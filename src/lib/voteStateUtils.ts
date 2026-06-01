import type { VoteValue } from '../types/domain';

export type VoteStateOption = {
  id: string;
};

export type VoteStateVote = {
  created_at: string;
  id: string;
  option_id: string;
  participant_id: string;
  updated_at: string;
  value: VoteValue;
};

export function buildVotesByOptionId<Vote extends VoteStateVote>(votes: readonly Vote[]) {
  return votes.reduce<Record<string, Vote>>((accumulator, vote) => {
    accumulator[vote.option_id] = vote;
    return accumulator;
  }, {});
}

export function getAnsweredCount<Option extends VoteStateOption, Vote extends VoteStateVote>(
  options: readonly Option[],
  votesByOptionId: Record<string, Vote>,
) {
  return options.filter((option) => Boolean(votesByOptionId[option.id])).length;
}

export function getFirstUnvotedIndex<Option extends VoteStateOption, Vote extends VoteStateVote>(
  options: readonly Option[],
  votesByOptionId: Record<string, Vote>,
) {
  return options.findIndex((option) => !votesByOptionId[option.id]);
}

export function getNextIndex<Option extends VoteStateOption, Vote extends VoteStateVote>(
  options: readonly Option[],
  votesByOptionId: Record<string, Vote>,
  currentIndex: number,
) {
  const afterCurrentIndex = options.findIndex((option, index) => index > currentIndex && !votesByOptionId[option.id]);

  if (afterCurrentIndex !== -1) {
    return afterCurrentIndex;
  }

  const firstUnvotedIndex = getFirstUnvotedIndex(options, votesByOptionId);

  return firstUnvotedIndex === -1 ? currentIndex : firstUnvotedIndex;
}

export function createOptimisticVote(optionId: string, participantId: string, value: VoteValue): VoteStateVote {
  const timestamp = new Date().toISOString();

  return {
    created_at: timestamp,
    id: `optimistic-${optionId}`,
    option_id: optionId,
    participant_id: participantId,
    updated_at: timestamp,
    value,
  };
}

export function replaceVote<Vote extends VoteStateVote>(votesByOptionId: Record<string, Vote>, vote: Vote) {
  return {
    ...votesByOptionId,
    [vote.option_id]: vote,
  };
}

export function rollbackOptimisticVote<Vote extends VoteStateVote>(
  votesByOptionId: Record<string, Vote>,
  optionId: string,
  optimisticVoteId: string,
  previousVote: Vote | undefined,
) {
  const currentVote = votesByOptionId[optionId];

  if (currentVote?.id !== optimisticVoteId) {
    return votesByOptionId;
  }

  const nextVotes = { ...votesByOptionId };

  if (previousVote) {
    nextVotes[optionId] = previousVote;
  } else {
    delete nextVotes[optionId];
  }

  return nextVotes;
}
