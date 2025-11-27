/**
 * Forum-Pod Integration Migration Runner
 *
 * This script runs the 003_pod_forum_integration.sql migration
 * to add pod integration to the forum system.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Starting Forum-Pod Integration Migration...\n');

  try {
    // Read the migration file
    const migrationPath = join(__dirname, '..', 'migrations', '003_pod_forum_integration.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);

    const sqlContent = readFileSync(migrationPath, 'utf8');

    // Split the SQL file into individual statements
    // We need to execute them one by one because Supabase RPC doesn't support multi-statement SQL well
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && s !== 'BEGIN' && s !== 'COMMIT');

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty lines
      if (statement.startsWith('--') || statement.trim().length === 0) {
        continue;
      }

      try {
        console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);

        // Log first 100 chars of statement for debugging
        const preview = statement.substring(0, 100).replace(/\s+/g, ' ');
        console.log(`   ${preview}${statement.length > 100 ? '...' : ''}`);

        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

        if (error) {
          // Check if it's a benign error (like "already exists")
          if (error.message?.includes('already exists')) {
            console.log(`   ⚠️  Already exists - skipping`);
          } else {
            throw error;
          }
        } else {
          console.log(`   ✅ Success\n`);
        }

        successCount++;
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}\n`);
        errorCount++;

        // Don't stop on errors, continue with next statement
        // Some errors are expected (like duplicate index creation)
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with some errors (see above)');
    }

    console.log('\n🔍 Verifying changes...');

    // Verify the migration worked
    const { data: sampleCategories, error: verifyError } = await supabase
      .from('forum_categories')
      .select('id, name, pod_id')
      .limit(3);

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
    } else {
      console.log(`✅ Verification passed: ${sampleCategories?.length || 0} forum categories found`);
      if (sampleCategories && sampleCategories.length > 0) {
        console.log('\nSample categories:');
        sampleCategories.forEach(cat => {
          console.log(`   - ${cat.name} (pod_id: ${cat.pod_id || 'global'})`);
        });
      }
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Check if Supabase has exec_sql function
async function checkExecSql() {
  console.log('🔍 Checking if exec_sql RPC function exists...');

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' });

    if (error) {
      if (error.message?.includes('function') && error.message?.includes('does not exist')) {
        console.log('❌ exec_sql function does not exist');
        console.log('\n📝 You need to create the exec_sql function first.');
        console.log('   Run this SQL in your Supabase SQL editor:\n');
        console.log('   CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)');
        console.log('   RETURNS VOID AS $$');
        console.log('   BEGIN');
        console.log('     EXECUTE sql;');
        console.log('   END;');
        console.log('   $$ LANGUAGE plpgsql SECURITY DEFINER;');
        console.log('\n   GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;\n');
        process.exit(1);
      } else {
        throw error;
      }
    }

    console.log('✅ exec_sql function exists\n');
  } catch (err) {
    console.error('❌ Error checking exec_sql:', err.message);
    process.exit(1);
  }
}

// Run the migration
(async () => {
  await checkExecSql();
  await runMigration();
  process.exit(0);
})();
