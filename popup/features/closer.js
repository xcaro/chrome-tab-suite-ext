// =============================================================
// popup/features/closer.js — Manager Panel (CloserPanel)
// Depends on: shared/url-utils.js, popup/services/ui.js
// =============================================================

import { isHttpTab, parseDomainLevels } from '../../shared/url-utils.js';
import { FilterService } from '../../services/filter.js';
import {
  showToast, setActed, GlobalStats,
  PanelHooks, createDomainFilter,
  buildTabRow, buildDupGroup,
} from '../services/ui.js';

// ── State ────────────────────────────────────────────────────
const _filters = FilterService.register('closer');
let   _hostOnly = false;
let   _domainFilter;

// Callable by ui.js to suppress the chrome.tabs.onRemoved re-render
// that fires when a tab is closed from within the popup UI itself.
export let suppressNextRemoved = () => {};

// ── Move tabs to new window ───────────────────────────────────
async function moveToNewWindow(tabs) {
  try {
    // Sort by index so tab order is preserved in the new window
    const sorted = [...tabs].sort((a, b) => a.index - b.index);

    // Create the new window with the first tab to get a windowId
    const newWin = await chrome.windows.create({
      tabId:   sorted[0].id,
      focused: false,
    });

    // Move remaining tabs into the new window, appending in order
    for (let i = 1; i < sorted.length; i++) {
      await chrome.tabs.move(sorted[i].id, { windowId: newWin.id, index: -1 });
    }

    return newWin.id;
  } catch (err) {
    showToast('Could not move tabs: ' + err.message, 'error');
    return null;
  }
}


