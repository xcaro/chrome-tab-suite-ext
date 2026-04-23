// =============================================================
// popup/features/vault.js — Vault Panel
// Depends on: shared/url-utils.js, shared/title-engine.js, popup/services/ui.js
// =============================================================

import { isHttpTab, normalizeUrl, parseDomainLevels, _isDomainToken } from '../../shared/url-utils.js';
import { FilterService } from '../../services/filter.js';
import { resolveAllTitles } from '../../shared/title-engine.js';
import {
  showToast, setActed, GlobalStats,
  createDomainFilter, buildTabRow,
} from '../services/ui.js';

// ── State ────────────────────────────────────────────────────
const _filters = FilterService.register('vault');
let   _domainFilter;

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
  const domains = _filters.filter(_isDomainToken);
  if (domains.length === 1 && _filters.length === 1) {
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

  onBadge.style.display = FilterService.hasFilters('vault') ? '' : 'none';

  if (!FilterService.hasFilters('vault')) { section.style.display = 'none'; return; }

  const allTabs = await chrome.tabs.query({});
  const matched = FilterService.filterTabs('vault', allTabs);

  section.style.display = '';
  badge.textContent     = matched.length;
  list.innerHTML        = '';

  if (!matched.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">⚠</div>
        <div class="e-title" style="color:var(--danger)">No tabs match</div>
        <div>No open tabs match the current filter</div>
      </div>`;
    return;
  }

  matched.forEach((tab, i) => list.appendChild(buildTabRow(tab, i)));
}

// ── Bookmark save — grouped ───────────────────────────────────
async function saveGrouped(tabs, titles, parentId) {
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

  const roots = [...tree.keys()].sort();
  let done = 0;

  for (const root of roots) {
    const sm   = tree.get(root);
    const rf   = await chrome.bookmarks.create({ parentId, title: root });
    const keys = [...sm.keys()].sort((a, b) =>
      a === '_direct' ? -1 : b === '_direct' ? 1 : a.localeCompare(b)
    );
    for (const key of keys) {
      const items  = sm.get(key);
      const target = key === '_direct' ? rf.id
        : (await chrome.bookmarks.create({ parentId: rf.id, title: key })).id;
      for (const { tab, title } of items) {
        await chrome.bookmarks.create({ parentId: target, title, url: tab.url });
        setProgress(50 + Math.round((++done / tabs.length) * 45));
      }
    }
  }
}

// ── Bookmark save — flat ──────────────────────────────────────
async function saveFlat(tabs, titles, parentId) {
  for (let i = 0; i < tabs.length; i++) {
    await chrome.bookmarks.create({ parentId, title: titles[i], url: tabs[i].url });
    setProgress(50 + Math.round(((i + 1) / tabs.length) * 45));
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
    let tabs = await chrome.tabs.query({});
    if (skipPinned) tabs = tabs.filter(t => !t.pinned);
    tabs = tabs.filter(isHttpTab);
    if (FilterService.hasFilters('vault')) tabs = FilterService.filterTabs('vault', tabs);
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

    const root = await chrome.bookmarks.create({ parentId: '1', title: folderName });
    setProgress(50);

    if (FilterService.hasFilters('vault')) await saveFlat(tabs, titles, root.id);
    else                                     await saveGrouped(tabs, titles, root.id);

    setProgress(100);

    if (closeTabs) {
      const cur = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const ids = tabs.map(t => t.id).filter(id => id !== cur?.id);
      if (ids.length) await chrome.tabs.remove(ids);
    }

    await setActed(tabs.length);
    await GlobalStats.refresh();
    const note = FilterService.hasFilters('vault') ? ` (${_filters.join(', ')})` : '';
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

  _domainFilter = createDomainFilter({
    tagsEl:   document.getElementById('vaultDomainTags'),
    inputEl:  document.getElementById('vaultDomainInput'),
    addBtn:   document.getElementById('vaultAddDomainBtn'),
    filters:  _filters,
    onChange: () => { updateFolderName(); renderMatchList(); },
  });

  document.getElementById('saveBtn').addEventListener('click', save);
}
