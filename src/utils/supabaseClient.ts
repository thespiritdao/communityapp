// src/utils/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("Supabase URL is missing. Please check your environment variables.");
  throw new Error("Supabase URL is missing.");
}

if (!supabaseAnonKey) {
  console.error("Supabase Anon Key is missing. Please check your environment variables.");
  throw new Error("Supabase Anon Key is missing.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
