import assert from 'node:assert/strict';
import test from 'node:test';

import { groupTabsByDomain, sortedRoots, sortGroups } from '../popup/usecases/manage-tabs.js';

const tabs = [
  { id: 1, url: 'https://older.example.com/a', windowId: 2, lastAccessed: 10 },
  { id: 2, url: 'https://newer.example.com/a', windowId: 1, lastAccessed: 30 },
  { id: 3, url: 'https://docs.github.com/a', windowId: 1, lastAccessed: 20 },
  { id: 4, url: 'https://blog.example.co.uk/a', windowId: 3, lastAccessed: 40 },
];

test('groupTabsByDomain groups by PSL-aware root domains', () => {
  const tree = groupTabsByDomain(tabs);

  assert.deepEqual([...tree.keys()].sort(), ['example.co.uk', 'example.com', 'github.com']);
  assert.deepEqual(tree.get('example.com').map(tab => tab.id), [1, 2]);
});

test('groupTabsByDomain uses the full IPv4 host as the group title', () => {
  const tree = groupTabsByDomain([
    { id: 10, url: 'http://192.168.1.10/admin', windowId: 1, lastAccessed: 10 },
    { id: 11, url: 'http://192.168.1.10/status', windowId: 1, lastAccessed: 20 },
  ]);

  assert.deepEqual([...tree.keys()], ['192.168.1.10']);
});

test('sortGroups orders tabs by most recent window bucket', () => {
  const tree = sortGroups(groupTabsByDomain(tabs));

  assert.deepEqual(tree.get('example.com').map(tab => tab.id), [2, 1]);
});

test('sortedRoots orders domain groups by latest tab access', () => {
  const tree = sortGroups(groupTabsByDomain(tabs));

  assert.deepEqual(sortedRoots(tree), ['example.co.uk', 'example.com', 'github.com']);
});
