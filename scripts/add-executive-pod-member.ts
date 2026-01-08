/**
 * Script to manually add a wallet to Executive Pod members
 *
 * Use this when:
 * - A wallet has the Executive Pod LEADER HAT on-chain
 * - But the automated indexer can't discover it
 * - You need to manually sync the database with blockchain state
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
const EXECUTIVE_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
const EXECUTIVE_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

// The wallet to add - UPDATE THIS WITH YOUR WALLET ADDRESS
const WALLET_TO_ADD = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48';

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !EXECUTIVE_POD_LEADER_HAT) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

async function main() {
  console.log('🔧 Manually adding Executive Pod member...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Normalize wallet address
  const normalizedWallet = WALLET_TO_ADD.toLowerCase();

  console.log('📋 Adding member:');
  console.log('  Pod ID:', EXECUTIVE_POD_ID);
  console.log('  Wallet:', normalizedWallet);
  console.log('  HAT ID:', EXECUTIVE_POD_LEADER_HAT);
  console.log('  Membership Type: leader');
  console.log();

  // Check if member already exists
  const { data: existing, error: checkError } = await supabase
    .from('pod_members')
    .select('*')
    .eq('pod_id', EXECUTIVE_POD_ID)
    .eq('wallet', normalizedWallet)
    .maybeSingle();

  if (checkError) {
    console.error('❌ Error checking existing membership:', checkError);
    process.exit(1);
  }

  if (existing) {
    console.log('⚠️  Member already exists in database!');
    console.log('   Current status:', {
      membership_type: existing.membership_type,
      is_active: existing.is_active,
      joined_at: existing.joined_at,
    });
    console.log();

    // Update if inactive
    if (!existing.is_active) {
      console.log('🔄 Reactivating membership...');
      const { error: updateError } = await supabase
        .from('pod_members')
        .update({
          is_active: true,
          removed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('pod_id', EXECUTIVE_POD_ID)
        .eq('wallet', normalizedWallet);

      if (updateError) {
        console.error('❌ Error reactivating membership:', updateError);
        process.exit(1);
      }

      console.log('✅ Membership reactivated!');
    } else {
      console.log('✅ Membership is already active - nothing to do');
    }
  } else {
    console.log('➕ Adding new member...');

    const { error: insertError } = await supabase
      .from('pod_members')
      .insert({
        pod_id: EXECUTIVE_POD_ID,
        wallet: normalizedWallet,
        hat_id: EXECUTIVE_POD_LEADER_HAT,
        membership_type: 'leader',
        role: 'leader', // Duplicate field in actual schema
        is_active: true,
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('❌ Error adding member:', insertError);
      process.exit(1);
    }

    console.log('✅ Member added successfully!');
  }

  // Verify the final state
  console.log();
  console.log('🔍 Verifying final state...');

  const { data: member, error: verifyError } = await supabase
    .from('pod_members')
    .select('*')
    .eq('pod_id', EXECUTIVE_POD_ID)
    .eq('wallet', normalizedWallet)
    .single();

  if (verifyError || !member) {
    console.error('❌ Error verifying member:', verifyError);
    process.exit(1);
  }

  console.log('✅ Member verified in database:');
  console.log('   Membership Type:', member.membership_type);
  console.log('   Is Active:', member.is_active);
  console.log('   HAT ID:', member.hat_id);
  console.log('   Joined At:', member.joined_at);
  console.log();
  console.log('🎉 Done! Your wallet is now in the Executive Pod members table.');
  console.log('   Refresh your app and check /events to test event creation permissions.');
}

main().catch(console.error);
