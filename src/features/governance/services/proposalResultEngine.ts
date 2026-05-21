// Pure helper for pod-level proposal result determination.
// No DB / network imports — safe to use from server services and client UI.
//
// Used by:
//   - src/services/ipfsAggregationService.ts (close-out, persisted result)
//   - GovernanceSettingsCard / proposal display UI (live in-flight status)

export type GovernanceTier =
  | 'POD_OPERATIONAL'
  | 'POD_TREASURY_BINDING'
  | 'DAO_CONSTITUTIONAL';

export interface ResolvedThresholds {
  approval_bps: number;
  quorum_bps: number;
  voting_hours: number;
}

export interface ProposalOverride {
  approval_bps?: number | null;
  quorum_bps?: number | null;
}

export interface Tally {
  for: number;
  against: number;
  abstain: number;
  total: number;
}

export interface ProposalResult {
  result: 'approved' | 'rejected';
  quorumMet: boolean;
  approvalMet: boolean;
  requiredQuorum: number;
  requiredApproval: number;
  effectiveApprovalBps: number;
  effectiveQuorumBps: number;
}

export const APPROVAL_FLOOR_BPS = 5001;
export const APPROVAL_CEIL_BPS = 10000;
export const QUORUM_FLOOR_BPS = 2000;
export const QUORUM_CEIL_BPS = 10000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Decide whether a proposal passes given its tally, the pod's config, and
 * any per-proposal stricter override. The override can only push the bar
 * UP — values lower than the pod default are silently clamped to the pod
 * default (and the caller is expected to have rejected the override at
 * write time).
 *
 * Abstentions are excluded from the approval denominator: a proposal with
 * 1 for / 0 against / 3 abstain is decided as 100% approval, but quorum is
 * still computed against all four voters.
 */
export function determineProposalResult(
  tally: Tally,
  podConfig: ResolvedThresholds,
  proposalOverride: ProposalOverride | null,
  _tier: GovernanceTier,
  eligibleVoters: number,
): ProposalResult {
  const overrideApproval = proposalOverride?.approval_bps ?? 0;
  const overrideQuorum = proposalOverride?.quorum_bps ?? 0;

  const effectiveApprovalBps = clamp(
    Math.max(podConfig.approval_bps, overrideApproval),
    APPROVAL_FLOOR_BPS,
    APPROVAL_CEIL_BPS,
  );
  const effectiveQuorumBps = clamp(
    Math.max(podConfig.quorum_bps, overrideQuorum),
    QUORUM_FLOOR_BPS,
    QUORUM_CEIL_BPS,
  );

  const requiredQuorum =
    eligibleVoters <= 0
      ? 0
      : Math.ceil((eligibleVoters * effectiveQuorumBps) / 10000);
  const quorumMet = tally.total >= requiredQuorum;

  const forPlusAgainst = tally.for + tally.against;
  const requiredApproval =
    forPlusAgainst <= 0
      ? 0
      : Math.ceil((forPlusAgainst * effectiveApprovalBps) / 10000);
  const approvalMet = forPlusAgainst > 0 && tally.for >= requiredApproval;

  return {
    result: quorumMet && approvalMet ? 'approved' : 'rejected',
    quorumMet,
    approvalMet,
    requiredQuorum,
    requiredApproval,
    effectiveApprovalBps,
    effectiveQuorumBps,
  };
}
