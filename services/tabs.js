// =============================================================
// services/tabs.js — Chrome tab/window operations
// Keeps feature modules focused on use-cases and UI state.
// =============================================================

export const TabsService = {
  all() {
    return chrome.tabs.query({});
  },

  activeInCurrentWindow() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs[0] ?? null);
  },

  async focus(tabOrId) {
    const tab = typeof tabOrId === 'number'
      ? await chrome.tabs.get(tabOrId)
      : tabOrId;
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  },

  async close(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) return;
    return chrome.tabs.remove(list);
  },

  async closeBestEffort(ids) {
    try { await this.close(ids); } catch { /* some tabs may already be closed */ }
  },

  async moveToNewWindow(tabs) {
    const sorted = [...tabs].sort((a, b) => a.index - b.index);
    const newWin = await chrome.windows.create({ tabId: sorted[0].id, focused: false });
    const rest = sorted.slice(1).map(tab => tab.id);
    if (rest.length) await chrome.tabs.move(rest, { windowId: newWin.id, index: -1 });
    return newWin.id;
  },
};
