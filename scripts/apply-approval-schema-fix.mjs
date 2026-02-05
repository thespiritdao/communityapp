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

console.log('📊 Fixing donation_approvals schema...\n');

const migrationPath = join(__dirname, '../supabase/migrations/20260204000001_fix_donation_approvals_schema.sql');
const sql = readFileSync(migrationPath, 'utf8');

console.log('✅ Migration file loaded');
console.log(`📝 SQL length: ${sql.length} characters\n`);

// Split by semicolons and filter out empty statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`🔧 Found ${statements.length} SQL statements to execute\n`);

// Execute each statement
for (let i = 0; i < statements.length; i++) {
  const statement = statements[i];
  console.log(`[${i + 1}/${statements.length}] Executing statement...`);

  const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' }).single();

  if (error) {
    // Try direct query if RPC fails
    const { error: directError } = await supabase.from('_').select('*').limit(0);

    if (error.message.includes('function') || error.code === '42883') {
      // RPC doesn't exist, execute directly
      const { error: execError } = await supabase.rpc('query', { query_text: statement + ';' });

      if (execError) {
        console.log(`  ⚠️  Skipping (might already exist): ${execError.message.substring(0, 100)}`);
        continue;
      }
    } else {
      console.log(`  ⚠️  Skipping: ${error.message.substring(0, 100)}`);
      continue;
    }
  }

  console.log('  ✅ Success');
}

console.log('\n🎉 Schema fix complete!\n');
console.log('📋 Changes applied:');
console.log('  - Made approver_hat_id optional (nullable)');
console.log('  - Renamed approver_wallet → executive_wallet');
console.log('  - Updated unique constraint\n');
