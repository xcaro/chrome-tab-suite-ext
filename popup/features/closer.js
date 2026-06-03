// =============================================================
// popup/features/closer.js — Manager Panel (CloserPanel)
// Depends on: shared/url-utils.js, popup/services/ui.js
// =============================================================

import { isHttpTab, parseDomainLevels } from '../../shared/url-utils.js';
import { FilterService } from '../../services/filter.js';
import {
  showToast, setActed, GlobalStats,
  PanelHooks, createDomainFilter,
  buildTabRow, buildDupGroup, windowHueForId,
} from '../services/ui.js';
import { TabsService } from '../../services/tabs.js';

// ── State ────────────────────────────────────────────────────────────────────
const _filter          = FilterService.register('closer');
let   _hostOnly        = false;
let   _selectedWindows = new Set();

export let suppressNextRemoved = () => {};

// ── Utilities ────────────────────────────────────────────────────────────────
function isHostOnly(url) {
  try {
    const u = new URL(url);
    return (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash;
  } catch { return false; }
}

// Run async fn with a button disabled for its duration.
async function withDisabled(btnId, fn) {
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

async function moveToNewWindow(tabs) {
  try {
    return await TabsService.moveToNewWindow(tabs);
  } catch (err) {
    showToast('Could not move tabs: ' + err.message, 'error');
    return null;
  }
}

// ── Domain grouping ───────────────────────────────────────────────────────────
function groupTabsByDomain(tabs) {
  const tree = new Map();
  for (const tab of tabs) {
    try {
      const host = new URL(tab.url).hostname.replace(/^www\./, '');
      const { root } = parseDomainLevels(host);
      if (!tree.has(root)) tree.set(root, []);
      tree.get(root).push(tab);
    } catch { /* skip unparseable */ }
  }
  return tree;
}

function sortGroups(tree) {
  for (const [root, tabs] of tree) {
    // Bucket by window, sort each bucket by lastAccessed desc
    const buckets = new Map();
    for (const tab of tabs) {
      if (!buckets.has(tab.windowId)) buckets.set(tab.windowId, []);
      buckets.get(tab.windowId).push(tab);
    }
    for (const b of buckets.values()) b.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

    // Sort windows by their most-recently-accessed tab, flatten
    tree.set(root,
      [...buckets.entries()]
        .sort(([, a], [, b]) =>
          Math.max(...b.map(t => t.lastAccessed || 0)) - Math.max(...a.map(t => t.lastAccessed || 0))
        )
        .flatMap(([, bucket]) => bucket)
    );
  }
  return tree;
}

function sortedRoots(tree) {
  return [...tree.keys()].sort((a, b) => {
    const latest = g => Math.max(...tree.get(g).map(t => t.lastAccessed || 0));
    return (latest(b) - latest(a)) || a.localeCompare(b);
  });
}

// ── Render helpers ───────────────────────────────────────────────────────────
function setEmptyState(list, badge, btnAll, btnNewWindow, message) {
  badge.style.display = btnAll.style.display = btnNewWindow.style.display = 'none';
  btnAll.disabled = btnNewWindow.disabled = true;
  list.innerHTML = `
    <div class="empty-state">
      <div class="e-icon">✓</div>
      <div class="e-title">${message}</div>
    <div>${_filter.hasFilters() ? 'No open tabs match the current filter' : 'No tabs are currently open'}</div>
    </div>`;
}

function renderWindowFilter(windowNames, windowTabCounts) {
  const row  = document.getElementById('closerWindowFilterRow');
  const list = document.getElementById('closerWindowTags');
  if (!row || !list) return;

  if (windowNames.size < 2) {
    row.style.display = 'none';
    _selectedWindows.clear();
    return;
  }

  row.style.display = '';
  list.innerHTML    = '';
  for (const [winId, label] of windowNames) {
    const tag = document.createElement('div');
    tag.className   = 'tag window-tag' + (_selectedWindows.has(winId) ? ' window-tag-active' : '');
    tag.textContent = windowTabCounts?.get(winId) ? `${label} (${windowTabCounts.get(winId)})` : label;
    tag.style.setProperty('--w-hue', windowHueForId(windowNames, winId));
    tag.title = `${_selectedWindows.has(winId) ? 'Deselect' : 'Select'} ${label}`;
    tag.addEventListener('click', () => {
      _selectedWindows.has(winId) ? _selectedWindows.delete(winId) : _selectedWindows.add(winId);
      render();
    });
    list.appendChild(tag);
  }
}

function makeCloseAction(tab) {
  return {
    label: '✕', className: 'close-tab-btn', title: 'Close this tab',
    onClick: async () => {
      await TabsService.closeBestEffort(tab.id);
      await setActed(1);
      await render();
      await GlobalStats.refresh();
    },
  };
}

// Inject ⧉ (move to window) and ✕ (close all) buttons into a buildDupGroup element.
function buildGroupHeader(root, tabs, group) {
  const header  = group.querySelector('.dup-header');
  const chevron = header?.querySelector('.dup-chevron');
  if (!header || !chevron) return;

  if (tabs.length > 1) {
    const btn = document.createElement('button');
    btn.className = 'tab-group-btn'; btn.textContent = '⧉';
    btn.title = `Move "${root}" tabs to new window`;
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (await moveToNewWindow(tabs)) {
        showToast(`Moved ${tabs.length} "${root}" tab(s) to new window`);
        await render(); await GlobalStats.refresh();
      }
    });
    header.insertBefore(btn, chevron);
  }

  const btn = document.createElement('button');
  btn.className = 'tab-group-btn'; btn.textContent = '✕';
  btn.title = `Close all "${root}" tabs`;
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    const activeTab = await TabsService.activeInCurrentWindow();
    const toClose = tabs
      .filter(t => t.id !== activeTab?.id)
      .map(t => t.id)
      .concat(tabs.find(t => t.id === activeTab?.id)?.id ?? []);
    await TabsService.closeBestEffort(toClose);
    await setActed(toClose.length);
    showToast(`Closed ${toClose.length} "${root}" tab(s)`);
    await render(); await GlobalStats.refresh();
  });
  header.insertBefore(btn, chevron);
}

