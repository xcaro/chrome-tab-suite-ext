// =============================================================
// popup/usecases/dedupe-tabs.js
// =============================================================

import { getDuplicateGroups, getDuplicateTabIdsToClose } from '../../core/duplicates.js';
import { TabsService } from '../../core/tabs.js';

export async function scanDuplicates(filterState) {
  const allTabs = await TabsService.all();
  const duplicateGroups = getDuplicateGroups(allTabs);
  const groups = filterState.hasFilters()
    ? duplicateGroups.filter(tabs => filterState.shouldProcess(tabs[0].url))
    : duplicateGroups;
  return { allTabs, groups };
}

export async function closeDuplicateGroups(groups, { keepNewest }) {
  const toClose = getDuplicateTabIdsToClose(groups, { keepNewest });
  if (toClose.length) await TabsService.closeBestEffort(toClose);
  return toClose;
}

export async function closeTabBestEffort(tabId) {
  return TabsService.closeBestEffort(tabId);
}

export function focusTab(tab) {
  return TabsService.focus(tab);
}
