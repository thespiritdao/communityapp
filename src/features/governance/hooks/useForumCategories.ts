import { useQuery } from '@tanstack/react-query';
import { supabase } from 'src/utils/supabaseClient';

export const useForumCategories = () =>
  useQuery({
    queryKey: ['forumCategories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forum_categories')
        .select('id, name');
      if (error) throw new Error(error.message);
      return data;
    },
  });
