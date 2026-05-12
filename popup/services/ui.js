// =============================================================
// popup/services/ui.js — UIService
// Shared DOM utilities & UI components for popup panels.
// Replaces ui-helpers.js with ES module exports.
// =============================================================

import { isHttpTab, normalizeUrl, _isDomainToken, normDomain } from '../../shared/url-utils.js';
import { StorageService } from '../../services/storage.js';

// ── Window color palette ──────────────────────────────────────────
// 10 hues as HSL — luminance/opacity adjusted per mode via CSS.
const WINDOW_HUES = [212, 28, 158, 280, 48, 340, 185, 95, 320, 8];

export function windowHueForId(windowNames, windowId) {
  const idx = [...windowNames.keys()].indexOf(windowId) % WINDOW_HUES.length;
  return WINDOW_HUES[Math.max(0, idx)];
}

// ── Toast ────────────────────────────────────────────────────
let _toastTimer = null;

export function showToast(msg, type = 'success') {
  const el  = document.getElementById('toast');
  const pfx = { success: '✅ ', error: '❌ ', info: 'ℹ️ ' }[type] ?? '';
  el.textContent = pfx + msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// ── Tab focus ────────────────────────────────────────────────
export async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// ── Acted count ──────────────────────────────────────────────
export async function setActed(n) {
  await StorageService.setActedCount(n);
  // const el = document.getElementById('gActedCount');
  // if (el) el.textContent = n;
}

// ── Global stats ─────────────────────────────────────────────
// Window count is cached and kept up-to-date via listeners so it never
// blocks the critical stats render path (tabs + dupes + acted).
let _cachedWindowCount = 0;

function _initWindowCountCache() {
  chrome.windows.getAll().then(wins => { _cachedWindowCount = wins.length; });
  chrome.windows.onCreated.addListener(() => { _cachedWindowCount++; });
  chrome.windows.onRemoved.addListener(() => { _cachedWindowCount = Math.max(0, _cachedWindowCount - 1); });
}

export const GlobalStats = {
  async _update(tabsPromise) {
    // Tabs, dupes, and acted count are fetched together on the critical path.
    // Window count is read from the cache — never awaited here.
    const [allTabs, actedCount] = await Promise.all([
      tabsPromise,
      StorageService.getActedCount(),
    ]);
    const httpTabs = allTabs.filter(isHttpTab);

    const winEl = document.getElementById('gWindowsOpen');
    if (winEl) winEl.textContent = _cachedWindowCount;

    document.getElementById('gTabsOpen').textContent = httpTabs.length;

    const urlMap = new Map();
    for (const tab of httpTabs) {
      const norm = normalizeUrl(tab.url);
      if (!norm) continue;
      urlMap.set(norm, (urlMap.get(norm) || 0) + 1);
    }
    const dupCount = [...urlMap.values()].filter(c => c > 1).length;
    const dupEl = document.getElementById('gDupCount');
    dupEl.textContent = dupCount;
    dupEl.className = 'g-stat-num' + (dupCount === 0 ? ' zero' : '');

    // const actedEl = document.getElementById('gActedCount');
    // actedEl.textContent = actedCount || '—';
    // actedEl.className = 'g-stat-num' + (actedCount > 0 ? ' warn' : '');
  },

  // initWithTabs: accepts shared tabsPromise from boot() — avoids a redundant query.
  // Resets actedCount to 0 on every popup open.
  // Also kicks off the window count cache (once, for the lifetime of the popup).
  async initWithTabs(tabsPromise) {
    _initWindowCountCache();
    await StorageService.setActedCount(0);
    return this._update(tabsPromise);
  },
  // refresh() issues its own query — called after user actions when tabs have changed.
  refresh() { return this._update(chrome.tabs.query({})); },
};

// ── Toggle label ─────────────────────────────────────────────
export function setToggleLabel(el, on) {
  el.textContent = on ? 'on' : 'off';
  el.className   = 'footer-sub ' + (on ? 'on' : 'off');
}

// ── Panel nav ────────────────────────────────────────────────

// Map from panel id (data-panel attribute) to its render/refresh function.
// Each panel registers itself here during init() so the nav can trigger
// a re-render when the user switches tabs.
// Valid keys: 'closer' | 'vault' | 'dedup' | 'settings'
/** @type {Record<string, () => void | Promise<void>>} */
export const PanelHooks = {};

export function initPanelNav() {
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
        await GlobalStats.refresh();
        PanelHooks[btn.dataset.panel]?.();
    });
  });
}

