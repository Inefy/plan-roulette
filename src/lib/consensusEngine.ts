// src/lib/consensusEngine.ts
import type { DecisionMode, ParticipantRole, VoteValue } from '../types/domain';

export type ConsensusOption = {
  constraintMatchScore?: number;
  id: string;
  matchScore?: number;
  score?: number;
  title?: string;
};

export type ConsensusVote = {
  optionId: string;
  participantId: string;
  value: VoteValue;
};

export type ConsensusParticipant = {
  id: string;
  role: ParticipantRole;
};

export type VoteCounts = Record<VoteValue, number>;

export type ConsensusScoreBreakdown = {
  constraintMatchScore: number;
  noCount: number;
  optionId: string;
  participantCount: number;
  skipCount: number;
  totalScore: number;
  votedParticipantCount: number;
  voteCounts: VoteCounts;
  yesCount: number;
};

export type RankedConsensusOption<TOption extends ConsensusOption> = {
  breakdown: ConsensusScoreBreakdown;
  option: TOption;
  rank: number;
  tiedForFirst: boolean;
};

export type ConsensusCalculationResult<TOption extends ConsensusOption> = {
  decisionMode: DecisionMode;
  noConsensus: boolean;
  rankedOptions: RankedConsensusOption<TOption>[];
  reason: string;
  scoreBreakdown: ConsensusScoreBreakdown[];
  tiedOptionIds: string[];
  winningOption?: TOption;
};

const voteScores: Record<VoteValue, number> = {
  maybe: 1,
  no: -2,
  skip: 0,
  yes: 2,
};

function createEmptyVoteCounts(): VoteCounts {
  return {
    maybe: 0,
    no: 0,
    skip: 0,
    yes: 0,
  };
}

function getConstraintMatchScore(option: ConsensusOption) {
  return option.constraintMatchScore ?? option.matchScore ?? option.score ?? 0;
}

function getLatestVotesByOptionAndParticipant(votes: readonly ConsensusVote[], participants: readonly ConsensusParticipant[]) {
  const participantIds = new Set(participants.map((participant) => participant.id));
  const latestVotes = new Map<string, ConsensusVote>();

  for (const vote of votes) {
    if (participantIds.has(vote.participantId)) {
      latestVotes.set(`${vote.optionId}:${vote.participantId}`, vote);
    }
  }

  return latestVotes;
}

function buildBreakdown<TOption extends ConsensusOption>(
  option: TOption,
  latestVotes: ReadonlyMap<string, ConsensusVote>,
  participants: readonly ConsensusParticipant[],
): ConsensusScoreBreakdown {
  const voteCounts = createEmptyVoteCounts();
  let totalScore = 0;
  let votedParticipantCount = 0;

  for (const participant of participants) {
    const vote = latestVotes.get(`${option.id}:${participant.id}`);

    if (vote) {
      voteCounts[vote.value] += 1;
      totalScore += voteScores[vote.value];
      votedParticipantCount += 1;
    }
  }

  return {
    constraintMatchScore: getConstraintMatchScore(option),
    noCount: voteCounts.no,
    optionId: option.id,
    participantCount: participants.length,
    skipCount: voteCounts.skip,
    totalScore,
    votedParticipantCount,
    voteCounts,
    yesCount: voteCounts.yes,
  };
}

function compareConsensusBreakdown(left: ConsensusScoreBreakdown, right: ConsensusScoreBreakdown) {
  return (
    left.noCount - right.noCount ||
    right.yesCount - left.yesCount ||
    right.totalScore - left.totalScore ||
    right.constraintMatchScore - left.constraintMatchScore ||
    left.optionId.localeCompare(right.optionId)
  );
}

function compareMajorityBreakdown(left: ConsensusScoreBreakdown, right: ConsensusScoreBreakdown) {
  return (
    right.yesCount - left.yesCount ||
    right.totalScore - left.totalScore ||
    left.noCount - right.noCount ||
    right.constraintMatchScore - left.constraintMatchScore ||
    left.optionId.localeCompare(right.optionId)
  );
}

