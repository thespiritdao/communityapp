// src/features/governance/hooks/useGovernanceForumThreads.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'src/utils/supabaseClient';      // or wherever your client lives

export interface Thread {
  id: string;
  title: string;
  created_at: string;
  // any other fields you need
}

export function useGovernanceForumThreads(userAddress?: string) {
  return useQuery<Thread[]>(
    ['governanceThreads', userAddress],
    async () => {
      let query = supabase
        .from('forum_threads')
        .select('id, title, created_at');

      if (userAddress) {
        query = query.eq('creator_wallet', userAddress);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    { staleTime: 60_000 }
  );
}
