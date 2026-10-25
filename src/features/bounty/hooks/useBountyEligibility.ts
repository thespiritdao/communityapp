'use client';

/**
 * useBountyEligibility — eligibility for every bounty on screen, computed
 * once per wallet from the shared context (pod memberships + on-chain
 * balances for any credential gates present).
 *
 * useCredentialOptions — what a creator can gate on: membership, roles and
 * tokens of the communities the creator manages (see the function doc).
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { supabase } from '@/utils/supabaseClient';
import {
  EXECUTIVE_POD_ID,
  collectCredentials,
  isEligible,
  loadEligibilityContext,
  normalizeHatId,
  type BountyGate,
  type CredentialGate,
  type EligibilityContext,
  type EligibilityResult,
} from '../lib/eligibility';

export interface GatedBounty {
  id: string;
  gate: BountyGate;
  creator?: string | null;
}

export function useBountyEligibility(bounties: GatedBounty[]) {
  const wallet = useUserWallet();
  const { balances } = useTokenBalances();
  const b = balances as { hasProofOfCuriosity?: boolean; hasAdvocate?: boolean } | null;
  const isMember = Boolean(b?.hasProofOfCuriosity || b?.hasAdvocate);

  const [ctx, setCtx] = useState<EligibilityContext | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-read only when the wallet or the set of on-chain gates changes.
  const credentialKey = useMemo(
    () =>
      collectCredentials(bounties.map((b) => b.gate))
        .map((c) => `${c.kind}:${c.id}`)
        .sort()
        .join('|'),
    [bounties],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const creds = collectCredentials(bounties.map((b) => b.gate));
    loadEligibilityContext(wallet, isMember, creds)
      .then((c) => { if (!cancelled) setCtx(c); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, isMember, credentialKey]);

  const results = useMemo(() => {
    const map = new Map<string, EligibilityResult>();
    if (!ctx) return map;
    for (const b of bounties) {
      const r = isEligible(b.gate, ctx);
      if (r.eligible && b.creator && ctx.wallet && b.creator.toLowerCase() === ctx.wallet && process.env.NODE_ENV !== 'development') {
        map.set(b.id, { eligible: false, reason: 'You created this bounty.' });
      } else {
        map.set(b.id, r);
      }
    }
    return map;
  }, [bounties, ctx]);

  const get = (id: string): EligibilityResult =>
    results.get(id) ?? { eligible: false, reason: loading ? 'Checking eligibility…' : '' };

  return { get, loading, ctx };
}

export interface CredentialOption extends CredentialGate {
  group: 'Pods' | 'Roles' | 'Accreditations' | 'Events' | 'Tokens';
}

export interface ManagedPodRef {
  id: string;
  name: string;
}

/**
 * What a creator may gate a bounty on. Scoped to the communities the creator
 * can manage (bounties module on + a role with bounty management):
 *
 *   Pods    membership of each managed pod
 *   Roles   every role those pods have defined, whether or not the creator
 *           holds it (a pod's roles are credentials it issues)
 *   Accreditations  courses those pods run (knowledge categories marked
 *           is_course); holding the course's accreditation satisfies the gate
 *   Events  attendance at an event those pods organised (published or
 *           completed; a future event means "attend this to qualify")
 *   Tokens  tokens owned by those pods; DAO-level tokens (no owning pod)
 *           only for Executive Pod managers
 *
 * The create route re-derives the same scope server-side and rejects gates
 * outside it, so this list is the experience, not the enforcement.
 */
export function useCredentialOptions(managedPods: ManagedPodRef[], podsLoading: boolean) {
  const [options, setOptions] = useState<CredentialOption[]>([]);
  const [loading, setLoading] = useState(true);

  const podKey = managedPods
    .map((p) => p.id)
    .sort()
    .join('|');

  useEffect(() => {
    if (podsLoading) {
      setLoading(true);
      return;
    }
    if (managedPods.length === 0) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ids = managedPods.map((p) => p.id);
      const allowDaoLevel = ids.includes(EXECUTIVE_POD_ID);
      const nameOf = new Map(managedPods.map((p) => [p.id, p.name]));

      let tokensQuery = supabase
        .from('tokens')
        .select('id, name, contract_address, token_type, category, owner_pod_id')
        .eq('is_active', true)
        .order('name');
      tokensQuery = allowDaoLevel
        ? tokensQuery.or(`owner_pod_id.in.(${ids.join(',')}),owner_pod_id.is.null`)
        : tokensQuery.in('owner_pod_id', ids);

      const [rolesRes, tokensRes, eventsRes, coursesRes] = await Promise.all([
        supabase
          .from('pod_role_permissions')
          .select('pod_id, token_address, role_name, is_active')
          .in('pod_id', ids)
          .order('role_name'),
        tokensQuery,
        supabase
          .from('events')
          .select('id, title, event_date, status, organizing_pod_id')
          .in('organizing_pod_id', ids)
          .in('status', ['published', 'completed'])
          .order('event_date', { ascending: false })
          .limit(60),
        supabase
          .from('knowledge_categories')
          .select('id, name, accreditation_name, pod_id')
          .in('pod_id', ids)
          .eq('is_course', true)
          .order('name'),
      ]);
      if (cancelled) return;

      const pods: CredentialOption[] = managedPods.map((p) => ({
        kind: 'pod',
        id: p.id,
        name: p.name,
        minBalance: 1,
        group: 'Pods',
      }));

      const seenHats = new Set<string>();
      const roles: CredentialOption[] = [];
      for (const r of rolesRes.data ?? []) {
        if (r.is_active === false) continue;
        const hat = normalizeHatId(r.token_address);
        if (!hat || seenHats.has(hat)) continue;
        seenHats.add(hat);
        const podName = nameOf.get(r.pod_id) ?? '';
        const roleName = String(r.role_name ?? 'Role').trim();
        // "Temporal Naturalism Leader" already names the pod; "Pod Leader" does not.
        const name =
          podName && roleName.toLowerCase().includes(podName.toLowerCase())
            ? roleName
            : `${roleName} (${podName})`;
        roles.push({ kind: 'hat', id: hat, name, minBalance: 1, group: 'Roles' });
      }

      const tokens: CredentialOption[] = (tokensRes.data ?? [])
        .filter((t) => t.contract_address && (t.token_type === 'erc20' || t.token_type === 'erc721'))
        .map((t) => ({
          kind: t.token_type as 'erc20' | 'erc721',
          id: String(t.contract_address).toLowerCase(),
          name: t.name,
          minBalance: 1,
          group: 'Tokens',
        }));

      const events: CredentialOption[] = (eventsRes.data ?? []).map((e) => {
        const when = e.event_date ? new Date(e.event_date) : null;
        const stamp =
          when && !Number.isNaN(when.getTime())
            ? ` (${when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })})`
            : '';
        return {
          kind: 'event',
          id: e.id,
          name: `${String(e.title ?? 'Event').trim()}${stamp}`,
          minBalance: 1,
          group: 'Events',
        };
      });

      const accreditations: CredentialOption[] = (coursesRes.data ?? []).map((k) => ({
        kind: 'accreditation',
        id: k.id,
        name: String(k.accreditation_name ?? '').trim() || String(k.name ?? 'Course'),
        minBalance: 1,
        group: 'Accreditations',
      }));

      setOptions([...pods, ...roles, ...accreditations, ...events, ...tokens]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // podKey captures the identity of managedPods; the array itself is not stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podKey, podsLoading]);

  return { options, loading };
}
