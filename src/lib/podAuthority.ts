// src/lib/podAuthority.ts
//
// One answer to "what may this wallet do in this pod?" — Phase 1 of
// APP_AUDIT_2026-09-15.md.
//
// Until now the server decided authority from the database alone:
// check_pod_permission() joined pod_members.hat_id to pod_role_permissions,
// and eight copies of isPodLeader() read pods.pod_leads and
// pod_members.role. pod_members was writable by its own member, so a member
// could hand themselves any permission (audit F1; closed by a trigger in
// Phase 0). The chain never had that problem: a hat is either worn or it
// isn't, and Hats.balanceOf() cannot be edited from a browser.
//
// So this resolver reads the chain first — the pod's management hat and each
// role hat, via Hats.balanceOf — and unions the permissions of the hats the
// wallet actually wears. The database is consulted for the *definitions*
// (which hat is which, what each role grants), which members cannot write,
// and as a fallback when the RPC is unreachable, in which case the result is
// marked source: 'db' so callers and logs can tell.
//
// SERVER ONLY: imports the service-role client.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import type { HatPermissions } from '@/services/hatPermissionsService';

export type PermissionKey = keyof HatPermissions;

export interface PodAuthority {
  wallet: string;
  podId: string;
  /** Wears the pod's management hat (the on-chain definition of a leader). */
  isManager: boolean;
  /** isManager, or listed in pods.pod_leads / created_by_address. */
  isLeader: boolean;
  /** Union of the permissions granted by the role hats the wallet wears. */
  permissions: Partial<Record<PermissionKey, boolean>>;
  /** Role hat ids (as stored) the wallet was found to wear. */
  roleHats: string[];
  /** 'chain' when balances came from Hats; 'db' when the RPC was unreachable. */
  source: 'chain' | 'db';
}

