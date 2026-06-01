/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import { getAvatarInitials, getAvatarTone } from './avatar';

test('builds avatar initials from one or two name parts', () => {
  assert.equal(getAvatarInitials('Ari'), 'A');
  assert.equal(getAvatarInitials('Ari Bennett'), 'AB');
  assert.equal(getAvatarInitials('Ari Bea Chen'), 'AB');
});

test('uses explicit initials before display name', () => {
  assert.equal(getAvatarInitials('Ari Bennett', 'zz'), 'ZZ');
  assert.equal(getAvatarInitials('Ari Bennett', 'z z'), 'ZZ');
});

test('falls back when avatar names are empty', () => {
  assert.equal(getAvatarInitials('   '), '?');
  assert.equal(getAvatarInitials(undefined, '   '), '?');
  assert.equal(getAvatarInitials(), '?');
});

test('cycles avatar tones predictably', () => {
  assert.equal(getAvatarTone(0), 'orange');
  assert.equal(getAvatarTone(5), 'red');
  assert.equal(getAvatarTone(6), 'orange');
  assert.equal(getAvatarTone(-1), 'red');
});
