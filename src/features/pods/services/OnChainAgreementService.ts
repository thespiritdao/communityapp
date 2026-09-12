// src/features/pods/services/OnChainAgreementService.ts
//
// On-chain agreements against the EligibilityModule deployed on Base at
// NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS.
//
// Why this exists separately from EligibilityService: that service routes every
// criterion through PodAuthFactory and calls setHatAdmin first, which matches
// MultiCriteriaEligibilityModule — a contract that is NOT what is deployed. The
// deployed EligibilityModule authorises writes with Hats' own
// `isAdminOfHat(msg.sender, hatId)` and has no setHatAdmin, so agreements need
// no factory, no pod proxy and no admin registration. That mismatch is why
// on-chain agreements have never worked.
//
// Two transactions matter:
//   addAgreementCriterion(hatId, agreementHash, requireAll) — records the
//     agreement against a role. Caller must be a Hats admin of that hat.
//   signAgreement(agreementHash) — permissionless; records that msg.sender
//     signed. Readable forever via hasSignedAgreement().
//
// ENFORCEMENT IS SEPARATE. A hat only consults this module once its eligibility
// is pointed here with Hats.changeHatEligibility. Until then these writes are a
// durable public record and gate nothing. The module also treats a hat with no
// criteria as openly eligible, so re-pointing a hat is itself a no-op until a
// criterion is added — which is what makes staging this safe.

import { keccak256, toHex, encodeFunctionData, type PublicClient } from 'viem';

export const ELIGIBILITY_MODULE_ADDRESS = process.env
  .NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS as `0x${string}` | undefined;

export const ELIGIBILITY_MODULE_ABI = [
  {
    name: 'addAgreementCriterion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_agreementHash', type: 'bytes32' },
      { name: '_requireAll', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'signAgreement',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_agreementHash', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'hasSignedAgreement',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_agreementHash', type: 'bytes32' },
      { name: '_user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getHatCriteria',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },
] as const;

export interface Call {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
}

/**
 * The agreement's on-chain identity.
 *
 * Hashing the IPFS CID rather than the text is deliberate: a CID is already a
 * content address, so the hash is bound to the exact bytes that were pinned and
 * cannot drift if the text is re-uploaded with different whitespace.
 *
 * This must stay identical on the create side and the sign side — a mismatch
 * produces signatures that verify against nothing. It is the only place the
 * derivation is written.
 */
export function agreementHashFromCid(cid: string): `0x${string}` {
  return keccak256(toHex(cid));
}

export function isOnChainAgreementConfigured(): boolean {
  return !!ELIGIBILITY_MODULE_ADDRESS;
}

function requireModule(): `0x${string}` {
  if (!ELIGIBILITY_MODULE_ADDRESS) {
    throw new Error(
      'NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS is not set — on-chain agreements are unavailable.',
    );
  }
  return ELIGIBILITY_MODULE_ADDRESS;
}

/**
 * Record an agreement against a role's hat. The sender must be a Hats admin of
 * that hat, which in a pod tree means wearing the hat above it.
 */
export function buildAddAgreementCriterionCall(
  hatId: bigint,
  cid: string,
  requireAll = true,
): Call {
  return {
    to: requireModule(),
    value: 0n,
    data: encodeFunctionData({
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'addAgreementCriterion',
      args: [hatId, agreementHashFromCid(cid), requireAll],
    }),
  };
}

/** Sign an agreement as the sending account. Permissionless. */
export function buildSignAgreementCall(cid: string): Call {
  return {
    to: requireModule(),
    value: 0n,
    data: encodeFunctionData({
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'signAgreement',
      args: [agreementHashFromCid(cid)],
    }),
  };
}

/** Whether `address` has signed this agreement on-chain. */
export async function hasSignedOnChain(
  publicClient: PublicClient,
  cid: string,
  address: `0x${string}`,
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: requireModule(),
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'hasSignedAgreement',
      args: [agreementHashFromCid(cid), address],
    });
    return result === true;
  } catch (err) {
    console.warn('[onchainAgreements] hasSignedAgreement read failed:', err);
    return false;
  }
}

/** Whether this agreement is already recorded against the hat on-chain. */
export async function isCriterionOnChain(
  publicClient: PublicClient,
  hatId: bigint,
  cid: string,
): Promise<boolean> {
  try {
    const hashes = (await publicClient.readContract({
      address: requireModule(),
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'getHatCriteria',
      args: [hatId],
    })) as readonly `0x${string}`[];
    const target = agreementHashFromCid(cid).toLowerCase();
    return hashes.some((h) => h.toLowerCase() === target);
  } catch (err) {
    console.warn('[onchainAgreements] getHatCriteria read failed:', err);
    return false;
  }
}

/** Basescan link for a transaction, for receipts shown to members. */
export function txUrl(hash: string): string {
  return `https://basescan.org/tx/${hash}`;
}
