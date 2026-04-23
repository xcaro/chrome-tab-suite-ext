// =============================================================
// shared/url-utils.js — pure URL & domain helpers
// No DOM. No Chrome API. Safe to use in any context.
// =============================================================

export function normalizeUrl(url) {
  try {
    if (!url) return null;
    const u = new URL(url);
    if (/^(chrome|chrome-extension|about|edge|moz-extension):/.test(u.protocol)) return null;
    return u.href;
  } catch { return null; }
}

export function isHttpTab(tab) {
  return !!(tab.url && /^https?:\/\/|^ftp:\/\//.test(tab.url));
}

export function normDomain(raw) {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '');
}

export function _isDomainToken(token) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(token);
}

export function parseFilters(filters) {
  return {
    domains: filters.filter(_isDomainToken),
    texts:   filters.filter(f => !_isDomainToken(f)),
  };
}

export function matchesDomainFilter(url, filters) {
  if (!filters.length) return true;
  try {
    const { domains, texts } = parseFilters(filters);
    if (!domains.length) return false;
    const u = new URL(url);
    const h = u.hostname.toLowerCase().replace(/^www\./, '');
    const domainMatch = domains.some(d => h === d || h.endsWith('.' + d));
    if (!domainMatch) return false;
    if (!texts.length) return true;
    const path = u.pathname.toLowerCase();
    return texts.some(t => path.includes(t.toLowerCase()));
  } catch { return false; }
}

const _PUBLIC_SUFFIXES = new Set([
  'co.uk','org.uk','me.uk','net.uk','ltd.uk','plc.uk',
  'com.au','net.au','org.au','edu.au',
  'com.vn','net.vn','org.vn','edu.vn',
  'com.br','net.br','org.br',
  'co.jp','ne.jp','or.jp','ac.jp',
  'co.in','net.in','org.in',
  'co.nz','net.nz','org.nz',
  'co.za','org.za','net.za',
  'com.sg','edu.sg','gov.sg',
  'com.hk','org.hk','net.hk',
  'com.tw','org.tw','net.tw',
  'com.mx','org.mx','net.mx',
  'com.ar','org.ar','net.ar',
  'com.tr','org.tr','net.tr',
  'com.ua','org.ua','net.ua',
  'com.my','com.ph','com.pk',
  'github.io','gitlab.io',
  'vercel.app','now.sh',
  'netlify.app',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'appspot.com',
  'herokuapp.com',
  'fly.dev','fly.io',
  'railway.app',
  'onrender.com',
  'azurewebsites.net','azurestaticapps.net',
  'cloudfront.net',
  's3.amazonaws.com','amplifyapp.com',
  'execute-api.amazonaws.com',
  'surge.sh',
  'repl.co','replit.dev',
  'glitch.me',
  'workers.dev',
]);

const _rootDomainCache = new Map();

function _getRootDomain(h) {
  if (_rootDomainCache.has(h)) return _rootDomainCache.get(h);
  let root;
  const parts = h.split('.');
  if (parts.length >= 3) {
    const last2 = parts.slice(-2).join('.');
    if (_PUBLIC_SUFFIXES.has(last2)) {
      root = parts[parts.length - 3] + '.' + last2;
    } else {
      for (const suffix of _PUBLIC_SUFFIXES) {
        if (h.endsWith('.' + suffix)) {
          const prefix = h.slice(0, -(suffix.length + 1));
          const pfx    = prefix.split('.');
          root = pfx[pfx.length - 1] + '.' + suffix;
          break;
        }
      }
    }
  }
  if (!root) root = parts.length >= 2 ? parts.slice(-2).join('.') : h;
  _rootDomainCache.set(h, root);
  return root;
}

export function parseDomainLevels(hostname) {
  const h    = hostname.toLowerCase().replace(/^www\./, '');
  const root = _getRootDomain(h);
  return { root, sub: h !== root ? h : null };
}