// ── Render modes ──────────────────────────────────────────────────────────────
async function renderGrouped(allTabs, list, badge, btnAll, btnNewWindow) {
  const httpTabs = _filter.filterTabs(allTabs)
    .filter(t => !_hostOnly || isHostOnly(t.url));

  if (!httpTabs.length) return setEmptyState(list, badge, btnAll, btnNewWindow, 'No open tabs');

  const allWindowIds  = [...new Set(httpTabs.map(t => t.windowId))].sort((a, b) => a - b);
  const windowNames   = new Map(allWindowIds.map((id, i) => [id, `WINDOW ${i + 1}`]));
  const windowTabCounts = new Map(allWindowIds.map(id => [id, httpTabs.filter(t => t.windowId === id).length]));
  renderWindowFilter(windowNames, windowTabCounts);

  const visibleTabs = _selectedWindows.size > 0
    ? httpTabs.filter(t => _selectedWindows.has(t.windowId))
    : httpTabs;

  const tree  = sortGroups(groupTabsByDomain(visibleTabs));
  const roots = sortedRoots(tree);

  badge.style.display = '';
  badge.textContent   = visibleTabs.length;
  btnAll.style.display = btnNewWindow.style.display = 'none';
  list.innerHTML       = '';

  for (const root of roots) {
    const tabs  = tree.get(root);
    const group = buildDupGroup(tabs, {
      windowNames,
      onInternalClose: suppressNextRemoved,
      onTabClose: () => GlobalStats.refresh(),
    });

    const countEl = group.querySelector('.dup-count');
    if (countEl) countEl.textContent = tabs.length > 1 ? `${tabs.length}` : '';

    if (tabs.length > 1) {
      const winCount = new Set(tabs.map(t => t.windowId)).size;
      const winBadge = document.createElement('span');
      winBadge.className   = 'dup-count win-count-badge';
      winBadge.textContent = `${winCount}w`;
      winBadge.title       = `${winCount} window${winCount > 1 ? 's' : ''}`;
      countEl?.after(winBadge);
    }

    const titleEl = group.querySelector('.dup-title');
    if (titleEl) { titleEl.textContent = root; titleEl.title = root; }

    buildGroupHeader(root, tabs, group);
    list.appendChild(group);
  }
}

