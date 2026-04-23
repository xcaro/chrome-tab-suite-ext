// =============================================================
// popup/index.js — Popup Entry Point
// Initializes UI services then each panel.
// To add a new panel: import its init() and call it here.
// =============================================================

import { GlobalStats, PanelHooks, initPanelNav } from './services/ui.js';
import { init as initCloser } from './features/closer.js';
import { init as initVault  } from './features/vault.js';
import { init as initDedup  } from './features/dedup.js';
import { init as initFb     } from './features/fb.js';

async function boot() {
  initPanelNav();

  initCloser();
  initVault();
  initDedup();
  initFb();

  await GlobalStats.init();

  // Defer Manager render — popup appears immediately, content loads after
  requestAnimationFrame(() => PanelHooks['closer']?.());
}

// Press '4' to toggle FB About panel visibility (hidden by default)
document.addEventListener('keydown', e => {
  if (e.key === '4' && e.target.tagName !== 'INPUT') {
    const btn      = document.getElementById('fbNavBtn');
    const isHidden = btn.style.display === 'none';
    btn.style.display = isHidden ? '' : 'none';
    if (!isHidden && btn.classList.contains('active')) {
      document.querySelector('[data-panel="vault"]').click();
    }
  }
});

boot();
