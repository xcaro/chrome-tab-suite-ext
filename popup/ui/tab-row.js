// =============================================================
// popup/ui/tab-row.js
// =============================================================

function makeFavicon(favIconUrl, { classPrefix = 'tabset' } = {}) {
  const fallback = () => {
    const el = document.createElement('span');
    el.textContent = '🌐';
    el.style.cssText = 'font-size:12px;flex-shrink:0';
    return el;
  };

  if (!favIconUrl) return fallback();

  const makeImg = (src, onError) => {
    const img = document.createElement('img');
    img.className = `${classPrefix}-favicon`;
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

export function buildTabRow(tab, { actions = [], onFocus, classPrefix = 'tabset' } = {}) {
  const row = document.createElement('div');
  row.className = `${classPrefix}-tab-row`;

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
  focusBtn.addEventListener('click', async e => { e.stopPropagation(); await onFocus?.(tab); });

  row.append(makeFavicon(tab.favIconUrl, { classPrefix }), meta, focusBtn);

  for (const action of actions) {
    const { label, className, title = '' } = action;
    const btn = document.createElement('button');
    btn.className = className; btn.textContent = label;
    if (title) btn.title = title;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      action.onClick?.({ tab, rowEl: row, event: e });
    });
    row.appendChild(btn);
  }

  row.addEventListener('click', () => onFocus?.(tab));
  return row;
}

export function buildFavicon(favIconUrl, options) {
  return makeFavicon(favIconUrl, options);
}
