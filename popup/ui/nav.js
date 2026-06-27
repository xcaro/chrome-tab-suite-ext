// =============================================================
// popup/ui/nav.js
// =============================================================

import { GlobalStats } from './stats.js';

export const PanelHooks = {};

export function initPanelNav() {
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
      await GlobalStats.refresh();
      PanelHooks[btn.dataset.panel]?.();
    });
  });
}
