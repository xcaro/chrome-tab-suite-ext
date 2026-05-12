# TODO — Refactor & Optimize

## 🔴 Quan trọng — nên sửa

### Bug tiềm ẩn: Dedup panel thiếu window dividers
**File:** `popup/features/dedup.js` → `buildDupGroup()`

`buildDupGroup()` trong `dedup.js` không truyền `windowNames`, nên các tab trùng ở nhiều cửa sổ khác nhau sẽ không có divider phân chia. Closer panel truyền đủ `windowNames`, nhưng Dedup thì không.

**Fix:** Thêm `windowNames` vào `buildDupGroup()` call trong `dedup.js`, hoặc document rõ đây là behavior có chủ ý.

---

### Race condition: `suppressNextRemoved` có thể bị desync
**File:** `popup/features/closer.js` → `suppressNextRemoved`

Cơ chế `_internalCloseCount` dùng `setTimeout 500ms` để reset. Nếu user đóng nhiều tab nhanh (bulk close) và Chrome delay hơn 500ms mới fire `onRemoved`, counter về 0 trước khi event đến — gây re-render không cần thiết và collapse group đang mở.

**Fix:** Dùng Set của tabIds thay vì counter:
```js
const _pendingClose = new Set();

suppressNextRemoved = (tabId) => _pendingClose.add(tabId);

chrome.tabs.onRemoved.addListener((tabId) => {
  if (_pendingClose.delete(tabId)) return; // suppress
  onTabsChanged();
});
```

---

## 🟡 Nên làm — refactor rõ ràng hơn

### DRY: Logic empty-state HTML bị lặp ở 4 chỗ
**File:** `closer.js`, `vault.js`, `dedup.js`, `ui.js`

Cùng một đoạn HTML template `<div class="empty-state"><div class="e-icon">...</div>` xuất hiện nhiều lần với icon/text khác nhau. Mỗi lần muốn thay đổi layout phải sửa nhiều chỗ.

**Fix:** Thêm helper `buildEmptyState(icon, title, subtitle)` vào `ui.js`, trả về một HTMLElement.

---

### DRY: Pattern disable/enable button trong async actions bị lặp
**File:** `closer.js`: `closeAll()`, `newWindow()` — `dedup.js`: `closeAll()`

Pattern `btn.disabled = true` → thực thi → `btn.disabled = false` trong try/finally xuất hiện ở mọi action button. Nếu có exception không bắt được, button sẽ bị stuck.

**Fix:** Extract helper `withButtonLock(btn, asyncFn)` trong `ui.js`: `btn.disabled=true`, gọi fn trong try/finally, luôn restore.

---

### Consistency: `_isProcessable()` định nghĩa 2 lần với cùng regex
**File:** `background/features/badge.js`, `background/features/dedup.js`

~~Cả hai file background đều có `function _isProcessable(url) { return !!(url && /^(https?|ftp):\/\//.test(url)); }` — copy-paste hoàn toàn. Nếu cần thêm protocol, phải sửa 2 chỗ.~~

**✅ Done:** Export `isProcessableUrl()` từ `shared/url-utils.js`. Cả `badge.js` và `dedup.js` đã import và dùng hàm chung.

---

### Separation: `setKeepUI` và `loadKeepMode` làm cùng việc
**File:** `popup/features/dedup.js`

`setKeepUI(newest)` cập nhật UI + storage. `loadKeepMode()` đọc storage + cập nhật UI. Cả hai đều set `label.textContent` và `label.style.color` với logic giống hệt nhau. Sẽ dễ drift nếu UI thay đổi.

**Fix:** Extract `_applyKeepUI(newest)` chỉ cập nhật DOM, gọi từ cả hai hàm.

---

### Robustness: `applyUiMode()` không handle key không hợp lệ
**File:** `background/index.js`

`UI_MODE_HANDLERS[uiMode]?.()` — nếu storage bị corrupt với giá trị ngoài `'popup'|'sidepanel'` thì optional chain trả về `undefined` silently, extension sẽ ở state không xác định.

