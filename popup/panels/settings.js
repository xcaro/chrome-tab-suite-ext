// =============================================================
// popup/panels/settings.js
// =============================================================

import { StorageService } from '../../core/storage.js';
import { showToast } from '../ui/toast.js';
import { setToggleLabel } from '../ui/toggles.js';

async function loadSettings() {
  const { uiMode, theme } = await StorageService.getUiPreferences();
  const uiModeSelect = document.getElementById('settingsUiMode');
  if (uiModeSelect) uiModeSelect.value = uiMode;
  document.body.dataset.uiMode = uiMode;

  const themeSelect = document.getElementById('settingsTheme');
  if (themeSelect) themeSelect.value = theme;
  applyTheme(theme);
}

const _darkMq = window.matchMedia('(prefers-color-scheme: dark)');
let _systemThemeListener = null;

export function applyTheme(theme) {
  const prefersDark = _darkMq.matches;
  const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.body.classList.toggle('light-mode', !useDark);

  if (_systemThemeListener) {
    _darkMq.removeEventListener('change', _systemThemeListener);
    _systemThemeListener = null;
  }
  if (theme === 'system') {
    _systemThemeListener = e => {
      document.body.classList.toggle('light-mode', !e.matches);
    };
    _darkMq.addEventListener('change', _systemThemeListener);
  }
}

async function loadAutoDetect() {
  const on = await StorageService.isEnabled('autoDetect', false);
  const toggle = document.getElementById('settingsAutoDetect');
  const status = document.getElementById('settingsAutoStatus');
  if (toggle) toggle.checked = on;
  if (status) setToggleLabel(status, on);
}

export function init() {
  const uiModeSelect = document.getElementById('settingsUiMode');
  if (uiModeSelect) {
    uiModeSelect.addEventListener('change', async () => {
      await StorageService.setUiMode(uiModeSelect.value);
      document.body.dataset.uiMode = uiModeSelect.value;
      showToast('Display mode updated — takes effect on next open', 'info');
    });
  }

  const themeSelect = document.getElementById('settingsTheme');
  if (themeSelect) {
    themeSelect.addEventListener('change', async () => {
      const theme = themeSelect.value;
      await StorageService.setTheme(theme);
      applyTheme(theme);
    });
  }

  const autoToggle = document.getElementById('settingsAutoDetect');
  const autoStatus = document.getElementById('settingsAutoStatus');
  if (autoToggle) {
    autoToggle.addEventListener('change', async () => {
      const on = autoToggle.checked;
      await StorageService.setEnabled('autoDetect', on);
      if (autoStatus) setToggleLabel(autoStatus, on);
    });
  }

  loadSettings();
  loadAutoDetect();
}
