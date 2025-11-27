import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/utils/supabaseClient';

interface Thread {
  id: string;
  title: string;
  category_id: string;
  author_address: string;
  created_at: string;
}

export const useForumThreadsByCategory = (
  categoryId: string,
  filterByUser?: string,
) =>
  useQuery({
    queryKey: ['forumThreads', categoryId, filterByUser],
    queryFn: async () => {
      console.log(
        '🔍 Fetching threads for category:',
        categoryId,
        filterByUser ? `(user: ${filterByUser})` : '',
      );

      let query = supabase
        .from('forum_threads')
        .select('id, title, category_id, author_address, created_at')
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false });

      if (filterByUser) {
        query = query.eq('author_address', filterByUser.toLowerCase());
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching threads:', error);
        throw new Error(error.message);
      }

      console.log(
        `✅ Found ${data?.length || 0} threads for category ${categoryId}`,
      );

      if (data && data.length > 0) {
        console.log(
          '   Threads:',
          data
            .map((t) => t.title)
            .slice(0, 3)
            .join(', '),
        );
      }

      return data || [];
    },
    enabled: Boolean(categoryId),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
