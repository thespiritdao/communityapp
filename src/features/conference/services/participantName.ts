// src/features/conference/services/participantName.ts
//
// Resolves a wallet address to a member display name through the
// authenticated participant-name route. Returns null when the member has no
// name set or the caller has no session.

import { supabase } from '@/utils/supabaseClient';

export async function fetchParticipantName(wallet: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const res = await fetch(
    `/api/conference/participant-name?wallet=${encodeURIComponent(wallet.toLowerCase())}`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  if (!res.ok) return null;
  const { name } = (await res.json()) as { name?: string | null };
  return name ?? null;
}
