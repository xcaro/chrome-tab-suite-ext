// =============================================================
// popup/usecases/manage-tabs.js
// =============================================================

import { TabsService } from '../../core/tabs.js';
import { isHttpTab, isHostOnlyUrl, parseDomainLevels } from '../../core/urls.js';
import { buildWindowContext } from '../../core/windows.js';

export function groupTabsByDomain(tabs) {
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

export function sortGroups(tree) {
  for (const [root, tabs] of tree) {
    const buckets = new Map();
    for (const tab of tabs) {
      if (!buckets.has(tab.windowId)) buckets.set(tab.windowId, []);
      buckets.get(tab.windowId).push(tab);
    }
    for (const bucket of buckets.values()) bucket.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

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

export function sortedRoots(tree) {
  return [...tree.keys()].sort((a, b) => {
    const latest = g => Math.max(...tree.get(g).map(t => t.lastAccessed || 0));
    return (latest(b) - latest(a)) || a.localeCompare(b);
  });
}

export async function getManagerModel({ filterState, hostOnly, selectedWindowIds, tabsPromise } = {}) {
  const allTabs = await (tabsPromise ?? TabsService.all());
  const windowContext = buildWindowContext(allTabs);
  const baseTabs = filterState.hasFilters()
    ? filterState.filterTabs(allTabs)
    : allTabs.filter(isHttpTab);
  const scopedTabs = baseTabs.filter(t => !hostOnly || isHostOnlyUrl(t.url));
  const visibleTabs = selectedWindowIds?.size
    ? scopedTabs.filter(t => selectedWindowIds.has(t.windowId))
    : scopedTabs;

  return {
    allTabs,
    scopedTabs,
    visibleTabs,
    windowContext,
    tree: sortGroups(groupTabsByDomain(visibleTabs)),
  };
}

export async function closeTabsBestEffort(ids) {
  return TabsService.closeBestEffort(ids);
}

export async function closeTabBestEffort(id) {
  return TabsService.closeBestEffort(id);
}

export async function closeDomainGroup(tabs, { beforeClose } = {}) {
  const activeTab = await TabsService.activeInCurrentWindow();
  const toClose = tabs
    .filter(t => t.id !== activeTab?.id)
    .map(t => t.id)
    .concat(tabs.find(t => t.id === activeTab?.id)?.id ?? []);
  toClose.forEach(id => beforeClose?.(id));
  await TabsService.closeBestEffort(toClose);
  return toClose;
}

export async function moveTabsToNewWindow(tabs) {
  return TabsService.moveToNewWindow(tabs);
}

export async function mergeWindowsInto({ sourceWindowIds, targetWindowId }) {
  let moved = 0;
  for (const sourceWindowId of sourceWindowIds) {
    moved += await TabsService.mergeWindows(sourceWindowId, targetWindowId);
  }
  return moved;
}

export function focusTab(tab) {
  return TabsService.focus(tab);
}
