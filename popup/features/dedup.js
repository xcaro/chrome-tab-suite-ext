// =============================================================
// popup/features/dedup.js — Dedup Panel
// Depends on: shared/url-utils.js, popup/services/ui.js
// Note: auto-detect setting is owned by settings.js
// =============================================================

import { getDuplicateGroups, getDuplicateTabIdsToClose } from '../../shared/dedup-core.js';
import { FilterService } from '../../services/filter.js';
import {
  showToast, setActed, GlobalStats, setToggleLabel,
  PanelHooks, createDomainFilter, buildDupGroup, renderEmptyState, withButtonLock,
} from '../services/ui.js';
import { StorageService } from '../../services/storage.js';
import { TabsService } from '../../services/tabs.js';

// ── State ────────────────────────────────────────────────────
const _filter     = FilterService.register('dedup');
let   _keepNewest = true;

// ── Scan ─────────────────────────────────────────────────────
async function scan() {
  const allTabs = await TabsService.all();
  const allGroups = getDuplicateGroups(allTabs);

  const groups = _filter.hasFilters()
    ? allGroups.filter(tabs => _filter.shouldProcess(tabs[0].url))
    : allGroups;

  return { allTabs, allGroups, groups };
}

// ── Render ────────────────────────────────────────────────────
async function render(cached) {
  const { allTabs, allGroups, groups } = cached ?? await scan();
  const list     = document.getElementById('dupList');
  const badge    = document.getElementById('dupBadge');
  const btnClose = document.getElementById('btnDedupeClose');

  if (!groups.length) {
    badge.style.display = 'none';
    btnClose.disabled   = true;
    const msg = _filter.hasFilters() ? 'No duplicates in filtered domains' : 'No duplicate tabs!';
    renderEmptyState(list, { icon: '✓', title: msg, subtitle: 'All tabs are unique' });
    return;
  }

  badge.style.display = '';
  badge.textContent   = groups.length;
  btnClose.disabled   = false;
  list.innerHTML      = '';
  groups.forEach(tabs => list.appendChild(buildDupGroup(tabs, {
    onTabClose: async () => {
      await render();
      await GlobalStats.refresh();
    },
    removeGroupWhenSingle: true,
  })));
  await GlobalStats.refresh();
}

// ── Close all ─────────────────────────────────────────────────
async function closeAll() {
  await withButtonLock('btnDedupeClose', async () => {
    const scanned = await scan();
    const { groups } = scanned;
    if (!groups.length) return;

    const toClose = getDuplicateTabIdsToClose(groups, { keepNewest: _keepNewest });
    if (!toClose.length) return;

    await TabsService.closeBestEffort(toClose);

    await setActed(toClose.length);
    showToast(`Closed ${toClose.length} duplicate tab(s)`);
    await render();   // fresh scan needed — tabs have changed
    await GlobalStats.refresh();
  });
}

// ── Keep mode toggle ──────────────────────────────────────────
async function setKeepUI(newest) {
  _keepNewest = newest;
  const label = document.getElementById('keepModeLabel');
  if (label) {
    label.textContent  = newest ? 'Newest' : 'Oldest';
    label.style.color  = newest ? 'var(--accent)' : 'var(--warn)';
  }
  await StorageService.setEnabled('keepNewest', newest);
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
  createDomainFilter({
    tagsEl:   document.getElementById('dedupDomainTags'),
    inputEl:  document.getElementById('dedupDomainInput'),
    addBtn:   document.getElementById('dedupAddDomainBtn'),
    filterState: _filter,
    onChange: () => {
      document.getElementById('dedupFilterHint').style.display  = _filter.hasFilters() ? '' : 'none';
      document.getElementById('dedupFilterBadge').style.display = _filter.hasFilters() ? '' : 'none';
      render();
    },
  });

  document.getElementById('btnDedupeClose').addEventListener('click', closeAll);

  document.getElementById('btnDedupeScan').addEventListener('click', () => {
    const btn = document.getElementById('btnDedupeScan');
    btn.textContent = '↻ Scanning...';
    render().then(() => { btn.textContent = '↻ Rescan'; });
  });

  const keepToggle = document.getElementById('keepModeToggle');
  if (keepToggle) {
    keepToggle.addEventListener('change', () => setKeepUI(keepToggle.checked));
  }

  loadKeepMode();
  PanelHooks['dedup'] = render;
}
