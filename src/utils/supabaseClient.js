import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPADB_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPADB_PK;
export const supabase = createClient(supabaseUrl, supabaseKey);
