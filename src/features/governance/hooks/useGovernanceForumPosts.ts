// src/features/governance/hooks/useGovernanceForumPosts.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from 'src/utils/supabaseClient';

interface ForumPost {
  id: string;
  title: string;
}

export const useGovernanceForumPosts = (categoryId: string) => {
  return useQuery<ForumPost[]>({
    queryKey: ['governanceForumPosts', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from<ForumPost>('forum_posts')
        .select('id, title')
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data;
    },
    enabled: Boolean(categoryId),
    staleTime: 60_000,
  });
};
