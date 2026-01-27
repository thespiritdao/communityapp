// Production-ready database-first proposal fetching
// Replaces the 100k block scan with direct database queries

import { supabase } from '@/utils/supabaseClient';

export interface ProposalMetadata {
  id: string;
  onchain_proposal_id: string;
  title: string;
  description: string;
  proposer_address: string;
  forum_thread_id?: string;
  category?: string;
  tags?: string[];
  mentions?: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  token_id?: string;
  transaction_hash?: string;
  voting_start?: string;
  voting_end?: string;
}

/**
 * Fetch all active proposals from database (source of truth)
 * This is the production-ready approach - no block scanning
 */
export async function fetchActiveProposalsFromDB(): Promise<ProposalMetadata[]> {
  console.log('📊 [DB-FIRST] Fetching active proposals from database...');

  const { data, error } = await supabase
    .from('proposal_metadata')
    .select('*')
    .eq('status', 'active')
    .not('onchain_proposal_id', 'like', 'temp_%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching active proposals:', error);
    throw error;
  }

  console.log(`✅ Found ${data?.length || 0} active proposals in database`);
  return data || [];
}

/**
 * Fetch pending proposals (not yet confirmed on-chain)
 */
export async function fetchPendingProposalsFromDB(): Promise<ProposalMetadata[]> {
  console.log('⏳ [DB-FIRST] Fetching pending proposals...');

  const { data, error } = await supabase
    .from('proposal_metadata')
    .select('*')
    .like('onchain_proposal_id', 'temp_%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching pending proposals:', error);
    return [];
  }

  console.log(`✅ Found ${data?.length || 0} pending proposals`);
  return data || [];
}

/**
 * Deduplicate proposals by database ID
 * Prevents showing the same proposal twice when it transitions from pending to confirmed
 */
export function deduplicateProposals<T extends { metadata?: { id?: string } }>(
  confirmedProposals: T[],
  pendingProposals: any[]
): any[] {
  const confirmedIds = new Set(
    confirmedProposals
      .map(p => p.metadata?.id)
      .filter((id): id is string => Boolean(id))
  );

  return pendingProposals.filter(meta => !confirmedIds.has(meta.id));
}
