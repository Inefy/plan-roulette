/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildVotesByOptionId,
  createOptimisticVote,
  getAnsweredCount,
  getFirstUnvotedIndex,
  getNextIndex,
  replaceVote,
  rollbackOptimisticVote,
  type VoteStateVote,
} from './voteStateUtils';

const options = [{ id: 'option-1' }, { id: 'option-2' }, { id: 'option-3' }];

function vote(optionId: string, value: VoteStateVote['value'], id = `vote-${optionId}`): VoteStateVote {
  return {
    created_at: '2026-06-01T18:00:00.000Z',
    id,
    option_id: optionId,
    participant_id: 'participant-1',
    updated_at: '2026-06-01T18:00:00.000Z',
    value,
  };
}

test('builds vote lookup and answered count from saved votes', () => {
  const votesByOptionId = buildVotesByOptionId([vote('option-1', 'yes'), vote('option-3', 'no')]);

  assert.equal(votesByOptionId['option-1'].value, 'yes');
  assert.equal(votesByOptionId['option-3'].value, 'no');
  assert.equal(getAnsweredCount(options, votesByOptionId), 2);
});

test('finds next unvoted option after the current card', () => {
  const votesByOptionId = buildVotesByOptionId([vote('option-1', 'yes')]);

  assert.equal(getFirstUnvotedIndex(options, votesByOptionId), 1);
  assert.equal(getNextIndex(options, votesByOptionId, 0), 1);
});

test('wraps to first unvoted option when later cards are complete', () => {
  const votesByOptionId = buildVotesByOptionId([vote('option-2', 'maybe'), vote('option-3', 'no')]);

  assert.equal(getFirstUnvotedIndex(options, votesByOptionId), 0);
  assert.equal(getNextIndex(options, votesByOptionId, 2), 0);
});

test('stays on current index when all options are voted', () => {
  const votesByOptionId = buildVotesByOptionId([
    vote('option-1', 'yes'),
    vote('option-2', 'maybe'),
    vote('option-3', 'no'),
  ]);

  assert.equal(getFirstUnvotedIndex(options, votesByOptionId), -1);
  assert.equal(getNextIndex(options, votesByOptionId, 2), 2);
});

test('creates and replaces optimistic votes', () => {
  const optimisticVote = createOptimisticVote('option-1', 'participant-1', 'yes');
  const votesByOptionId = replaceVote({}, optimisticVote);

  assert.equal(optimisticVote.id, 'optimistic-option-1');
  assert.equal(votesByOptionId['option-1'].value, 'yes');
});

test('rolls back a new optimistic vote when save fails', () => {
  const optimisticVote = createOptimisticVote('option-1', 'participant-1', 'yes');
  const optimisticVotes = replaceVote({}, optimisticVote);
  const rolledBackVotes = rollbackOptimisticVote(optimisticVotes, 'option-1', optimisticVote.id, undefined);

  assert.deepEqual(rolledBackVotes, {});
});

test('restores the previous saved vote when optimistic update fails', () => {
  const previousVote = vote('option-1', 'maybe');
  const optimisticVote = createOptimisticVote('option-1', 'participant-1', 'no');
  const optimisticVotes = replaceVote(buildVotesByOptionId([previousVote]), optimisticVote);
  const rolledBackVotes = rollbackOptimisticVote(optimisticVotes, 'option-1', optimisticVote.id, previousVote);

  assert.equal(rolledBackVotes['option-1'], previousVote);
});

test('does not roll back when newer state replaced the optimistic vote', () => {
  const optimisticVote = createOptimisticVote('option-1', 'participant-1', 'yes');
  const refreshedVote = vote('option-1', 'yes', 'server-vote-1');
  const refreshedVotes = replaceVote(replaceVote({}, optimisticVote), refreshedVote);
  const rolledBackVotes = rollbackOptimisticVote(refreshedVotes, 'option-1', optimisticVote.id, undefined);

  assert.equal(rolledBackVotes, refreshedVotes);
  assert.equal(rolledBackVotes['option-1'].id, 'server-vote-1');
});
