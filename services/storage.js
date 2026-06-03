// =============================================================
// services/storage.js — StorageService
// Thin wrapper around chrome.storage with typed helpers.
// All features read/write through here — no raw chrome.storage calls
// scattered across feature files.
// =============================================================

export const StorageService = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },

  // ── Per-feature helpers ──────────────────────────────────

  async isEnabled(key, defaultValue = false) {
    const result = await chrome.storage.local.get({ [key]: defaultValue });
    return result[key];
  },

  async setEnabled(key, value) {
    return chrome.storage.local.set({ [key]: value });
  },

  async getActedCount() {
    const { actedCount = 0 } = await chrome.storage.local.get({ actedCount: 0 });
    return actedCount;
  },

  async setActedCount(n) {
    return chrome.storage.local.set({ actedCount: n });
  },

  // ── Defaults on install ──────────────────────────────────
  async initDefaults(defaults) {
    return chrome.storage.local.set(defaults);
  },

  // ── Synced UI preferences ────────────────────────────────
  async getUiPreferences() {
    const prefs = await chrome.storage.sync.get({ theme: 'system', uiMode: 'sidepanel' });
    return {
      ...prefs,
      uiMode: prefs.uiMode === 'popup' || prefs.uiMode === 'sidepanel' ? prefs.uiMode : 'sidepanel',
    };
  },

  async getUiMode() {
    const { uiMode = 'sidepanel' } = await chrome.storage.sync.get({ uiMode: 'sidepanel' });
    return uiMode === 'popup' || uiMode === 'sidepanel' ? uiMode : 'sidepanel';
  },

  async setUiMode(uiMode) {
    const normalized = uiMode === 'popup' || uiMode === 'sidepanel' ? uiMode : 'sidepanel';
    return chrome.storage.sync.set({ uiMode: normalized });
  },

  async setTheme(theme) {
    return chrome.storage.sync.set({ theme });
  },
};