// ── Domain filter ────────────────────────────────────────────
export function createDomainFilter({ tagsEl, inputEl, addBtn, filters, onChange }) {
  function render() {
    tagsEl.innerHTML = '';
    filters.forEach((d, i) => {
      const tag     = document.createElement('div');
      const isText  = !_isDomainToken(d);
      tag.className = isText ? 'tag tag-text' : 'tag';
      const label   = isText ? `🔍 ${d}` : d;
      tag.innerHTML = `<span>${label}</span><span class="tag-remove" data-i="${i}">×</span>`;
      tagsEl.appendChild(tag);
    });
    tagsEl.querySelectorAll('.tag-remove').forEach(b =>
      b.addEventListener('click', () => {
        filters.splice(+b.dataset.i, 1);
        render();
        onChange?.();
      })
    );
  }

  function add(raw) {
    raw.split(',').map(token => {
      const t = token.trim();
      if (!t) return null;
      return _isDomainToken(t) ? normDomain(t) : t.toLowerCase();
    }).filter(Boolean).forEach(d => {
      if (!filters.includes(d)) filters.push(d);
    });
    render();
    onChange?.();
  }

  // Wire input and button
  addBtn.addEventListener('click', () => { add(inputEl.value); inputEl.value = ''; inputEl.focus(); });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inputEl.value); inputEl.value = ''; }
  });

  return { render, add };
}

// ── Favicon helper ───────────────────────────────────────────
// Load order: favIconUrl → Google S2 fallback → 🌐 emoji
function _makeFavicon(favIconUrl) {
  const fallback = () => {
    const el = document.createElement('span');
    el.textContent = '🌐';
    el.style.cssText = 'font-size:12px;flex-shrink:0';
    return el;
  };

  if (!favIconUrl) return fallback();

  const domain = (() => {
    try { return new URL(favIconUrl).hostname; } catch { return null; }
  })();

  const makeImg = (src, onError) => {
    const img = document.createElement('img');
    img.className = 'dup-favicon';
    img.src = src;
    img.addEventListener('error', () => { if (img.parentNode) img.replaceWith(onError()); });
    return img;
  };

  const googleSrc = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    : null;

  return makeImg(favIconUrl, () => googleSrc ? makeImg(googleSrc, fallback) : fallback());
}

// ── Tab row ──────────────────────────────────────────────────
export function buildTabRow(tab, idx, actions = []) {
  const row = document.createElement('div');
  row.className = 'dup-tab-row';

  let displayUrl = tab.url;
  let fullUrl    = tab.url;
  try {
    const u    = new URL(tab.url);
    fullUrl    = u.hostname.replace(/^www\./, '') + u.pathname + u.search + u.hash;
    displayUrl = fullUrl.length > 38 ? fullUrl.slice(0, 36) + '…' : fullUrl;
  } catch { /* keep raw */ }

  const meta      = document.createElement('div'); meta.className = 'tab-meta';
  const metaTitle = document.createElement('div'); metaTitle.className = 'tab-meta-title';
  metaTitle.title = tab.title || fullUrl; metaTitle.textContent = tab.title || displayUrl;
  const metaUrl   = document.createElement('div'); metaUrl.className = 'tab-meta-url';
  metaUrl.title = fullUrl; metaUrl.textContent = displayUrl;
  meta.appendChild(metaTitle); meta.appendChild(metaUrl);

  const focusBtn     = document.createElement('button');
  focusBtn.className = 'focus-btn'; focusBtn.title = 'Jump to tab'; focusBtn.textContent = '↗';
  focusBtn.addEventListener('click', async e => { e.stopPropagation(); await focusTab(tab); });

  row.appendChild(_makeFavicon(tab.favIconUrl));
  row.appendChild(meta);
  row.appendChild(focusBtn);

  for (const { label, className, title = '', onClick } of actions) {
    const btn     = document.createElement('button');
    btn.className = className; btn.textContent = label;
    if (title) btn.title = title;
    btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    row.appendChild(btn);
  }

  row.addEventListener('click', () => focusTab(tab));
  return row;
}

