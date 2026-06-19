/**
 * $SELF attestation triggers (SERVER-ONLY).
 *
 * Thin wrappers that the various earn paths (event close-out, bounty approval,
 * vote, role stipend) call to queue earnings. Each resolves the pod's
 * communityId + current epoch, then defers to queueEarning() which does the
 * hour-anchor + caps + budget enforcement. All idempotent via the ledger's
 * UNIQUE(source_type, source_ref, wallet).
 *
 * Never import into client code (uses the service-role earn service).
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { podToCommunityId } from '../lib/communityId';
import {
  queueEarning,
  eventHours,
  VOTE_CREDIT,
  type QueueResult,
} from './selfEarnService';

const SELF_EPOCHS = process.env.NEXT_PUBLIC_SELF_EPOCHS as `0x${string}` | undefined;

const EPOCH_ABI = [
  {
    name: 'currentEpoch',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint32' }],
  },
] as const;

/** Read the live global epoch from SelfEpochs. Returns null if unconfigured. */
export async function getCurrentEpoch(): Promise<number | null> {
  if (!SELF_EPOCHS) return null;
  try {
    const rpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const client = createPublicClient({ chain: base, transport: http(rpc) });
    const e = await client.readContract({
      address: SELF_EPOCHS,
      abi: EPOCH_ABI,
      functionName: 'currentEpoch',
    });
    return Number(e);
  } catch {
    return null;
  }
}

/** Queue an event-attendance earning (hour-anchored from scheduled duration). */
export async function queueEventAttendance(params: {
  wallet: string;
  podId: string;
  registrationId: string;
  eventStartISO: string;
  eventEndISO: string | null;
  epoch: number;
}): Promise<QueueResult> {
  return queueEarning({
    wallet: params.wallet,
    podId: params.podId,
    communityId: podToCommunityId(params.podId),
    epoch: params.epoch,
    rawHours: eventHours(params.eventStartISO, params.eventEndISO),
    sourceType: 'event_attendance',
    sourceRef: params.registrationId,
  });
}

/** Queue a bounty-completion earning (poster's estimated hours). */
export async function queueBountyCompletion(params: {
  wallet: string;
  podId: string;
  bountyId: string;
  estimatedHoursWei: bigint;
  epoch: number;
}): Promise<QueueResult> {
  return queueEarning({
    wallet: params.wallet,
    podId: params.podId,
    communityId: podToCommunityId(params.podId),
    epoch: params.epoch,
    rawHours: params.estimatedHoursWei,
    sourceType: 'bounty_completion',
    sourceRef: params.bountyId,
  });
}

/** Queue a trace-level governance-vote earning (D-11). */
export async function queueVoteCredit(params: {
  wallet: string;
  podId: string;
  voteRef: string; // proposalId:voter or vote row id
  epoch: number;
}): Promise<QueueResult> {
  return queueEarning({
    wallet: params.wallet,
    podId: params.podId,
    communityId: podToCommunityId(params.podId),
    epoch: params.epoch,
    rawHours: VOTE_CREDIT,
    sourceType: 'governance_vote',
    sourceRef: params.voteRef,
  });
}

/** Queue a role-service epoch stipend (swept at epoch close). */
export async function queueRoleStipend(params: {
  wallet: string;
  podId: string;
  roleRef: string; // hat_id or role key, unique per wallet/epoch
  stipendHoursWei: bigint;
  epoch: number;
}): Promise<QueueResult> {
  return queueEarning({
    wallet: params.wallet,
    podId: params.podId,
    communityId: podToCommunityId(params.podId),
    epoch: params.epoch,
    rawHours: params.stipendHoursWei,
    sourceType: 'role_service',
    // include epoch so the same role re-credits each epoch (idempotent within one).
    sourceRef: `${params.roleRef}:${params.epoch}`,
  });
}
