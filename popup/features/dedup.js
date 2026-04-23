// =============================================================
// popup/features/dedup.js — Dedup Panel
// Depends on: shared/url-utils.js, popup/services/ui.js
// =============================================================

import { normalizeUrl } from '../../shared/url-utils.js';
import { FilterService } from '../../services/filter.js';
import {
  showToast, setActed, GlobalStats, setToggleLabel,
  PanelHooks, createDomainFilter, buildDupGroup,
} from '../services/ui.js';
import { StorageService } from '../../services/storage.js';

// ── State ────────────────────────────────────────────────────
const _filters    = FilterService.register('dedup');
let   _domainFilter;
let   _keepNewest = true;

// ── Scan ─────────────────────────────────────────────────────
async function scan() {
  const allTabs = await chrome.tabs.query({});
  const urlMap  = new Map();

  for (const tab of allTabs) {
    const norm = normalizeUrl(tab.url);
    if (!norm) continue;
    if (!urlMap.has(norm)) urlMap.set(norm, []);
    urlMap.get(norm).push(tab);
  }

  const allGroups = [];
  for (const tabs of urlMap.values()) {
    if (tabs.length > 1) allGroups.push(tabs);
  }

  const groups = FilterService.hasFilters('dedup')
    ? allGroups.filter(tabs => FilterService.shouldProcess('dedup', tabs[0].url))
    : allGroups;

  return { allTabs, allGroups, groups };
}

// ── Render ────────────────────────────────────────────────────
async function render() {
  const { allTabs, allGroups, groups } = await scan();
  const list     = document.getElementById('dupList');
  const badge    = document.getElementById('dupBadge');
  const btnClose = document.getElementById('btnDedupeClose');

  if (!groups.length) {
    badge.style.display = 'none';
    btnClose.disabled   = true;
    const msg = FilterService.hasFilters('dedup') ? 'No duplicates in filtered domains' : 'No duplicate tabs!';
    list.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">✓</div>
        <div class="e-title">${msg}</div>
        <div>All tabs are unique</div>
      </div>`;
    return;
  }

  badge.style.display = '';
  badge.textContent   = groups.length;
  btnClose.disabled   = false;
  list.innerHTML      = '';
  groups.forEach(tabs => list.appendChild(buildDupGroup(tabs, {
      onTabClose: async () => {
        const list = document.getElementById('dupList');
        if (!list.children.length) {
          await render();
        }
        await GlobalStats.refresh();
      },
      removeGroupWhenSingle: true,
  })));
  await GlobalStats.refresh();
}

// ── Close all ─────────────────────────────────────────────────
async function closeAll() {
  const { groups } = await scan();
  if (!groups.length) return;

  let closed = 0;
  for (const tabs of groups) {
    const toClose = _keepNewest
      ? tabs.slice(0, -1).map(t => t.id)
      : tabs.slice(1).map(t => t.id);
    for (const id of toClose) {
      try { await chrome.tabs.remove(id); closed++; } catch { /* already closed */ }
    }
  }

  await setActed(closed);
  showToast(`Closed ${closed} duplicate tab(s)`);
  setTimeout(async () => {
      await render();
      await GlobalStats.refresh();
  }, 400);
}

// ── Keep mode toggle ──────────────────────────────────────────
// Shows "Newest" (accent) or "Oldest" (warn) — never "on"/"off"
// so users always know which tab survives dedup.
async function setKeepUI(newest) {
  _keepNewest = newest;
  const label = document.getElementById('keepModeLabel');
  if (label) {
    label.textContent  = newest ? 'Newest' : 'Oldest';
    label.style.color  = newest ? 'var(--accent)' : 'var(--warn)';
  }
  // Persist so background auto-detect uses the same strategy
  await StorageService.setEnabled('keepNewest', newest);
}

// ── Auto-detect toggle ────────────────────────────────────────
function setAutoUI(on) {
  setToggleLabel(document.getElementById('autoStatus'), on);
}

async function loadAutoDetect() {
  const on = await StorageService.isEnabled('autoDetect', false);
  document.getElementById('autoToggle').checked = on;
  setAutoUI(on);
}

async function loadKeepMode() {
  const newest = await StorageService.isEnabled('keepNewest', true);
  const keepToggle = document.getElementById('keepModeToggle');
  if (keepToggle) keepToggle.checked = newest;
  _keepNewest = newest;
  const label = document.getElementById('keepModeLabel');
  if (label) {
    label.textContent = newest ? 'Newest' : 'Oldest';
    label.style.color = newest ? 'var(--accent)' : 'var(--warn)';
  }
}

// ── Init ─────────────────────────────────────────────────────
export function init() {
  _domainFilter = createDomainFilter({
    tagsEl:   document.getElementById('dedupDomainTags'),
    inputEl:  document.getElementById('dedupDomainInput'),
    addBtn:   document.getElementById('dedupAddDomainBtn'),
    filters:  _filters,
    onChange: () => {
      document.getElementById('dedupFilterHint').style.display  = FilterService.hasFilters('dedup') ? '' : 'none';
      document.getElementById('dedupFilterBadge').style.display = FilterService.hasFilters('dedup') ? '' : 'none';
      render();
    },
  });

  document.getElementById('btnDedupeClose').addEventListener('click', closeAll);

  document.getElementById('btnDedupeScan').addEventListener('click', () => {
    const btn = document.getElementById('btnDedupeScan');
    btn.textContent = '↻ Scanning...';
    render().then(() => { btn.innerHTML = '<span>↻</span> Rescan'; });
  });

  const keepToggle = document.getElementById('keepModeToggle');
  if (keepToggle) {
    keepToggle.addEventListener('change', () => setKeepUI(keepToggle.checked));
  }

  const autoToggle = document.getElementById('autoToggle');
  autoToggle.addEventListener('change', async () => {
    const on = autoToggle.checked;
    await StorageService.setEnabled('autoDetect', on);
    chrome.runtime.sendMessage({ type: 'SET_AUTO_DETECT', enabled: on }).catch(() => {});
    setAutoUI(on);
  });

  loadAutoDetect();
  loadKeepMode();
  PanelHooks['dedup'] = render;
}
