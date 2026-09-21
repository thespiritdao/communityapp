import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, getAddress } from 'viem';
import { base } from 'viem/chains';
import jwt from 'jsonwebtoken';
import { getHatId } from '@/lib/hatRegistry';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

/**
 * Exec-Pod-only admin API for community governance tokens.
 *
 * Security model (mirrors api/pods/review + api/donations/approve):
 *   1. JWT-verify the caller's wallet (never trust the request body for identity).
 *   2. Re-check the EXECUTIVE_POD_LEADER hat ON-CHAIN — UI gating is not an
 *      enforcement boundary.
 *   3. Only then write with the service-role client.
 *
 * 501(c)(3) posture: blessing a token for gating (gating_enabled) is a deliberate
 * Exec action. The token is a governance signal only — never issued, held, or
 * exchanged by the platform. `owner_pod_id` scopes it to one community.
 *
 * POST  — register/bless a token (reads decimals on-chain). Body:
 *           { contract_address, name, owner_pod_id?, gating_enabled? }
 * PATCH — toggle/scope an existing token. Body:
 *           { id, gating_enabled?, owner_pod_id? }  (owner_pod_id null = platform-wide)
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

const publicClient = createPublicClient({ chain: base, transport: http() });

const HATS_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return (
      payload.wallet_address || payload.user_metadata?.wallet_address || null
    );
  } catch {
    return null;
  }
}

async function requireExec(req: NextRequest): Promise<
  | { ok: true; wallet: string }
  | { ok: false; res: NextResponse }
> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const wallet = await getWalletFromToken(token);
  if (!wallet) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
    };
  }

  const execHatId = await getHatId('EXECUTIVE_POD_LEADER');
  if (!execHatId) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Executive hat not configured' },
        { status: 500 },
      ),
    };
  }

  const balance = (await publicClient.readContract({
    address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
    abi: HATS_ABI,
    functionName: 'balanceOf',
    args: [getAddress(wallet), BigInt(execHatId)],
  })) as bigint;

  if (balance === 0n) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Forbidden: Executive Pod role required' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, wallet };
}

export async function GET(req: NextRequest) {
  const auth = await requireExec(req);
  if (!auth.ok) return auth.res;

  // Exec sees ALL erc20 community tokens (incl. disabled) plus the pods list
  // for the scope dropdown.
  const [{ data: tokens }, { data: pods }] = await Promise.all([
    supabaseAdmin
      .from('tokens')
      .select('id, name, contract_address, decimals, gating_enabled, owner_pod_id')
      .eq('token_type', 'erc20')
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('pods')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true }),
  ]);

  // The platform's own tokens ($SYSTEM/$SELF) share token_type='erc20' with
  // community tokens. They are not community governance signals and must never
  // appear in this card (toggling their gating_enabled is meaningless/harmful).
  // Exclude them two ways so the filter holds regardless of how the row was
  // seeded: (1) by the canonical env-configured addresses — the same source of
  // truth the marketplace trusts — and (2) by their stable token id slugs.
  // Both compared case-insensitively (DB casing isn't guaranteed).
  const PLATFORM_TOKEN_ADDRESSES = [
    process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
    process.env.NEXT_PUBLIC_SELF_TOKEN,
  ]
    .filter(Boolean)
    .map((a) => (a as string).toLowerCase());
  const PLATFORM_TOKEN_IDS = ['$system', '$self', 'system', 'self'];

  const communityTokens = (tokens ?? []).filter((t) => {
    const addr = t.contract_address?.toLowerCase();
    const id = t.id?.toLowerCase();
    return !PLATFORM_TOKEN_ADDRESSES.includes(addr) && !PLATFORM_TOKEN_IDS.includes(id);
  });

  return NextResponse.json({ tokens: communityTokens, pods: pods ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireExec(req);
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const contractAddress: string | undefined = body.contract_address;
    const name: string | undefined = body.name;
    const ownerPodId: string | null = body.owner_pod_id ?? null;
    const gatingEnabled: boolean = body.gating_enabled ?? true;

    if (
      !contractAddress ||
      !/^0x[0-9a-fA-F]{40}$/.test(contractAddress) ||
      !name
    ) {
      return NextResponse.json(
        { error: 'contract_address (0x..40) and name are required' },
        { status: 400 },
      );
    }

    // Read decimals on-chain — never assume; also a soft validity check that
    // the address is a real ERC-20.
    let decimals: number;
    try {
      decimals = Number(
        await publicClient.readContract({
          address: getAddress(contractAddress),
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      );
    } catch {
      return NextResponse.json(
        { error: 'Could not read decimals() — not a valid ERC-20 on Base?' },
        { status: 400 },
      );
    }

    const row = {
      id: name.replace(/^\$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name,
      contract_address: contractAddress,
      token_type: 'erc20',
      decimals,
      is_active: true,
      gating_enabled: gatingEnabled,
      owner_pod_id: ownerPodId,
      description: `Community governance token — governance signal only`,
    };

    // Upsert on contract_address so re-registering updates rather than dupes.
    const { data: existing } = await supabaseAdmin
      .from('tokens')
      .select('id')
      .ilike('contract_address', contractAddress)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('tokens')
        .update({
          name,
          token_type: 'erc20',
          decimals,
          is_active: true,
          gating_enabled: gatingEnabled,
          owner_pod_id: ownerPodId,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ token: data, updated: true });
    }

    const { data, error } = await supabaseAdmin
      .from('tokens')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ token: data, created: true });
  } catch (e: any) {
    console.error('admin/tokens POST failed:', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to register token' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireExec(req);
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const id: string | undefined = body.id;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const patch: Record<string, any> = {};
    if (typeof body.gating_enabled === 'boolean') {
      patch.gating_enabled = body.gating_enabled;
    }
    // owner_pod_id is explicitly settable to null (platform-wide).
    if ('owner_pod_id' in body) {
      patch.owner_pod_id = body.owner_pod_id ?? null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('tokens')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ token: data });
  } catch (e: any) {
    console.error('admin/tokens PATCH failed:', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to update token' },
      { status: 500 },
    );
  }
}
