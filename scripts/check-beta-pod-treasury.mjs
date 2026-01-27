#!/usr/bin/env node
/**
 * Check if Beta Testers Pod has a treasury deployed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBetaPodTreasury() {
  console.log('🔍 Checking Beta Testers Pod treasury status...\n');

  try {
    // Query Beta Testers Pod
    const { data: pods, error } = await supabase
      .from('pods')
      .select('id, name, treasury_contract_address, management_hat_id, status')
      .eq('name', 'Beta Testers Pod')
      .single();

    if (error) {
      console.error('❌ Database error:', error.message);
      return;
    }

    if (!pods) {
      console.log('❌ Beta Testers Pod not found');
      return;
    }

    console.log('📦 Beta Testers Pod:');
    console.log('   ID:', pods.id);
    console.log('   Name:', pods.name);
    console.log('   Status:', pods.status);
    console.log('   Management HAT ID:', pods.management_hat_id);
    console.log('   Treasury Address:', pods.treasury_contract_address || '❌ NOT DEPLOYED');
    console.log('');

    if (pods.treasury_contract_address) {
      console.log('✅ Treasury is deployed!');
      console.log('🔗 View on BaseScan: https://basescan.org/address/' + pods.treasury_contract_address);
    } else {
      console.log('❌ Treasury NOT deployed');
      console.log('📝 Action required: Deploy treasury from pod management page');
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

checkBetaPodTreasury();
