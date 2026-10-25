/**
 * Bounty eligibility — the one place that decides who can bid.
 *
 * Used by the bounty cards, the bid button, and the create form's preview.
 * The database enforces the parts it can verify (pod membership) in
 * bids_guard via bounty_bid_allowed(); on-chain credential gates are checked
 * here with viem and nowhere else.
 *
 * Gate model (mirrors migration 20261020000001):
 *   public         any member (Proof of Curiosity or Advocate)
 *   pod_members    members or leaders of `podId`
 *   token_holders  ANY of `credentials`: a pod (membership), an ERC-20
 *                  (balance >= minBalance whole tokens), an ERC-721 (count
 *                  >= minBalance), or a pod role (a Hats Protocol hat id)
 *
 * Hat ids are uint256 and do not fit bounty_token_gates.hat_id (bigint), so a
 * role gate stores the hat id as a decimal string in contract_address with
 * hat_id null. Role holding is read from active_pod_members (the member's own
 * hat) and, as a fallback, from the Hats contract.
 */

import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { supabase } from '@/utils/supabaseClient';

export type GateMode = 'public' | 'pod_members' | 'token_holders';

/**
 * DAO-level credentials (tokens with no owning pod: Proof of Curiosity,
 * Advocate, $SYSTEM, $SELF) are issued by SpiritDAO itself. Only managers of
 * the Executive Pod may gate a bounty on them. Same id as hatRegistry.ts.
 */
export const EXECUTIVE_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

export type CredentialKind = 'pod' | 'erc20' | 'erc721' | 'hat';

export interface CredentialGate {
  kind: CredentialKind;
  /** Pod uuid, token contract address, or hat id (as a decimal string). */
  id: string;
  name: string;
  minBalance: number;
}

export interface BountyGate {
  mode: GateMode;
  podId: string | null;
  credentials: CredentialGate[];
}

/** Raw shape as it comes back from `bounties` with `bounty_token_gates(*)`. */
export interface GateRow {
  required_pod_id?: string | null;
  restriction_level?: string | null;
  bounty_token_gates?: Array<{
    token_type?: string | null;
    contract_address?: string | null;
    hat_id?: number | string | null;
    hat_name?: string | null;
    min_balance?: number | string | null;
  }> | null;
}

/**
 * Hat ids appear as 0x-hex (pod_role_permissions, active_pod_members) or as
 * decimal strings. Compare and store them in one form: decimal.
 */
export function normalizeHatId(raw: string | number | bigint | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';
  try {
    return BigInt(s).toString();
  } catch {
    return s.toLowerCase();
  }
}

export function gateFromRow(row: GateRow): BountyGate {
  const level = row.restriction_level;
  const podId = row.required_pod_id ?? null;

  if (level === 'token_holders') {
    const credentials: CredentialGate[] = (row.bounty_token_gates ?? [])
      .map((g) => {
        const kind = (g.token_type ?? 'hat') as CredentialKind;
        const id =
          kind === 'hat'
            ? normalizeHatId(g.hat_id ?? g.contract_address)
            : String(g.contract_address ?? '').toLowerCase();
        return {
          kind,
          id,
          name: g.hat_name ?? id,
          minBalance: Math.max(0, Number(g.min_balance ?? 1) || 1),
        };
      })
      .filter((c) => c.id);
    // A token_holders bounty with no gates would be unreachable; treat it as
    // public rather than locking everyone out.
    return credentials.length
      ? { mode: 'token_holders', podId, credentials }
      : { mode: 'public', podId, credentials: [] };
  }

  if (level === 'pod_members' || (!level && podId)) {
    return { mode: 'pod_members', podId, credentials: [] };
  }

  return { mode: 'public', podId, credentials: [] };
}

/** Human sentence for "Who can apply". */
export function describeGate(gate: BountyGate, podName?: string | null): string {
  switch (gate.mode) {
    case 'pod_members':
      return `Members of ${podName || 'the sponsoring pod'}`;
    case 'token_holders': {
      const names = gate.credentials.map((c) =>
        c.kind === 'pod'
          ? `members of ${c.name}`
          : c.kind === 'hat'
            ? `holders of the ${c.name} role`
            : `${c.name} holders`,
      );
      if (names.length === 1) return capitalize(names[0]);
      return `Any of: ${names.join(', ')}`;
    }
    default:
      return 'Any SpiritDAO member';
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface EligibilityContext {
  wallet: string | null;
  /** Holds Proof of Curiosity or Advocate. */
  isMember: boolean;
  memberPodIds: Set<string>;
  leaderPodIds: Set<string>;
  /** Lowercased contract or hat id → balance (whole tokens / count). */
  holdings: Map<string, number>;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

export function isEligible(gate: BountyGate, ctx: EligibilityContext): EligibilityResult {
  if (!ctx.wallet) return { eligible: false, reason: 'Connect your wallet to bid.' };

  switch (gate.mode) {
    case 'public':
      return ctx.isMember
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: 'Open to SpiritDAO members. Finish onboarding to bid.' };

    case 'pod_members': {
      if (!gate.podId) return { eligible: true, reason: '' };
      const ok = ctx.memberPodIds.has(gate.podId) || ctx.leaderPodIds.has(gate.podId);
      return ok
        ? { eligible: true, reason: '' }
        : { eligible: false, reason: 'Only members of the sponsoring pod can bid. Apply to join the pod first.' };
    }

    case 'token_holders': {
      for (const c of gate.credentials) {
        if (c.kind === 'pod') {
          if (ctx.memberPodIds.has(c.id) || ctx.leaderPodIds.has(c.id)) return { eligible: true, reason: '' };
        } else {
          const have = ctx.holdings.get(c.id.toLowerCase()) ?? 0;
          if (have >= c.minBalance) return { eligible: true, reason: '' };
        }
      }
      return {
        eligible: false,
        reason: `You need one of: ${gate.credentials
          .map((c) =>
            c.kind === 'pod' ? `membership of ${c.name}` : c.kind === 'hat' ? `the ${c.name} role` : c.name,
          )
          .join(', ')}.`,
      };
    }
  }
}

// ─── Loading the context ─────────────────────────────────────────────────────

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
] as const;

const HATS_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'wearer', type: 'address' }, { name: 'hatId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const HATS_ADDRESS = (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
  '0x3bc1a0ad72417f2d411118085256fc53cbddd137') as Address;

