# 🛠️ Tab Suite

**Chrome Extension · Manifest V3**

Tab Suite is a Chrome extension that consolidates three tab management tools into a single popup interface — no more juggling multiple extensions.

---

## Panels

### 🗂 Manager

The default panel. Shows all open tabs grouped by root domain, sorted by most recently accessed.

**Without filter — grouped view:**

- Each group is collapsible, showing the root domain, favicon, and tab count
- A **⧉** button on groups with multiple tabs moves them all to a new window, labeled with how many windows the tabs currently span
- A **✕** button closes all tabs in a group (active tab is closed last)
- Tabs within a group show title, URL, a focus (↗) button, and an individual close button

**With domain filter — flat list:**

- Matched tabs are listed individually with title, URL, focus, and close buttons
- Close All and New Window buttons operate on the filtered set only
- A **Host-only** checkbox narrows the list further to tabs sitting at the bare domain root (no path, no query string)

---

### 💾 Vault

Saves open tabs as bookmarks into a named folder, with smart title cleaning and 2-level domain grouping.

**Folder naming:**

- Default: `Tabs - YYYY/MM/DD`
- Exactly one domain filter active: auto-fills with the domain name
- Two or more domain filters: reverts to the date pattern

**Bookmark hierarchy (no filter):**

Tabs are saved into `Root domain → Subdomain → bookmark`. Subdomains that share the same root are nested under it; tabs sitting directly on the root domain are placed before subdomain folders. All folders sorted alphabetically.

**With domain filter active:**

Tabs are saved flat (no grouping) directly under the named folder.

**Smart title engine** (`shared/title-engine.js`):

- Strips notification prefixes like `(3)` or `[2]` from tab titles
- Strips site suffixes: `| GitHub`, `· Instagram`, `— YouTube`, etc.
- Platform-specific resolution for **Instagram** (`@username`), **Twitter/X** (`@handle (X)`), **LinkedIn** (in/ and company/), **GitHub** (`owner/repo`), **YouTube** (channel name)
- Generic suffix-stripping catch-all covers Reddit, Notion, Figma, Vercel, Jira, Slack, Spotify, and more
- All titles resolved in parallel via `Promise.all` — a 50-tab save completes in under 1 second

**Options:**

| Option | Default | Description |
|---|---|---|
| Skip duplicate URLs | ✅ on | Uses the same URL normalization as Dedup for consistency |
| Close tabs after saving | off | Preserves the currently active tab |
| Skip pinned tabs | off | Leaves pinned tabs open and unsaved |

---

### ⊗ Dedup

Finds and closes duplicate tabs. Two tabs are duplicates when their full normalized URLs (including query string and fragment) are identical.

**Scan and display:**

- Groups all duplicate tabs by normalized URL
- Each group is expandable — shows all instances with title, URL, focus (↗) and individual close buttons
- The group header shows a duplicate count; once expanded, individual rows can be closed one at a time
- When a group is reduced to one tab it is removed from the list automatically

**Domain filter:**

Narrows the display to duplicates within specific domains only. The global stats bar still reflects all duplicates regardless of filter.

**Keep mode toggle:**

Controls which tab survives when duplicates are closed:

- **Newest** (default, accent color) — keeps the most recently opened tab
- **Oldest** (warning color) — keeps the oldest tab

This preference is persisted in `chrome.storage.local` and shared with the background auto-detect feature.

**Auto-detect:**

When toggled on, the background service worker (`background/features/dedup.js`) automatically closes new duplicate tabs the moment they finish loading. The surviving tab receives focus and its window is brought forward. State persists across browser sessions.

---

## Global Stats Bar

Always visible between the tab nav and the active panel content. Shows live counters:

| Counter | Description |
|---|---|
| **Open windows** | Total browser windows. Shown in side panel mode |
| **Open tabs** | Total HTTP/HTTPS/FTP tabs across all windows |
| **Duplicates** | Number of duplicate URL groups detected. Useful context even when outside the Dedup panel — e.g. Vault's "skip duplicates" option is informed by this count |

---

## Domain Filter System

All panels share the same filter input logic, implemented once in `services/filter.js`. The input accepts a comma-separated mix of domain tokens and free-text tokens:

| Input | Behavior |
|---|---|
| `github.com, google.com` | Tabs on either domain |
| `github.com, lorem` | GitHub tabs whose URL path contains "lorem" |
| `github.com, google.com, lorem` | Tabs on either domain whose path contains "lorem" |
| `lorem` (text only) | No match — text tokens require at least one domain token |

Domain tokens are displayed as **green tags**; text search tokens appear as **blue tags** with a 🔍 prefix. Tags can be removed individually by clicking ×.