const HATS = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}` | undefined;
const RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// One client for the module. Left un-annotated on purpose: two copies of
// viem's PublicClient type exist in node_modules and any explicit annotation
// trips "two different types with this name".
const publicClient = createPublicClient({ chain: base, transport: http(RPC) });

/** Hat ids are stored as padded hex for most pods and decimal for one. */
function toHatId(raw: string | null | undefined): bigint | null {
  if (!raw) return null;
  try {
    return BigInt(String(raw).trim());
  } catch {
    return null;
  }
}

// A wallet's authority in a pod rarely changes within a request burst; the
// TTL is short so a freshly minted hat shows up within half a minute.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: PodAuthority; expiresAt: number }>();

interface RoleRow {
  id: string;
  role_name: string;
  token_address: string;
  permissions: Partial<Record<PermissionKey, boolean>> | string | null;
}

function parsePermissions(raw: RoleRow['permissions']): Partial<Record<PermissionKey, boolean>> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function unionPermissions(rows: RoleRow[]): Partial<Record<PermissionKey, boolean>> {
  const out: Partial<Record<PermissionKey, boolean>> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(parsePermissions(row.permissions))) {
      if (v === true) out[k as PermissionKey] = true;
    }
  }
  return out;
}

/**
 * Resolve what `wallet` may do in `podId`. Chain first; database fallback.
 */
export async function resolvePodAuthority(
  wallet: string,
  podId: string,
  opts: { fresh?: boolean } = {},
): Promise<PodAuthority> {
  const w = wallet.toLowerCase();
  const key = `${w}|${podId}`;
  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }

  // Definitions members cannot write: which hat is the management hat, who
  // the declared leads are, and what each role hat grants.
  const [{ data: pod }, { data: roles }] = await Promise.all([
    supabaseAdmin
      .from('pods')
      .select('management_hat_id, pod_leads, created_by_address')
      .eq('id', podId)
      .maybeSingle(),
    supabaseAdmin
      .from('pod_role_permissions')
      .select('id, role_name, token_address, permissions')
      .eq('pod_id', podId)
      .eq('is_active', true),
  ]);

  const leads = ((pod?.pod_leads as string[] | null) ?? []).map((x) => x.toLowerCase());
  const declaredLead = leads.includes(w) || (pod?.created_by_address || '').toLowerCase() === w;
  const roleRows = (roles ?? []) as RoleRow[];
  const mgmtHat = toHatId(pod?.management_hat_id as string | null);

  let result: PodAuthority;

  try {
    if (!HATS) throw new Error('NEXT_PUBLIC_HATS_CONTRACT unset');
    const c = publicClient;
    const account = w as `0x${string}`;

    const roleHatIds = roleRows.map((r) => toHatId(r.token_address));
    const [mgmtBalance, ...roleBalances] = await Promise.all([
      mgmtHat === null
        ? Promise.resolve(0n)
        : c.readContract({ address: HATS, abi: BALANCE_OF_ABI, functionName: 'balanceOf', args: [account, mgmtHat] }),
      ...roleHatIds.map((id) =>
        id === null
          ? Promise.resolve(0n)
          : c.readContract({ address: HATS, abi: BALANCE_OF_ABI, functionName: 'balanceOf', args: [account, id] }),
      ),
    ]);

    const wornRows = roleRows.filter((_, i) => (roleBalances[i] ?? 0n) > 0n);
    const isManager = (mgmtBalance as bigint) > 0n;

    result = {
      wallet: w,
      podId,
      isManager,
      isLeader: isManager || declaredLead,
      permissions: unionPermissions(wornRows),
      roleHats: wornRows.map((r) => r.token_address),
      source: 'chain',
    };
  } catch (err) {
    // The chain is the source of truth; the database is the record of what
    // the chain said last time we wrote it. Since Phase 0 a member cannot
    // edit their own role or hat_id, so this fallback is no longer the
    // escalation path it was — but it is still second-hand, and the result
    // says so.
    console.warn(`[podAuthority] chain read failed for ${w} in ${podId}; falling back to database:`, err instanceof Error ? err.message : err);

    const { data: membership } = await supabaseAdmin
      .from('pod_members')
      .select('hat_id, role')
      .eq('pod_id', podId)
      .eq('wallet', w)
      .eq('is_active', true)
      .maybeSingle();

    const wornRows = membership?.hat_id
      ? roleRows.filter((r) => {
          const a = toHatId(r.token_address);
          const b = toHatId(membership.hat_id as string);
          return a !== null && b !== null && a === b;
        })
      : [];
    const dbLeader = declaredLead || membership?.role === 'leader';
    const isManager =
      mgmtHat !== null && wornRows.some((r) => toHatId(r.token_address) === mgmtHat);

    result = {
      wallet: w,
      podId,
      isManager,
      isLeader: isManager || dbLeader,
      permissions: unionPermissions(wornRows),
      roleHats: wornRows.map((r) => r.token_address),
      source: 'db',
    };
  }

  cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Does the wallet hold this permission in the pod, and how do we know. */
export async function hasPodPermission(
  wallet: string,
  podId: string,
  permission: PermissionKey,
): Promise<{ allowed: boolean; source: PodAuthority['source'] }> {
  const auth = await resolvePodAuthority(wallet, podId);
  return { allowed: auth.permissions[permission] === true, source: auth.source };
}

/** Is the wallet a leader of the pod (management hat, or declared lead/creator). */
export async function isPodLead(wallet: string, podId: string): Promise<boolean> {
  const auth = await resolvePodAuthority(wallet, podId);
  return auth.isLeader;
}

/**
 * Does `wallet` wear `hatId` right now, per Hats on Base? Throws if the chain
 * cannot be read — callers that record membership must not guess.
 */
export async function wearsHat(wallet: string, hatId: string | bigint): Promise<boolean> {
  if (!HATS) throw new Error('NEXT_PUBLIC_HATS_CONTRACT unset');
  const id = typeof hatId === 'bigint' ? hatId : toHatId(hatId);
  if (id === null) throw new Error(`Unparseable hat id: ${String(hatId)}`);
  const balance = await publicClient.readContract({
    address: HATS,
    abi: BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [wallet.toLowerCase() as `0x${string}`, id],
  });
  return (balance as bigint) > 0n;
}

/** Drop cached authority for a wallet/pod, e.g. right after minting a hat. */
export function invalidatePodAuthority(wallet: string, podId: string): void {
  cache.delete(`${wallet.toLowerCase()}|${podId}`);
}
