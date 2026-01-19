#!/usr/bin/env node
/**
 * Check Pod Permissions - Verify if a wallet has manager access to a pod
 *
 * This script checks if a wallet address is in the pod's pod_leads array
 * or matches the pod's created_by_address.
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

async function checkPodPermissions(podId, walletAddress) {
  console.log('\n🔍 Checking Pod Manager Permissions\n');
  console.log('='.repeat(60));

  const normalizedWallet = walletAddress.toLowerCase();

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
  console.log(`   pod_leads: ${JSON.stringify(pod.pod_leads, null, 2)}`);

  // Check if wallet is in pod_leads
  const inPodLeads = pod.pod_leads?.some(
    lead => lead.toLowerCase() === normalizedWallet
  );

  const isCreator = pod.created_by_address?.toLowerCase() === normalizedWallet;

  console.log(`\n🔐 Permission Check for: ${normalizedWallet}`);
  console.log(`   In pod_leads array: ${inPodLeads ? '✅ YES' : '❌ NO'}`);
  console.log(`   Is creator: ${isCreator ? '✅ YES' : '❌ NO'}`);

  if (inPodLeads || isCreator) {
    console.log(`\n✅ RLS POLICY SHOULD PASS`);
    console.log('   Wallet has permission to manage pod modules and chat groups.');
  } else {
    console.log(`\n❌ RLS POLICY WILL FAIL`);
    console.log('   Wallet does NOT have permission to manage this pod.');
    console.log('\n💡 To fix this, you need to either:');
    console.log(`   1. Add "${normalizedWallet}" to the pod_leads array, OR`);
    console.log(`   2. Set created_by_address to "${normalizedWallet}"`);
    console.log('\n   You can do this with SQL:');
    console.log(`   UPDATE pods SET pod_leads = array_append(pod_leads, '${normalizedWallet}') WHERE id = '${podId}';`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run the check
const podId = process.argv[2];
const walletAddress = process.argv[3];

if (!podId || !walletAddress) {
  console.log('Usage: node scripts/check-pod-permissions.mjs <pod-id> <wallet-address>');
  console.log('\nExample:');
  console.log('  node scripts/check-pod-permissions.mjs f2bc166d-33d5-47dc-8409-ea8d445d3fc0 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48');
  process.exit(1);
}

checkPodPermissions(podId, walletAddress).catch(console.error);
