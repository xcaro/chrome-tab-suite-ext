// =============================================================
// popup/index.js — Popup Entry Point
// Initializes UI services then each panel.
// To add a new panel: import its init() and call it here.
// =============================================================

import { GlobalStats, PanelHooks, initPanelNav } from './services/ui.js';
import { init as initCloser } from './features/closer.js';
import { init as initVault  } from './features/vault.js';
import { init as initDedup  } from './features/dedup.js';

async function boot() {
  initPanelNav();

  initCloser();
  initVault();
  initDedup();

  await GlobalStats.init();

  // Defer Manager render — popup appears immediately, content loads after
  requestAnimationFrame(() => PanelHooks['closer']?.());
}

boot();
