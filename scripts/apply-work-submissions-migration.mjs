import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('📋 Applying work_submissions table migration...\n');
console.log(' ✓ Supabase URL:', supabaseUrl);
console.log('');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read migration file
const migrationSQL = readFileSync(
  'supabase/migrations/20260123000000_create_work_submissions_table.sql',
  'utf8'
);

try {
  // Execute the migration using rpc
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

  if (error) {
    console.log('⚠️ RPC method not available, trying direct SQL execution...\n');

    // Split SQL into individual statements for execution
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

    console.log(`📝 Executing ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;

      console.log(`   ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);

      // Use Supabase admin API to execute raw SQL
      const { error: execError } = await supabase.rpc('exec_raw_sql', { sql: statement });

      if (execError) {
        console.error(`   ❌ Failed:`, execError.message);
        // Continue with next statement
      } else {
        console.log(`   ✓ Success`);
      }
    }
  } else {
    console.log('✅ Migration applied successfully via RPC!');
  }

  // Verify table was created by checking if we can query it
  const { count, error: verifyError } = await supabase
    .from('work_submissions')
    .select('*', { count: 'exact', head: true });

  if (verifyError) {
    console.error('\n❌ Table verification failed:', verifyError.message);
    console.log('\n⚠️  The migration file has been created, but automatic execution failed.');
    console.log('   Please apply it manually using one of these methods:');
    console.log('');
    console.log('   1. Supabase Dashboard:');
    console.log('      - Go to https://supabase.com/dashboard/project/yqgqodofeliuurrmxlks/sql');
    console.log('      - Copy the contents of: supabase/migrations/20260123000000_create_work_submissions_table.sql');
    console.log('      - Paste and run in the SQL Editor');
    console.log('');
    console.log('   2. Supabase CLI:');
    console.log('      - Run: supabase db push');
    console.log('');
    process.exit(1);
  }

  console.log('\n✅ Verified: work_submissions table exists!');
  console.log('📊 Table is ready to accept work submissions.\n');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n⚠️  Please apply the migration manually using the Supabase Dashboard.');
  process.exit(1);
}
