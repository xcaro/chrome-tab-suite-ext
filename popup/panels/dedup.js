// =============================================================
// popup/panels/dedup.js
// =============================================================

import { createFilterState } from '../../core/filters.js';
import { StorageService } from '../../core/storage.js';
import { buildWindowContext } from '../../core/windows.js';
import { withButtonLock } from '../ui/buttons.js';
import { createDomainFilter } from '../ui/domain-filter.js';
import { buildExpandableGroup } from '../ui/expandable-group.js';
import { renderEmptyState } from '../ui/empty-state.js';
import { PanelHooks } from '../ui/nav.js';
import { GlobalStats } from '../ui/stats.js';
import { setToggleLabel } from '../ui/toggles.js';
import { showToast } from '../ui/toast.js';
import { closeDuplicateGroups, closeTabBestEffort, focusTab, scanDuplicates } from '../usecases/dedupe-tabs.js';

const _filter = createFilterState();
let _keepNewest = true;

async function render(cached) {
  const { allTabs, groups } = cached ?? await scanDuplicates(_filter);
  const list = document.getElementById('dupList');
  const badge = document.getElementById('dupBadge');
  const btnClose = document.getElementById('btnDedupeClose');
  const { windowNames } = buildWindowContext(allTabs);

  if (!groups.length) {
    badge.style.display = 'none';
    btnClose.disabled = true;
    const msg = _filter.hasFilters() ? 'No duplicates in filtered domains' : 'No duplicate tabs!';
    renderEmptyState(list, { icon: '✓', title: msg, subtitle: 'All tabs are unique' });
    return;
  }

  badge.style.display = '';
  badge.textContent = groups.length;
  btnClose.disabled = false;
  list.innerHTML = '';
  groups.forEach(tabs => list.appendChild(buildExpandableGroup({
    tabs,
    windowNames,
    removeGroupWhenSingle: true,
    onFocus: focusTab,
    rowActions: tab => [{
      label: '✕',
      className: 'close-tab-btn',
      title: 'Close this tab',
      onClick: async ({ removeTabRow }) => {
        await closeTabBestEffort(tab.id);
        removeTabRow();
        await render();
        await GlobalStats.refresh();
      },
    }],
  })));
  await GlobalStats.refresh();
}

async function closeAll() {
  await withButtonLock('btnDedupeClose', async () => {
    const scanned = await scanDuplicates(_filter);
    const { groups } = scanned;
    if (!groups.length) return;

    const toClose = await closeDuplicateGroups(groups, { keepNewest: _keepNewest });
    if (!toClose.length) return;

    showToast(`Closed ${toClose.length} duplicate tab(s)`);
    await render();
    await GlobalStats.refresh();
  });
}

function applyKeepUI(newest) {
  _keepNewest = newest;
  const label = document.getElementById('keepModeLabel');
  if (!label) return;
  label.textContent = newest ? 'Newest' : 'Oldest';
  label.style.color = newest ? 'var(--accent)' : 'var(--warn)';
}

async function setKeepUI(newest) {
  applyKeepUI(newest);
  await StorageService.setEnabled('keepNewest', newest);
}

async function loadKeepMode() {
  const newest = await StorageService.isEnabled('keepNewest', true);
  const keepToggle = document.getElementById('keepModeToggle');
  if (keepToggle) keepToggle.checked = newest;
  applyKeepUI(newest);
}

export function init() {
  createDomainFilter({
    tagsEl: document.getElementById('dedupDomainTags'),
    inputEl: document.getElementById('dedupDomainInput'),
    addBtn: document.getElementById('dedupAddDomainBtn'),
    filterState: _filter,
    onChange: () => {
      document.getElementById('dedupFilterHint').style.display = _filter.hasFilters() ? '' : 'none';
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
