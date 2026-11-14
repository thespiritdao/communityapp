/**
 * Hat Registry
 *
 * Server-side utility that resolves named hat keys to on-chain hat ids.
 *
 * Every key is a hat of one of the deployment's structural pods (see PODS in
 * src/config/deployment.ts), read from that pod's row in `pods`:
 *   - a pod's management hat is its leader hat,
 *   - a pod's membership hat is its member hat.
 *
 * There is no separate registry table. When a hat tree is redeployed, update
 * `pods.management_hat_id` / `pods.membership_hat_id` and lookups follow.
 *
 * Server-side usage:
 *   import { getHatId, getHatIdBigInt } from '@/lib/hatRegistry';
 *   const id = await getHatIdBigInt('EXECUTIVE_POD_LEADER');
 */

import { createClient } from '@supabase/supabase-js';
import { PODS } from '@/config/deployment';

// ─── Types ──────────────────────────────────────────────────────────────────

export type HatKey =
  | 'EXECUTIVE_POD_LEADER'
  | 'COMMUNITY_PODS_PARENT'
  | 'DEFAULT_POD'
  | 'DEFAULT_POD_LEADER'
  | 'DEFAULT_POD_MEMBER';

export type HatIds = Record<HatKey, `0x${string}` | undefined>;

type HatColumn = 'management_hat_id' | 'membership_hat_id';

const LOOKUPS: Record<HatKey, { podId: string | undefined; column: HatColumn }> = {
  EXECUTIVE_POD_LEADER: { podId: PODS.governance, column: 'management_hat_id' },
  COMMUNITY_PODS_PARENT: { podId: PODS.communityParent, column: 'management_hat_id' },
  DEFAULT_POD: { podId: PODS.defaultCommunity, column: 'management_hat_id' },
  DEFAULT_POD_LEADER: { podId: PODS.defaultCommunity, column: 'management_hat_id' },
  DEFAULT_POD_MEMBER: { podId: PODS.defaultCommunity, column: 'membership_hat_id' },
};

// ─── Cache ───────────────────────────────────────────────────────────────────

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: { ids: HatIds; expiresAt: number } | null = null;

// ─── Internal loader ─────────────────────────────────────────────────────────

async function loadFromDb(): Promise<HatIds> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const podIds = [...new Set(Object.values(LOOKUPS).map((l) => l.podId).filter(Boolean))] as string[];
  const ids: Partial<HatIds> = {};

  if (podIds.length > 0) {
    const { data, error } = await supabase
      .from('pods')
      .select('id, management_hat_id, membership_hat_id')
      .in('id', podIds);
    if (error) {
      console.error('[hatRegistry] pods lookup failed:', error.message);
    }
    const byId = new Map((data ?? []).map((p: any) => [p.id as string, p]));
    for (const [key, { podId, column }] of Object.entries(LOOKUPS) as [HatKey, (typeof LOOKUPS)[HatKey]][]) {
      const hatId = podId ? byId.get(podId)?.[column] : undefined;
      if (typeof hatId === 'string' && hatId.startsWith('0x')) {
        ids[key] = hatId as `0x${string}`;
      }
    }
  }

  // A key whose pod is configured but did not resolve means the pod row is
  // missing or has a NULL hat column, which breaks governance or onboarding.
  // Keys whose pod is not configured are optional and stay silent.
  const unresolved = (Object.keys(LOOKUPS) as HatKey[]).filter(
    (k) => LOOKUPS[k].podId && !ids[k],
  );
  if (unresolved.length > 0) {
    console.error(
      `[hatRegistry] UNRESOLVED hat keys (governance/onboarding may break): ${unresolved.join(', ')}`,
    );
  }

  return ids as HatIds;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getHatIds(): Promise<HatIds> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.ids;
  const ids = await loadFromDb();
  cache = { ids, expiresAt: now + TTL_MS };
  return ids;
}

export async function getHatId(key: HatKey): Promise<`0x${string}` | undefined> {
  return (await getHatIds())[key];
}

export async function getHatIdBigInt(key: HatKey): Promise<bigint> {
  const hatId = await getHatId(key);
  if (!hatId) {
    throw new Error(
      `Hat id for '${key}' could not be resolved. Check that the pod configured ` +
        `for it in the environment exists and has its hat columns set.`,
    );
  }
  return BigInt(hatId);
}

export function invalidateHatCache(): void {
  cache = null;
}
