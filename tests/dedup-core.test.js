import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countDuplicateGroups,
  getDuplicateGroups,
  getDuplicateTabIdsToClose,
  getDuplicateTabsForUrl,
} from '../shared/dedup-core.js';

const tabs = [
  { id: 1, url: 'https://example.com/a', lastAccessed: 10 },
  { id: 2, url: 'https://example.com/a', lastAccessed: 20 },
  { id: 3, url: 'https://example.com/b', lastAccessed: 30 },
  { id: 4, url: 'chrome://extensions', lastAccessed: 40 },
  { id: 5, url: 'https://example.com/a', lastAccessed: 50 },
];

test('getDuplicateGroups returns only processable duplicate URL groups', () => {
  const groups = getDuplicateGroups(tabs);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(tab => tab.id), [1, 2, 5]);
  assert.equal(countDuplicateGroups(tabs), 1);
});

test('getDuplicateTabsForUrl excludes the current tab', () => {
  assert.deepEqual(
    getDuplicateTabsForUrl(tabs, 2, 'https://example.com/a').map(tab => tab.id),
    [1, 5]
  );
  assert.deepEqual(getDuplicateTabsForUrl(tabs, 4, 'chrome://extensions'), []);
});

test('getDuplicateTabIdsToClose follows keep mode', () => {
  const groups = getDuplicateGroups(tabs);
  assert.deepEqual(getDuplicateTabIdsToClose(groups, { keepNewest: true }), [1, 2]);
  assert.deepEqual(getDuplicateTabIdsToClose(groups, { keepNewest: false }), [2, 5]);
});
