// =============================================================
// shared/dedup-core.js — Pure duplicate-tab helpers
// No DOM. No Chrome API. Safe to use in popup/background/tests.
// =============================================================

import { normalizeUrl, isProcessableUrl } from './url-utils.js';

export function groupTabsByNormalizedUrl(tabs) {
  const groups = new Map();

  for (const tab of tabs) {
    if (!isProcessableUrl(tab.url)) continue;
    const norm = normalizeUrl(tab.url);
    if (!norm) continue;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(tab);
  }

  return groups;
}

export function getDuplicateGroups(tabs) {
  return [...groupTabsByNormalizedUrl(tabs).values()].filter(group => group.length > 1);
}

export function countDuplicateGroups(tabs) {
  return getDuplicateGroups(tabs).length;
}

export function getDuplicateTabsForUrl(tabs, tabId, url) {
  if (!isProcessableUrl(url)) return [];
  const norm = normalizeUrl(url);
  if (!norm) return [];

  return tabs.filter(tab =>
    tab.id !== tabId && isProcessableUrl(tab.url) && normalizeUrl(tab.url) === norm
  );
}

export function getDuplicateTabIdsToClose(groups, { keepNewest }) {
  return groups.flatMap(tabs =>
    keepNewest
      ? tabs.slice(0, -1).map(tab => tab.id)
      : tabs.slice(1).map(tab => tab.id)
  );
}
