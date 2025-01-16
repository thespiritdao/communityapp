// src/utils/supabaseAdminClient.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Supabase URL is missing. Please check your environment variables.");
  throw new Error("Supabase URL is missing.");
}

if (!supabaseServiceRoleKey) {
  console.error("Supabase Service Role Key is missing. Please check your environment variables.");
  throw new Error("Supabase Service Role Key is missing.");
}

// Create Supabase Admin client
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

console.log('Supabase Admin client initialized with URL:', supabaseUrl);
