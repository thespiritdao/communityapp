// src/features/governance/hooks/useForumPostTitle.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'src/utils/supabaseClient';

interface ForumPost {
  title: string;
}

export const useForumPostTitle = (forumPostId?: string) =>
  useQuery<string | null>({
    queryKey: ['forumPostTitle', forumPostId],
    queryFn: async () => {
      if (!forumPostId) return null;

      const { data, error } = await supabase
        .from('forum_posts')
        .select('title')
        .eq('id', forumPostId)
        .single<ForumPost>();

      if (error) throw new Error(error.message);
      return data?.title || null;
    },
    enabled: Boolean(forumPostId),
    staleTime: 60_000,
  });