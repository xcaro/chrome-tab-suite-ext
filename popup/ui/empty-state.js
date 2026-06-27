// =============================================================
// popup/ui/empty-state.js
// =============================================================

export function buildEmptyState({ icon = '✓', title, subtitle, titleColor = '' }) {
  const root = document.createElement('div');
  root.className = 'empty-state';

  const iconEl = document.createElement('div');
  iconEl.className = 'e-icon';
  iconEl.textContent = icon;

  const titleEl = document.createElement('div');
  titleEl.className = 'e-title';
  titleEl.textContent = title;
  if (titleColor) titleEl.style.color = titleColor;

  const subtitleEl = document.createElement('div');
  subtitleEl.textContent = subtitle;

  root.append(iconEl, titleEl, subtitleEl);
  return root;
}

export function renderEmptyState(container, options) {
  container.replaceChildren(buildEmptyState(options));
}
