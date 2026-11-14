// src/app/api/paymaster/route.ts
// ERC-7677 paymaster proxy for SpiritDAO.
//
// CDP's built-in paymaster only sponsors calls to manually-whitelisted addresses.
// Per-pod PodCreationManagerV2 contracts are deployed dynamically on pod activation
// and cannot be added to the whitelist programmatically.
//
// This proxy intercepts pm_getPaymasterStubData / pm_getPaymasterData requests,
// inspects the callData to find the actual target contract, checks whether that
// contract is allowed (static whitelist OR stored on a pod row — either as
// creation_manager_address or treasury_contract_address), then forwards
// approved requests to Coinbase's paymaster.
//
// Usage: set paymasterUrl="/api/paymaster" in sendUserOperation calls that target
// dynamic pod manager contracts. Statically-whitelisted contracts can continue
// using useCdpPaymaster: true directly.

import { PAYMASTER_EXTRA_ALLOWLIST } from '@/config/deployment.server';
import { type NextRequest, NextResponse } from 'next/server';
import { decodeFunctionData, isAddress } from 'viem';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

// ── Static whitelist ────────────────────────────────────────────────────────
// Contracts that are always allowed to receive sponsored gas.
// Keep this in sync with your Coinbase paymaster whitelist policy.
const STATIC_WHITELIST = new Set<string>(
  [
    process.env.NEXT_PUBLIC_POD_CREATION_MANAGER,
    process.env.NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY,
    process.env.NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS,
    process.env.NEXT_PUBLIC_HATS_CONTRACT,
    process.env.NEXT_PUBLIC_HAT_MINTER,
    process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS,
    process.env.NEXT_PUBLIC_TREASURY_PROXY,
    // EventManagerV2 — createEvent / registerForEvent / completeEvent /
    // cancelEvent / certificate mints are all sponsored. ($SELF event payment
    // burns via SELF_PAYMENT, listed below, in a separate userOp.)
    process.env.NEXT_PUBLIC_EVENT_MANAGER,
    // Deployment-specific extras (for example pod treasuries that need
    // setAuthorizedProxy during a proxy migration): PAYMASTER_EXTRA_ALLOWLIST.
    ...PAYMASTER_EXTRA_ALLOWLIST,
    // $SELF soulbound system (Phase 0). Backend mint/prestige/receipt ops + the
    // user-facing burn-to-pay all sponsored. SelfEpochs is NOT listed — it is
    // only called internally by Minter/Payment, never as a top-level userOp.
    process.env.NEXT_PUBLIC_SELF_MINTER,
    process.env.NEXT_PUBLIC_SELF_PAYMENT,
    process.env.NEXT_PUBLIC_SELF_PRESTIGE,
    process.env.NEXT_PUBLIC_SELF_RECEIPT,
  ]
    .filter(Boolean)
    .map((a) => a!.toLowerCase()),
);

