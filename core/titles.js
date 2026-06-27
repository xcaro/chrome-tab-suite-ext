// =============================================================
// core/titles.js — smart bookmark title resolution
// =============================================================

const _NOTE_PREFIX = /^[\(\[•]\s*\d+\s*[\)\]•]?\s*/;

const _GENERIC_SITES = [
  'Reddit','TikTok','Pinterest','Medium','Wikipedia','Notion','Figma',
  'Vercel','Netlify','Jira','Confluence','Trello','Asana','Slack',
  'Spotify','Netflix','Google','AWS','Azure','Cloudflare','GitLab','Bitbucket',
];

const DOMAIN_RULES = [
  {
    match:         h => h === 'instagram.com' || h.endsWith('.instagram.com'),
    genericTitles: ['instagram'],
    stripSuffix:   /\s*[|\-–—·•]\s*Instagram\s*$/i,
    alwaysResolve: true,
    _skip:         new Set(['p', 'reel', 'explore', 'stories', 'direct', 'accounts']),
    async resolveTitle(tab) {
      const m = new URL(tab.url).pathname.replace(/\/$/, '').match(/^\/([^/?#]+)/);
      return m && !this._skip.has(m[1]) ? `@${m[1]}` : null;
    },
  },
  {
    match:         h => h === 'twitter.com' || h === 'x.com',
    genericTitles: ['twitter', 'x', 'x / twitter'],
    stripSuffix:   /\s*[|\-–—·•]\s*(X|Twitter)\s*$/i,
    async resolveTitle(tab) {
      const m    = new URL(tab.url).pathname.replace(/\/$/, '').match(/^\/([^/?#]+)/);
      const SKIP = new Set(['home','explore','notifications','messages','i','settings','search']);
      return m && !SKIP.has(m[1]) ? `@${m[1]} (X)` : null;
    },
  },
  {
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
  },
  {
    match:         h => h === 'github.com',
    genericTitles: ['github'],
    stripSuffix:   /\s*[|\-–—·•]\s*GitHub\s*$/i,
    async resolveTitle(tab) {
      const pts = new URL(tab.url).pathname.split('/').filter(Boolean);
      if (pts.length === 1) return `${pts[0]} (GitHub)`;
      if (pts.length >= 2) return `${pts[0]}/${pts[1]} (GitHub)`;
      return null;
    },
  },
  {
    match:         h => h === 'youtube.com' || h === 'youtu.be',
    genericTitles: ['youtube'],
    stripSuffix:   /\s*[|\-–—·•]\s*YouTube\s*$/i,
    async resolveTitle(tab) {
      const u = new URL(tab.url);
      if (u.searchParams.get('v')) return null;
      const m = u.pathname.match(/^\/@?([^/?#]+)/);
      return m ? `${m[1]} (YouTube)` : null;
    },
  },
  {
    match:         () => true,
    genericTitles: [],
    stripSuffix:   new RegExp(`\\s*[|\\-–—·•]\\s*(${_GENERIC_SITES.join('|')})\\s*$`, 'i'),
    async resolveTitle() { return null; },
  },
];

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
