#!/usr/bin/env node
/**
 * Test RLS Lookup - Verify that RLS policy lookups can access user_profiles
 *
 * This simulates what the RLS policy does to check if there's a problem
 * with the user_profiles lookup.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRLSLookup(userEmail, podId) {
  console.log('\n🔍 Testing RLS Policy Lookup\n');
  console.log('='.repeat(80));

  // Get user by email
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    return;
  }

  const user = users.find(u => u.email === userEmail);

  if (!user) {
    console.error(`❌ User not found: ${userEmail}`);
    return;
  }

  console.log(`\n✅ Found user: ${user.email}`);
  console.log(`   User ID (auth.uid()): ${user.id}`);

  // Test 1: Can we read user_profiles for this user?
  console.log(`\n📋 Test 1: Reading user_profiles`);
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, wallet_address')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    console.error('   ❌ Error reading user_profiles:', profileError);
    console.log('\n   💡 This might be why RLS is failing!');
    console.log('   The RLS policy needs to read user_profiles.wallet_address');
    console.log('   but it might be blocked by RLS on user_profiles table.');
    return;
  }

  console.log(`   ✅ Successfully read user_profiles`);
  console.log(`   wallet_address: ${profile.wallet_address || 'NULL'}`);

  if (!profile.wallet_address) {
    console.error('\n   ❌ wallet_address is NULL!');
    console.log('   The RLS policy will fail because wallet_address is not set.');
    return;
  }

  // Test 2: Can we read the pod?
  console.log(`\n📋 Test 2: Reading pod`);
  const { data: pod, error: podError } = await supabase
    .from('pods')
    .select('id, name, pod_leads, created_by_address')
    .eq('id', podId)
    .single();

  if (podError) {
    console.error('   ❌ Error reading pod:', podError);
    return;
  }

  console.log(`   ✅ Successfully read pod`);
  console.log(`   Pod: ${pod.name}`);
  console.log(`   pod_leads: ${JSON.stringify(pod.pod_leads)}`);
  console.log(`   created_by_address: ${pod.created_by_address || 'NULL'}`);

  // Test 3: Simulate the RLS check
  console.log(`\n📋 Test 3: Simulating RLS policy check`);

  const walletLower = profile.wallet_address.toLowerCase();
  const inPodLeads = pod.pod_leads?.some(lead => lead.toLowerCase() === walletLower);
  const isCreator = pod.created_by_address?.toLowerCase() === walletLower;

  console.log(`   wallet_address from user_profiles: ${walletLower}`);
  console.log(`   In pod_leads: ${inPodLeads ? '✅ YES' : '❌ NO'}`);
  console.log(`   Is creator: ${isCreator ? '✅ YES' : '❌ NO'}`);

  if (inPodLeads || isCreator) {
    console.log(`\n   ✅ RLS CHECK WOULD PASS`);
    console.log(`   The user should be able to INSERT into pod_modules and chat_groups`);
  } else {
    console.log(`\n   ❌ RLS CHECK WOULD FAIL`);
    console.log(`   The user's wallet is not in pod_leads or created_by_address`);
  }

  // Test 4: Check user_profiles RLS policies
  console.log(`\n📋 Test 4: Checking user_profiles RLS policies`);
  console.log(`   Run this SQL to check user_profiles RLS:`);
  console.log(`   SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'user_profiles';`);

  console.log('\n' + '='.repeat(80));

  // Final diagnosis
  console.log('\n🔍 DIAGNOSIS:\n');

  if (!profile.wallet_address) {
    console.log('❌ Problem: wallet_address is NULL in user_profiles');
    console.log('   Solution: Run fix-user-wallet-rls.mjs to set it');
  } else if (!inPodLeads && !isCreator) {
    console.log('❌ Problem: Wallet not in pod_leads or created_by_address');
    console.log('   Solution: Add wallet to pod_leads array');
  } else {
    console.log('✅ Data looks correct');
    console.log('❌ Problem is likely:');
    console.log('   1. RLS policies on user_profiles blocking the lookup, OR');
    console.log('   2. RLS policies on pod_modules/chat_groups are wrong/missing, OR');
    console.log('   3. Client is not authenticated properly');
    console.log('\n   Next steps:');
    console.log('   1. Run check-rls-policies.sql in Supabase SQL Editor');
    console.log('   2. Check if user_profiles has SELECT policy for authenticated users');
    console.log('   3. Verify the pod_modules and chat_groups INSERT policies');
  }

  console.log('\n');
}

// Run the test
const userEmail = process.argv[2];
const podId = process.argv[3];

if (!userEmail || !podId) {
  console.log('Usage: node scripts/test-rls-lookup.mjs <user-email> <pod-id>');
  console.log('\nExample:');
  console.log('  node scripts/test-rls-lookup.mjs member@example.org f2bc166d-33d5-47dc-8409-ea8d445d3fc0');
  process.exit(1);
}

testRLSLookup(userEmail, podId).catch(console.error);
