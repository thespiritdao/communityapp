/**
 * Pod UUID → on-chain communityId (uint224) mapping.
 *
 * SelfEpochs token ids encode (communityId, epoch). communityId must be a stable
 * uint224 derived deterministically from the pod's UUID so every caller (earn
 * service, mint-batch, SelfPayment recognition, prestige) agrees without a
 * lookup table. We hash the lowercased UUID and take the low 224 bits.
 *
 * IMPORTANT: this derivation is canonical — do NOT change it after any $SELF has
 * been minted, or existing token ids would orphan. If a registry-backed mapping
 * is ever preferred, migrate explicitly.
 */

import { keccak256, toBytes } from 'viem';

const MASK_224 = (1n << 224n) - 1n;

/** Deterministic uint224 communityId for a pod UUID. */
export function podToCommunityId(podId: string): bigint {
  const hash = keccak256(toBytes(podId.toLowerCase()));
  return BigInt(hash) & MASK_224;
}
