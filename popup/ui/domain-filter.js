// =============================================================
// popup/ui/domain-filter.js
// =============================================================

import { isDomainToken } from '../../core/urls.js';

export function createDomainFilter({ tagsEl, inputEl, addBtn, filterState, onChange }) {
  function renderTags() {
    tagsEl.innerHTML = '';
    filterState.filters.forEach((d, i) => {
      const isText  = !isDomainToken(d);
      const tag     = document.createElement('div');
      tag.className = isText ? 'tag tag-text' : 'tag';
      tag.innerHTML = `<span>${isText ? `🔍 ${d}` : d}</span><span class="tag-remove" data-i="${i}">×</span>`;
      tagsEl.appendChild(tag);
    });
    tagsEl.querySelectorAll('.tag-remove').forEach(b =>
      b.addEventListener('click', () => {
        filterState.removeAt(+b.dataset.i);
        renderTags();
        onChange?.();
      })
    );
  }

  function add(raw) {
    filterState.add(raw);
    renderTags();
    onChange?.();
  }

  addBtn.addEventListener('click', () => { add(inputEl.value); inputEl.value = ''; inputEl.focus(); });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inputEl.value); inputEl.value = ''; }
  });

  return { render: renderTags, add };
}