function isSameConsensusRank(left: ConsensusScoreBreakdown, right: ConsensusScoreBreakdown) {
  return (
    left.noCount === right.noCount &&
    left.yesCount === right.yesCount &&
    left.totalScore === right.totalScore &&
    left.constraintMatchScore === right.constraintMatchScore
  );
}

function isSameMajorityRank(left: ConsensusScoreBreakdown, right: ConsensusScoreBreakdown) {
  return (
    left.yesCount === right.yesCount &&
    left.totalScore === right.totalScore &&
    left.noCount === right.noCount &&
    left.constraintMatchScore === right.constraintMatchScore
  );
}

function hasPositiveSupport(breakdown: ConsensusScoreBreakdown) {
  return breakdown.voteCounts.yes > 0 || breakdown.voteCounts.maybe > 0;
}

function buildRankedOptions<TOption extends ConsensusOption>(
  options: readonly TOption[],
  breakdowns: readonly ConsensusScoreBreakdown[],
  decisionMode: DecisionMode,
) {
  const optionById = new Map(options.map((option) => [option.id, option]));
  const compare = decisionMode === 'majority' ? compareMajorityBreakdown : compareConsensusBreakdown;
  const isSameRank = decisionMode === 'majority' ? isSameMajorityRank : isSameConsensusRank;
  const sortedBreakdowns = [...breakdowns].sort(compare);
  const topBreakdown = sortedBreakdowns[0];
  const tiedOptionIds = topBreakdown
    ? sortedBreakdowns.filter((breakdown) => isSameRank(breakdown, topBreakdown)).map((breakdown) => breakdown.optionId)
    : [];

  const rankedOptions = sortedBreakdowns.map((breakdown, index) => ({
    breakdown,
    option: optionById.get(breakdown.optionId) as TOption,
    rank: index + 1,
    tiedForFirst: tiedOptionIds.includes(breakdown.optionId) && tiedOptionIds.length > 1,
  }));

  return {
    rankedOptions,
    tiedOptionIds: tiedOptionIds.length > 1 ? tiedOptionIds : [],
  };
}

function getReason<TOption extends ConsensusOption>(
  decisionMode: DecisionMode,
  rankedOptions: readonly RankedConsensusOption<TOption>[],
  tiedOptionIds: readonly string[],
) {
  const top = rankedOptions[0];

  if (decisionMode === 'host_pick') {
    return 'Host pick mode is waiting for the host to choose from the ranked options.';
  }

  if (!top) {
    return 'No plan options are available to rank.';
  }

  if (top.breakdown.votedParticipantCount === 0) {
    return 'No votes have been cast yet.';
  }

  if (!hasPositiveSupport(top.breakdown)) {
    return 'No option has positive support yet.';
  }

  if (tiedOptionIds.length > 1) {
    return `Tie detected between ${tiedOptionIds.length} options.`;
  }

  if (decisionMode === 'majority') {
    return 'Majority mode selected the option with the strongest yes-vote support.';
  }

  return 'Consensus mode selected the option with the fewest no votes, strongest yes support, best score, and best constraint match.';
}

export function calculateConsensus<TOption extends ConsensusOption>(
  options: readonly TOption[],
  votes: readonly ConsensusVote[],
  participants: readonly ConsensusParticipant[],
  decisionMode: DecisionMode,
): ConsensusCalculationResult<TOption> {
  const latestVotes = getLatestVotesByOptionAndParticipant(votes, participants);
  const scoreBreakdown = options.map((option) => buildBreakdown(option, latestVotes, participants));
  const { rankedOptions, tiedOptionIds } = buildRankedOptions(options, scoreBreakdown, decisionMode);
  const top = rankedOptions[0];
  const noConsensus =
    decisionMode === 'host_pick' ||
    !top ||
    top.breakdown.votedParticipantCount === 0 ||
    !hasPositiveSupport(top.breakdown) ||
    tiedOptionIds.length > 1;

  return {
    decisionMode,
    noConsensus,
    rankedOptions,
    reason: getReason(decisionMode, rankedOptions, tiedOptionIds),
    scoreBreakdown,
    tiedOptionIds,
    winningOption: noConsensus ? undefined : top.option,
  };
}
