/**
 * 🔍 DEBUG: Check for Pod ID Mismatch
 *
 * This script checks if the database pod_id matches the blockchain pod_id
 */

import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const FACTORY_ADDRESS = '0x3d453f1a4E200F446637DD9f4863DdcA9975eDCF';
const BLOCKCHAIN_POD_ID = 'pod-1762310879258-3naytgade';

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Viem client
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org')
});

// Factory ABI (minimal)
const FACTORY_ABI = [
  {
    name: 'getProxyAddress',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }]
  }
];

async function checkPodIdMismatch() {
  console.log('🔍 === POD ID MISMATCH DIAGNOSTIC ===\n');

  // Step 1: Get role from database
  console.log('📋 Step 1: Checking database...');
  const { data: roles, error } = await supabase
    .from('pod_role_permissions')
    .select('*')
    .eq('pod_id', BLOCKCHAIN_POD_ID)
    .limit(5);

  if (error) {
    console.error('❌ Database error:', error);
    return;
  }

  if (!roles || roles.length === 0) {
    console.log('⚠️  NO ROLES FOUND with blockchain pod ID:', BLOCKCHAIN_POD_ID);
    console.log('\n📋 Searching for ANY roles in database...');

    const { data: allRoles } = await supabase
      .from('pod_role_permissions')
      .select('id, pod_id, role_name, hat_id')
      .limit(10);

    if (allRoles && allRoles.length > 0) {
      console.log('\n✅ Found these roles:');
      allRoles.forEach((role, i) => {
        console.log(`\n  Role ${i + 1}:`);
        console.log(`    - ID: ${role.id}`);
        console.log(`    - Pod ID: ${role.pod_id}`);
        console.log(`    - Role Name: ${role.role_name}`);
        console.log(`    - HAT ID: ${role.hat_id}`);
      });

      console.log('\n🔍 Now checking each pod_id against blockchain...\n');

      for (const role of allRoles) {
        try {
          const proxyAddress = await publicClient.readContract({
            address: FACTORY_ADDRESS,
            abi: FACTORY_ABI,
            functionName: 'getProxyAddress',
            args: [role.pod_id]
          });

          console.log(`Pod ID: ${role.pod_id}`);
          console.log(`  Proxy: ${proxyAddress}`);
          console.log(`  Status: ${proxyAddress === '0x0000000000000000000000000000000000000000' ? '❌ NOT ON BLOCKCHAIN' : '✅ ON BLOCKCHAIN'}`);
          console.log('');
        } catch (err) {
          console.log(`Pod ID: ${role.pod_id}`);
          console.log(`  Error: ${err.message}`);
          console.log('');
        }
      }
    } else {
      console.log('❌ No roles found in database at all!');
    }
    return;
  }

  // Step 2: Check if database pod_id works on blockchain
  console.log('\n✅ Found roles in database');
  console.log(`   Count: ${roles.length}`);

  for (const role of roles) {
    console.log(`\n📊 Role: ${role.role_name}`);
    console.log(`   - Role ID: ${role.id}`);
    console.log(`   - Pod ID (DB): ${role.pod_id}`);
    console.log(`   - HAT ID: ${role.hat_id}`);

    // Check if this pod_id exists on blockchain
    try {
      const proxyAddress = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getProxyAddress',
        args: [role.pod_id]
      });

      console.log(`   - Proxy Address: ${proxyAddress}`);

      if (proxyAddress === '0x0000000000000000000000000000000000000000') {
        console.log(`   ❌ POD DOES NOT EXIST ON BLOCKCHAIN!`);
        console.log(`   This is why you get "Pod proxy does not exist" error!`);
      } else {
        console.log(`   ✅ Pod exists on blockchain`);
      }
    } catch (err) {
      console.log(`   ❌ Error checking blockchain: ${err.message}`);
    }
  }

  // Step 3: Verify the blockchain pod ID works
  console.log(`\n\n📋 Step 2: Verifying blockchain pod ID: ${BLOCKCHAIN_POD_ID}`);

  try {
    const proxyAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'getProxyAddress',
      args: [BLOCKCHAIN_POD_ID]
    });

    console.log(`   Proxy Address: ${proxyAddress}`);

    if (proxyAddress === '0x0000000000000000000000000000000000000000') {
      console.log(`   ❌ Blockchain pod ID does NOT work!`);
    } else {
      console.log(`   ✅ Blockchain pod ID works!`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  console.log('\n\n📊 === SUMMARY ===');
  console.log('\nThe error "Pod proxy does not exist" means:');
  console.log('  1. The pod_id stored in database does NOT match blockchain');
  console.log('  2. When frontend sends transaction, it uses database pod_id');
  console.log('  3. Factory contract checks blockchain and says "no proxy for this pod_id"');
  console.log('\nSOLUTION:');
  console.log('  Update the database pod_id to match the blockchain pod_id:');
  console.log(`  ${BLOCKCHAIN_POD_ID}`);
}

checkPodIdMismatch().catch(console.error);
