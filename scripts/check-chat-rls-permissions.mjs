#!/usr/bin/env node
/**
 * Diagnostic script to check chat group creation RLS permissions
 *
 * This script helps diagnose why the RLS policy "Pod managers can create chat groups" might be failing
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPermissions(userEmail, podId) {
  console.log('\n🔍 Checking Chat Group Creation Permissions\n');
  console.log('=' . repeat(60));

  // Get user by email
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    return;
  }

  const user = users.find(u => u.email === userEmail);

  if (!user) {
    console.error(`❌ User not found with email: ${userEmail}`);
    return;
  }

  console.log(`\n✅ Found user: ${user.email}`);
  console.log(`   User ID: ${user.id}`);

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    console.error('❌ Error fetching user profile:', profileError);
    return;
  }

  console.log(`\n📋 User Profile:`);
  console.log(`   wallet_address: ${profile?.wallet_address || 'NULL'}`);

  if (!profile?.wallet_address) {
    console.log('\n⚠️  WARNING: User profile has no wallet_address!');
    console.log('   This will cause RLS policy to fail.');
    console.log('   The user needs to connect their wallet to set this field.');
  }

  // Get pod details
  const { data: pod, error: podError } = await supabase
    .from('pods')
    .select('id, name, pod_leads, created_by_address')
    .eq('id', podId)
    .single();

  if (podError) {
    console.error('❌ Error fetching pod:', podError);
    return;
  }

  console.log(`\n🏛️  Pod Details:`);
  console.log(`   ID: ${pod.id}`);
  console.log(`   Name: ${pod.name}`);
  console.log(`   created_by_address: ${pod.created_by_address || 'NULL'}`);
  console.log(`   pod_leads: ${JSON.stringify(pod.pod_leads)}`);

  // Check if user's wallet is in pod_leads
  const walletInLeads = pod.pod_leads?.some(
    lead => lead.toLowerCase() === profile?.wallet_address?.toLowerCase()
  );

  const isCreator = pod.created_by_address?.toLowerCase() === profile?.wallet_address?.toLowerCase();

  console.log(`\n🔐 Permission Check:`);
  console.log(`   Wallet in pod_leads: ${walletInLeads ? '✅ YES' : '❌ NO'}`);
  console.log(`   Is creator: ${isCreator ? '✅ YES' : '❌ NO'}`);

  if (walletInLeads || isCreator) {
    console.log(`\n✅ RLS POLICY SHOULD PASS`);
    console.log('   User has permission to create chat groups for this pod.');
  } else {
    console.log(`\n❌ RLS POLICY WILL FAIL`);
    console.log('   User does NOT have permission to create chat groups.');
    console.log('\n💡 Possible Solutions:');
    console.log('   1. Add user\'s wallet to pod_leads array');
    console.log('   2. Ensure user_profiles.wallet_address is set correctly');
    console.log('   3. Update pod.created_by_address to user\'s wallet');
  }

  // Show the exact wallet addresses for comparison
  console.log(`\n🔍 Wallet Address Comparison:`);
  console.log(`   user_profiles.wallet_address: "${profile?.wallet_address || 'NULL'}"`);
  console.log(`   pod.created_by_address:        "${pod.created_by_address || 'NULL'}"`);
  console.log(`   pod.pod_leads:                 ${JSON.stringify(pod.pod_leads, null, 2)}`);

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run the check
const userEmail = process.argv[2];
const podId = process.argv[3];

if (!userEmail || !podId) {
  console.log('Usage: node scripts/check-chat-rls-permissions.mjs <user-email> <pod-id>');
  console.log('\nExample:');
  console.log('  node scripts/check-chat-rls-permissions.mjs user@example.com 123e4567-e89b-12d3-a456-426614174000');
  process.exit(1);
}

checkPermissions(userEmail, podId).catch(console.error);
