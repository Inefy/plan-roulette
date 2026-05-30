// src/lib/planGenerator.test.ts
/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { planTemplates } from '../data/planTemplates';
import { generatePlanOptions } from './planGenerator';

const stableGeneratorOptions = {
  count: 12,
  maxResults: 12,
  minResults: 1,
  random: () => 0.5,
};

test('budget filtering excludes templates above the requested ceiling', () => {
  const options = generatePlanOptions(
    {
      maxBudgetTier: 'free',
    },
    planTemplates,
    stableGeneratorOptions,
  );

  assert.ok(options.length > 0);
  assert.equal(options.every((option) => option.budgetTier === 'free'), true);
});

test('rainy day filtering returns rainy-day indoor-friendly options', () => {
  const options = generatePlanOptions(
    {
      categories: ['rainy_day'],
      weatherModes: ['indoor'],
    },
    planTemplates,
    stableGeneratorOptions,
  );

  assert.ok(options.length > 0);
  assert.equal(options.every((option) => option.category === 'rainy_day'), true);
  assert.equal(options.every((option) => option.weatherCompatibility.includes('indoor') || option.weatherCompatibility.includes('weather_flexible')), true);
});

test('weather filtering keeps weather-compatible templates', () => {
  const options = generatePlanOptions(
    {
      weatherModes: ['outdoor'],
    },
    planTemplates,
    stableGeneratorOptions,
  );

  assert.ok(options.length > 0);
  assert.equal(
    options.every((option) => option.weatherCompatibility.includes('outdoor') || option.weatherCompatibility.includes('weather_flexible')),
    true,
  );
});

test('ageSensitive filtering excludes age-sensitive templates when disabled', () => {
  const options = generatePlanOptions(
    {
      ageSensitiveAllowed: false,
      categories: ['bars'],
    },
    planTemplates,
    stableGeneratorOptions,
  );

  assert.ok(options.length > 0);
  assert.equal(options.every((option) => option.ageSensitive === false), true);
});

test('group size filtering excludes templates outside the requested size', () => {
  const groupSize = 12;
  const options = generatePlanOptions(
    {
      groupSize,
    },
    planTemplates,
    stableGeneratorOptions,
  );

  assert.ok(options.length > 0);
  assert.equal(options.every((option) => option.groupSize.min <= groupSize && option.groupSize.max >= groupSize), true);
});
