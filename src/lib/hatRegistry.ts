/**
 * Hat Registry
 *
 * Server-side utility that resolves named hat keys to their on-chain hat IDs
 * by querying `pod_role_permissions.token_address`.
 *
 * There is NO separate registry table — pod_role_permissions is the source
 * of truth. When a pod's hat tree is redeployed, update the token_address
 * in pod_role_permissions and all lookups update automatically.
 *
 * Current hat tree (top hat 0x00000749):
 *   Executive Pod Leader    0x0000074900010000...  pod e35c9e25
 *   Community Pod parent    0x0000074900020000...  pod 86d2d359 (parent hat, no role row)
 *   Temporal Naturalism     0x0000074900020001...  pod f2bc166d (pod hat)
 *   TN Leader               0x0000074900020001000000...  pod f2bc166d, role "Temporal Naturalism Leader"
 *   TN Member               0x0000074900020001000100...  pod f2bc166d, role "Temporal Naturalism Member"
 *
 * Server-side usage:
 *   import { getHatId, getHatIdBigInt } from '@/lib/hatRegistry';
 *   const id = await getHatIdBigInt('EXECUTIVE_POD_LEADER');
 */

import { createClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type HatKey =
  | 'EXECUTIVE_POD_LEADER'
  | 'COMMUNITY_PODS_PARENT'
  | 'TEMPORAL_NATURALISM'
  | 'TEMPORAL_NATURALISM_LEADER'
  | 'TEMPORAL_NATURALISM_MEMBER';

export type HatIds = Record<HatKey, `0x${string}` | undefined>;

// ─── Pod / role lookup map ────────────────────────────────────────────────────
// Maps each HatKey to the (pod_id, role_name) row in pod_role_permissions.
// COMMUNITY_PODS_PARENT is the pod's own hat — stored in pods.management_hat_id,
// not in pod_role_permissions — so we fall back to a direct pods query for that one.

const POD_ROLE_LOOKUPS: Record<
  HatKey,
  { podId: string; roleName: string } | { podId: string; fromPodColumn: 'management_hat_id' | 'membership_hat_id' }
> = {
  EXECUTIVE_POD_LEADER: {
    podId: 'e35c9e25-d29f-4988-b1e8-2902e960b94c',
    roleName: 'Executive Pod Leader',
  },
  COMMUNITY_PODS_PARENT: {
    podId: '86d2d359-2e38-4267-b7b7-c7f6155063e2',
    fromPodColumn: 'management_hat_id',
  },
  TEMPORAL_NATURALISM: {
    podId: 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0',
    fromPodColumn: 'management_hat_id',
  },
  TEMPORAL_NATURALISM_LEADER: {
    podId: 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0',
    roleName: 'Temporal Naturalism Leader',
  },
  TEMPORAL_NATURALISM_MEMBER: {
    podId: 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0',
    roleName: 'Temporal Naturalism Member',
  },
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

  const ids: Partial<HatIds> = {};

  for (const [key, lookup] of Object.entries(POD_ROLE_LOOKUPS) as [HatKey, typeof POD_ROLE_LOOKUPS[HatKey]][]) {
    try {
      if ('roleName' in lookup) {
        // Query pod_role_permissions by pod_id + role_name
        const { data } = await supabase
          .from('pod_role_permissions')
          .select('token_address')
          .eq('pod_id', lookup.podId)
          .ilike('role_name', lookup.roleName)
          .limit(1)
          .single();

        if (data?.token_address?.startsWith('0x')) {
          ids[key] = data.token_address as `0x${string}`;
        }
      } else {
        // Query pods table for management_hat_id or membership_hat_id
        const { data } = await supabase
          .from('pods')
          .select(lookup.fromPodColumn)
          .eq('id', lookup.podId)
          .single();

        const hatId = data?.[lookup.fromPodColumn];
        if (hatId?.startsWith('0x')) {
          ids[key] = hatId as `0x${string}`;
        }
      }
    } catch {
      // Non-fatal — key will be undefined, callers handle gracefully
    }
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
      `Hat ID for '${key}' not found in pod_role_permissions. ` +
      `Update the token_address for that role after deploying the new hat tree.`,
    );
  }
  return BigInt(hatId);
}

export function invalidateHatCache(): void {
  cache = null;
}
