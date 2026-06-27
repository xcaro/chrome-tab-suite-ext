// =============================================================
// popup/ui/expandable-group.js
// =============================================================

import { windowHueForId } from '../../core/windows.js';
import { buildFavicon, buildTabRow } from './tab-row.js';

export function buildExpandableGroup({
  title,
  tabs,
  countLabel = `×${tabs.length}`,
  headerActions = [],
  rowActions = () => [],
  removeGroupWhenSingle = false,
  windowNames,
  onFocus,
} = {}) {
  const group    = document.createElement('div'); group.className = 'dup-group';
  const header   = document.createElement('div'); header.className = 'dup-header';
  const titleEl  = document.createElement('div'); titleEl.className = 'dup-title';
  const countEl  = document.createElement('div'); countEl.className = 'dup-count';
  const chevron  = document.createElement('div'); chevron.className = 'dup-chevron'; chevron.textContent = '▸';
  const tabList  = document.createElement('div'); tabList.className = 'dup-tab-list';

  titleEl.title = titleEl.textContent = title ?? tabs[0]?.title ?? '';
  countEl.textContent = countLabel;
  header.append(buildFavicon(tabs.find(t => t.favIconUrl)?.favIconUrl ?? null), titleEl, countEl);

  for (const action of headerActions) {
    const btn = document.createElement('button');
    btn.className = action.className;
    btn.textContent = action.label;
    if (action.title) btn.title = action.title;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      action.onClick?.({ tabs, groupEl: group, event: e });
    });
    header.appendChild(btn);
  }
  header.appendChild(chevron);

  const showDividers = windowNames && new Set(tabs.map(t => t.windowId)).size > 0;
  let tabCount = tabs.length;
  let rendered = false;

  function removeTabRow(row) {
    tabCount--;
    if (tabCount === 0 || (removeGroupWhenSingle && tabCount === 1)) group.remove();
    else {
      row.remove();
      countEl.textContent = tabCount > 1 ? `${tabCount}` : '';
    }
  }

  function renderRows() {
    if (rendered) return;
    rendered = true;

    let lastWindowId = null;
    let windowBlock  = null;

    tabs.forEach(tab => {
      if (showDividers && tab.windowId !== lastWindowId) {
        const hue   = windowHueForId(windowNames, tab.windowId);
        const label = windowNames.get(tab.windowId) ?? 'W?';

        const divider = document.createElement('div');
        divider.className   = 'window-divider';
        divider.textContent = label;
        divider.style.setProperty('--w-hue', hue);

        windowBlock = document.createElement('div');
        windowBlock.className = 'window-block';
        windowBlock.style.setProperty('--w-hue', hue);

        tabList.append(divider, windowBlock);
        lastWindowId = tab.windowId;
      }

      let row;
      const actions = rowActions(tab).map(action => ({
        ...action,
        onClick: ctx => action.onClick?.({ ...ctx, groupEl: group, countEl, removeTabRow: () => removeTabRow(row) }),
      }));
      row = buildTabRow(tab, { actions, onFocus });
      (windowBlock ?? tabList).appendChild(row);
    });
  }

  let open = false;
  header.addEventListener('click', () => {
    open = !open;
    if (open) renderRows();
    tabList.classList.toggle('open', open);
    chevron.textContent = open ? '▾' : '▸';
    header.classList.toggle('expanded', open);
  });

  group.append(header, tabList);
  return group;
}
