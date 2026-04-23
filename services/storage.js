// =============================================================
// services/storage.js — StorageService
// Thin wrapper around chrome.storage.local with typed helpers.
// All features read/write through here — no raw chrome.storage calls
// scattered across feature files.
// =============================================================

export const StorageService = {

  async get(keys) {
    return chrome.storage.local.get(keys);
  },

  async set(data) {
    return chrome.storage.local.set(data);
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

  async resetActedCount() {
    return chrome.storage.local.set({ actedCount: 0 });
  },

  // ── Defaults on install ──────────────────────────────────
  async initDefaults(defaults) {
    return chrome.storage.local.set(defaults);
  },
};
