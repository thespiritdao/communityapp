#!/usr/bin/env node
/**
 * Check pod_role_permissions table for Beta Tester
 *
 * Usage: node scripts/check-pod-role-permissions.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';

async function checkRolePermissions() {
  console.log('🔍 Checking pod_role_permissions table...\n');
  console.log('   Pod ID:', POD_ID);
  console.log('');

  const { data: permissions, error } = await supabase
    .from('pod_role_permissions')
    .select('*')
    .eq('pod_id', POD_ID);

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  if (!permissions || permissions.length === 0) {
    console.log('⚠️  No permissions found for this pod');
    process.exit(0);
  }

  console.log(`✅ Found ${permissions.length} permission record(s):\n`);

  permissions.forEach((perm, idx) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Permission ${idx + 1}:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(JSON.stringify(perm, null, 2));
    console.log('');
  });
}

checkRolePermissions()
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