// ── ERC-4337 smart-account execute ABIs ────────────────────────────────────
// The UserOperation's callData encodes a call to the smart account itself
// (execute or executeBatch). We decode this to find the real target(s).
const EXECUTE_ABI = [
  {
    name: 'execute',
    type: 'function',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const EXECUTE_BATCH_ABI = [
  {
    name: 'executeBatch',
    type: 'function',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// Some Coinbase smart accounts use (address, uint256, bytes) without names
const EXECUTE_BATCH_ALT_ABI = [
  {
    name: 'executeBatch',
    type: 'function',
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'datas', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// Sentinel returned when a batch decodes but contains a target we cannot fully
// validate (missing or non-address element). We must NOT silently drop such a
// target — that would let an unvalidated call ride along on a batch whose other
// targets are whitelisted. Its presence forces denial in willSponsor.
const UNDECODABLE = '__undecodable__';

/**
 * Extract every contract address the UserOperation will call from the
 * smart-account-encoded callData. Returns one lowercased address per call.
 *
 * FAIL CLOSED: if any batch element is malformed (not a valid address), the
 * result includes the UNDECODABLE sentinel so the whole op is denied rather
 * than partially validated. An empty result means "could not decode at all".
 */
function extractTargets(callData: string): string[] {
  if (!callData || callData === '0x' || callData.length < 10) return [];

  // Map a raw element to a lowercased address, or UNDECODABLE if invalid.
  const norm = (v: unknown): string =>
    typeof v === 'string' && isAddress(v) ? v.toLowerCase() : UNDECODABLE;

  try {
    const { args } = decodeFunctionData({ abi: EXECUTE_ABI, data: callData as `0x${string}` });
    return [norm(args[0])];
  } catch {}

  try {
    const { args } = decodeFunctionData({ abi: EXECUTE_BATCH_ABI, data: callData as `0x${string}` });
    const calls = args[0] as unknown as { target: string }[];
    if (!Array.isArray(calls) || calls.length === 0) return [];
    return calls.map((c) => norm(c?.target));
  } catch {}

  try {
    const { args } = decodeFunctionData({ abi: EXECUTE_BATCH_ALT_ABI, data: callData as `0x${string}` });
    const targets = args[0] as unknown as string[];
    if (!Array.isArray(targets) || targets.length === 0) return [];
    return targets.map((t) => norm(t));
  } catch {}

  return [];
}

/**
 * Returns true if all target contracts in the UserOperation are approved.
 */
async function willSponsor(userOp: Record<string, unknown>): Promise<boolean> {
  const callData = (userOp.callData as string) || '';
  const targets = extractTargets(callData);

  if (targets.length === 0) {
    // Can't determine target — deny to be safe
    console.warn('[paymaster] Could not decode callData targets, denying sponsorship');
    return false;
  }

  // Any target we couldn't validate as an address → deny the whole op.
  if (targets.includes(UNDECODABLE)) {
    console.warn('[paymaster] Batch contains an undecodable target, denying sponsorship');
    return false;
  }

  // Check each target
  for (const target of targets) {
    if (STATIC_WHITELIST.has(target)) continue;

    // Dynamic check — is this a known per-pod contract? Match on either
    // creation_manager_address (V2 per-pod manager) or
    // treasury_contract_address (V3 per-pod treasury, deployed via
    // PodTreasuryDeployerV3). Case-insensitive: viem returns checksummed
    // addresses from decoded events while `target` here is lowercased.
    const { data } = await supabaseAdmin
      .from('pods')
      .select('id')
      .or(
        `creation_manager_address.ilike.${target},treasury_contract_address.ilike.${target}`,
      )
      .limit(1)
      .maybeSingle();

    if (!data) {
      console.warn(`[paymaster] Denying sponsorship for unknown contract: ${target}`);
      return false;
    }
  }

  return true;
}

// ── Upstream Coinbase paymaster URL ─────────────────────────────────────────
const UPSTREAM_PAYMASTER = process.env.NEXT_PUBLIC_PAYMASTER as string;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, params, id, jsonrpc } = body as {
      method: string;
      params: unknown[];
      id: unknown;
      jsonrpc: string;
    };

    if (method !== 'pm_getPaymasterStubData' && method !== 'pm_getPaymasterData') {
      return NextResponse.json(
        { jsonrpc, id, error: { code: -32601, message: `Method not supported: ${method}` } },
        { status: 200 },
      );
    }

    // params[0] is the UserOperation object
    const userOp = (params?.[0] ?? {}) as Record<string, unknown>;

    const allowed = await willSponsor(userOp);
    if (!allowed) {
      return NextResponse.json(
        {
          jsonrpc,
          id,
          error: {
            code: -32003,
            message: 'Paymaster: contract not approved for gas sponsorship',
          },
        },
        { status: 200 },
      );
    }

    // Forward to Coinbase paymaster
    const upstream = await fetch(UPSTREAM_PAYMASTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc, id, method, params }),
    });

    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status });
  } catch (err: any) {
    console.error('[paymaster] proxy error:', err);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: err.message || 'Internal paymaster error' },
      },
      { status: 200 }, // JSON-RPC errors always return HTTP 200
    );
  }
}
