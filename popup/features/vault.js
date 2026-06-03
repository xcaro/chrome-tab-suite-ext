// =============================================================
// popup/features/vault.js — Vault Panel
// Depends on: shared/url-utils.js, shared/title-engine.js, popup/services/ui.js
// =============================================================

import { isHttpTab, normalizeUrl, parseDomainLevels, _isDomainToken } from '../../shared/url-utils.js';
import { FilterService } from '../../services/filter.js';
import { resolveAllTitles } from '../../shared/title-engine.js';
import {
  showToast, setActed, GlobalStats,
  createDomainFilter, buildTabRow, renderEmptyState,
} from '../services/ui.js';
import { TabsService } from '../../services/tabs.js';

// ── State ────────────────────────────────────────────────────
const _filter = FilterService.register('vault');

// ── Helpers ──────────────────────────────────────────────────
function formatDate(d = new Date()) {
  return `Tabs - ${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function setProgress(pct) {
  document.getElementById('progressFill').style.width = pct + '%';
}

function capitalizeDomain(domain) {
  return domain.replace(/^([a-z])/, c => c.toUpperCase());
}

function updateFolderName() {
  const inp     = document.getElementById('folderName');
  const domains = _filter.filters.filter(_isDomainToken);
  if (domains.length === 1 && _filter.filters.length === 1) {
    inp.value = capitalizeDomain(domains[0]);
  } else {
    inp.value = formatDate();
  }
}

// ── Match list preview ────────────────────────────────────────
async function renderMatchList() {
  const section = document.getElementById('vaultMatchSection');
  const list    = document.getElementById('vaultMatchList');
  const badge   = document.getElementById('vaultMatchBadge');
  const onBadge = document.getElementById('vaultFilterBadge');

  onBadge.style.display = _filter.hasFilters() ? '' : 'none';

  if (!_filter.hasFilters()) { section.style.display = 'none'; return; }

  const allTabs = await TabsService.all();
  const matched = _filter.filterTabs(allTabs);

  section.style.display = '';
  badge.textContent     = matched.length;
  list.innerHTML        = '';

  if (!matched.length) {
    renderEmptyState(list, {
      icon: '⚠',
      title: 'No tabs match',
      subtitle: 'No open tabs match the current filter',
      titleColor: 'var(--danger)',
    });
    return;
  }

  matched.forEach(tab => list.appendChild(buildTabRow(tab)));
}

// ── Bookmark save ─────────────────────────────────────────────
// Single entry point for both grouped and flat save modes.
// grouped=true  → 2-level domain hierarchy (root → subdomain → bookmarks)
// grouped=false → flat list under the parent folder
// Progress range passed in as [start, end] within the overall 0–100 scale.
async function saveTabs(tabs, titles, parentId, { grouped }) {
  const total = tabs.length;
  let   done  = 0;

  const tick = () => setProgress(50 + Math.round((++done / total) * 45));

  if (!grouped) {
    await Promise.all(tabs.map((tab, i) => chrome.bookmarks.create({ parentId, title: titles[i], url: tab.url }).then(tick)));
    return;
  }

  // Build 2-level domain tree: Map<root, Map<subOrDirect, {tab, title}[]>>
  const tree = new Map();
  tabs.forEach((tab, i) => {
    let host = '';
    try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return; }
    const { root, sub } = parseDomainLevels(host);
    if (!tree.has(root)) tree.set(root, new Map());
    const sm  = tree.get(root);
    const key = sub || '_direct';
    if (!sm.has(key)) sm.set(key, []);
    sm.get(key).push({ tab, title: titles[i] });
  });

  for (const root of [...tree.keys()].sort()) {
    const sm = tree.get(root);
    const rf = await chrome.bookmarks.create({ parentId, title: root });
    const keys = [...sm.keys()].sort((a, b) =>
      a === '_direct' ? -1 : b === '_direct' ? 1 : a.localeCompare(b)
    );
    await Promise.all(keys.map(async key => {
      const items  = sm.get(key);
      const target = key === '_direct' ? rf.id
        : (await chrome.bookmarks.create({ parentId: rf.id, title: key })).id;
      await Promise.all(items.map(({ tab, title }) =>
        chrome.bookmarks.create({ parentId: target, title, url: tab.url }).then(tick)
      ));
    }));
  }
}

// ── Main save ─────────────────────────────────────────────────
async function save() {
  const btn        = document.getElementById('saveBtn');
  const folderName = document.getElementById('folderName').value.trim() || formatDate();
  const skipDupes  = document.getElementById('skipDupes').checked;
  const closeTabs  = document.getElementById('closeTabs').checked;
  const skipPinned = document.getElementById('skipPinned').checked;

  btn.disabled  = true;
  btn.innerHTML = '<span>⏳</span> Saving…';
  setProgress(10);

  try {
    let tabs = await TabsService.all();
    if (skipPinned) tabs = tabs.filter(t => !t.pinned);
    tabs = tabs.filter(isHttpTab);
    if (_filter.hasFilters()) tabs = _filter.filterTabs(tabs);
    if (skipDupes) {
      const seen = new Set();
      tabs = tabs.filter(t => {
        const key = normalizeUrl(t.url) ?? t.url;
        return seen.has(key) ? false : (seen.add(key), true);
      });
    }
    if (!tabs.length) { showToast('No valid tabs to save', 'error'); return; }

    setProgress(20);
    const titles = await resolveAllTitles(tabs);
    setProgress(40);

    const root    = await chrome.bookmarks.create({ parentId: '1', title: folderName });
    const grouped = !_filter.hasFilters();
    setProgress(50);

    await saveTabs(tabs, titles, root.id, { grouped });

    setProgress(100);

    if (closeTabs) {
      const cur = await TabsService.activeInCurrentWindow();
      const toClose = tabs.map(t => t.id).filter(id => id !== cur?.id);
      const skipped = tabs.length - toClose.length;
      if (toClose.length) await TabsService.close(toClose);
      if (skipped) showToast(`Saved ${tabs.length} tabs — 1 tab kept open (active)`, 'info');
    }

    await setActed(tabs.length);
    await GlobalStats.refresh();
    const note = _filter.hasFilters() ? ` (${_filter.filters.join(', ')})` : '';
    showToast(`Saved ${tabs.length} tabs to "${folderName}"${note}`);
    setTimeout(() => setProgress(0), 1500);

  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    setProgress(0);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<span>💾</span> Save all tabs';
  }
}

// ── Init ─────────────────────────────────────────────────────
export function init() {
  document.getElementById('folderName').value = formatDate();

  createDomainFilter({
    tagsEl:   document.getElementById('vaultDomainTags'),
    inputEl:  document.getElementById('vaultDomainInput'),
    addBtn:   document.getElementById('vaultAddDomainBtn'),
    filterState: _filter,
    onChange: () => { updateFolderName(); renderMatchList(); },
  });

  document.getElementById('saveBtn').addEventListener('click', save);
}
