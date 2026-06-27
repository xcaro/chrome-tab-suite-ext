// =============================================================
// popup/ui/live-tab-refresh.js
// =============================================================

import { GlobalStats } from './stats.js';
import { PanelHooks } from './nav.js';
import { TabsService } from '../../core/tabs.js';

function activePanelName() {
  return document.querySelector('.tab-nav-btn.active')?.dataset.panel ?? 'closer';
}

export function refreshActivePanel() {
  return PanelHooks[activePanelName()]?.();
}

export async function refreshPopupState() {
  await GlobalStats.refresh();
  await refreshActivePanel();
}

function tabSnapshotKey(tabs) {
  return tabs
    .map(tab => [
      tab.id,
      tab.windowId,
      tab.index,
      tab.url ?? '',
      tab.title ?? '',
      tab.favIconUrl ?? '',
      tab.pinned ? 1 : 0,
      tab.status ?? '',
    ].join('|'))
    .sort()
    .join('\n');
}

export function initLiveTabRefresh({ onChange = refreshPopupState, debounceMs = 80, pollMs = 1000 } = {}) {
  let changeTimer = null;
  let lastSnapshot = null;

  const syncIfChanged = async () => {
    const tabs = await TabsService.all();
    const nextSnapshot = tabSnapshotKey(tabs);
    if (nextSnapshot === lastSnapshot) return;
    lastSnapshot = nextSnapshot;
    await onChange();
  };

  const scheduleSync = () => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(async () => {
      changeTimer = null;
      await syncIfChanged();
    }, debounceMs);
  };

  syncIfChanged();

  chrome.tabs.onCreated.addListener(scheduleSync);
  chrome.tabs.onRemoved.addListener(scheduleSync);
  chrome.tabs.onReplaced.addListener(scheduleSync);
  chrome.tabs.onMoved.addListener(scheduleSync);
  chrome.tabs.onAttached.addListener(scheduleSync);
  chrome.tabs.onDetached.addListener(scheduleSync);
  chrome.tabs.onUpdated.addListener(scheduleSync);
  chrome.windows.onCreated.addListener(scheduleSync);
  chrome.windows.onRemoved.addListener(scheduleSync);
  chrome.windows.onFocusChanged.addListener(scheduleSync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });
  window.addEventListener('focus', scheduleSync);
  setInterval(syncIfChanged, pollMs);
}
