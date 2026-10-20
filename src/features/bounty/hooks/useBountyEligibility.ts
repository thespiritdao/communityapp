'use client';

/**
 * useBountyEligibility — eligibility for every bounty on screen, computed
 * once per wallet from the shared context (pod memberships + on-chain
 * balances for any credential gates present).
 *
 * useCredentialOptions — what a creator can gate on: the token catalogue
 * plus membership of any active pod.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { supabase } from '@/utils/supabaseClient';
import {
  collectCredentials,
  isEligible,
  loadEligibilityContext,
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
  group: 'Pods' | 'Tokens';
}

export function useCredentialOptions() {
  const [options, setOptions] = useState<CredentialOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [podsRes, tokensRes] = await Promise.all([
        supabase.from('pods').select('id, name').eq('status', 'active').order('name'),
        supabase
          .from('tokens')
          .select('id, name, contract_address, token_type, category')
          .eq('is_active', true)
          .order('name'),
      ]);
      if (cancelled) return;
      const pods: CredentialOption[] = (podsRes.data ?? [])
        .filter((p) => p.name !== 'Top hat')
        .map((p) => ({ kind: 'pod', id: p.id, name: p.name, minBalance: 1, group: 'Pods' }));
      const tokens: CredentialOption[] = (tokensRes.data ?? [])
        .filter((t) => t.contract_address && (t.token_type === 'erc20' || t.token_type === 'erc721'))
        .map((t) => ({
          kind: t.token_type as 'erc20' | 'erc721',
          id: String(t.contract_address).toLowerCase(),
          name: t.name,
          minBalance: 1,
          group: 'Tokens',
        }));
      setOptions([...pods, ...tokens]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { options, loading };
}
