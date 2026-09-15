// src/features/pods/services/OnChainAgreementService.ts
//
// On-chain agreements against the eligibility module at
// NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS.
//
// Two different contracts have been deployed under that name, and which one
// an environment points at has differed between machines (audit
// 2026-09-15): production uses MultiCriteriaEligibilityModule
// (0x437e353A…), a local .env had the plain EligibilityModule (0x8E87Bb0D…).
// Both expose addAgreementCriterion(hatId, hash, requireAll) and
// signAgreement(hash) with identical signatures, but their read-side getters
// differ, and so does who may add a criterion:
//
//   EligibilityModule       hasSignedAgreement(hash, user); getHatCriteria(hat)
//                           addAgreementCriterion gated by Hats.isAdminOfHat
//   MultiCriteria           agreementSignatures(user, hash); agreementCriteria(hat, hash)
//                           addAgreementCriterion gated by its own hatAdmins[hat],
//                           which is set once, first-come, via setHatAdmin.
//
// Reads here try the first shape and fall back to the second, so the same
// code is correct against either deployment.
//
// ENFORCEMENT IS SEPARATE. A hat only consults a module once its eligibility
// address is pointed there with Hats.changeHatEligibility. Today every hat
// points at AgentExclusionEligibilityModule (0x4A63…), so writes to either
// module are a public record and gate nothing.

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
  // EligibilityModule shape
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
  // MultiCriteriaEligibilityModule shape (public mapping getters)
  {
    name: 'agreementSignatures',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'agreementCriteria',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'bytes32' },
    ],
    outputs: [
      { name: 'agreementHash', type: 'bytes32' },
      { name: 'requireAll', type: 'bool' },
    ],
  },
  {
    name: 'hatAdmins',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
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
 * Record an agreement against a role's hat. Who may call this depends on the
 * deployed module: Hats admin of the hat (EligibilityModule) or the module's
 * own hatAdmins[hat] (MultiCriteria), which must have been set first.
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

/** Sign an agreement as the sending account. Permissionless on both modules. */
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

/**
 * Whether `address` has signed this agreement on-chain. Tries the
 * EligibilityModule getter, then MultiCriteria's mapping. Throws only if
 * neither shape answers — callers recording a signature must not guess.
 */
export async function hasSignedOnChain(
  publicClient: PublicClient,
  cid: string,
  address: `0x${string}`,
): Promise<boolean> {
  const module = requireModule();
  const hash = agreementHashFromCid(cid);
  try {
    const r = await publicClient.readContract({
      address: module,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'hasSignedAgreement',
      args: [hash, address],
    });
    return r === true;
  } catch {
    const r = await publicClient.readContract({
      address: module,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'agreementSignatures',
      args: [address, hash],
    });
    return r === true;
  }
}

/** Whether this agreement is already recorded against the hat on-chain. */
export async function isCriterionOnChain(
  publicClient: PublicClient,
  hatId: bigint,
  cid: string,
): Promise<boolean> {
  const module = requireModule();
  const target = agreementHashFromCid(cid);
  try {
    const hashes = (await publicClient.readContract({
      address: module,
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'getHatCriteria',
      args: [hatId],
    })) as readonly `0x${string}`[];
    return hashes.some((h) => h.toLowerCase() === target.toLowerCase());
  } catch {
    try {
      const [storedHash] = (await publicClient.readContract({
        address: module,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'agreementCriteria',
        args: [hatId, target],
      })) as readonly [`0x${string}`, boolean];
      return storedHash.toLowerCase() === target.toLowerCase();
    } catch (err) {
      console.warn('[onchainAgreements] criterion read failed on both module shapes:', err);
      return false;
    }
  }
}

/**
 * On MultiCriteria, who may add criteria for this hat. Zero address means
 * nobody has claimed it yet — and setHatAdmin is first-come. Returns null on
 * EligibilityModule, which has no such registry.
 */
export async function moduleHatAdmin(
  publicClient: PublicClient,
  hatId: bigint,
): Promise<`0x${string}` | null> {
  try {
    return (await publicClient.readContract({
      address: requireModule(),
      abi: ELIGIBILITY_MODULE_ABI,
      functionName: 'hatAdmins',
      args: [hatId],
    })) as `0x${string}`;
  } catch {
    return null;
  }
}

/** Basescan link for a transaction, for receipts shown to members. */
export function txUrl(hash: string): string {
  return `https://basescan.org/tx/${hash}`;
}
