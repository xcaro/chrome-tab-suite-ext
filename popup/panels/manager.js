// =============================================================
// popup/panels/manager.js
// =============================================================

import { createFilterState } from '../../core/filters.js';
import { windowHueForId } from '../../core/windows.js';
import { createDomainFilter } from '../ui/domain-filter.js';
import { buildExpandableGroup } from '../ui/expandable-group.js';
import { renderEmptyState } from '../ui/empty-state.js';
import { buildTabRow } from '../ui/tab-row.js';
import { PanelHooks } from '../ui/nav.js';
import { GlobalStats } from '../ui/stats.js';
import { showToast } from '../ui/toast.js';
import { withButtonLock } from '../ui/buttons.js';
import {
  closeDomainGroup, closeTabBestEffort, closeTabsBestEffort, focusTab,
  getManagerModel, mergeWindowsInto, moveTabsToNewWindow, sortedRoots,
} from '../usecases/manage-tabs.js';

const _filter = createFilterState();
let _hostOnly = false;
let _selectedWindows = new Set();

export let suppressNextRemoved = () => {};

function selectedWindowIds(windowNames) {
  return [...windowNames.keys()].filter(id => _selectedWindows.has(id));
}

function hideMergeControls() {
  const root = document.getElementById('mergeWindowActions');
  if (!root) return;
  root.style.display = 'none';
  root.replaceChildren();
}

function renderMergeControls(windowNames) {
  const selected = selectedWindowIds(windowNames);
  const root = document.getElementById('mergeWindowActions');
  if (!root || selected.length < 2) {
    hideMergeControls();
    return;
  }

  root.style.display = '';
  root.replaceChildren();

  selected.forEach(targetWindowId => {
    const targetLabel = windowNames.get(targetWindowId);
    const sourceWindowIds = selected.filter(id => id !== targetWindowId);
    const sourceLabels = sourceWindowIds.map(id => windowNames.get(id)).join(', ');

    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost';
    btn.dataset.targetWindowId = String(targetWindowId);
    btn.dataset.sourceWindowIds = sourceWindowIds.join(',');
    btn.innerHTML = `<span>⤷</span> Append into ${targetLabel}`;
    btn.title = `Move all tabs from ${sourceLabels} into ${targetLabel}`;
    btn.addEventListener('click', e => mergeWindowsFromButton(e.currentTarget));
    root.appendChild(btn);
  });
}

async function mergeWindowsFromButton(btn) {
  const targetWindowId = Number(btn.dataset.targetWindowId);
  const sourceWindowIds = (btn.dataset.sourceWindowIds || '')
    .split(',')
    .map(id => Number(id))
    .filter(id => id && id !== targetWindowId);
  if (!targetWindowId || !sourceWindowIds.length) return;

  await withButtonLock(btn, async () => {
    try {
      const moved = await mergeWindowsInto({ sourceWindowIds, targetWindowId });
      const targetLabel = btn.textContent.replace(/^.*\binto\s+/, '').trim() || 'target window';
      _selectedWindows.clear();
      showToast(`Merged ${moved} tab(s) into ${targetLabel}`);
      await render();
      await GlobalStats.refresh();
    } catch (err) {
      showToast('Could not merge windows: ' + err.message, 'error');
    }
  });
}

