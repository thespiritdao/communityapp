#!/usr/bin/env node
/**
 * Fix RLS Policy Issues by Syncing Wallet Address to User Profile
 *
 * This script updates user_profiles.wallet_address to match the user's current
 * EVM address, which fixes RLS policy violations for pod_modules and chat_groups.
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

async function fixUserWallet(userEmail, evmAddress) {
  console.log('\n🔧 Fixing User Wallet Address for RLS Policies\n');
  console.log('='.repeat(60));

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
  console.log(`   User ID: ${user.id}`);

  // Get current user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .eq('user_id', user.id)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('❌ Error fetching profile:', profileError);
    return;
  }

  console.log(`\n📋 Current Profile:`);
  console.log(`   wallet_address: ${profile?.wallet_address || 'NULL'}`);
  console.log(`\n🎯 Target EVM Address: ${evmAddress.toLowerCase()}`);

  if (profile?.wallet_address?.toLowerCase() === evmAddress.toLowerCase()) {
    console.log('\n✅ Wallet address already matches! No update needed.');
    return;
  }

  // Update wallet_address
  console.log(`\n🔄 Updating wallet_address...`);

  const { data: updated, error: updateError } = await supabase
    .from('user_profiles')
    .update({ wallet_address: evmAddress.toLowerCase() })
    .eq('user_id', user.id)
    .select();

  if (updateError) {
    console.error('❌ Error updating profile:', updateError);
    return;
  }

  console.log(`\n✅ SUCCESS! Updated wallet_address`);
  console.log(`   Old: ${profile?.wallet_address || 'NULL'}`);
  console.log(`   New: ${evmAddress.toLowerCase()}`);

  // Check pod permissions
  console.log(`\n🏛️  Checking pod permissions...`);

  const { data: pods, error: podsError } = await supabase
    .from('pods')
    .select('id, name, pod_leads, created_by_address')
    .or(`pod_leads.cs.{${evmAddress.toLowerCase()}},created_by_address.eq.${evmAddress.toLowerCase()}`);

  if (podsError) {
    console.warn('⚠️  Could not check pod permissions:', podsError.message);
  } else if (pods && pods.length > 0) {
    console.log(`\n✅ You now have manager access to ${pods.length} pod(s):`);
    pods.forEach(pod => {
      const isLead = pod.pod_leads?.includes(evmAddress.toLowerCase());
      const isCreator = pod.created_by_address?.toLowerCase() === evmAddress.toLowerCase();
      console.log(`   - ${pod.name} (${isLead ? 'Leader' : ''}${isCreator ? 'Creator' : ''})`);
    });
  } else {
    console.log(`\n⚠️  Warning: You don't appear to be a manager of any pods.`);
    console.log(`   Make sure your address is in pod_leads for the pods you want to manage.`);
  }

  console.log(`\n✨ RLS policies should now work correctly!`);
  console.log(`   Try creating a chat group or enabling modules again.`);
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run the fix
const userEmail = process.argv[2];
const evmAddress = process.argv[3];

if (!userEmail || !evmAddress) {
  console.log('Usage: node scripts/fix-user-wallet-rls.mjs <user-email> <evm-address>');
  console.log('\nExample:');
  console.log('  node scripts/fix-user-wallet-rls.mjs tech@spiritdao.org 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48');
  console.log('\nThis will update user_profiles.wallet_address to match your current EVM address,');
  console.log('fixing RLS policy violations for pod_modules and chat_groups.');
  process.exit(1);
}

fixUserWallet(userEmail, evmAddress).catch(console.error);
