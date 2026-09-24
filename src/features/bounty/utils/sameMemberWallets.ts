// Bids are placed on-chain from the member's device wallet but recorded under
// their canonical wallet, so an on-chain address can differ from the stored
// one and still be the same person. Pre-sign checks use this before refusing.

import { supabase } from '@/lib/supabase';

export async function walletsBelongToSameMember(a: string, b: string): Promise<boolean> {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const { data, error } = await supabase.rpc('wallets_same_member', { a, b });
  if (error) {
    console.warn('wallets_same_member failed:', error.message);
    return false;
  }
  return data === true;
}
