// =============================================================
// popup/ui/toast.js
// =============================================================

let _toastTimer = null;

export function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const pfx = { success: '✅ ', error: '❌ ', info: 'ℹ️ ' }[type] ?? '';
  el.textContent = pfx + msg;
  el.className   = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}
