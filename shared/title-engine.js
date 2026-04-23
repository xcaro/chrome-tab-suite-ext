// =============================================================
// shared/title-engine.js — smart bookmark title resolution
// =============================================================

const _NOTE_PREFIX = /^[\(\[•]\s*\d+\s*[\)\]•]?\s*/;

async function fetchTitleFromTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || /^(chrome|chrome-extension|about|edge|moz-extension):/.test(tab.url)) {
      return null;
    }
    const r = await chrome.scripting.executeScript({
      target: { tabId },
      func:   () => document.title,
    });
    return r?.[0]?.result?.trim() || null;
  } catch { return null; }
}

const DOMAIN_RULES = [];

DOMAIN_RULES.push({
  match:         h => h === 'facebook.com' || h.endsWith('.facebook.com'),
  genericTitles: ['facebook', 'log into facebook', 'facebook – log in or sign up'],
  stripSuffix:   /\s*[|\-–—]\s*Facebook\s*$/i,
  async resolveTitle(tab) {
    const u    = new URL(tab.url);
    const path = u.pathname.replace(/\/$/, '');
    if (u.pathname === '/profile.php' && u.searchParams.get('id')) {
      const id = u.searchParams.get('id');
      const lt = await fetchTitleFromTab(tab.id);
      if (lt) {
        const c = lt.replace(/\s*[|\-–—]\s*Facebook.*$/i, '').trim();
        if (c && !this.genericTitles.includes(c.toLowerCase())) return `${c} (Facebook)`;
      }
      return `ID:${id} (Facebook)`;
    }
    const NON  = new Set(['watch','marketplace','gaming','events','pages','stories',
      'notifications','messages','groups','friends','reels','videos','photos',
      'saved','bookmarks','live','fundraisers']);
    const slug = path.match(/^\/([^/?#]+)/);
    if (slug && !NON.has(slug[1])) {
      const lt = await fetchTitleFromTab(tab.id);
      if (lt) {
        const c = lt.replace(/\s*[|\-–—]\s*Facebook.*$/i, '').trim();
        if (c && !this.genericTitles.includes(c.toLowerCase())) return `${c} (Facebook)`;
      }
      return `${slug[1].replace(/\./g, ' ')} (Facebook)`;
    }
    const gm = path.match(/^\/groups\/([^/?#]+)/);
    if (gm) return `${gm[1].replace(/[-_.]/g, ' ')} (Facebook Group)`;
    return null;
  },
});

DOMAIN_RULES.push({
  match:         h => h === 'instagram.com' || h.endsWith('.instagram.com'),
  genericTitles: ['instagram'],
  stripSuffix:   /\s*[|\-–—·•]\s*Instagram\s*$/i,
  alwaysResolve: true,
  _skip:         new Set(['p', 'reel', 'explore', 'stories', 'direct', 'accounts']),
  async resolveTitle(tab) {
    const m = new URL(tab.url).pathname.replace(/\/$/, '').match(/^\/([^/?#]+)/);
    return m && !this._skip.has(m[1]) ? `@${m[1]}` : null;
  },
});

DOMAIN_RULES.push({
  match:         h => h === 'twitter.com' || h === 'x.com',
  genericTitles: ['twitter', 'x', 'x / twitter'],
  stripSuffix:   /\s*[|\-–—·•]\s*(X|Twitter)\s*$/i,
  async resolveTitle(tab) {
    const m    = new URL(tab.url).pathname.replace(/\/$/, '').match(/^\/([^/?#]+)/);
    const SKIP = new Set(['home','explore','notifications','messages','i','settings','search']);
    return m && !SKIP.has(m[1]) ? `@${m[1]} (X)` : null;
  },
});

DOMAIN_RULES.push({
  match:         h => h === 'linkedin.com' || h.endsWith('.linkedin.com'),
  genericTitles: ['linkedin'],
  stripSuffix:   /\s*[|\-–—·•]\s*LinkedIn\s*$/i,
  async resolveTitle(tab) {
    const p   = new URL(tab.url).pathname;
    const inM = p.match(/^\/in\/([^/?#]+)/);
    if (inM) return `${inM[1].replace(/-/g, ' ')} (LinkedIn)`;
    const coM = p.match(/^\/company\/([^/?#]+)/);
    if (coM) return `${coM[1].replace(/-/g, ' ')} (LinkedIn)`;
    return null;
  },
});

DOMAIN_RULES.push({
  match:         h => h === 'github.com',
  genericTitles: ['github'],
  stripSuffix:   /\s*[|\-–—·•]\s*GitHub\s*$/i,
  async resolveTitle(tab) {
    const pts = new URL(tab.url).pathname.split('/').filter(Boolean);
    if (pts.length === 1) return `${pts[0]} (GitHub)`;
    if (pts.length >= 2) return `${pts[0]}/${pts[1]} (GitHub)`;
    return null;
  },
});

DOMAIN_RULES.push({
  match:         h => h === 'youtube.com' || h === 'youtu.be',
  genericTitles: ['youtube'],
  stripSuffix:   /\s*[|\-–—·•]\s*YouTube\s*$/i,
  async resolveTitle(tab) {
    const u = new URL(tab.url);
    if (u.searchParams.get('v')) return null;
    const m = u.pathname.match(/^\/@?([^/?#]+)/);
    return m ? `${m[1]} (YouTube)` : null;
  },
});

const _GENERIC_SITES = [
  'Reddit','TikTok','Pinterest','Medium','Wikipedia','Notion','Figma',
  'Vercel','Netlify','Jira','Confluence','Trello','Asana','Slack',
  'Spotify','Netflix','Google','AWS','Azure','Cloudflare','GitLab','Bitbucket',
];
DOMAIN_RULES.push({
  match:         () => true,
  genericTitles: [],
  stripSuffix:   new RegExp(`\\s*[|\\-–—·•]\\s*(${_GENERIC_SITES.join('|')})\\s*$`, 'i'),
  async resolveTitle() { return null; },
});

export async function smartTitle(tab) {
  const raw = (tab.title || '').trim();
  let host  = '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); }
  catch { return raw || tab.url; }
  const rule     = DOMAIN_RULES.find(r => r.match(host));
  if (!rule) return raw || tab.url;
  const denoted  = raw.replace(_NOTE_PREFIX, '').trim();
  const stripped = denoted.replace(rule.stripSuffix || /(?:)/, '').trim();
  const generic  = !stripped
    || rule.genericTitles.includes(denoted.toLowerCase())
    || rule.genericTitles.includes(stripped.toLowerCase());
  if (generic || rule.alwaysResolve) {
    return (await rule.resolveTitle(tab)) || stripped || raw || tab.url;
  }
  return stripped;
}

export async function resolveAllTitles(tabs) {
  return Promise.all(tabs.map(tab => smartTitle(tab)));
}
