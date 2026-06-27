// =============================================================
// popup/app.js — UI entry point
// =============================================================

import { StorageService } from '../core/storage.js';
import { TabsService } from '../core/tabs.js';
import { initPanelNav, PanelHooks } from './ui/nav.js';
import { GlobalStats } from './ui/stats.js';
import { initLiveTabRefresh } from './ui/live-tab-refresh.js';
import { init as initManager } from './panels/manager.js';
import { init as initVault } from './panels/vault.js';
import { init as initDedup } from './panels/dedup.js';
import { init as initSettings, applyTheme } from './panels/settings.js';

StorageService.getUiPreferences().then(({ theme, uiMode }) => {
  applyTheme(theme);
  document.body.dataset.uiMode = uiMode;
});

async function boot() {
  initPanelNav();

  initManager();
  initVault();
  initDedup();
  initSettings();

  const tabsPromise = TabsService.all();
  await Promise.all([
    GlobalStats.initWithTabs(tabsPromise),
    PanelHooks['closer']?.(tabsPromise),
  ]);
  initLiveTabRefresh();
}

boot();
