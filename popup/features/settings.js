// =============================================================
// popup/features/settings.js — Settings Panel
// Owns: uiMode (popup/sidepanel), autoDetect (dedup)
// Depends on: services/storage.js, popup/services/ui.js
// =============================================================

import { StorageService } from '../../services/storage.js';
import { showToast, setToggleLabel } from '../services/ui.js';

// ── UI Mode ───────────────────────────────────────────────────
async function loadUiMode() {
  const { uiMode = 'sidepanel' } = await chrome.storage.sync.get('uiMode');
  const select = document.getElementById('settingsUiMode');
  if (select) select.value = uiMode;
}

async function applyUiMode(mode) {
  await chrome.storage.sync.set({ uiMode: mode });
  // background.js listens to storage.onChanged and calls applyUiMode() there
}

// ── Theme ─────────────────────────────────────────────────────
export function applyTheme(theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.body.classList.toggle('light-mode', !useDark);
}

async function loadTheme() {
  const { theme = 'system' } = await chrome.storage.sync.get('theme');
  const select = document.getElementById('settingsTheme');
  if (select) select.value = theme;
  applyTheme(theme);
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
      await applyUiMode(uiModeSelect.value);
      showToast('Display mode updated — takes effect on next open', 'info');
    });
  }

  // Theme select
  const themeSelect = document.getElementById('settingsTheme');
  if (themeSelect) {
    themeSelect.addEventListener('change', async () => {
      const theme = themeSelect.value;
      await chrome.storage.sync.set({ theme });
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

  loadUiMode();
  loadTheme();
  loadAutoDetect();
}
