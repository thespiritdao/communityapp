// Pure helper for building DAO Governor parameter-change proposals.
// No React, no wallet state — trivially testable.
//
// The deployed DAOGovernor (OZ v5, GovernorSettings + GovernorVotesQuorumFraction)
// already exposes the setters we need. We construct a proposeWithMetadata
// payload whose calldatas[] invokes one or more of those setters. Only
// knobs the caller wants to change are included.

import { encodeFunctionData } from 'viem';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';

// Base mainnet block time (2 seconds since L2 launch).
export const BASE_SECONDS_PER_BLOCK = 2;

export const blocksToHours = (b: bigint | number): number =>
  Number(b) * BASE_SECONDS_PER_BLOCK / 3600;

export const hoursToBlocks = (h: number): number =>
  Math.round(h * 3600 / BASE_SECONDS_PER_BLOCK);

// Policy bounds. Narrower than the contract permits — defense in depth.
export const VOTING_DELAY_MIN_HOURS = 1;
export const VOTING_DELAY_MAX_HOURS = 72;
export const VOTING_PERIOD_MIN_HOURS = 12;
export const VOTING_PERIOD_MAX_HOURS = 336; // 14 days
export const QUORUM_MIN_PERCENT = 4;
export const QUORUM_MAX_PERCENT = 20;

export interface DaoGovernorChanges {
  votingDelayBlocks?: number; // uint48
  votingPeriodBlocks?: number; // uint32
  quorumPercent?: number; // uint256, percent (denominator=100)
}

export interface BuiltProposal {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  description: string;
  title: string;
  forumThreadId: string;
}

function assertWithinBounds(changes: DaoGovernorChanges): void {
  if (changes.votingDelayBlocks !== undefined) {
    const h = blocksToHours(changes.votingDelayBlocks);
    if (h < VOTING_DELAY_MIN_HOURS || h > VOTING_DELAY_MAX_HOURS) {
      throw new Error(
        `voting delay ${h}h outside allowed range ${VOTING_DELAY_MIN_HOURS}h–${VOTING_DELAY_MAX_HOURS}h`,
      );
    }
  }
  if (changes.votingPeriodBlocks !== undefined) {
    const h = blocksToHours(changes.votingPeriodBlocks);
    if (h < VOTING_PERIOD_MIN_HOURS || h > VOTING_PERIOD_MAX_HOURS) {
      throw new Error(
        `voting period ${h}h outside allowed range ${VOTING_PERIOD_MIN_HOURS}h–${VOTING_PERIOD_MAX_HOURS}h`,
      );
    }
  }
  if (changes.quorumPercent !== undefined) {
    if (
      changes.quorumPercent < QUORUM_MIN_PERCENT ||
      changes.quorumPercent > QUORUM_MAX_PERCENT
    ) {
      throw new Error(
        `quorum ${changes.quorumPercent}% outside allowed range ${QUORUM_MIN_PERCENT}%–${QUORUM_MAX_PERCENT}%`,
      );
    }
  }
}

/**
 * Build a DAO Governor parameter-change proposal. Returns the tuple shape
 * expected by proposeWithMetadata (targets, values, calldatas, description,
 * title, forumThreadId).
 *
 * Throws if any change is outside the policy bounds — catches scripted
 * mis-calls that bypass the UI guardrails.
 */
export function buildDaoParamProposal(
  governorAddress: `0x${string}`,
  changes: DaoGovernorChanges,
  title: string,
  rationale: string,
  forumThreadId?: string,
): BuiltProposal {
  assertWithinBounds(changes);

  const targets: `0x${string}`[] = [];
  const values: bigint[] = [];
  const calldatas: `0x${string}`[] = [];

  if (changes.votingDelayBlocks !== undefined) {
    targets.push(governorAddress);
    values.push(0n);
    calldatas.push(
      encodeFunctionData({
        abi: DAOGovernorABIJson,
        functionName: 'setVotingDelay',
        args: [BigInt(changes.votingDelayBlocks)],
      }),
    );
  }
  if (changes.votingPeriodBlocks !== undefined) {
    targets.push(governorAddress);
    values.push(0n);
    calldatas.push(
      encodeFunctionData({
        abi: DAOGovernorABIJson,
        functionName: 'setVotingPeriod',
        args: [BigInt(changes.votingPeriodBlocks)],
      }),
    );
  }
  if (changes.quorumPercent !== undefined) {
    targets.push(governorAddress);
    values.push(0n);
    calldatas.push(
      encodeFunctionData({
        abi: DAOGovernorABIJson,
        functionName: 'updateQuorumNumerator',
        args: [BigInt(changes.quorumPercent)],
      }),
    );
  }

  if (targets.length === 0) {
    throw new Error('buildDaoParamProposal called with no changes');
  }

  const description = `# ${title}\n\n${rationale}${forumThreadId ? `\n\nForum: ${forumThreadId}` : ''}`;

  return {
    targets,
    values,
    calldatas,
    description,
    title,
    forumThreadId: forumThreadId ?? '',
  };
}
