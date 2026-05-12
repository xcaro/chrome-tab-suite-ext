// =============================================================
// background/features/badge.js — Duplicate Count Badge
// Shows the number of duplicate tab groups on the extension icon.
// Clears the badge automatically when there are no duplicates.
// =============================================================

import { Registry }          from '../registry.js';
import { normalizeUrl, isProcessableUrl } from '../../shared/url-utils.js';

const BADGE_COLOR = '#E0462A';

// Count URL groups that have 2+ tabs → number of "duplicate groups"
async function updateBadge() {
  try {
    const allTabs = await chrome.tabs.query({});
    const counts  = new Map();

    for (const tab of allTabs) {
      if (!isProcessableUrl(tab.url)) continue;
      const norm = normalizeUrl(tab.url);
      if (!norm) continue;
      counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }

    const dupGroups = [...counts.values()].filter(n => n >= 2).length;

    if (dupGroups > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
      await chrome.action.setBadgeText({ text: String(dupGroups) });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch { /* service worker may have been killed mid-flight */ }
}

// Leading + trailing debounce: fires immediately on the first event, then
// once more after a 300ms quiet period following the last event.
// This keeps the badge responsive for single tab changes while still
// coalescing rapid bulk close/open sequences (e.g. "Close all").
let _timer    = null;
let _pending  = false;

function scheduleUpdate() {
  if (!_timer) {
    // Leading edge: fire immediately
    updateBadge();
  } else {
    // Mark that another event arrived while the cooldown is running
    _pending = true;
  }
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    if (_pending) {
      _pending = false;
      updateBadge();
    }
  }, 300);
}

function onUpdated(_tabId, changeInfo) {
  if (changeInfo.status === 'complete' || changeInfo.url) scheduleUpdate();
}
function onCreated()  { scheduleUpdate(); }
function onRemoved()  { scheduleUpdate(); }
function onReplaced() { scheduleUpdate(); }

Registry.register({
  id:             'badge',
  name:           'Duplicate Badge',
  description:    'Hiển thị số nhóm tab trùng lên icon extension',
  defaultEnabled: true,

  init() {
    updateBadge(); // paint immediately on startup
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onReplaced.addListener(onReplaced);
  },

  destroy() {
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onCreated.removeListener(onCreated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
    chrome.tabs.onReplaced.removeListener(onReplaced);
    clearTimeout(_timer);
    _timer   = null;
    _pending = false;
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
  },
});
