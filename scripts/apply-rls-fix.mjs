#!/usr/bin/env node

/**
 * Script to apply RLS fix for pod_role_permissions
 * Run with: node scripts/apply-rls-fix.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyMigration() {
  try {
    console.log('📋 Reading migration file...');
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260122000003_fix_pod_role_permissions_rls_cdp.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('🚀 Applying RLS fix migration...');
    console.log('Migration:', migrationPath);

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql,
    });

    if (error) {
      // If exec_sql RPC doesn't exist, try direct SQL execution
      console.log('⚠️  RPC method not available, trying direct execution...');

      // Split by semicolon and execute each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`\n📝 Executing: ${statement.substring(0, 100)}...`);
          const { error: stmtError } = await supabase.rpc('exec_sql', {
            query: statement + ';',
          });

          if (stmtError) {
            console.error(`❌ Error executing statement:`, stmtError);
            throw stmtError;
          }
        }
      }
    }

    console.log('\n✅ Migration applied successfully!');
    console.log('\n📊 New RLS Policy Features:');
    console.log('  ✓ CDP wallet compatible (checks user_metadata.wallet_address)');
    console.log('  ✓ Case-insensitive address comparison');
    console.log('  ✓ Checks pod leaders, pod_leads array, and pod creator');
    console.log('  ✓ Respects member_management and role_assignment permissions');
    console.log('\n🔄 Please refresh your application to test the fix.');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\n⚠️  Manual Application Required');
    console.error('Copy the SQL from:');
    console.error('  supabase/migrations/20260122000003_fix_pod_role_permissions_rls_cdp.sql');
    console.error('And run it in Supabase SQL Editor');
    process.exit(1);
  }
}

applyMigration();
