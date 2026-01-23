/**
 * Apply on-chain recording migration to governance_votes table
 *
 * This script adds the columns needed for the batching system:
 * - onchain_recorded_at: Tracks when vote was posted to blockchain
 * - pod_id: Links vote to specific pod
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read environment variables from .env
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1].trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1].trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration in .env');
  process.exit(1);
}

console.log('🔧 Connecting to Supabase...');
console.log(`   URL: ${supabaseUrl}`);

console.log('\n📝 Applying migration: add_onchain_recording_fields\n');

try {
  // Read migration SQL
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260122000002_add_onchain_recording_fields.sql');
  const sql = readFileSync(migrationPath, 'utf8');

  console.log('SQL to execute:');
  console.log('---');
  console.log(sql);
  console.log('---\n');

  // Execute migration using PostgREST
  console.log('⏳ Executing migration via Supabase REST API...');

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`⚠️ REST API returned ${response.status}: ${errorText}`);
    console.log('\n📋 Manual Migration Required');
    console.log('---');
    console.log('The migration needs to be applied via Supabase Dashboard:');
    console.log('');
    console.log('1. Go to: https://supabase.com/dashboard/project/yqgqodofeliuurrmxlks/sql');
    console.log('2. Paste this SQL:');
    console.log('');
    console.log(sql);
    console.log('');
    console.log('3. Click "Run"');
    console.log('---');
    process.exit(0);
  }

  const result = await response.json();
  console.log('✅ Migration applied successfully!');
  console.log('Result:', result);

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.log('\n📋 Manual Migration Required');
  console.log('---');
  console.log('Please apply the migration manually via Supabase Dashboard:');
  console.log('');
  console.log('1. Go to: https://supabase.com/dashboard/project/yqgqodofeliuurrmxlks/sql');
  console.log('2. Open file: supabase/migrations/20260122000002_add_onchain_recording_fields.sql');
  console.log('3. Copy and paste the SQL into the SQL Editor');
  console.log('4. Click "Run"');
  console.log('---');
  process.exit(0);
}
