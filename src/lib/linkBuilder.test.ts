// src/lib/linkBuilder.test.ts
// src/lib/linkBuilder.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildInviteLink, buildInviteShareMessage, parseInviteTokenFromLink } from './linkBuilder';

test('builds production invite links', () => {
  assert.equal(buildInviteLink('abc123', 'production'), 'https://planroulette.app/join/abc123');
});

test('builds development invite links', () => {
  assert.equal(buildInviteLink('abc123', 'development'), 'planroulette://join/abc123');
});

test('encodes invite token path segments', () => {
  assert.equal(buildInviteLink('abc 123', 'production'), 'https://planroulette.app/join/abc%20123');
});

test('builds invite share message', () => {
  assert.equal(buildInviteShareMessage('planroulette://join/abc123'), "Vote on what we're doing tonight: planroulette://join/abc123");
});

test('parses invite tokens from production links', () => {
  assert.equal(parseInviteTokenFromLink('https://planroulette.app/join/abc%20123'), 'abc 123');
  assert.equal(parseInviteTokenFromLink('https://www.planroulette.app/join/abc123'), 'abc123');
});

test('parses invite tokens from development links', () => {
  assert.equal(parseInviteTokenFromLink('planroulette://join/dev-token'), 'dev-token');
  assert.equal(parseInviteTokenFromLink('planroulette:///join/dev-token'), 'dev-token');
});

test('returns undefined for links without invite tokens', () => {
  assert.equal(parseInviteTokenFromLink('https://planroulette.app/room/abc123'), undefined);
  assert.equal(parseInviteTokenFromLink('planroulette://join'), undefined);
  assert.equal(parseInviteTokenFromLink('not a link'), undefined);
});

test('returns undefined for malformed or blank invite tokens', () => {
  assert.equal(parseInviteTokenFromLink('https://planroulette.app/join/%E0%A4%A'), undefined);
  assert.equal(parseInviteTokenFromLink('planroulette://join/%E0%A4%A'), undefined);
  assert.equal(parseInviteTokenFromLink('https://planroulette.app/join/%20'), undefined);
  assert.equal(parseInviteTokenFromLink('planroulette://join/%20'), undefined);
});
