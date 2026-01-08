/**
 * Verification Script: Check pod_members Record
 *
 * This script verifies if the manual sync actually created a record
 * and checks for common issues like address normalization.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
const envPaths = [
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📄 Loading environment from: ${envPath}`);
    dotenv.config({ path: envPath });
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EXECUTIVE_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

// The wallet to check
const WALLET_TO_CHECK = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48';

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

async function main() {
  console.log('🔍 Verifying pod_members record...\n');

  // Test with both service role and anon key
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const anonClient = SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  console.log('📋 Search parameters:');
  console.log('  Pod ID:', EXECUTIVE_POD_ID);
  console.log('  Wallet (original):', WALLET_TO_CHECK);
  console.log('  Wallet (lowercase):', WALLET_TO_CHECK.toLowerCase());
  console.log();

  // ============================================================
  // TEST 1: Check with exact address (service role)
  // ============================================================
  console.log('🔍 TEST 1: Searching with exact address (service role)...');
  const { data: exactMatch, error: exactError } = await serviceClient
    .from('pod_members')
    .select('*')
    .eq('pod_id', EXECUTIVE_POD_ID)
    .eq('wallet', WALLET_TO_CHECK)
    .maybeSingle();

  if (exactError) {
    console.error('❌ Error:', exactError);
  } else if (exactMatch) {
    console.log('✅ FOUND with exact address match!');
    console.log('   Record:', JSON.stringify(exactMatch, null, 2));
  } else {
    console.log('❌ NOT FOUND with exact address');
  }
  console.log();

  // ============================================================
  // TEST 2: Check with lowercase address (service role)
  // ============================================================
  console.log('🔍 TEST 2: Searching with lowercase address (service role)...');
  const { data: lowercaseMatch, error: lowercaseError } = await serviceClient
    .from('pod_members')
    .select('*')
    .eq('pod_id', EXECUTIVE_POD_ID)
    .eq('wallet', WALLET_TO_CHECK.toLowerCase())
    .maybeSingle();

  if (lowercaseError) {
    console.error('❌ Error:', lowercaseError);
  } else if (lowercaseMatch) {
    console.log('✅ FOUND with lowercase address match!');
    console.log('   Record:', JSON.stringify(lowercaseMatch, null, 2));
  } else {
    console.log('❌ NOT FOUND with lowercase address');
  }
  console.log();

  // ============================================================
  // TEST 3: Get ALL members for this pod (service role)
  // ============================================================
  console.log('🔍 TEST 3: Getting ALL Executive Pod members (service role)...');
  const { data: allMembers, error: allError } = await serviceClient
    .from('pod_members')
    .select('*')
    .eq('pod_id', EXECUTIVE_POD_ID);

  if (allError) {
    console.error('❌ Error:', allError);
  } else {
    console.log(`📊 Found ${allMembers?.length || 0} total members`);
    if (allMembers && allMembers.length > 0) {
      console.log('   Members:');
      allMembers.forEach((member, idx) => {
        console.log(`   ${idx + 1}. ${member.wallet} (${member.membership_type}) - Active: ${member.is_active}`);
      });
    }
  }
  console.log();

  // ============================================================
  // TEST 4: Check with active_pod_members view (service role)
  // ============================================================
  console.log('🔍 TEST 4: Checking active_pod_members view (service role)...');
  const { data: activeView, error: activeError } = await serviceClient
    .from('active_pod_members')
    .select('*')
    .eq('wallet', WALLET_TO_CHECK.toLowerCase())
    .eq('is_active', true);

  if (activeError) {
    console.error('❌ Error:', activeError);
  } else {
    console.log(`📊 Found ${activeView?.length || 0} active memberships`);
    if (activeView && activeView.length > 0) {
      console.log('   Active memberships:');
      activeView.forEach((membership, idx) => {
        console.log(`   ${idx + 1}. Pod: ${membership.pod_name || membership.pod_id} (${membership.membership_type})`);
      });
    }
  }
  console.log();

  // ============================================================
  // TEST 5: Check with anon key (frontend simulation)
  // ============================================================
  if (anonClient) {
    console.log('🔍 TEST 5: Checking with anon key (simulates frontend)...');
    const { data: anonData, error: anonError } = await anonClient
      .from('active_pod_members')
      .select('*')
      .eq('wallet', WALLET_TO_CHECK.toLowerCase())
      .eq('is_active', true);

    if (anonError) {
      console.error('❌ Error with anon key:', anonError);
      console.error('   This could be an RLS (Row Level Security) issue!');
    } else {
      console.log(`📊 Anon key found ${anonData?.length || 0} active memberships`);
      if (anonData && anonData.length > 0) {
        console.log('   ✅ Frontend should be able to see permissions!');
      } else {
        console.log('   ❌ Frontend CANNOT see permissions - RLS policy issue!');
      }
    }
  } else {
    console.log('⚠️  TEST 5 skipped: No NEXT_PUBLIC_SUPABASE_ANON_KEY in environment');
  }
  console.log();

  // ============================================================
  // DIAGNOSIS
  // ============================================================
  console.log('📋 DIAGNOSIS:');
  console.log('─'.repeat(60));

  if (lowercaseMatch || exactMatch) {
    console.log('✅ Record EXISTS in database');

    if (anonClient && !activeError && (!activeView || activeView.length === 0)) {
      console.log('❌ PROBLEM: RLS policy blocking frontend access');
      console.log('   Solution: Check Supabase RLS policies for pod_members table');
    } else if (activeView && activeView.length > 0) {
      console.log('✅ Record VISIBLE in active_pod_members view');
      console.log('❌ PROBLEM: Frontend cache or component issue');
      console.log('   Solution 1: Hard refresh browser (Ctrl+Shift+R)');
      console.log('   Solution 2: Clear browser cache and localStorage');
      console.log('   Solution 3: Check browser console for errors');
    } else {
      console.log('❌ PROBLEM: Record exists but not showing in view');
      console.log('   Possible issues:');
      console.log('   - is_active = false');
      console.log('   - active_pod_members view definition issue');
    }
  } else {
    console.log('❌ Record DOES NOT EXIST in database');
    console.log('   The manual sync script may have failed silently');
    console.log('   Solution: Re-run add-executive-pod-member.ts script');
  }

  console.log('─'.repeat(60));
}

main().catch(console.error);