// ── Expandable dup group ─────────────────────────────────────
export function buildDupGroup(tabs, { onTabClose, removeGroupWhenSingle = false, windowNames, onInternalClose } = {}) {
  const sample  = tabs[0];
  const title   = sample.title || '';
  const group   = document.createElement('div'); group.className  = 'dup-group';
  const header  = document.createElement('div'); header.className = 'dup-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'dup-title'; titleEl.title = title; titleEl.textContent = title;
  const countEl   = document.createElement('div');
  countEl.className = 'dup-count'; countEl.textContent = `×${tabs.length}`;
  const chevronEl = document.createElement('div');
  chevronEl.className = 'dup-chevron'; chevronEl.textContent = '▸';

  const groupFavicon = tabs.find(t => t.favIconUrl)?.favIconUrl || null;
  header.appendChild(_makeFavicon(groupFavicon));
  header.appendChild(titleEl);
  header.appendChild(countEl);
  header.appendChild(chevronEl);

  const tabList = document.createElement('div'); tabList.className = 'dup-tab-list';

  let tabCount = tabs.length;

  // Whether to show window dividers: only when windowNames provided and >1 unique window
  const uniqueWindows = windowNames
    ? new Set(tabs.map(t => t.windowId)).size
    : 0;
  const showDividers = uniqueWindows > 1;

  let rendered = false;
  function renderRows() {
    if (rendered) return;
    rendered = true;
    let lastWindowId = null;
    let windowBlock  = null;
    tabs.forEach((tab, i) => {
      // New window block: divider + wrapper
      if (showDividers && tab.windowId !== lastWindowId) {
        const hue   = windowHueForId(windowNames, tab.windowId);
        const label = windowNames.get(tab.windowId) ?? 'W?';

        const divider = document.createElement('div');
        divider.className = 'window-divider';
        divider.textContent = label;
        divider.style.setProperty('--w-hue', hue);

        windowBlock = document.createElement('div');
        windowBlock.className = 'window-block';
        windowBlock.style.setProperty('--w-hue', hue);

        tabList.appendChild(divider);
        tabList.appendChild(windowBlock);
        lastWindowId = tab.windowId;
      }
      const actions = onTabClose ? [{
        label:     '✕',
        className: 'close-tab-btn',
        title:     'Close this tab',
        onClick:   async () => {
          try   {
            onInternalClose?.();
            await chrome.tabs.remove(tab.id);
            await setActed(1);
          }
          catch { /* already closed */ }
          tabCount--;
          if (tabCount === 0 || (removeGroupWhenSingle && tabCount === 1)) { group.remove(); }
          else { row.remove(); countEl.textContent = tabCount > 1 ? `${tabCount}` : ''; }
          onTabClose();
        },
      }] : [];
      const row = buildTabRow(tab, i, actions);
      // Append into window block when dividers active, else directly into tabList
      (windowBlock ?? tabList).appendChild(row);
    });
  }

  let open = false;
  header.addEventListener('click', () => {
    open = !open;
    if (open) renderRows();
    tabList.classList.toggle('open', open);
    chevronEl.textContent = open ? '▾' : '▸';
    header.classList.toggle('expanded', open);
  });

  group.appendChild(header);
  group.appendChild(tabList);
  return group;
}