// ── Host-only check ──────────────────────────────────────────
function isHostOnly(url) {
  try {
    const u = new URL(url);
    return (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash;
  } catch { return false; }
}

// ── Close action ─────────────────────────────────────────────
function makeCloseAction(tab) {
  return {
    label:     '✕',
    className: 'close-tab-btn',
    title:     'Close this tab',
    onClick:   async () => {
      try   { await chrome.tabs.remove(tab.id); await setActed(1); }
      catch { /* already closed */ }
      await render();
      await GlobalStats.refresh();
    },
  };
}

// ── Grouped mode (no filter) ──────────────────────────────────
async function renderGrouped(allTabs, list, badge, btnAll, btnNewWindow) {
  const httpTabs = FilterService.filterTabs('closer', allTabs)
    .filter(t => !_hostOnly || isHostOnly(t.url));

  if (!httpTabs.length) {
    badge.style.display  = 'none';
    btnAll.style.display = 'none';
    btnAll.disabled      = true;
    btnNewWindow.style.display = 'none';
    btnNewWindow.disabled      = true;
    list.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">✓</div>
        <div class="e-title">No open tabs</div>
        <div>No tabs are currently open</div>
      </div>`;
    return;
  }

  // ── Build global window name map (once, before any group renders) ──
  const allWindowIds = [...new Set(httpTabs.map(t => t.windowId))].sort((a, b) => a - b);
  const windowNames  = new Map(allWindowIds.map((id, i) => [id, `WINDOW ${i + 1}`]));

  const tree = new Map();
  for (const tab of httpTabs) {
    try {
      const host = new URL(tab.url).hostname.replace(/^www\./, '');
      const { root } = parseDomainLevels(host);
      if (!tree.has(root)) tree.set(root, []);
      tree.get(root).push(tab);
    } catch { /* skip */ }
  }

  // ── Sort tabs within each domain group: window (by lastAccessed) → tab (by lastAccessed) ──
  for (const [root, tabs] of tree) {
    // Bucket tabs by windowId
    const buckets = new Map();
    for (const tab of tabs) {
      if (!buckets.has(tab.windowId)) buckets.set(tab.windowId, []);
      buckets.get(tab.windowId).push(tab);
    }
    // Sort each bucket internally by lastAccessed desc
    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    }
    // Sort windows by their most recently accessed tab desc
    const sortedWindows = [...buckets.entries()].sort((a, b) => {
      const maxA = Math.max(...a[1].map(t => t.lastAccessed || 0));
      const maxB = Math.max(...b[1].map(t => t.lastAccessed || 0));
      return maxB - maxA;
    });
    // Flatten back
    tree.set(root, sortedWindows.flatMap(([, bucket]) => bucket));
  }

  badge.style.display  = '';
  badge.textContent    = httpTabs.length;
  btnAll.style.display = 'none';
  btnNewWindow.style.display = 'none';
  list.innerHTML = '';

  // Sort by most recently accessed
  const rootLastAccessed = new Map();
  for (const [root, tabs] of tree) {
    let max = 0;
    for (const t of tabs) { if ((t.lastAccessed || 0) > max) max = t.lastAccessed || 0; }
    rootLastAccessed.set(root, max);
  }
  const roots = [...tree.keys()].sort((a, b) =>
    (rootLastAccessed.get(b) - rootLastAccessed.get(a)) || a.localeCompare(b)
  );

  for (const root of roots) {
    const tabs  = tree.get(root);
    const group = buildDupGroup(tabs, {
      windowNames,
      onInternalClose: suppressNextRemoved,
      onTabClose: async () => {
          await GlobalStats.refresh();
      },
    });

    const countEl = group.querySelector('.dup-count');
    if (countEl) countEl.textContent = tabs.length > 1 ? `${tabs.length}` : '';

    // Window count badge — only shown when there are multiple tabs (same condition as ⧉ button)
    if (tabs.length > 1) {
      const winCount = new Set(tabs.map(t => t.windowId)).size;
      const winBadge = document.createElement('span');
      winBadge.className = 'dup-count win-count-badge';
      winBadge.textContent = `${winCount}w`;
      winBadge.title = `${winCount} window${winCount > 1 ? 's' : ''}`;
      if (countEl) countEl.after(winBadge);
    }

    const titleEl = group.querySelector('.dup-title');
    if (titleEl) { titleEl.textContent = root; titleEl.title = root; }

    const header  = group.querySelector('.dup-header');
    if (header) {
      const chevron = header.querySelector('.dup-chevron');
      if (tabs.length > 1) {
          const groupBtn = document.createElement('button');
          groupBtn.className = 'tab-group-btn';
          groupBtn.textContent = '⧉';
          groupBtn.title = `Move "${root}" tabs to new window`;
          groupBtn.addEventListener('click', async e => {
              e.stopPropagation();
              const winId = await moveToNewWindow(tabs);
              if (winId) {
                  showToast(`Moved ${tabs.length} "${root}" tab(s) to new window`);
                  await render();
                  await GlobalStats.refresh();
              }
          });
          header.insertBefore(groupBtn, chevron);
      }

      const closeBtn       = document.createElement('button');
      closeBtn.className   = 'tab-group-btn';
      closeBtn.textContent = '✕';
      closeBtn.title       = `Close all "${root}" tabs`;
      closeBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const others  = tabs.filter(t => t.id !== activeTab?.id);
        const active  = tabs.find(t => t.id === activeTab?.id);
        let closed = 0;
        for (const t of others) { try { await chrome.tabs.remove(t.id); closed++; } catch {} }
        if (active) { try { await chrome.tabs.remove(active.id); closed++; } catch {} }
        await setActed(closed);
        showToast(`Closed ${closed} "${root}" tab(s)`);
        await render();
        await GlobalStats.refresh();
      });
      header.insertBefore(closeBtn, chevron);
    }

    list.appendChild(group);
  }
}

// ── Filtered mode ─────────────────────────────────────────────
async function renderFiltered(allTabs, list, badge, btnAll, btnNewWindow) {
  const matched = FilterService.filterTabs('closer', allTabs)
    .filter(t => !_hostOnly || isHostOnly(t.url));

  if (!matched.length) {
    badge.style.display  = 'none';
    btnAll.style.display = 'none';
    btnAll.disabled      = true;
    btnNewWindow.style.display = 'none';
    btnNewWindow.disabled      = true;
    list.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">✓</div>
        <div class="e-title">No matching tabs</div>
        <div>No open tabs match the current filter</div>
      </div>`;
    return;
  }

  badge.style.display  = '';
  badge.textContent    = matched.length;
  btnAll.disabled      = _hostOnly;
  btnAll.style.display = _hostOnly ? 'none' : '';
  btnNewWindow.disabled      = _hostOnly;
  btnNewWindow.style.display = _hostOnly ? 'none' : '';
  list.innerHTML       = '';
  matched.forEach((tab, i) => list.appendChild(buildTabRow(tab, i, [makeCloseAction(tab)])));
}

// ── Main render ──────────────────────────────────────────────
// tabsPromise: optional — passed from boot() to reuse the initial query.
// Internal re-renders (after close/move) call render() without argument,
// which fires a fresh query to get the updated tab list.
async function render(tabsPromise) {
  const list         = document.getElementById('closerList');
  const badge        = document.getElementById('closerBadge');
  const btnAll       = document.getElementById('btnCloserCloseAll');
  const btnNewWindow = document.getElementById('btnNewWindow');
  const allTabs      = await (tabsPromise ?? chrome.tabs.query({}));
  if (FilterService.hasFilters('closer')) await renderFiltered(allTabs, list, badge, btnAll, btnNewWindow);
  else                                      await renderGrouped(allTabs, list, badge, btnAll, btnNewWindow);
}

// ── Get target tabs ───────────────────────────────────────────
// Returns [others, active] or null if no targets found.
// Callers must check for null before destructuring.
async function getTargetTabs() {
  const allTabs = await chrome.tabs.query({});
  const targets = FilterService.hasFilters('closer')
    ? FilterService.filterTabs('closer', allTabs)
    : allTabs.filter(isHttpTab);

  if (!targets.length) return null;

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const others      = targets.filter(t => t.id !== activeTab?.id);
  const active      = targets.find(t => t.id === activeTab?.id);

  return [others, active];
}

// ── Close all ────────────────────────────────────────────────
async function closeAll() {
  const btn    = document.getElementById('btnCloserCloseAll');
  btn.disabled = true;

  const result = await getTargetTabs();
  if (!result) { btn.disabled = false; return; }

  const [others, active] = result;
  let closed = 0;
  for (const tab of others) { try { await chrome.tabs.remove(tab.id); closed++; } catch {} }
  if (active) { try { await chrome.tabs.remove(active.id); closed++; } catch {} }

  await setActed(closed);
  showToast(`Closed ${closed} tab(s)`);
  await render();
  await GlobalStats.refresh();
  btn.disabled = false;
}

async function newWindow() {
  const btn    = document.getElementById('btnNewWindow');
  btn.disabled = true;

  const result = await getTargetTabs();
  if (!result) { btn.disabled = false; return; }

  const [others, active] = result;
  const tabs = [...others, ...(active ? [active] : [])];
  await moveToNewWindow(tabs);

  await setActed(tabs.length);
  showToast(`Moved ${tabs.length} tab(s)`);
  await render();
  await GlobalStats.refresh();
  btn.disabled = false;
}

// ── Init ─────────────────────────────────────────────────────
export function init() {
  const hint  = document.getElementById('closerFilterHint');
  const badge = document.getElementById('closerFilterBadge');
  const label = document.getElementById('closerListLabel');

  _domainFilter = createDomainFilter({
    tagsEl:   document.getElementById('closerDomainTags'),
    inputEl:  document.getElementById('closerDomainInput'),
    addBtn:   document.getElementById('closerAddDomainBtn'),
    filters:  _filters,
    onChange: () => {
      hint.style.display  = FilterService.hasFilters('closer') ? '' : 'none';
      badge.style.display = FilterService.hasFilters('closer') ? '' : 'none';
      if (label) label.textContent = FilterService.hasFilters('closer') ? 'Matched tabs' : 'All tabs';
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

  // ── Live update when tabs are opened or closed externally ───
  // _internalCloseCount tracks tabs being closed via the popup UI itself.
  // Chrome fires onRemoved for these too, so we suppress the external
  // re-render to avoid collapsing expanded groups.
  let _internalCloseCount = 0;

  function isCloserPanelActive() {
    return document.getElementById('panel-closer')?.classList.contains('active');
  }

  async function onTabsChanged() {
    if (!isCloserPanelActive()) return;
    if (_internalCloseCount > 0) return;
    await render();
    await GlobalStats.refresh();
  }

  chrome.tabs.onCreated.addListener(onTabsChanged);
  chrome.tabs.onRemoved.addListener(onTabsChanged);
  chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
    // Only re-render when the URL changes (new navigation), not on every loading event
    if (changeInfo.url !== undefined) onTabsChanged();
  });

  // Exposed so ui.js buildDupGroup can suppress the external onRemoved
  // that Chrome fires when a tab is closed from within the popup UI.
  suppressNextRemoved = () => {
    _internalCloseCount++;
    setTimeout(() => { _internalCloseCount = Math.max(0, _internalCloseCount - 1); }, 500);
  };
}
