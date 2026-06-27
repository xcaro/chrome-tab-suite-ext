// =============================================================
// core/windows.js — window labeling and grouping helpers
// =============================================================

import { isHttpTab } from './urls.js';

export const WINDOW_HUES = [212, 28, 158, 280, 48, 340, 185, 95, 320, 8];

export function windowHueForId(windowNames, windowId) {
  let idx = 0;
  for (const id of windowNames.keys()) {
    if (id === windowId) break;
    idx++;
  }
  return WINDOW_HUES[idx % WINDOW_HUES.length];
}

export function buildWindowContext(tabs) {
  const httpTabs = tabs.filter(isHttpTab);
  const allWindowIds = [...new Set(httpTabs.map(t => t.windowId))].sort((a, b) => a - b);
  return {
    windowNames: new Map(allWindowIds.map((id, i) => [id, `WINDOW ${i + 1}`])),
    windowTabCounts: new Map(allWindowIds.map(id => [id, httpTabs.filter(t => t.windowId === id).length])),
  };
}