---

## Architecture

The extension uses a **module pattern** — each panel is an ES module exporting a single `init()` function. Shared utilities are loaded before panel files.

```
shared/url-utils.js
shared/dedup-core.js
shared/title-engine.js
services/storage.js
services/filter.js
services/tabs.js
popup/services/ui.js
popup/features/closer.js
popup/features/vault.js
popup/features/dedup.js
popup/index.js          ← entry point

background/registry.js
background/features/dedup.js
background/index.js     ← service worker entry point
```

### File responsibilities

| File | Role |
|---|---|
| `shared/url-utils.js` | Pure URL helpers: `normalizeUrl`, `isHttpTab`, `normDomain`, `matchesDomainFilter`, `parseDomainLevels` (PSL-aware). No DOM, no Chrome API — safe in any context. |
| `shared/dedup-core.js` | Pure duplicate-tab helpers shared by popup and background badge/dedup features. |
| `shared/title-engine.js` | Smart title resolution: `DOMAIN_RULES` plugin array, `smartTitle()`, `resolveAllTitles()`. Handles 6 platforms plus a generic suffix-stripping catch-all. |
| `services/storage.js` | Thin wrapper over `chrome.storage.local` / `chrome.storage.sync` with typed helpers. All features read/write through here. |
| `services/filter.js` | Shared domain/URL filtering: each feature registers a namespace and gets an explicit filter state object. |
| `services/tabs.js` | Thin adapter for common Chrome tab/window operations such as query, focus, close, and move-to-window. |
| `popup/services/ui.js` | DOM utilities: toast, `focusTab`, `GlobalStats`, `PanelHooks`, `createDomainFilter`, `buildTabRow`, `buildDupGroup`. Shared UI components used by all panels. |
| `popup/features/closer.js` | Manager panel — grouped overview, filtered close, new-window move, host-only toggle. |
| `popup/features/vault.js` | Vault panel — bookmark save logic, folder structure, smart title batching, domain filter state. |
| `popup/features/dedup.js` | Dedup panel — duplicate scan, grouped list render, close logic, keep-mode toggle, auto-detect wiring. |
| `popup/index.js` | Popup entry point — initializes all panels, renders Manager on boot. |
| `background/registry.js` | Feature registry for the service worker — starts registered features based on persisted enabled flags. |
| `background/features/dedup.js` | Background auto-deduplicator — listens to `tabs.onUpdated` and `tabs.onCreated`, closes duplicates immediately, respects keep-mode from storage. |
| `background/index.js` | Service worker entry point — imports features to register them, starts the registry, owns display-mode and install defaults. |

---

## Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Query, update, close, and move tabs; read `tab.url`, `tab.title`, `tab.lastAccessed`, `tab.favIconUrl` |
| `bookmarks` | Create bookmark folders and entries (Vault) |
| `storage` | Persist settings: auto-detect state, keep-mode, display mode, and theme |
| `sidePanel` | Open the extension as a Chrome side panel |

---

## Technical Notes

### URL Normalization

All duplicate detection — across Dedup, Manager, and Vault's "skip duplicates" option — uses the same `normalizeUrl()` from `shared/url-utils.js`. It preserves the full URL including query string and hash, and only rejects internal browser protocols (`chrome://`, `about:`, etc.). This keeps counts consistent across panels.

### PSL-Aware Domain Grouping

Standard `.split('.').slice(-2)` incorrectly groups unrelated sites on shared hosting platforms. `url-utils.js` maintains a curated `_PUBLIC_SUFFIXES` set covering ccTLDs (`co.uk`, `com.vn`), user hosting (`github.io`, `gitlab.io`), and cloud platforms (`vercel.app`, `netlify.app`, `railway.app`, etc.). Results are cached in `_rootDomainCache` to avoid repeated lookups.

### MV3 Service Worker Safety

MV3 service workers can be killed and restarted by Chrome at any time. Tab Suite never stores state in service worker memory. All feature flags (`autoDetect`, `keepNewest`) are read from `chrome.storage.local` on every event handler invocation.

### Favicon Loading

Favicons are loaded using `tab.favIconUrl` with a hidden `Image()` probe. On failure, a Google S2 favicon service URL is tried as a secondary fallback. If that also fails, a `🌐` span is rendered in-place using `replaceWith()`, avoiding invisible-element problems from `display:none` fallback patterns.

### Smart Title Batching

Vault resolves titles with `Promise.all(tabs.map(smartTitle))` — all tabs are processed in parallel. For a typical 50-tab session this reduces save time from ~5 s to under 1 s.
