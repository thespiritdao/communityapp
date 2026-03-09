// src/app/api/paymaster/route.ts
// ERC-7677 paymaster proxy for SpiritDAO.
//
// CDP's built-in paymaster only sponsors calls to manually-whitelisted addresses.
// Per-pod PodCreationManagerV2 contracts are deployed dynamically on pod activation
// and cannot be added to the whitelist programmatically.
//
// This proxy intercepts pm_getPaymasterStubData / pm_getPaymasterData requests,
// inspects the callData to find the actual target contract, checks whether that
// contract is allowed (static whitelist OR stored in pods.creation_manager_address),
// then forwards approved requests to Coinbase's paymaster.
//
// Usage: set paymasterUrl="/api/paymaster" in sendUserOperation calls that target
// dynamic pod manager contracts. Statically-whitelisted contracts can continue
// using useCdpPaymaster: true directly.

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

/**
 * Extract the actual contract address(es) the user is trying to call from
 * the smart-account-encoded callData.
 */
function extractTargets(callData: string): string[] {
  if (!callData || callData === '0x' || callData.length < 10) return [];

  try {
    const { args } = decodeFunctionData({ abi: EXECUTE_ABI, data: callData as `0x${string}` });
    const target = args[0] as string;
    if (isAddress(target)) return [target.toLowerCase()];
  } catch {}

  try {
    const { args } = decodeFunctionData({ abi: EXECUTE_BATCH_ABI, data: callData as `0x${string}` });
    const calls = args[0] as unknown as { target: string }[];
    return calls.map((c) => c.target.toLowerCase()).filter(isAddress);
  } catch {}

  try {
    const { args } = decodeFunctionData({ abi: EXECUTE_BATCH_ALT_ABI, data: callData as `0x${string}` });
    const targets = args[0] as unknown as string[];
    return targets.map((t) => t.toLowerCase()).filter(isAddress);
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

  // Check each target
  for (const target of targets) {
    if (STATIC_WHITELIST.has(target)) continue;

    // Dynamic check — is this a known per-pod creation manager?
    const { data } = await supabaseAdmin
      .from('pods')
      .select('id')
      .eq('creation_manager_address', target)
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
