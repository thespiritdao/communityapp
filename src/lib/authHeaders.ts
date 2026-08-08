// src/lib/authHeaders.ts
// Client-side helper: attach the caller's Supabase JWT to API fetches so
// server routes can authenticate via getWalletFromRequest / apiPodGuard.
// Returns {} when no session exists (route will 401 — fail closed).

import { supabase } from '@/lib/supabase';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  } catch {
    return {};
  }
}
