// =============================================================
// popup/ui/toggles.js
// =============================================================

export function setToggleLabel(el, on) {
  el.textContent = on ? 'on' : 'off';
  el.className   = 'footer-sub ' + (on ? 'on' : 'off');
}
