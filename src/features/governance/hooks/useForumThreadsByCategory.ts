import { useQuery } from '@tanstack/react-query';
import { supabase } from 'src/utils/supabaseClient';

interface Thread {
  id: string;
  title: string;
  category_id: string;
  author_wallet: string;
}

export const useForumThreadsByCategory = (categoryId: string, filterByUser?: string) =>
  useQuery({
    queryKey: ['forumThreads', categoryId, filterByUser],
    queryFn: async () => {
      let query = supabase
        .from('forum_threads')
        .select('id, title, category_id, author_wallet')
        .eq('category_id', categoryId);
      if (filterByUser) {
        query = query.eq('author_wallet', filterByUser);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: Boolean(categoryId),
  });
