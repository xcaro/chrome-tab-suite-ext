// =============================================================
// popup/features/settings.js — Settings Panel
// Owns: uiMode (popup/sidepanel), autoDetect (dedup)
// Depends on: services/storage.js, popup/services/ui.js
// =============================================================

import { StorageService } from '../../services/storage.js';
import { showToast, setToggleLabel } from '../services/ui.js';

// ── UI Mode + Theme ───────────────────────────────────────────
async function loadSettings() {
  const { uiMode, theme } = await StorageService.getUiPreferences();
  const uiModeSelect = document.getElementById('settingsUiMode');
  if (uiModeSelect) uiModeSelect.value = uiMode;
  const themeSelect = document.getElementById('settingsTheme');
  if (themeSelect) themeSelect.value = theme;
  applyTheme(theme);
}

// ── Theme ─────────────────────────────────────────────────────
const _darkMq = window.matchMedia('(prefers-color-scheme: dark)');
let   _systemThemeListener = null;

export function applyTheme(theme) {
  const prefersDark = _darkMq.matches;
  const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.body.classList.toggle('light-mode', !useDark);

  // Wire or unwire the system change listener based on current theme setting
  if (_systemThemeListener) {
    _darkMq.removeEventListener('change', _systemThemeListener);
    _systemThemeListener = null;
  }
  if (theme === 'system') {
    _systemThemeListener = (e) => {
      document.body.classList.toggle('light-mode', !e.matches);
    };
    _darkMq.addEventListener('change', _systemThemeListener);
  }
}

// ── Auto-detect ───────────────────────────────────────────────
async function loadAutoDetect() {
  const on = await StorageService.isEnabled('autoDetect', false);
  const toggle = document.getElementById('settingsAutoDetect');
  const status = document.getElementById('settingsAutoStatus');
  if (toggle) toggle.checked = on;
  if (status) setToggleLabel(status, on);
}

// ── Init ─────────────────────────────────────────────────────
export function init() {
  // UI Mode select
  const uiModeSelect = document.getElementById('settingsUiMode');
  if (uiModeSelect) {
    uiModeSelect.addEventListener('change', async () => {
      await StorageService.setUiMode(uiModeSelect.value);
      showToast('Display mode updated — takes effect on next open', 'info');
    });
  }

  // Theme select
  const themeSelect = document.getElementById('settingsTheme');
  if (themeSelect) {
    themeSelect.addEventListener('change', async () => {
      const theme = themeSelect.value;
      await StorageService.setTheme(theme);
      applyTheme(theme);
    });
  }

  // Auto-detect toggle
  const autoToggle = document.getElementById('settingsAutoDetect');
  const autoStatus = document.getElementById('settingsAutoStatus');
  if (autoToggle) {
    autoToggle.addEventListener('change', async () => {
      const on = autoToggle.checked;
      await StorageService.setEnabled('autoDetect', on);
      chrome.runtime.sendMessage({ type: 'SET_AUTO_DETECT', enabled: on }).catch(() => {});
      if (autoStatus) setToggleLabel(autoStatus, on);
    });
  }

  loadSettings();
  loadAutoDetect();
}
