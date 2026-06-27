// =============================================================
// popup/usecases/save-vault.js
// =============================================================

import { BookmarkService } from '../../core/bookmarks.js';
import { TabsService } from '../../core/tabs.js';
import { resolveAllTitles } from '../../core/titles.js';
import { isHttpTab, normalizeUrl, parseDomainLevels } from '../../core/urls.js';

export function formatVaultDate(d = new Date()) {
  return `Tabs - ${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

export async function previewVaultTabs(filterState) {
  const allTabs = await TabsService.all();
  return filterState.filterTabs(allTabs);
}

function collectTabs(allTabs, { filterState, skipPinned, skipDupes }) {
  let tabs = allTabs;
  if (skipPinned) tabs = tabs.filter(t => !t.pinned);
  tabs = tabs.filter(isHttpTab);
  if (filterState.hasFilters()) tabs = filterState.filterTabs(tabs);
  if (skipDupes) {
    const seen = new Set();
    tabs = tabs.filter(t => {
      const key = normalizeUrl(t.url) ?? t.url;
      return seen.has(key) ? false : (seen.add(key), true);
    });
  }
  return tabs;
}

async function saveTabs(tabs, titles, parentId, { grouped, onProgress }) {
  const total = tabs.length;
  let done = 0;
  const tick = () => onProgress?.(50 + Math.round((++done / total) * 45));

  if (!grouped) {
    await Promise.all(tabs.map((tab, i) =>
      BookmarkService.createBookmark(parentId, titles[i], tab.url).then(tick)
    ));
    return;
  }

  const tree = new Map();
  tabs.forEach((tab, i) => {
    let host = '';
    try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return; }
    const { root, sub } = parseDomainLevels(host);
    if (!tree.has(root)) tree.set(root, new Map());
    const sm = tree.get(root);
    const key = sub || '_direct';
    if (!sm.has(key)) sm.set(key, []);
    sm.get(key).push({ tab, title: titles[i] });
  });

  for (const root of [...tree.keys()].sort()) {
    const sm = tree.get(root);
    const rf = await BookmarkService.createFolder(parentId, root);
    const keys = [...sm.keys()].sort((a, b) =>
      a === '_direct' ? -1 : b === '_direct' ? 1 : a.localeCompare(b)
    );
    await Promise.all(keys.map(async key => {
      const items = sm.get(key);
      const target = key === '_direct' ? rf.id
        : (await BookmarkService.createFolder(rf.id, key)).id;
      await Promise.all(items.map(({ tab, title }) =>
        BookmarkService.createBookmark(target, title, tab.url).then(tick)
      ));
    }));
  }
}

export async function saveVault({ filterState, folderName, skipDupes, closeTabs, skipPinned, onProgress }) {
  let tabs = collectTabs(await TabsService.all(), { filterState, skipPinned, skipDupes });
  if (!tabs.length) return { savedCount: 0, skippedActiveCount: 0, filterNote: '' };

  onProgress?.(20);
  const titles = await resolveAllTitles(tabs);
  onProgress?.(40);

  const root = await BookmarkService.createFolder('1', folderName);
  const grouped = !filterState.hasFilters();
  onProgress?.(50);

  await saveTabs(tabs, titles, root.id, { grouped, onProgress });
  onProgress?.(100);

  let skippedActiveCount = 0;
  if (closeTabs) {
    const cur = await TabsService.activeInCurrentWindow();
    const toClose = tabs.map(t => t.id).filter(id => id !== cur?.id);
    skippedActiveCount = tabs.length - toClose.length;
    if (toClose.length) await TabsService.close(toClose);
  }

  return {
    savedCount: tabs.length,
    skippedActiveCount,
    filterNote: filterState.hasFilters() ? ` (${filterState.filters.join(', ')})` : '',
  };
}

export function focusTab(tab) {
  return TabsService.focus(tab);
}
