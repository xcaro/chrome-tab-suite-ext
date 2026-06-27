// =============================================================
// core/storage.js — Chrome storage adapter
// =============================================================

export const StorageService = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },

  async isEnabled(key, defaultValue = false) {
    const result = await chrome.storage.local.get({ [key]: defaultValue });
    return result[key];
  },

  async setEnabled(key, value) {
    return chrome.storage.local.set({ [key]: value });
  },

  async initDefaults(defaults) {
    return chrome.storage.local.set(defaults);
  },

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