async function renderFiltered(allTabs, list, badge, btnAll, btnNewWindow) {
  const matched = _filter.filterTabs(allTabs)
    .filter(t => !_hostOnly || isHostOnly(t.url));

  if (!matched.length) return setEmptyState(list, badge, btnAll, btnNewWindow, 'No matching tabs');

  badge.style.display   = '';
  badge.textContent     = matched.length;
  btnAll.disabled       = btnNewWindow.disabled      = _hostOnly;
  btnAll.style.display  = btnNewWindow.style.display = _hostOnly ? 'none' : '';
  list.innerHTML        = '';
  matched.forEach((tab, i) => list.appendChild(buildTabRow(tab, i, [makeCloseAction(tab)])));
}

async function render(tabsPromise) {
  const list         = document.getElementById('closerList');
  const badge        = document.getElementById('closerBadge');
  const btnAll       = document.getElementById('btnCloserCloseAll');
  const btnNewWindow = document.getElementById('btnNewWindow');
  const allTabs      = await (tabsPromise ?? TabsService.all());
  if (_filter.hasFilters()) await renderFiltered(allTabs, list, badge, btnAll, btnNewWindow);
  else                                    await renderGrouped(allTabs, list, badge, btnAll, btnNewWindow);
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function getTargetTabs() {
  const allTabs = await TabsService.all();
  const targets = _filter.hasFilters()
    ? _filter.filterTabs(allTabs)
    : allTabs.filter(isHttpTab);
  return targets.length ? targets : null;
}

async function closeAll() {
  await withDisabled('btnCloserCloseAll', async () => {
    const tabs = await getTargetTabs();
    if (!tabs) return;
    await TabsService.closeBestEffort(tabs.map(t => t.id));
    await setActed(tabs.length);
    showToast(`Closed ${tabs.length} tab(s)`);
    await render();
    await GlobalStats.refresh();
  });
}

async function newWindow() {
  await withDisabled('btnNewWindow', async () => {
    const tabs = await getTargetTabs();
    if (!tabs) return;
    await moveToNewWindow(tabs);
    await setActed(tabs.length);
    showToast(`Moved ${tabs.length} tab(s)`);
    await render();
    await GlobalStats.refresh();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function init() {
  const hint  = document.getElementById('closerFilterHint');
  const badge = document.getElementById('closerFilterBadge');
  const label = document.getElementById('closerListLabel');

  createDomainFilter({
    tagsEl:  document.getElementById('closerDomainTags'),
    inputEl: document.getElementById('closerDomainInput'),
    addBtn:  document.getElementById('closerAddDomainBtn'),
    filterState: _filter,
    onChange: () => {
      const hasFilter = _filter.hasFilters();
      hint.style.display  = hasFilter ? '' : 'none';
      badge.style.display = hasFilter ? '' : 'none';
      if (label) label.textContent = hasFilter ? 'Matched tabs' : 'All tabs';
      render();
    },
  });

  document.getElementById('closerHostOnlyToggle').addEventListener('change', e => {
    _hostOnly = e.target.checked;
    render();
  });

  document.getElementById('btnCloserCloseAll').addEventListener('click', closeAll);
  document.getElementById('btnNewWindow').addEventListener('click', newWindow);
  PanelHooks['closer'] = render;

  // Suppress external re-render when a tab is closed from within the popup UI.
  // Chrome fires onRemoved for internal closes too — we track them to avoid
  // collapsing expanded groups.
  let _internalCloseCount = 0;
  const isCloserActive = () => document.getElementById('panel-closer')?.classList.contains('active');

  async function onTabsChanged() {
    if (!isCloserActive() || _internalCloseCount > 0) return;
    await render();
    await GlobalStats.refresh();
  }

  chrome.tabs.onCreated.addListener(onTabsChanged);
  chrome.tabs.onRemoved.addListener(onTabsChanged);
  chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url !== undefined) onTabsChanged(); });

  suppressNextRemoved = () => {
    _internalCloseCount++;
    setTimeout(() => { _internalCloseCount = Math.max(0, _internalCloseCount - 1); }, 500);
  };
}
