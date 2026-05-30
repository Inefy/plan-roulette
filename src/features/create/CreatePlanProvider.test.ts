// src/features/create/CreatePlanProvider.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadValidateCreatePlanDraft() {
  const module = await import('./createPlanValidation');

  return module.validateCreatePlanDraft;
}

test('valid create draft parses group size and optional time window', async () => {
  const validateCreatePlanDraft = await loadValidateCreatePlanDraft();
  const result = validateCreatePlanDraft({
    allowAgeSensitive: false,
    budgetTier: 'moderate',
    categories: ['food', 'coffee'],
    endsAt: '2026-06-01T21:00',
    energyLevel: 'medium',
    groupSizeEstimate: '4',
    locationMode: 'in_person',
    startsAt: '2026-06-01T18:00',
    title: 'Friday plan',
    weatherMode: 'weather_flexible',
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.parsed?.groupSize, 4);
  assert.equal(result.parsed?.duration?.maxMinutes, 180);
});

test('create draft requires both start and end time when either is provided', async () => {
  const validateCreatePlanDraft = await loadValidateCreatePlanDraft();
  const result = validateCreatePlanDraft({
    allowAgeSensitive: false,
    budgetTier: 'low',
    categories: ['walk'],
    endsAt: '',
    energyLevel: 'low',
    groupSizeEstimate: '2',
    locationMode: 'in_person',
    startsAt: '2026-06-01T18:00',
    title: 'Walk',
    weatherMode: 'outdoor',
  });

  assert.ok(result.errors.includes('Add both a start and end time, or leave the date/time window blank.'));
  assert.equal(result.parsed, undefined);
});
