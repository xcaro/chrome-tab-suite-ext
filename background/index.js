// =============================================================
// background/index.js — Service Worker Entry Point
// Import features to register them, then start all.
// To add a new background feature: just import it here.
// =============================================================

import { Registry }    from './registry.js';
import { MessageBus }  from './message-bus.js';
import { StorageService } from '../services/storage.js';

// ── Register features (order = load order only, not priority) ──
import './features/dedup.js';

// ── Register core message handlers ──────────────────────────
// Simple ack — dedup reads storage directly, no relay needed
MessageBus.register('SET_AUTO_DETECT', async () => ({ ok: true }));
MessageBus.register('GET_FEATURES',    async () => ({ features: Registry.getAll() }));

// ── Boot ─────────────────────────────────────────────────────
// MessageBus.listen() MUST be called after all handlers are registered
MessageBus.listen();
Registry.startAll();

// ── Open side panel on action click ─────────────────────────
// (no default_popup in manifest, so this event fires on icon click)
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// ── Onboarding ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  await StorageService.initDefaults({
    autoDetect:      false,
    actedCount:      0,
    enabledFeatures: {},
  });
});