function publicClient() {
  return createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
  });
}

/**
 * Load everything isEligible() needs for one wallet. `credentials` is the
 * union of on-chain gates across the bounties on screen, so balances are
 * read once per contract, not once per bounty.
 */
export async function loadEligibilityContext(
  wallet: string | null,
  isMember: boolean,
  credentials: CredentialGate[],
): Promise<EligibilityContext> {
  const ctx: EligibilityContext = {
    wallet: wallet?.toLowerCase() ?? null,
    isMember,
    memberPodIds: new Set(),
    leaderPodIds: new Set(),
    holdings: new Map(),
  };
  if (!ctx.wallet) return ctx;

  const [memberRes, podsRes] = await Promise.all([
    supabase.from('active_pod_members').select('pod_id, hat_id').eq('wallet', ctx.wallet),
    supabase.from('pods').select('id, pod_leads, created_by_address').eq('status', 'active'),
  ]);
  for (const m of memberRes.data ?? []) {
    if (m.pod_id) ctx.memberPodIds.add(m.pod_id);
    // The member's own role hat satisfies a role gate without a chain read.
    const hat = normalizeHatId((m as { hat_id?: string | null }).hat_id);
    if (hat) ctx.holdings.set(hat, 1);
  }
  for (const p of podsRes.data ?? []) {
    const leads = (p.pod_leads ?? []) as string[];
    if (leads.some((l) => l?.toLowerCase() === ctx.wallet) || p.created_by_address?.toLowerCase() === ctx.wallet) {
      ctx.leaderPodIds.add(p.id);
    }
  }

  // Role gates already satisfied from active_pod_members need no chain read.
  const onchain = credentials.filter(
    (c) => c.kind !== 'pod' && !(c.kind === 'hat' && ctx.holdings.has(normalizeHatId(c.id))),
  );
  if (onchain.length === 0) return ctx;

  const unique = new Map<string, CredentialGate>();
  for (const c of onchain) unique.set(`${c.kind}:${c.id.toLowerCase()}`, c);

  try {
    const client = publicClient();
    const list = Array.from(unique.values());
    const contracts = list.map((c) =>
      c.kind === 'hat'
        ? { address: HATS_ADDRESS, abi: HATS_ABI, functionName: 'balanceOf' as const, args: [ctx.wallet as Address, BigInt(c.id)] }
        : { address: c.id as Address, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: [ctx.wallet as Address] },
    );
    const decimalCalls = list.map((c) =>
      c.kind === 'erc20'
        ? { address: c.id as Address, abi: ERC20_ABI, functionName: 'decimals' as const }
        : null,
    );
    const [balances, decimals] = await Promise.all([
      client.multicall({ contracts: contracts as any, allowFailure: true }),
      client.multicall({
        contracts: decimalCalls.filter(Boolean) as any,
        allowFailure: true,
      }),
    ]);
    let d = 0;
    list.forEach((c, i) => {
      const r = balances[i];
      if (r.status !== 'success') return;
      const raw = r.result as bigint;
      let value: number;
      if (c.kind === 'erc20') {
        const dec = decimals[d++];
        const scale = dec.status === 'success' ? Number(dec.result) : 18;
        value = Number(raw) / 10 ** scale;
      } else {
        value = Number(raw);
      }
      ctx.holdings.set(c.id.toLowerCase(), value);
    });
  } catch (err) {
    console.warn('Eligibility: on-chain balance read failed', err);
  }

  return ctx;
}

/** Union of on-chain credential gates across a set of bounties. */
export function collectCredentials(gates: BountyGate[]): CredentialGate[] {
  const out: CredentialGate[] = [];
  for (const g of gates) if (g.mode === 'token_holders') out.push(...g.credentials);
  return out;
}
