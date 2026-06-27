// =============================================================
// popup/ui/buttons.js
// =============================================================

export async function withButtonLock(btnOrId, fn) {
  const btn = typeof btnOrId === 'string' ? document.getElementById(btnOrId) : btnOrId;
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}