**Fix:**
```js
if (!UI_MODE_HANDLERS[uiMode]) {
  uiMode = 'sidepanel';
  await chrome.storage.sync.set({ uiMode });
}
```

---

## 🔵 Performance

### `GlobalStats` gọi `chrome.windows.getAll()` không cần thiết
**File:** `popup/services/ui.js` → `GlobalStats._update()`

~~Mỗi lần refresh stats (tab switch, sau close, sau save), code await cả `chrome.windows.getAll()`. Số windows thường không thay đổi thường xuyên và không phải core feature. Thêm latency không cần thiết.~~

**✅ Done:** Window count được cache trong `_cachedWindowCount`, cập nhật qua `chrome.windows.onCreated/onRemoved`. `_update()` chỉ còn await tabs + actedCount.

---

### `_rootDomainCache` không có size limit
**File:** `shared/url-utils.js` → `_rootDomainCache`

~~`_rootDomainCache` là một `Map` không bao giờ bị clear. Trong một session dài với nhiều unique domains, Map sẽ tích lũy vô hạn entries.~~

**✅ Done:** Thêm `_ROOT_DOMAIN_CACHE_MAX = 500`. Cache bị clear khi vượt ngưỡng trước khi set entry mới.

---

### Badge update không debounce đủ khi bulk close
**File:** `background/features/badge.js` → `scheduleUpdate()`

~~Throttle 300ms hoạt động tốt cho tab đơn lẻ. Nhưng khi user nhấn "Close all" (đóng 20+ tabs), Chrome có thể fire `onRemoved` trong các macro-task riêng — timer reset liên tục, badge update bị delay 300ms sau lần close cuối cùng.~~

**✅ Done:** Chuyển sang leading+trailing debounce: fire ngay lần đầu (`updateBadge()` trước `setTimeout`), trailing update chạy nếu có thêm event trong cooldown. `destroy()` cũng reset `_pending`.

---

## 🟢 Nice-to-have

### Readability: `renderGrouped()` trong closer.js quá dài
**File:** `popup/features/closer.js`

~~Hàm 120+ dòng vừa group tabs, vừa sort, vừa build DOM, vừa inject custom buttons. Khó test và khó đọc.~~

**✅ Done:** Tách thành `groupTabsByDomain(tabs)`, `sortGroups(tree)`, `sortedRoots(tree)`, `buildGroupHeader(root, tabs, group)`. `renderGrouped()` giờ chỉ còn ~40 dòng, mỗi hàm con có một trách nhiệm rõ ràng.

---

### Clarity: `saveGrouped` và `saveFlat` trong Vault có thể hợp nhất
**File:** `popup/features/vault.js`

~~Logic phân nhánh `if (hasFilters) saveFlat else saveGrouped` khá đơn giản. Hai hàm riêng dễ drift — progress reporting đã bị lặp rồi.~~

**✅ Done:** Hợp nhất thành `saveTabs(tabs, titles, parentId, { grouped })`. Progress logic (`tick()`) viết một lần, dùng cho cả hai mode. Hàm `save()` truyền `grouped = !FilterService.hasFilters('vault')`.

---

### Arch: `PanelHooks` là plain object không có type safety
**File:** `popup/services/ui.js`, `popup/index.js`

~~`PanelHooks['closer'] = render` — key là magic string, không có autocomplete, typo sẽ fail silently.~~

**✅ Done:** Thêm JSDoc `/** @type {Record<string, () => void | Promise<void>>} */` và comment liệt kê valid keys (`'closer' | 'vault' | 'dedup' | 'settings'`).

---

### UX: `closeAll()` trong Dedup dùng `setTimeout 400ms` magic number
**File:** `popup/features/dedup.js` → `closeAll()`

`setTimeout(async () => { await render(); }, 400)` — magic number để "chờ Chrome xử lý". Nếu máy chậm, 400ms có thể không đủ. Nếu máy nhanh, đây là độ trễ không cần thiết.

**Fix:** Resolve sau khi tất cả `chrome.tabs.remove` promises settle thay vì dùng timeout cố định.
