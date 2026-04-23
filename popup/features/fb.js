// =============================================================
// popup/features/fb.js — FB About Panel
// Depends on: shared/url-utils.js, popup/services/ui.js
// =============================================================

import { getFbAboutUrl } from '../../shared/url-utils.js';
import { showToast, setActed, setToggleLabel, PanelHooks, buildTabRow } from '../services/ui.js';

// ── State ────────────────────────────────────────────────────
let _candidates = [];   // [{ tab, aboutUrl }]
let _hasScanned = false;

// ── Render candidate list ─────────────────────────────────────
function renderCandidates() {
  const container = document.getElementById('fbCandidateList');
  const btnAll    = document.getElementById('btnFbRedirectAll');
  const hint      = document.getElementById('fbEmptyHint');
  container.innerHTML = '';

  if (!_hasScanned) {
    hint.style.display   = '';
    btnAll.style.display = 'none';
    return;
  }

  hint.style.display = 'none';

  if (!_candidates.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">✓</div>
        <div class="e-title">No tabs need redirecting</div>
        <div>All Facebook tabs are already on About page</div>
      </div>`;
    btnAll.style.display = 'none';
    return;
  }

  btnAll.style.display = '';
  btnAll.innerHTML     = `<span>↗</span> Redirect all (${_candidates.length})`;

  _candidates.forEach(({ tab, aboutUrl }, idx) => {
    const row = buildTabRow(tab, idx, [{
      label:     'About',
      className: 'about-btn',
      title:     'Redirect to About page',
      onClick:   async () => {
        await chrome.tabs.update(tab.id, { url: aboutUrl });
        _candidates.splice(idx, 1);
        await setActed(1);
        renderCandidates();
        showToast('Redirected 1 tab');
      },
    }]);
    row.querySelector('.focus-btn')?.classList.add('visible');
    container.appendChild(row);
  });
}

// ── Auto-redirect toggle UI ───────────────────────────────────
function setAutoUI(on) {
  document.getElementById('fbAutoToggle').checked = on;
  setToggleLabel(document.getElementById('fbAutoLabel'), on);
}

// ── Init ─────────────────────────────────────────────────────
export function init() {
  // Scan button
  document.getElementById('btnFbScan').addEventListener('click', async () => {
    const btn    = document.getElementById('btnFbScan');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Scanning...';

    const tabs  = await chrome.tabs.query({});
    _candidates = tabs
      .filter(t => t.url)
      .map(t => ({ tab: t, aboutUrl: getFbAboutUrl(t.url) }))
      .filter(x => x.aboutUrl);

    _hasScanned  = true;
    btn.disabled = false;
    btn.innerHTML = '<span>🔄</span> Rescan';
    renderCandidates();
  });

  // Redirect all
  document.getElementById('btnFbRedirectAll').addEventListener('click', async () => {
    const btn    = document.getElementById('btnFbRedirectAll');
    btn.disabled = true;
    const count  = _candidates.length;

    for (const { tab, aboutUrl } of [..._candidates]) {
      await chrome.tabs.update(tab.id, { url: aboutUrl });
    }
    _candidates  = [];
    await setActed(count);
    renderCandidates();
    showToast(`Redirected ${count} Facebook tab(s)`);
    btn.disabled = false;
  });

  // Auto-redirect toggle
  const toggle = document.getElementById('fbAutoToggle');
  toggle.addEventListener('change', () => {
    const on = toggle.checked;
    chrome.runtime.sendMessage({ type: 'FB_SET_STATUS', enabled: on })
      .then(() => {
        setAutoUI(on);
        showToast(on ? 'FB Auto-redirect enabled' : 'FB Auto-redirect disabled', on ? 'success' : 'info');
      })
      .catch(() => {});
  });

  // Load current state from background SW
  chrome.runtime.sendMessage({ type: 'FB_GET_STATUS' })
    .then(res => { if (res) setAutoUI(res.enabled); })
    .catch(() => {});

  PanelHooks['fb'] = renderCandidates;
}
