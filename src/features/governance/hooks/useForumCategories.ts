import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/utils/supabaseClient';

export const useForumCategories = () =>
  useQuery({
    queryKey: ['forumCategories'],
    queryFn: async () => {
      console.log('🔍 Fetching forum categories...');

      // Get all categories with thread counts
      const { data: categories, error } = await supabase
        .from('forum_categories')
        .select('id, name, description, created_at, required_token');

      if (error) {
        console.error('❌ Error fetching categories:', error);
        throw new Error(error.message);
      }

      if (!categories || categories.length === 0) {
        console.warn('⚠️ No forum categories found');
        return [];
      }

      // Get thread counts for each category
      const categoriesWithCounts = await Promise.all(
        categories.map(async (cat) => {
          const { count, error: countError } = await supabase
            .from('forum_threads')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', cat.id);

          if (countError) {
            console.warn(
              `⚠️ Error counting threads for ${cat.name}:`,
              countError,
            );
          }

          return {
            ...cat,
            thread_count: count || 0,
          };
        }),
      );

      // Filter out categories with 0 threads for governance proposal selection
      const activeCategories = categoriesWithCounts.filter(
        (cat) => cat.thread_count > 0,
      );

      console.log('✅ Found categories:', {
        total: categories.length,
        withThreads: activeCategories.length,
        categories: activeCategories.map(
          (c) => `${c.name} (${c.thread_count} threads)`,
        ),
      });

      return activeCategories;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
