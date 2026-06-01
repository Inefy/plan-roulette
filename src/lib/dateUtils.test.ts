/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareTimestampDesc,
  formatDateTime,
  formatRelativeDate,
  formatShortDate,
  parseTimestamp,
  sortByTimestampDesc,
} from './dateUtils';

test('parses valid timestamps and rejects invalid values', () => {
  assert.equal(parseTimestamp('2026-06-01T18:00:00.000Z'), Date.parse('2026-06-01T18:00:00.000Z'));
  assert.equal(parseTimestamp('not-a-date'), undefined);
  assert.equal(parseTimestamp(''), undefined);
  assert.equal(parseTimestamp(undefined), undefined);
});

test('compares timestamps descending with invalid dates last', () => {
  assert.equal(compareTimestampDesc('2026-06-02T18:00:00.000Z', '2026-06-01T18:00:00.000Z') < 0, true);
  assert.equal(compareTimestampDesc('bad-date', '2026-06-01T18:00:00.000Z') > 0, true);
  assert.equal(compareTimestampDesc('bad-date', undefined), 0);
});

test('sorts items by timestamp descending with malformed dates at the end', () => {
  const items = sortByTimestampDesc(
    [
      { id: 'old', touchedAt: '2026-06-01T18:00:00.000Z' },
      { id: 'bad', touchedAt: 'not-a-date' },
      { id: 'new', touchedAt: '2026-06-03T18:00:00.000Z' },
    ],
    (item) => item.touchedAt,
  );

  assert.deepEqual(
    items.map((item) => item.id),
    ['new', 'old', 'bad'],
  );
});

test('formats relative dates with stable fallbacks', () => {
  const now = Date.parse('2026-06-02T18:00:00.000Z');

  assert.equal(formatRelativeDate('2026-06-02T18:00:00.000Z', now), 'Updated just now');
  assert.equal(formatRelativeDate('2026-06-02T17:45:00.000Z', now), 'Updated 15 min ago');
  assert.equal(formatRelativeDate('2026-06-02T15:00:00.000Z', now), 'Updated 3 hr ago');
  assert.equal(formatRelativeDate('2026-05-31T18:00:00.000Z', now), 'Updated 2 days ago');
  assert.equal(formatRelativeDate('not-a-date', now), 'Recently updated');
});

test('formats absolute dates with invalid-date fallbacks', () => {
  assert.equal(formatShortDate('2026-06-01T18:00:00.000Z', { locale: 'en-US', timeZone: 'UTC' }), 'Jun 1, 2026');
  assert.equal(formatShortDate('not-a-date'), 'Recently');
  assert.equal(formatDateTime('2026-06-01T18:00:00.000Z', { locale: 'en-US', timeZone: 'UTC' }), 'Jun 1, 2026, 6:00 PM');
  assert.equal(formatDateTime('not-a-date'), 'not-a-date');
});