function setEmptyState(list, badge, btnAll, btnNewWindow, message) {
  badge.style.display = btnAll.style.display = btnNewWindow.style.display = 'none';
  btnAll.disabled = btnNewWindow.disabled = true;
  renderEmptyState(list, {
    icon: '✓',
    title: message,
    subtitle: _filter.hasFilters() ? 'No open tabs match the current filter' : 'No tabs are currently open',
  });
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

  for (const winId of _selectedWindows) {
    if (!windowNames.has(winId)) _selectedWindows.delete(winId);
  }

  _selectedWindows = new Set([..._selectedWindows].filter(id => windowNames.has(id)));
  row.style.display = '';
  list.innerHTML = '';
  for (const [winId, label] of windowNames) {
    const tag = document.createElement('div');
    tag.className = 'tag window-tag' + (_selectedWindows.has(winId) ? ' window-tag-active' : '');
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

function closeRowAction(tab) {
  return {
    label: '✕', className: 'close-tab-btn', title: 'Close this tab',
    onClick: async ({ removeTabRow } = {}) => {
      suppressNextRemoved(tab.id);
      await closeTabBestEffort(tab.id);
      removeTabRow?.();
      await render();
      await GlobalStats.refresh();
    },
  };
}

function makeGroupActions(root, tabs) {
  const actions = [];
  if (tabs.length > 1) {
    actions.push({
      label: '⧉',
      className: 'tab-group-btn',
      title: `Move "${root}" tabs to new window`,
      onClick: async () => {
        try {
          await moveTabsToNewWindow(tabs);
          showToast(`Moved ${tabs.length} "${root}" tab(s) to new window`);
          await render();
          await GlobalStats.refresh();
        } catch (err) {
          showToast('Could not move tabs: ' + err.message, 'error');
        }
      },
    });
  }

  actions.push({
    label: '✕',
    className: 'tab-group-btn',
    title: `Close all "${root}" tabs`,
    onClick: async () => {
      const toClose = await closeDomainGroup(tabs, { beforeClose: suppressNextRemoved });
      showToast(`Closed ${toClose.length} "${root}" tab(s)`);
      await render();
      await GlobalStats.refresh();
    },
  });

  return actions;
}

async function renderGrouped(allTabs, list, badge, btnAll, btnNewWindow, windowNames) {
  const { scopedTabs, visibleTabs, tree } = await getManagerModel({
    filterState: _filter,
    hostOnly: _hostOnly,
    selectedWindowIds: _selectedWindows,
    tabsPromise: Promise.resolve(allTabs),
  });

  if (!scopedTabs.length) return setEmptyState(list, badge, btnAll, btnNewWindow, 'No open tabs');
  if (!visibleTabs.length) return setEmptyState(list, badge, btnAll, btnNewWindow, 'No open tabs');

  badge.style.display = '';
  badge.textContent = visibleTabs.length;
  btnAll.style.display = btnNewWindow.style.display = 'none';
  list.innerHTML = '';

  for (const root of sortedRoots(tree)) {
    const tabs = tree.get(root);
    const winCount = new Set(tabs.map(t => t.windowId)).size;
    const group = buildExpandableGroup({
      title: root,
      tabs,
      countLabel: tabs.length > 1 ? `${tabs.length}` : '',
      headerActions: makeGroupActions(root, tabs),
      rowActions: tab => [closeRowAction(tab)],
      windowNames,
      onFocus: focusTab,
    });

    if (tabs.length > 1) {
      const countEl = group.querySelector('.dup-count');
      const winBadge = document.createElement('span');
      winBadge.className = 'dup-count win-count-badge';
      winBadge.textContent = `${winCount}w`;
      winBadge.title = `${winCount} window${winCount > 1 ? 's' : ''}`;
      countEl?.after(winBadge);
    }

    list.appendChild(group);
  }
}

async function renderFiltered(allTabs, list, badge, btnAll, btnNewWindow) {
  const windowFilterRow = document.getElementById('closerWindowFilterRow');
  if (windowFilterRow) windowFilterRow.style.display = 'none';
  _selectedWindows.clear();

  const { visibleTabs } = await getManagerModel({
    filterState: _filter,
    hostOnly: _hostOnly,
    selectedWindowIds: _selectedWindows,
    tabsPromise: Promise.resolve(allTabs),
  });

  if (!visibleTabs.length) return setEmptyState(list, badge, btnAll, btnNewWindow, 'No matching tabs');

  badge.style.display = '';
  badge.textContent = visibleTabs.length;
  btnAll.disabled = btnNewWindow.disabled = _hostOnly;
  btnAll.style.display = btnNewWindow.style.display = _hostOnly ? 'none' : '';
  list.innerHTML = '';
  visibleTabs.forEach(tab => list.appendChild(buildTabRow(tab, { actions: [closeRowAction(tab)], onFocus: focusTab })));
}

async function render(tabsPromise) {
  const list = document.getElementById('closerList');
  const badge = document.getElementById('closerBadge');
  const btnAll = document.getElementById('btnCloserCloseAll');
  const btnNewWindow = document.getElementById('btnNewWindow');
  const model = await getManagerModel({
    filterState: _filter,
    hostOnly: _hostOnly,
    selectedWindowIds: _selectedWindows,
    tabsPromise,
  });
  const { allTabs, windowContext } = model;
  const { windowNames, windowTabCounts } = windowContext;

  renderWindowFilter(windowNames, windowTabCounts);
  renderMergeControls(windowNames);
  if (_filter.hasFilters()) await renderFiltered(allTabs, list, badge, btnAll, btnNewWindow);
  else await renderGrouped(allTabs, list, badge, btnAll, btnNewWindow, windowNames);
}

async function getTargetTabs() {
  const { visibleTabs } = await getManagerModel({
    filterState: _filter,
    hostOnly: _hostOnly,
    selectedWindowIds: _selectedWindows,
  });
  return visibleTabs.length ? visibleTabs : null;
}

async function closeAll() {
  await withButtonLock('btnCloserCloseAll', async () => {
    const tabs = await getTargetTabs();
    if (!tabs) return;
    const ids = tabs.map(t => t.id);
    ids.forEach(suppressNextRemoved);
    await closeTabsBestEffort(ids);
    showToast(`Closed ${tabs.length} tab(s)`);
    await render();
    await GlobalStats.refresh();
  });
}

async function newWindow() {
  await withButtonLock('btnNewWindow', async () => {
    const tabs = await getTargetTabs();
    if (!tabs) return;
    try {
      await moveTabsToNewWindow(tabs);
      showToast(`Moved ${tabs.length} tab(s)`);
      await render();
      await GlobalStats.refresh();
    } catch (err) {
      showToast('Could not move tabs: ' + err.message, 'error');
    }
  });
}

export function init() {
  const hint  = document.getElementById('closerFilterHint');
  const badge = document.getElementById('closerFilterBadge');
  const label = document.getElementById('closerListLabel');

  createDomainFilter({
    tagsEl: document.getElementById('closerDomainTags'),
    inputEl: document.getElementById('closerDomainInput'),
    addBtn: document.getElementById('closerAddDomainBtn'),
    filterState: _filter,
    onChange: () => {
      const hasFilter = _filter.hasFilters();
      hint.style.display = hasFilter ? '' : 'none';
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

  const pendingInternalClose = new Set();
  const isManagerActive = () => document.getElementById('panel-closer')?.classList.contains('active');

  async function onTabsChanged(tabId) {
    if (!isManagerActive()) return;
    await render();
    await GlobalStats.refresh();
  }

  chrome.tabs.onCreated.addListener(onTabsChanged);
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (pendingInternalClose.delete(tabId)) return;
    onTabsChanged(tabId);
  });
  chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url !== undefined) onTabsChanged(); });

  suppressNextRemoved = (tabId) => { pendingInternalClose.add(tabId); };
}
