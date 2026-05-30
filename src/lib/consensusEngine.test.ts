// src/lib/consensusEngine.test.ts
/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ConsensusOption, ConsensusParticipant, ConsensusVote } from './consensusEngine';
import { calculateConsensus } from './consensusEngine';

const participants: ConsensusParticipant[] = [
  { id: 'participant-1', role: 'host' },
  { id: 'participant-2', role: 'guest' },
  { id: 'participant-3', role: 'guest' },
];

function option(id: string, constraintMatchScore = 0): ConsensusOption {
  return {
    constraintMatchScore,
    id,
    title: id,
  };
}

test('yes/maybe/no scoring uses the expected vote weights', () => {
  const scoringParticipants: ConsensusParticipant[] = [
    ...participants,
    { id: 'participant-4', role: 'guest' },
  ];
  const options = [option('balanced')];
  const votes: ConsensusVote[] = [
    { optionId: 'balanced', participantId: 'participant-1', value: 'yes' },
    { optionId: 'balanced', participantId: 'participant-2', value: 'maybe' },
    { optionId: 'balanced', participantId: 'participant-3', value: 'no' },
    { optionId: 'balanced', participantId: 'participant-4', value: 'skip' },
  ];

  const result = calculateConsensus(options, votes, scoringParticipants, 'consensus');
  const breakdown = result.scoreBreakdown[0];

  assert.equal(breakdown.totalScore, 1);
  assert.deepEqual(breakdown.voteCounts, {
    maybe: 1,
    no: 1,
    skip: 1,
    yes: 1,
  });
  assert.equal(result.winningOption?.id, 'balanced');
});

test('option with many maybes beats polarizing option in consensus mode', () => {
  const options = [option('polarizing', 10), option('steady-maybes', 5)];
  const votes: ConsensusVote[] = [
    { optionId: 'polarizing', participantId: 'participant-1', value: 'yes' },
    { optionId: 'polarizing', participantId: 'participant-2', value: 'yes' },
    { optionId: 'polarizing', participantId: 'participant-3', value: 'no' },
    { optionId: 'steady-maybes', participantId: 'participant-1', value: 'maybe' },
    { optionId: 'steady-maybes', participantId: 'participant-2', value: 'maybe' },
    { optionId: 'steady-maybes', participantId: 'participant-3', value: 'maybe' },
  ];

  const result = calculateConsensus(options, votes, participants, 'consensus');

  assert.equal(result.winningOption?.id, 'steady-maybes');
  assert.equal(result.noConsensus, false);
});

test('no votes penalize options', () => {
  const options = [option('blocked'), option('acceptable')];
  const votes: ConsensusVote[] = [
    { optionId: 'blocked', participantId: 'participant-1', value: 'yes' },
    { optionId: 'blocked', participantId: 'participant-2', value: 'no' },
    { optionId: 'acceptable', participantId: 'participant-1', value: 'maybe' },
    { optionId: 'acceptable', participantId: 'participant-2', value: 'skip' },
  ];

  const result = calculateConsensus(options, votes, participants, 'consensus');

  assert.equal(result.winningOption?.id, 'acceptable');
  assert.equal(result.scoreBreakdown.find((breakdown) => breakdown.optionId === 'blocked')?.noCount, 1);
});

test('tie detection works', () => {
  const options = [option('left'), option('right')];
  const votes: ConsensusVote[] = [
    { optionId: 'left', participantId: 'participant-1', value: 'yes' },
    { optionId: 'right', participantId: 'participant-1', value: 'yes' },
  ];

  const result = calculateConsensus(options, votes, participants, 'consensus');

  assert.equal(result.noConsensus, true);
  assert.deepEqual(result.tiedOptionIds, ['left', 'right']);
  assert.equal(result.winningOption, undefined);
});

test('no consensus detection works when no option has positive support', () => {
  const options = [option('not-today'), option('also-not-today')];
  const votes: ConsensusVote[] = [
    { optionId: 'not-today', participantId: 'participant-1', value: 'no' },
    { optionId: 'not-today', participantId: 'participant-2', value: 'skip' },
    { optionId: 'also-not-today', participantId: 'participant-1', value: 'skip' },
    { optionId: 'also-not-today', participantId: 'participant-2', value: 'no' },
  ];

  const result = calculateConsensus(options, votes, participants, 'consensus');

  assert.equal(result.noConsensus, true);
  assert.equal(result.winningOption, undefined);
  assert.match(result.reason, /positive support/);
});

test('majority mode differs from consensus mode', () => {
  const options = [option('polarizing'), option('steady-maybes')];
  const votes: ConsensusVote[] = [
    { optionId: 'polarizing', participantId: 'participant-1', value: 'yes' },
    { optionId: 'polarizing', participantId: 'participant-2', value: 'yes' },
    { optionId: 'polarizing', participantId: 'participant-3', value: 'no' },
    { optionId: 'steady-maybes', participantId: 'participant-1', value: 'maybe' },
    { optionId: 'steady-maybes', participantId: 'participant-2', value: 'maybe' },
    { optionId: 'steady-maybes', participantId: 'participant-3', value: 'maybe' },
  ];

  const consensusResult = calculateConsensus(options, votes, participants, 'consensus');
  const majorityResult = calculateConsensus(options, votes, participants, 'majority');

  assert.equal(consensusResult.winningOption?.id, 'steady-maybes');
  assert.equal(majorityResult.winningOption?.id, 'polarizing');
});
