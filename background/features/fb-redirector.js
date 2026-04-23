// =============================================================
// background/features/fb-redirector.js — FB Auto-About Redirector
// Registers with Registry. Uses MessageBus for message handling.
// =============================================================

import { Registry }       from '../registry.js';
import { MessageBus }     from '../message-bus.js';
import { StorageService } from '../../services/storage.js';
import { getFbAboutUrl }  from '../../shared/url-utils.js';

const STORAGE_KEY = 'fbAutoRedirect';

async function scanAndRedirectAll() {
  const tabs = await chrome.tabs.query({});
  let count = 0;
  for (const tab of tabs) {
    if (!tab.url) continue;
    const aboutUrl = getFbAboutUrl(tab.url);
    if (aboutUrl) { chrome.tabs.update(tab.id, { url: aboutUrl }); count++; }
  }
  return { redirected: count };
}

async function onUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!(await StorageService.isEnabled(STORAGE_KEY, false))) return;
  const aboutUrl = getFbAboutUrl(tab.url);
  if (aboutUrl) chrome.tabs.update(tabId, { url: aboutUrl });
}

Registry.register({
  id:             'fb-redirector',
  name:           'FB Auto-About Redirector',
  description:    'Tự động redirect Facebook profile sang trang About',
  defaultEnabled: true,

  init() {
    chrome.tabs.onUpdated.addListener(onUpdated);

    // Register with central MessageBus — NOT chrome.runtime.onMessage directly
    MessageBus.register('FB_GET_STATUS', async () => {
      const enabled = await StorageService.isEnabled(STORAGE_KEY, false);
      return { enabled };
    });

    MessageBus.register('FB_SET_STATUS', async (msg) => {
      await StorageService.setEnabled(STORAGE_KEY, msg.enabled);
      return { ok: true };
    });

    MessageBus.register('FB_SCAN_NOW',  async () => scanAndRedirectAll());
  },

  destroy() {
    chrome.tabs.onUpdated.removeListener(onUpdated);
  },
});
