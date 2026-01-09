/**
 * Fix 406 errors and sync pod members
 *
 * This script:
 * 1. Updates active_pod_members view to include pod_name
 * 2. Verifies RLS policies on pod_role_permissions
 * 3. Provides instructions for syncing members
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fixActivePodMembersView() {
  console.log('🔧 Fixing active_pod_members view...\n');

  const viewSQL = `
    DROP VIEW IF EXISTS active_pod_members CASCADE;

    CREATE OR REPLACE VIEW active_pod_members AS
    SELECT
        pm.pod_id,
        pm.wallet,
        pm.hat_id,
        pm.membership_type,
        pm.source,
        pm.indexed_at,
        pm.joined_at,
        pm.created_at,
        pm.updated_at,
        pm.is_active,
        p.name as pod_name,
        p.management_hat_id,
        p.membership_hat_id,
        p.status as pod_status
    FROM pod_members pm
    LEFT JOIN pods p ON pm.pod_id = p.id
    WHERE pm.is_active = TRUE;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql: viewSQL });

  if (error) {
    console.error('❌ Failed to update view:', error);
    console.log('\n⚠️  You may need to run this SQL manually in Supabase SQL Editor:');
    console.log(viewSQL);
    return false;
  }

  console.log('✅ active_pod_members view updated successfully!\n');
  return true;
}

async function checkRLSPolicies() {
  console.log('🔍 Checking RLS policies on pod_role_permissions...\n');

  // Try a test query with token_address
  const { data, error } = await supabase
    .from('pod_role_permissions')
    .select('*')
    .eq('token_address', '0x0000008800010001000000000000000000000000000000000000000000000000')
    .limit(1);

  if (error) {
    console.error('❌ RLS policy is blocking token_address queries!');
    console.error('Error:', error.message);
    console.log('\n🔧 Fix: Update RLS policy in Supabase Dashboard:');
    console.log('   1. Go to Supabase Dashboard → Database → pod_role_permissions table');
    console.log('   2. Click on "Row Level Security" tab');
    console.log('   3. Update SELECT policy to allow filtering by token_address');
    console.log('   4. Or run this SQL:');
    console.log(`
    DROP POLICY IF EXISTS "Allow read access to pod_role_permissions" ON pod_role_permissions;
    CREATE POLICY "Allow read access to pod_role_permissions" ON pod_role_permissions
        FOR SELECT USING (true);
    `);
    return false;
  }

  console.log('✅ RLS policies allow token_address queries\n');
  return true;
}

async function verifyBetaTesterMembers() {
  console.log('🔍 Checking Beta Testers Pod members...\n');

  const BETA_POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';

  const { data: members, error } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('pod_id', BETA_POD_ID);

  if (error) {
    console.error('❌ Error querying members:', error);
    return;
  }

  console.log(`📊 Current member count: ${members?.length || 0}\n`);

  if (members && members.length > 0) {
    members.forEach((m, i) => {
      console.log(`${i + 1}. ${m.wallet}`);
      console.log(`   Type: ${m.membership_type}`);
      console.log(`   Pod: ${m.pod_name || 'Unknown'}`);
      console.log('');
    });
  }

  if (!members || members.length < 10) {
    console.log('\n⚠️  Expected ~10 members but found', members?.length || 0);
    console.log('\n🔧 Fix: Sync pod members from blockchain');
    console.log('   1. Navigate to: http://localhost:3000/admin/sync-pod-members');
    console.log('   2. Enter Pod ID: af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb');
    console.log('   3. Click "Sync Members"');
    console.log('   4. This will index all HAT holders from blockchain into database\n');
  }
}

async function main() {
  console.log('🚀 Running fixes for 406 errors and member sync\n');
  console.log('='.repeat(60));
  console.log('');

  // Fix 1: Update view
  const viewFixed = await fixActivePodMembersView();

  console.log('='.repeat(60));
  console.log('');

  // Fix 2: Check RLS
  const rlsOk = await checkRLSPolicies();

  console.log('='.repeat(60));
  console.log('');

  // Fix 3: Check members
  await verifyBetaTesterMembers();

  console.log('='.repeat(60));
  console.log('\n📋 Summary:');
  console.log(`   View updated: ${viewFixed ? '✅' : '❌'}`);
  console.log(`   RLS policies OK: ${rlsOk ? '✅' : '❌'}`);
  console.log('\n🔄 Next steps:');
  console.log('   1. Fix RLS policy if needed (see above)');
  console.log('   2. Sync Beta Testers Pod members via /admin/sync-pod-members');
  console.log('   3. Test Ron and Tressa accounts\n');
}

main();
