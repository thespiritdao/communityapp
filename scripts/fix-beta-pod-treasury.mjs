#!/usr/bin/env node
/**
 * Fix Beta Testers Pod treasury by querying factory contract
 * and updating database
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const FACTORY_ADDRESS = '0xb9e3D01C144c5Bfcd5816afea9190371B0843be6';
const BETA_POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';

const FACTORY_ABI = [
  {
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
];

// Create clients
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Try to get from env, but don't fail if missing - we'll get treasury address at least
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

async function fixBetaPodTreasury() {
  console.log('🔍 Querying factory contract for Beta Testers Pod treasury...\n');
  console.log('Pod ID:', BETA_POD_ID);
  console.log('Factory:', FACTORY_ADDRESS);
  console.log('');

  try {
    // Query factory contract
    const treasuryAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'getTreasuryForPod',
      args: [BETA_POD_ID],
    });

    console.log('📦 Factory Response:', treasuryAddress);
    console.log('');

    if (!treasuryAddress || treasuryAddress === '0x0000000000000000000000000000000000000000') {
      console.log('❌ No treasury found for this pod in factory contract');
      console.log('   The treasury deployment may have failed or not been submitted yet.');
      return;
    }

    console.log('✅ Treasury found at:', treasuryAddress);
    console.log('🔗 View on BaseScan: https://basescan.org/address/' + treasuryAddress);
    console.log('');

    if (!supabase) {
      console.log('⚠️ Supabase credentials not found in .env.local');
      console.log('');
      console.log('📋 Manual Database Update Required:');
      console.log('');
      console.log('Run this SQL in Supabase dashboard:');
      console.log('');
      console.log(`UPDATE pods`);
      console.log(`SET treasury_contract_address = '${treasuryAddress}',`);
      console.log(`    updated_at = NOW()`);
      console.log(`WHERE id = '${BETA_POD_ID}';`);
      console.log('');
      return;
    }

    // Update database
    console.log('📝 Updating database...');
    const { data, error } = await supabase
      .from('pods')
      .update({
        treasury_contract_address: treasuryAddress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', BETA_POD_ID)
      .select();

    if (error) {
      console.error('❌ Database update failed:', error.message);
      return;
    }

    console.log('✅ Database updated successfully!');
    console.log('');
    console.log('📊 Updated pod:');
    console.log(JSON.stringify(data[0], null, 2));
    console.log('');
    console.log('✅ Beta Testers Pod treasury is now linked!');
    console.log('🎉 Users can now donate and create bounties.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixBetaPodTreasury();
