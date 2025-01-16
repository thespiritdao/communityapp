// src/utils/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Fetch environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Initializing Supabase client...');
console.log('URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('ANON_KEY:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);


// Validate environment variables
if (!supabaseUrl) {
  console.error("Supabase URL is missing. Please check your environment variables.");
  throw new Error("Supabase URL is missing.");
}

if (!supabaseAnonKey) {
  console.error("Supabase anon key is missing. Please check your environment variables.");
  throw new Error("Supabase anon key is missing.");
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log("Supabase client initialized:", { supabaseUrl });
