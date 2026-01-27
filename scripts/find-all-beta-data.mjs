#!/usr/bin/env node
/**
 * Search all tables for Beta Tester data
 *
 * Usage: node scripts/find-all-beta-data.mjs
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
const TOKEN_ADDRESS = '0x000000880001000b000000000000000000000000000000000000000000000000';

async function searchAllTables() {
  console.log('🔍 Searching for Beta Tester data across all tables...\n');
  console.log('   Pod ID:', POD_ID);
  console.log('   Management HAT:', TOKEN_ADDRESS);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Check pod_role_permissions
  console.log('📋 1. Checking pod_role_permissions...\n');
  try {
    const { data: rolePerms, error: roleError } = await supabase
      .from('pod_role_permissions')
      .select('*')
      .eq('pod_id', POD_ID);

    if (roleError) {
      console.log('   ❌ Error:', roleError.message);
    } else if (!rolePerms || rolePerms.length === 0) {
      console.log('   ⚠️  No records found');
    } else {
      console.log(`   ✅ Found ${rolePerms.length} record(s):\n`);
      rolePerms.forEach((perm, idx) => {
        console.log(`   Record ${idx + 1}:`);
        console.log('   ', JSON.stringify(perm, null, 2).split('\n').join('\n    '));
        console.log('');
      });
    }
  } catch (e) {
    console.log('   ❌ Exception:', e.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 2. Check hats table (if it exists)
  console.log('🎩 2. Checking hats table...\n');
  try {
    const { data: hats, error: hatsError } = await supabase
      .from('hats')
      .select('*')
      .eq('pod_id', POD_ID);

    if (hatsError) {
      console.log('   ❌ Error:', hatsError.message);
    } else if (!hats || hats.length === 0) {
      console.log('   ⚠️  No records found');
    } else {
      console.log(`   ✅ Found ${hats.length} record(s):\n`);
      hats.forEach((hat, idx) => {
        console.log(`   HAT ${idx + 1}:`);
        console.log('   ', JSON.stringify(hat, null, 2).split('\n').join('\n    '));
        console.log('');
      });
    }
  } catch (e) {
    console.log('   ❌ Exception:', e.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 3. Check pod_hats table (if it exists)
  console.log('🎩 3. Checking pod_hats table...\n');
  try {
    const { data: podHats, error: podHatsError } = await supabase
      .from('pod_hats')
      .select('*')
      .eq('pod_id', POD_ID);

    if (podHatsError) {
      console.log('   ❌ Error:', podHatsError.message);
    } else if (!podHats || podHats.length === 0) {
      console.log('   ⚠️  No records found');
    } else {
      console.log(`   ✅ Found ${podHats.length} record(s):\n`);
      podHats.forEach((hat, idx) => {
        console.log(`   HAT ${idx + 1}:`);
        console.log('   ', JSON.stringify(hat, null, 2).split('\n').join('\n    '));
        console.log('');
      });
    }
  } catch (e) {
    console.log('   ❌ Exception:', e.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 4. Check roles table (if it exists)
  console.log('👤 4. Checking roles table...\n');
  try {
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .eq('pod_id', POD_ID);

    if (rolesError) {
      console.log('   ❌ Error:', rolesError.message);
    } else if (!roles || roles.length === 0) {
      console.log('   ⚠️  No records found');
    } else {
      console.log(`   ✅ Found ${roles.length} record(s):\n`);
      roles.forEach((role, idx) => {
        console.log(`   Role ${idx + 1}:`);
        console.log('   ', JSON.stringify(role, null, 2).split('\n').join('\n    '));
        console.log('');
      });
    }
  } catch (e) {
    console.log('   ❌ Exception:', e.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 5. Check the pods table itself for embedded data
  console.log('📦 5. Checking pods table...\n');
  try {
    const { data: pod, error: podError } = await supabase
      .from('pods')
      .select('*')
      .eq('id', POD_ID)
      .single();

    if (podError) {
      console.log('   ❌ Error:', podError.message);
    } else if (!pod) {
      console.log('   ⚠️  Pod not found');
    } else {
      console.log('   ✅ Found pod:\n');
      console.log('   ', JSON.stringify(pod, null, 2).split('\n').join('\n    '));
      console.log('');
    }
  } catch (e) {
    console.log('   ❌ Exception:', e.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 6. Your original JSON data had fields that might be elsewhere
  console.log('💡 Based on your original data, the Beta Tester role had:\n');
  console.log('   - role_name: "Beta Tester "');
  console.log('   - token_address: 0x000000880001000b000000000000000000000000000000000000000000000000');
  console.log('   - eligibility_criteria with time_based restriction');
  console.log('   - permissions object');
  console.log('   - max_holders: 100');
  console.log('');
  console.log('   This data might be:');
  console.log('   a) In a table we haven\'t checked yet');
  console.log('   b) Stored as JSON in the pods table');
  console.log('   c) In a table with different permissions');
  console.log('   d) Generated dynamically from Hats Protocol on-chain data');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

searchAllTables()
  .then(() => {
    console.log('✅ Search completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Search failed:', error);
    process.exit(1);
  });
