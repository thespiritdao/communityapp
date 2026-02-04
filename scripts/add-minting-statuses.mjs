import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('📊 Adding pending_mint and minting statuses...\n');

// Read the migration file
const migrationPath = join(__dirname, '../supabase/migrations/20260204000002_add_minting_statuses.sql');
const sql = readFileSync(migrationPath, 'utf8');

// Execute the SQL by updating via a test query
// Since we can't execute DDL directly, we'll use a workaround

console.log('Attempting to apply migration...\n');

// Try method 1: Direct SQL via raw query (if available)
try {
  // This won't work with standard Supabase client, but trying anyway
  const { error } = await supabase.rpc('exec', { sql });

  if (error) {
    console.log('⚠️  Direct SQL execution not available\n');
    console.log('📋 MANUAL STEPS REQUIRED:\n');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Paste and run this SQL:\n');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log('\n3. Then run: node scripts/beta-approve-single.mjs\n');
  } else {
    console.log('✅ Migration applied successfully!\n');
  }
} catch (err) {
  console.log('⚠️  Automatic migration not possible\n');
  console.log('📋 MANUAL STEPS REQUIRED:\n');
  console.log('1. Go to Supabase Dashboard → SQL Editor');
  console.log(`   URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/sql`);
  console.log('2. Create a new query and paste this SQL:\n');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
  console.log('\n3. Click "Run" to execute');
  console.log('4. Then run: node scripts/beta-approve-single.mjs\n');
}
