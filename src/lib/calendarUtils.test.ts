/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCalendarEventNotes,
  formatCalendarDateInput,
  getDefaultCalendarDateRange,
  parseCalendarDateInput,
} from './calendarUtils';

test('builds calendar ranges from itinerary duration ranges', () => {
  const { endDate, startDate } = getDefaultCalendarDateRange('2026-06-01T18:00:00.000Z', '45 min to 1 hr 30 min');

  assert.equal(startDate.toISOString(), '2026-06-01T18:00:00.000Z');
  assert.equal(endDate.toISOString(), '2026-06-01T19:30:00.000Z');
});

test('parses plural and decimal calendar durations', () => {
  const { endDate } = getDefaultCalendarDateRange('2026-06-01T18:00:00.000Z', 'about 1.5 hours');

  assert.equal(endDate.toISOString(), '2026-06-01T19:30:00.000Z');
});

test('parses calendar durations with unicode dash ranges', () => {
  const { endDate } = getDefaultCalendarDateRange('2026-06-01T18:00:00.000Z', '1 hr\u20132 hr');

  assert.equal(endDate.toISOString(), '2026-06-01T20:00:00.000Z');
});

test('falls back to default duration when itinerary duration is unknown', () => {
  const { endDate } = getDefaultCalendarDateRange('2026-06-01T18:00:00.000Z', 'Duration TBD');

  assert.equal(endDate.toISOString(), '2026-06-01T19:30:00.000Z');
});

test('parses and formats calendar date inputs defensively', () => {
  assert.equal(parseCalendarDateInput('not a date'), undefined);
  assert.equal(parseCalendarDateInput('   '), undefined);
  assert.ok(parseCalendarDateInput('2026-06-01T18:30') instanceof Date);
  assert.match(formatCalendarDateInput(new Date('2026-06-01T18:30:00.000Z')), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('builds calendar notes with fallback step text', () => {
  const notes = buildCalendarEventNotes({
    backupPlan: 'Move inside if it rains.',
    budget: 'Low cost',
    endDate: new Date('2026-06-01T19:30:00.000Z'),
    locationText: 'Harbor',
    planTitle: 'Walk',
    shareLink: 'planroulette://room/1/itinerary',
    startDate: new Date('2026-06-01T18:00:00.000Z'),
    steps: [],
  });

  assert.match(notes, /No steps listed\./);
  assert.match(notes, /Budget: Low cost/);
  assert.match(notes, /Backup plan: Move inside if it rains\./);
});
