// src/utils/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get Supabase client instance (lazy initialization)
 * This prevents build-time errors when env vars aren't available
 */
function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.error(
      'Supabase URL is missing. Please check your environment variables.',
    );
    throw new Error('Supabase URL is missing.');
  }

  if (!supabaseAnonKey) {
    console.error(
      'Supabase Anon Key is missing. Please check your environment variables.',
    );
    throw new Error('Supabase Anon Key is missing.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

// Export as a getter to maintain backwards compatibility
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    return getSupabase()[prop as keyof SupabaseClient];
  },
});
