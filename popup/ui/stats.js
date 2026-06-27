// =============================================================
// popup/ui/stats.js
// =============================================================

import { countDuplicateGroups } from '../../core/duplicates.js';
import { TabsService } from '../../core/tabs.js';
import { isHttpTab } from '../../core/urls.js';

let _cachedWindowCount = 0;

function initWindowCountCache() {
  chrome.windows.getAll().then(wins => { _cachedWindowCount = wins.length; });
  chrome.windows.onCreated.addListener(() => { _cachedWindowCount++; });
  chrome.windows.onRemoved.addListener(() => { _cachedWindowCount = Math.max(0, _cachedWindowCount - 1); });
}

export const GlobalStats = {
  async _update(tabsPromise) {
    const allTabs = await tabsPromise;
    const httpTabs = allTabs.filter(isHttpTab);

    const winEl = document.getElementById('gWindowsOpen');
    if (winEl) winEl.textContent = _cachedWindowCount;
    document.getElementById('gTabsOpen').textContent = httpTabs.length;

    const dupCount = countDuplicateGroups(httpTabs);
    const dupEl    = document.getElementById('gDupCount');
    dupEl.textContent = dupCount;
    dupEl.className   = 'g-stat-num' + (dupCount === 0 ? ' zero' : '');
  },

  async initWithTabs(tabsPromise) {
    initWindowCountCache();
    return this._update(tabsPromise);
  },

  refresh() { return this._update(TabsService.all()); },
};
