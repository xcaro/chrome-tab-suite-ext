// =============================================================
// popup/panels/vault.js
// =============================================================

import { isDomainToken } from '../../core/urls.js';
import { createFilterState } from '../../core/filters.js';
import { createDomainFilter } from '../ui/domain-filter.js';
import { renderEmptyState } from '../ui/empty-state.js';
import { buildTabRow } from '../ui/tab-row.js';
import { GlobalStats } from '../ui/stats.js';
import { showToast } from '../ui/toast.js';
import { focusTab, formatVaultDate, previewVaultTabs, saveVault } from '../usecases/save-vault.js';

const _filter = createFilterState();

function setProgress(pct) {
  const fill = document.getElementById('progressFill');
  if (!fill) return;
  const bar = fill.closest('.progress-bar');
  fill.style.width = pct + '%';
  bar?.classList.toggle('active', pct > 0);
}

function capitalizeDomain(domain) {
  return domain.replace(/^([a-z])/, c => c.toUpperCase());
}

function updateFolderName() {
  const inp = document.getElementById('folderName');
  const domains = _filter.filters.filter(isDomainToken);
  inp.value = domains.length === 1 && _filter.filters.length === 1
    ? capitalizeDomain(domains[0])
    : formatVaultDate();
}

async function renderMatchList() {
  const section = document.getElementById('vaultMatchSection');
  const list = document.getElementById('vaultMatchList');
  const badge = document.getElementById('vaultMatchBadge');
  const onBadge = document.getElementById('vaultFilterBadge');

  onBadge.style.display = _filter.hasFilters() ? '' : 'none';

  if (!_filter.hasFilters()) { section.style.display = 'none'; return; }

  const matched = await previewVaultTabs(_filter);
  section.style.display = '';
  badge.textContent = matched.length;
  list.innerHTML = '';

  if (!matched.length) {
    renderEmptyState(list, {
      icon: '⚠',
      title: 'No tabs match',
      subtitle: 'No open tabs match the current filter',
      titleColor: 'var(--danger)',
    });
    return;
  }

  matched.forEach(tab => list.appendChild(buildTabRow(tab, { onFocus: focusTab })));
}

async function save() {
  const btn = document.getElementById('saveBtn');
  const folderName = document.getElementById('folderName').value.trim() || formatVaultDate();
  const skipDupes = document.getElementById('skipDupes').checked;
  const closeTabs = document.getElementById('closeTabs').checked;
  const skipPinned = document.getElementById('skipPinned').checked;

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Saving…';
  setProgress(10);

  try {
    const result = await saveVault({
      filterState: _filter,
      folderName,
      skipDupes,
      closeTabs,
      skipPinned,
      onProgress: setProgress,
    });

    if (!result.savedCount) {
      setProgress(0);
      showToast('No valid tabs to save', 'error');
      return;
    }

    if (result.skippedActiveCount) {
      showToast(`Saved ${result.savedCount} tabs — 1 tab kept open (active)`, 'info');
    }

    await GlobalStats.refresh();
    showToast(`Saved ${result.savedCount} tabs to "${folderName}"${result.filterNote}`);
    setTimeout(() => setProgress(0), 1500);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    setProgress(0);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> Save all tabs';
  }
}

export function init() {
  document.getElementById('folderName').value = formatVaultDate();

  createDomainFilter({
    tagsEl: document.getElementById('vaultDomainTags'),
    inputEl: document.getElementById('vaultDomainInput'),
    addBtn: document.getElementById('vaultAddDomainBtn'),
    filterState: _filter,
    onChange: () => { updateFolderName(); renderMatchList(); },
  });

  document.getElementById('saveBtn').addEventListener('click', save);
}
