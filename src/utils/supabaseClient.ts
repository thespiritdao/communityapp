// src/utils/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Next.js 15 compatibility: Only throw during runtime, not build time
// During build, env vars might not be available for static analysis
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

if (!supabaseUrl && !isBuildTime) {
  console.error(
    'Supabase URL is missing. Please check your environment variables.',
  );
  throw new Error('Supabase URL is missing.');
}

if (!supabaseAnonKey && !isBuildTime) {
  console.error(
    'Supabase Anon Key is missing. Please check your environment variables.',
  );
  throw new Error('Supabase Anon Key is missing.');
}

// Create client with fallback empty strings for build time
// Will fail at runtime if env vars are actually missing
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
);
