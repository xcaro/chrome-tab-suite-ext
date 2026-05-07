// =============================================================
// popup/index.js — Popup Entry Point
// Initializes UI services then each panel.
// To add a new panel: import its init() and call it here.
// =============================================================

import { GlobalStats, PanelHooks, initPanelNav } from './services/ui.js';
import { init as initCloser   } from './features/closer.js';
import { init as initVault    } from './features/vault.js';
import { init as initDedup    } from './features/dedup.js';
import { init as initSettings } from './features/settings.js';

async function boot() {
  initPanelNav();

  initCloser();
  initVault();
  initDedup();
  initSettings();

  // Single tabs.query shared by both stats and first render — no redundant call.
  // Both run concurrently: popup content appears immediately without waiting for stats.
  const tabsPromise = chrome.tabs.query({});
  await Promise.all([
    GlobalStats.initWithTabs(tabsPromise),
    PanelHooks['closer']?.(tabsPromise),
  ]);
}

boot();
