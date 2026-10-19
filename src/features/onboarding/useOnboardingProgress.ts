'use client';

/**
 * useOnboardingProgress — loads the member's intent and the live facts the
 * tracks need, and returns the computed checklist plus the three writes the
 * cards can make (set intent, dismiss, clear dismissal).
 *
 * All reads are plain client queries under RLS: own user_profiles row,
 * active_pod_members for this wallet, pods (id + leads). Nothing new is
 * exposed to other members.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { profileFullName } from '@/features/identity/utils/profileCompleteness';
import {
  buildTrack,
  type OnboardingIntent,
  type TrackFacts,
  type TrackItem,
  type VisitKey,
} from './tracks';

/** Fired by VisitRecorder after it stores a visit, so open cards refresh. */
export const ONBOARDING_CHANGED_EVENT = 'onboarding:changed';

type ProfileRow = {
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_picture: string | null;
  bio: string | null;
  seeking: string | null;
  onboarding_intent: OnboardingIntent | null;
  onboarding_visited: Partial<Record<VisitKey, string>> | null;
  onboarding_dismissed_at: string | null;
};

export interface OnboardingProgress {
  loading: boolean;
  intent: OnboardingIntent | null;
  dismissed: boolean;
  items: TrackItem[];
  doneCount: number;
  total: number;
  complete: boolean;
  nextItem: TrackItem | null;
  setIntent: (intent: OnboardingIntent) => Promise<void>;
  dismiss: () => Promise<void>;
  undismiss: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useOnboardingProgress(walletAddress: string | null | undefined): OnboardingProgress {
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [inAnyPod, setInAnyPod] = useState(false);
  const [leadsAnyPod, setLeadsAnyPod] = useState(false);

  const refetch = useCallback(async () => {
    if (!wallet) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const [profileRes, memberRes, podsRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select(
            'user_id, first_name, last_name, profile_picture, bio, seeking, onboarding_intent, onboarding_visited, onboarding_dismissed_at',
          )
          .eq('wallet_address', wallet)
          .maybeSingle(),
        supabase.from('active_pod_members').select('pod_id').eq('wallet', wallet).limit(1),
        supabase.from('pods').select('id, pod_leads').eq('status', 'active'),
      ]);

      if (profileRes.error) throw profileRes.error;
      setProfile((profileRes.data as ProfileRow | null) ?? null);
      setInAnyPod(Boolean(memberRes.data && memberRes.data.length > 0));
      const leads = (podsRes.data ?? []).some((p: { pod_leads: string[] | null }) =>
        (p.pod_leads ?? []).some((l) => l?.toLowerCase() === wallet),
      );
      setLeadsAnyPod(leads);
    } catch (err) {
      console.error('Onboarding: failed to load progress', err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // VisitRecorder stores visits from outside this hook; listen so a card
  // that is already on screen (e.g. /identity) updates without a reload.
  useEffect(() => {
    const onChange = () => { refetch(); };
    window.addEventListener(ONBOARDING_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ONBOARDING_CHANGED_EVENT, onChange);
  }, [refetch]);

  const write = useCallback(
    async (patch: Partial<ProfileRow>) => {
      if (!wallet) return;
      const { error } = await supabase.from('user_profiles').update(patch).eq('wallet_address', wallet);
      if (error) {
        console.error('Onboarding: failed to save', error);
        return;
      }
      setProfile((p) => (p ? { ...p, ...patch } : p));
      window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
    },
    [wallet],
  );

  const setIntent = useCallback(
    (intent: OnboardingIntent) => write({ onboarding_intent: intent, onboarding_dismissed_at: null }),
    [write],
  );
  const dismiss = useCallback(
    () => write({ onboarding_dismissed_at: new Date().toISOString() }),
    [write],
  );
  const undismiss = useCallback(() => write({ onboarding_dismissed_at: null }), [write]);

  const intent = profile?.onboarding_intent ?? null;

  const items = useMemo<TrackItem[]>(() => {
    if (!intent) return [];
    const facts: TrackFacts = {
      hasName: Boolean(profileFullName(profile)),
      hasPhoto: Boolean(profile?.profile_picture?.trim()),
      hasBio: Boolean(profile?.bio?.trim()),
      hasSeeking: Boolean(profile?.seeking?.trim()),
      inAnyPod,
      leadsAnyPod,
      visited: profile?.onboarding_visited ?? {},
    };
    return buildTrack(intent, facts);
  }, [intent, profile, inAnyPod, leadsAnyPod]);

  const doneCount = items.filter((i) => i.done).length;
  // The explore track's last item is a re-ask, never "done". Explore is
  // never "complete": once the four visits are in, the card stays as the
  // standing "ready to join or found?" prompt until the member picks a
  // path or hides it.
  const countable = items.filter((i) => i.href !== null).length;
  const complete = intent !== 'explore' && items.length > 0 && doneCount >= countable;
  const nextItem = items.find((i) => !i.done) ?? null;

  return {
    loading,
    intent,
    dismissed: Boolean(profile?.onboarding_dismissed_at),
    items,
    doneCount,
    total: countable,
    complete,
    nextItem,
    setIntent,
    dismiss,
    undismiss,
    refetch,
  };
}
