// =============================================================
// background/features/auto-dedup.js — Auto Tab Deduplicator
// =============================================================

import { Registry } from '../registry.js';
import { StorageService } from '../../core/storage.js';
import { TabsService } from '../../core/tabs.js';
import { isProcessableUrl } from '../../core/urls.js';
import { getDuplicateTabsForUrl } from '../../core/duplicates.js';

const STORAGE_KEY = 'autoDetect';
const KEEP_NEWEST_KEY = 'keepNewest';

let _autoDetect = false;
let _keepNewest = true;

async function loadSettings() {
  _autoDetect = await StorageService.isEnabled(STORAGE_KEY, false);
  _keepNewest = await StorageService.isEnabled(KEEP_NEWEST_KEY, true);
}

function onStorageChanged(changes) {
  if (STORAGE_KEY in changes) _autoDetect = changes[STORAGE_KEY].newValue;
  if (KEEP_NEWEST_KEY in changes) _keepNewest = changes[KEEP_NEWEST_KEY].newValue;
}

const _processing = new Set();

async function checkAndCloseDuplicate(newTabId, newTabUrl) {
  if (!_autoDetect) return;
  if (!isProcessableUrl(newTabUrl)) return;
  if (_processing.has(newTabId)) return;

  const allTabs = await TabsService.all();
  const duplicates = getDuplicateTabsForUrl(allTabs, newTabId, newTabUrl);
  if (!duplicates.length) return;

  _processing.add(newTabId);
  try {
    if (_keepNewest) {
      await TabsService.closeBestEffort(duplicates.map(t => t.id));
      try { await TabsService.focus(newTabId); } catch { /* new tab may have been closed */ }
    } else {
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
  id: 'dedup',
  defaultEnabled: true,

  async init() {
    await loadSettings();
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onCreated.addListener(onCreated);
  },
});
