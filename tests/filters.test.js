import assert from 'node:assert/strict';
import test from 'node:test';

import { createFilterState } from '../core/filters.js';

test('filter state normalizes and dedupes added tokens', () => {
  const filter = createFilterState();
  filter.add('https://www.GitHub.com/foo, Actions, github.com');

  assert.deepEqual(filter.filters, ['github.com', 'actions']);
  assert.equal(filter.hasFilters(), true);
});

test('filter state supports remove and clear', () => {
  const filter = createFilterState(['github.com', 'actions']);
  filter.removeAt(1);
  assert.deepEqual(filter.filters, ['github.com']);
  filter.clear();
  assert.deepEqual(filter.filters, []);
});

test('filter state filters tabs through processable URLs and domain rules', () => {
  const filter = createFilterState(['github.com', 'actions']);
  const tabs = [
    { id: 1, url: 'https://docs.github.com/actions' },
    { id: 2, url: 'https://docs.github.com/billing' },
    { id: 3, url: 'chrome://extensions' },
  ];

  assert.deepEqual(filter.filterTabs(tabs).map(tab => tab.id), [1]);
});
