// =============================================================
// background/index.js — Service Worker Entry Point
// Import features to register them, then start all.
// To add a new background feature: just import it here.
// =============================================================

import { Registry }       from './registry.js';
import { MessageBus }     from './message-bus.js';
import { StorageService } from '../services/storage.js';

// ── Register features ────────────────────────────────────────
import './features/dedup.js';
import './features/badge.js';

// ── Register core message handlers ──────────────────────────
MessageBus.register('SET_AUTO_DETECT', async () => ({ ok: true }));
MessageBus.register('GET_FEATURES',    async () => ({ features: Registry.getAll() }));

// ── Boot ─────────────────────────────────────────────────────
MessageBus.listen();
Registry.startAll();

// ── UI Mode ──────────────────────────────────────────────────
// Cache uiMode in memory so action.onClicked can read it synchronously.
// sidePanel.open() must be called without any await before it — the
// browser revokes the user-gesture token the moment the call stack yields.
let _uiMode = 'sidepanel';

const UI_MODE_HANDLERS = {
  popup:     () => chrome.action.setPopup({ popup: 'popup.html' }),
  sidepanel: () => chrome.action.setPopup({ popup: '' }),
};

async function applyUiMode() {
  const uiMode = await StorageService.getUiMode();
  _uiMode = uiMode;
  await UI_MODE_HANDLERS[uiMode]?.();
}

// Sync cache on every service worker startup (MV3 workers are not persistent)
chrome.runtime.onStartup.addListener(applyUiMode);

// Re-sync immediately when user changes the setting
chrome.storage.onChanged.addListener(({ uiMode }) => uiMode && applyUiMode());

// Handle icon click — only fires when popup is cleared (sidepanel mode).
// IMPORTANT: sidePanel.open() must be the first call — no await before it.
chrome.action.onClicked.addListener((tab) => {
  if (_uiMode === 'sidepanel') {
    // Call open() synchronously within the gesture handler, then do the rest
    chrome.sidePanel.open({ windowId: tab.windowId });
    chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
  }
  // popup mode: this listener never fires because action has a popup set
});

// ── Onboarding ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  await StorageService.initDefaults({
    autoDetect:      false,
    actedCount:      0,
    enabledFeatures: {},
  });
  // Default uiMode to sidepanel on fresh install
  await StorageService.setUiMode('sidepanel');
  await applyUiMode();
});
