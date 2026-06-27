// =============================================================
// popup/services/ui.js — UIService
// Shared DOM utilities & UI components for popup panels.
// =============================================================

import { isHttpTab, normalizeUrl, _isDomainToken, normDomain } from '../../shared/url-utils.js';
import { TabsService } from '../../services/tabs.js';

// ── Window color palette ──────────────────────────────────────────────────────
const WINDOW_HUES = [212, 28, 158, 280, 48, 340, 185, 95, 320, 8];

export function windowHueForId(windowNames, windowId) {
  let idx = 0;
  for (const id of windowNames.keys()) {
    if (id === windowId) break;
    idx++;
  }
  return WINDOW_HUES[idx % WINDOW_HUES.length];
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;

export function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const pfx = { success: '✅ ', error: '❌ ', info: 'ℹ️ ' }[type] ?? '';
  el.textContent = pfx + msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// ── Tab focus ─────────────────────────────────────────────────────────────────
export async function focusTab(tab) {
  await TabsService.focus(tab);
}

// ── Toggle label ──────────────────────────────────────────────────────────────
export function setToggleLabel(el, on) {
  el.textContent = on ? 'on' : 'off';
  el.className   = 'footer-sub ' + (on ? 'on' : 'off');
}

// ── Common UI helpers ────────────────────────────────────────────────────────
export function buildEmptyState({ icon = '✓', title, subtitle, titleColor = '' }) {
  const root = document.createElement('div');
  root.className = 'empty-state';

  const iconEl = document.createElement('div');
  iconEl.className = 'e-icon';
  iconEl.textContent = icon;

  const titleEl = document.createElement('div');
  titleEl.className = 'e-title';
  titleEl.textContent = title;
  if (titleColor) titleEl.style.color = titleColor;

  const subtitleEl = document.createElement('div');
  subtitleEl.textContent = subtitle;

  root.append(iconEl, titleEl, subtitleEl);
  return root;
}

export function renderEmptyState(container, options) {
  container.replaceChildren(buildEmptyState(options));
}

export async function withButtonLock(btnOrId, fn) {
  const btn = typeof btnOrId === 'string' ? document.getElementById(btnOrId) : btnOrId;
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}

// ── Global stats ──────────────────────────────────────────────────────────────
// Window count is cached via listeners so it never blocks the stats render path.
let _cachedWindowCount = 0;

function _initWindowCountCache() {
  chrome.windows.getAll().then(wins => { _cachedWindowCount = wins.length; });
  chrome.windows.onCreated.addListener(() => { _cachedWindowCount++; });
  chrome.windows.onRemoved.addListener(() => { _cachedWindowCount = Math.max(0, _cachedWindowCount - 1); });
}

export const GlobalStats = {
  async _update(tabsPromise) {
    const allTabs = await tabsPromise;
    const httpTabs = allTabs.filter(isHttpTab);

    const winEl = document.getElementById('gWindowsOpen');
    if (winEl) winEl.textContent = _cachedWindowCount;
    document.getElementById('gTabsOpen').textContent = httpTabs.length;

    const urlMap = new Map();
    for (const tab of httpTabs) {
      const norm = normalizeUrl(tab.url);
      if (norm) urlMap.set(norm, (urlMap.get(norm) || 0) + 1);
    }
    const dupCount = [...urlMap.values()].filter(c => c > 1).length;
    const dupEl    = document.getElementById('gDupCount');
    dupEl.textContent = dupCount;
    dupEl.className   = 'g-stat-num' + (dupCount === 0 ? ' zero' : '');
  },

  // Called once at boot with the shared tabs promise — avoids a redundant query.
  async initWithTabs(tabsPromise) {
    _initWindowCountCache();
    return this._update(tabsPromise);
  },

  // Called after user actions when tabs have changed.
  refresh() { return this._update(TabsService.all()); },
};

// ── Panel nav ─────────────────────────────────────────────────────────────────
// Each panel registers a render fn here during init() so the nav can trigger
// a refresh when the user switches tabs.
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

// ── Domain filter ─────────────────────────────────────────────────────────────
export function createDomainFilter({ tagsEl, inputEl, addBtn, filterState, filters = filterState?.filters ?? [], onChange }) {
  function renderTags() {
    tagsEl.innerHTML = '';
    filters.forEach((d, i) => {
      const isText  = !_isDomainToken(d);
      const tag     = document.createElement('div');
      tag.className = isText ? 'tag tag-text' : 'tag';
      tag.innerHTML = `<span>${isText ? `🔍 ${d}` : d}</span><span class="tag-remove" data-i="${i}">×</span>`;
      tagsEl.appendChild(tag);
    });
    tagsEl.querySelectorAll('.tag-remove').forEach(b =>
      b.addEventListener('click', () => { filters.splice(+b.dataset.i, 1); renderTags(); onChange?.(); })
    );
  }

  function add(raw) {
    raw.split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => _isDomainToken(t) ? normDomain(t) : t.toLowerCase())
      .filter(d => d && !filters.includes(d))
      .forEach(d => filters.push(d));
    renderTags();
    onChange?.();
  }

  addBtn.addEventListener('click', () => { add(inputEl.value); inputEl.value = ''; inputEl.focus(); });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inputEl.value); inputEl.value = ''; }
  });

  return { render: renderTags, add };
}

