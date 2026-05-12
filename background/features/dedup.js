// =============================================================
// background/features/dedup.js — Auto Tab Deduplicator
// Registers with Registry. Uses StorageService + FilterService.
// =============================================================

import { Registry }                        from '../registry.js';
import { StorageService }                  from '../../services/storage.js';
import { normalizeUrl, isProcessableUrl }  from '../../shared/url-utils.js';

const STORAGE_KEY      = 'autoDetect';
const KEEP_NEWEST_KEY  = 'keepNewest';

async function checkAndCloseDuplicate(newTabId, newTabUrl) {
  try {
    if (!(await StorageService.isEnabled(STORAGE_KEY, false))) return;

    // Hard guard — never attempt any tab operation on non-http URLs
    if (!isProcessableUrl(newTabUrl)) return;

    const norm = normalizeUrl(newTabUrl);
    if (!norm) return;

    const allTabs    = await chrome.tabs.query({});
    const duplicates = allTabs.filter(t =>
      t.id !== newTabId && isProcessableUrl(t.url) && normalizeUrl(t.url) === norm
    );
    if (!duplicates.length) return;

    // Read keep-mode from storage to stay consistent with popup Dedup toggle.
    // keepNewest=true (default) → keep the newly opened tab, close existing ones.
    // keepNewest=false          → keep the oldest tab, close the new one.
    const keepNewest = await StorageService.isEnabled(KEEP_NEWEST_KEY, true);

    if (keepNewest) {
      // Close existing duplicates, keep the new tab
      for (const dup of duplicates) {
        try { await chrome.tabs.remove(dup.id); } catch { /* already closed */ }
      }
      try {
        await chrome.tabs.update(newTabId, { active: true });
        const tab = await chrome.tabs.get(newTabId);
        if (tab) await chrome.windows.update(tab.windowId, { focused: true });
      } catch { /* tab may have been closed */ }
    } else {
      // Close the new tab, focus the oldest existing duplicate
      try { await chrome.tabs.remove(newTabId); } catch { /* already closed */ }
      const oldest = duplicates.reduce((a, b) =>
        (a.lastAccessed || 0) <= (b.lastAccessed || 0) ? a : b
      );
      try {
        await chrome.tabs.update(oldest.id, { active: true });
        await chrome.windows.update(oldest.windowId, { focused: true });
      } catch { /* tab may have been closed */ }
    }

  } catch { /* silently handle */ }
}

function onUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete' || !isProcessableUrl(tab.url)) return;
  checkAndCloseDuplicate(tabId, tab.url);
}

function onCreated(tab) {
  if (isProcessableUrl(tab.url)) {
    checkAndCloseDuplicate(tab.id, tab.url);
  }
}

Registry.register({
  id:             'dedup',
  name:           'Auto Tab Deduplicator',
  description:    'Tự động đóng tab trùng khi mở tab mới',
  defaultEnabled: true,

  init() {
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onCreated.addListener(onCreated);
  },

  destroy() {
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onCreated.removeListener(onCreated);
  },
});
