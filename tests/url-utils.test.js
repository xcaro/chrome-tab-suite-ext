import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isHttpTab,
  isProcessableUrl,
  matchesDomainFilter,
  normalizeUrl,
  parseDomainLevels,
} from '../core/urls.js';

test('normalizeUrl rejects browser-internal protocols', () => {
  assert.equal(normalizeUrl('chrome://extensions'), null);
  assert.equal(normalizeUrl('about:blank'), null);
  assert.equal(normalizeUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
});

test('processable tab helpers accept web protocols only', () => {
  assert.equal(isHttpTab({ url: 'https://example.com' }), true);
  assert.equal(isHttpTab({ url: 'ftp://example.com/file' }), true);
  assert.equal(isHttpTab({ url: 'chrome://extensions' }), false);
  assert.equal(isProcessableUrl('https://example.com'), true);
  assert.equal(isProcessableUrl('about:blank'), false);
});

test('domain filters require a domain token and optionally match path text', () => {
  assert.equal(matchesDomainFilter('https://docs.github.com/actions', ['github.com']), true);
  assert.equal(matchesDomainFilter('https://docs.github.com/actions', ['github.com', 'actions']), true);
  assert.equal(matchesDomainFilter('https://docs.github.com/actions', ['github.com', 'billing']), false);
  assert.equal(matchesDomainFilter('https://docs.github.com/actions', ['actions']), false);
});

test('parseDomainLevels handles configured public suffixes', () => {
  assert.deepEqual(parseDomainLevels('blog.example.co.uk'), {
    root: 'example.co.uk',
    sub: 'blog.example.co.uk',
  });
  assert.deepEqual(parseDomainLevels('www.example.com'), {
    root: 'example.com',
    sub: null,
  });
});

test('parseDomainLevels keeps IPv4 hosts intact', () => {
  assert.deepEqual(parseDomainLevels('192.168.1.10'), {
    root: '192.168.1.10',
    sub: null,
  });
});