// ── Favicon ───────────────────────────────────────────────────────────────────
function _makeFavicon(favIconUrl) {
  const fallback = () => {
    const el = document.createElement('span');
    el.textContent = '🌐';
    el.style.cssText = 'font-size:12px;flex-shrink:0';
    return el;
  };

  if (!favIconUrl) return fallback();

  const makeImg = (src, onError) => {
    const img = document.createElement('img');
    img.className = 'dup-favicon';
    img.src = src;
    img.addEventListener('error', () => { if (img.parentNode) img.replaceWith(onError()); });
    return img;
  };

  let domain = null;
  try { domain = new URL(favIconUrl).hostname; } catch { /* keep null */ }

  const googleFallback = domain
    ? () => makeImg(`https://www.google.com/s2/favicons?domain=${domain}&sz=16`, fallback)
    : fallback;

  return makeImg(favIconUrl, googleFallback);
}

// ── Tab row ───────────────────────────────────────────────────────────────────
export function buildTabRow(tab, actions = []) {
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
  meta.append(metaTitle, metaUrl);

  const focusBtn     = document.createElement('button');
  focusBtn.className = 'focus-btn'; focusBtn.title = 'Jump to tab'; focusBtn.textContent = '↗';
  focusBtn.addEventListener('click', async e => { e.stopPropagation(); await focusTab(tab); });

  row.append(_makeFavicon(tab.favIconUrl), meta, focusBtn);

  for (const { label, className, title = '', onClick } of actions) {
    const btn = document.createElement('button');
    btn.className = className; btn.textContent = label;
    if (title) btn.title = title;
    btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    row.appendChild(btn);
  }

  row.addEventListener('click', () => focusTab(tab));
  return row;
}

// ── Dup group ─────────────────────────────────────────────────────────────────
export function buildDupGroup(tabs, { onTabClose, removeGroupWhenSingle = false, windowNames, onInternalClose } = {}) {
  const group    = document.createElement('div'); group.className = 'dup-group';
  const header   = document.createElement('div'); header.className = 'dup-header';
  const titleEl  = document.createElement('div'); titleEl.className = 'dup-title';
  const countEl  = document.createElement('div'); countEl.className = 'dup-count';
  const chevron  = document.createElement('div'); chevron.className = 'dup-chevron'; chevron.textContent = '▸';
  const tabList  = document.createElement('div'); tabList.className = 'dup-tab-list';

  const title = tabs[0].title || '';
  titleEl.title = titleEl.textContent = title;
  countEl.textContent = `×${tabs.length}`;

  header.append(_makeFavicon(tabs.find(t => t.favIconUrl)?.favIconUrl ?? null), titleEl, countEl, chevron);

  const showDividers = windowNames && new Set(tabs.map(t => t.windowId)).size > 0;
  let tabCount = tabs.length;
  let rendered = false;

  function renderRows() {
    if (rendered) return;
    rendered = true;

    let lastWindowId = null;
    let windowBlock  = null;

    tabs.forEach((tab, i) => {
      if (showDividers && tab.windowId !== lastWindowId) {
        const hue   = windowHueForId(windowNames, tab.windowId);
        const label = windowNames.get(tab.windowId) ?? 'W?';

        const divider = document.createElement('div');
        divider.className   = 'window-divider';
        divider.textContent = label;
        divider.style.setProperty('--w-hue', hue);

        windowBlock = document.createElement('div');
        windowBlock.className = 'window-block';
        windowBlock.style.setProperty('--w-hue', hue);

        tabList.append(divider, windowBlock);
        lastWindowId = tab.windowId;
      }

      const closeAction = onTabClose ? [{
        label: '✕', className: 'close-tab-btn', title: 'Close this tab',
        onClick: async () => {
          try {
            onInternalClose?.(tab.id);
            await TabsService.close(tab.id);
          } catch { /* already closed */ }
          tabCount--;
          if (tabCount === 0 || (removeGroupWhenSingle && tabCount === 1)) group.remove();
          else { row.remove(); countEl.textContent = tabCount > 1 ? `${tabCount}` : ''; }
          onTabClose();
        },
      }] : [];

      const row = buildTabRow(tab, closeAction);
      (windowBlock ?? tabList).appendChild(row);
    });
  }

  let open = false;
  header.addEventListener('click', () => {
    open = !open;
    if (open) renderRows();
    tabList.classList.toggle('open', open);
    chevron.textContent = open ? '▾' : '▸';
    header.classList.toggle('expanded', open);
  });

  group.append(header, tabList);
  return group;
}
