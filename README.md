# Tab Suite

Chrome extension for managing open tabs from one popup or side panel.

## Features

### Manager

- Shows open tabs grouped by root domain.
- Filters tabs by domain and optional URL path text.
- Closes individual tabs, whole domain groups, or the current filtered set.
- Moves a domain group or filtered set into a new window.
- Filters and merges tabs across browser windows.
- Host-only mode shows only tabs at a domain root.

### Vault

- Saves open tabs into a bookmarks folder.
- Uses a default folder name like `Tabs - YYYY/MM/DD`.
- Auto-fills the folder name when exactly one domain filter is active.
- Saves unfiltered tabs as `Root domain -> Subdomain -> bookmark`.
- Saves filtered tabs as a flat bookmark list.
- Cleans noisy tab titles for common sites like GitHub, LinkedIn, Instagram, X/Twitter, and YouTube.
- Options: skip duplicate URLs, close tabs after saving, and skip pinned tabs.

### Dedup

- Finds duplicate tabs by normalized full URL.
- Shows duplicate groups with expandable tab rows.
- Closes duplicate tabs while keeping either the newest or oldest tab.
- Filters duplicate groups by domain.
- Can auto-detect and close duplicates as new tabs finish loading.
- Shows duplicate count on the extension badge.

### Settings

- Opens either as a side panel or popup.
- Supports system, dark, and light themes.
- Persists auto-detect and keep-mode preferences.

## Permissions

| Permission | Purpose |
|---|---|
| `tabs` | Query, focus, move, and close browser tabs |
| `bookmarks` | Save Vault folders and bookmarks |
| `storage` | Persist preferences |
| `sidePanel` | Open the extension as a Chrome side panel |

## Development

```sh
npm test
```
