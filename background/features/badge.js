// =============================================================
// background/features/badge.js — Duplicate Count Badge
// Shows the number of duplicate tab groups on the extension icon.
// Clears the badge automatically when there are no duplicates.
// =============================================================

import { Registry }     from '../registry.js';
import { normalizeUrl } from '../../shared/url-utils.js';

const BADGE_COLOR = '#E0462A';

function _isProcessable(url) {
  return !!(url && /^(https?|ftp):\/\//.test(url));
}

// Count URL groups that have 2+ tabs → number of "duplicate groups"
async function updateBadge() {
  try {
    const allTabs = await chrome.tabs.query({});
    const counts  = new Map();

    for (const tab of allTabs) {
      if (!_isProcessable(tab.url)) continue;
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

// Throttle rapid-fire tab events (e.g. bulk open/close)
let _timer = null;
function scheduleUpdate() {
  if (_timer) return;
  _timer = setTimeout(() => {
    _timer = null;
    updateBadge();
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
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
  },
});
