// =============================================================
// background/features/dedup.js — Auto Tab Deduplicator
// Registers with Registry. Uses StorageService + FilterService.
// =============================================================

import { Registry }                        from '../registry.js';
import { StorageService }                  from '../../services/storage.js';
import { TabsService }                     from '../../services/tabs.js';
import { isProcessableUrl }                from '../../shared/url-utils.js';
import { getDuplicateTabsForUrl }          from '../../shared/dedup-core.js';

const STORAGE_KEY     = 'autoDetect';
const KEEP_NEWEST_KEY = 'keepNewest';

// ── Settings cache ────────────────────────────────────────────────────────────
// Read once at init, kept in sync via storage.onChanged.
// Avoids 2 storage reads on every tab event.
let _autoDetect = false;
let _keepNewest = true;

async function loadSettings() {
  _autoDetect = await StorageService.isEnabled(STORAGE_KEY, false);
  _keepNewest = await StorageService.isEnabled(KEEP_NEWEST_KEY, true);
}

function onStorageChanged(changes) {
  if (STORAGE_KEY     in changes) _autoDetect = changes[STORAGE_KEY].newValue;
  if (KEEP_NEWEST_KEY in changes) _keepNewest = changes[KEEP_NEWEST_KEY].newValue;
}

// ── Re-entrant guard ──────────────────────────────────────────────────────────
// Tracks tab IDs currently being processed so a Chrome-fired onUpdated/onCreated
// event for a tab we're already closing doesn't trigger a second dedup run.
const _processing = new Set();

async function checkAndCloseDuplicate(newTabId, newTabUrl) {
  if (!_autoDetect)                  return;
  if (!isProcessableUrl(newTabUrl))  return;
  if (_processing.has(newTabId))     return;

  const allTabs    = await TabsService.all();
  const duplicates = getDuplicateTabsForUrl(allTabs, newTabId, newTabUrl);
  if (!duplicates.length) return;

  _processing.add(newTabId);
  try {
    if (_keepNewest) {
      // Close all existing duplicates at once, keep the new tab
      await TabsService.closeBestEffort(duplicates.map(t => t.id));
      try { await TabsService.focus(newTabId); } catch { /* new tab may have been closed */ }
    } else {
      // Close the new tab, focus the oldest existing duplicate
      await TabsService.closeBestEffort(newTabId);
      const oldest = duplicates.reduce((a, b) =>
        (a.lastAccessed || 0) <= (b.lastAccessed || 0) ? a : b
      );
      try { await TabsService.focus(oldest); } catch { /* tab may have been closed */ }
    }
  } finally {
    _processing.delete(newTabId);
  }
}

function onUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete' || !isProcessableUrl(tab.url)) return;
  checkAndCloseDuplicate(tabId, tab.url);
}

function onCreated(tab) {
  if (isProcessableUrl(tab.url)) checkAndCloseDuplicate(tab.id, tab.url);
}

Registry.register({
  id:             'dedup',
  name:           'Auto Tab Deduplicator',
  description:    'Tự động đóng tab trùng khi mở tab mới',
  defaultEnabled: true,

  async init() {
    await loadSettings();
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onCreated.addListener(onCreated);
  },

  destroy() {
    chrome.storage.onChanged.removeListener(onStorageChanged);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onCreated.removeListener(onCreated);
    _processing.clear();
  },
});
