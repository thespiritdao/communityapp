#!/usr/bin/env node
/**
 * Update Beta Tester HAT expiration - FINAL VERSION
 *
 * Uses the correct table (pod_role_permissions) and column names (hat_id, role_name)
 *
 * Usage: node scripts/update-beta-final.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Beta Tester role details from your data
const ROLE_ID = '64d5d229-b3ea-4f6a-a3bc-9a6315248daa';
const POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';
const HAT_ID = '0x000000880001000b000000000000000000000000000000000000000000000000';
const NEW_EXPIRATION = '2026-02-28T23:59';

async function updateBetaTester() {
  console.log('🔍 Fetching Beta Tester role from pod_role_permissions...\n');
  console.log('   Role ID:', ROLE_ID);
  console.log('   Pod ID:', POD_ID);
  console.log('   HAT ID:', HAT_ID);
  console.log('');

  // Fetch the role
  const { data: role, error: fetchError } = await supabase
    .from('pod_role_permissions')
    .select('*')
    .eq('id', ROLE_ID)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching role:', fetchError);
    process.exit(1);
  }

  if (!role) {
    console.error('❌ Role not found');
    process.exit(1);
  }

  console.log('✅ Found Beta Tester role!');
  console.log('   Role Name:', role.role_name);
  console.log('   HAT ID:', role.hat_id);
  console.log('   Max Holders:', role.max_holders);
  console.log('   Current Holders:', role.current_holders);
  console.log('   Version:', role.version);
  console.log('');

  // Parse eligibility criteria
  let eligibilityCriteria;
  try {
    eligibilityCriteria = typeof role.eligibility_criteria === 'string'
      ? JSON.parse(role.eligibility_criteria)
      : role.eligibility_criteria;
  } catch (e) {
    console.error('❌ Failed to parse eligibility criteria:', e);
    console.log('   Raw value:', role.eligibility_criteria);
    process.exit(1);
  }

  console.log('📋 Current eligibility criteria:');
  console.log(JSON.stringify(eligibilityCriteria, null, 2));
  console.log('');

  // Find time-based criteria
  if (!Array.isArray(eligibilityCriteria)) {
    console.error('❌ eligibility_criteria is not an array');
    process.exit(1);
  }

  const timeBasedCriteria = eligibilityCriteria.find(
    c => c.type === 'time_based' || c.id?.includes('time_based')
  );

  if (!timeBasedCriteria) {
    console.error('❌ No time-based criteria found');
    process.exit(1);
  }

  console.log('⏰ Current time restriction:');
  console.log('   Valid From:', timeBasedCriteria.valid_from);
  console.log('   Valid Until:', timeBasedCriteria.valid_until);
  console.log('');

  const oldExpiration = timeBasedCriteria.valid_until;

  // Update expiration
  timeBasedCriteria.valid_until = NEW_EXPIRATION;

  console.log('🔄 Updating expiration...');
  console.log('   From:', oldExpiration);
  console.log('   To:  ', NEW_EXPIRATION);
  console.log('   Date:', new Date(NEW_EXPIRATION).toLocaleString());
  console.log('');

  // Calculate extension
  const oldDate = new Date(oldExpiration);
  const newDate = new Date(NEW_EXPIRATION);
  const daysDiff = Math.round((newDate - oldDate) / (1000 * 60 * 60 * 24));

  console.log('   Extension:', daysDiff, 'days');
  console.log('');

  // Update in database
  const { data: updated, error: updateError } = await supabase
    .from('pod_role_permissions')
    .update({
      eligibility_criteria: JSON.stringify(eligibilityCriteria),
      updated_at: new Date().toISOString(),
      version: role.version + 1,
    })
    .eq('id', ROLE_ID)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Error updating role:', updateError);
    process.exit(1);
  }

  console.log('✅ Beta Tester expiration updated successfully!\n');

  // Verify the update
  const updatedCriteria = typeof updated.eligibility_criteria === 'string'
    ? JSON.parse(updated.eligibility_criteria)
    : updated.eligibility_criteria;

  const updatedTimeBased = updatedCriteria.find(
    c => c.type === 'time_based' || c.id?.includes('time_based')
  );

  console.log('✅ Verification:');
  console.log('   New Valid Until:', updatedTimeBased.valid_until);
  console.log('   Matches Target:', updatedTimeBased.valid_until === NEW_EXPIRATION ? '✅ YES' : '❌ NO');
  console.log('   New Version:', updated.version);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DATABASE UPDATE COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Table: pod_role_permissions');
  console.log('Role ID:', ROLE_ID);
  console.log('Role Name:', role.role_name);
  console.log('HAT ID:', HAT_ID);
  console.log('');
  console.log('Old Expiration:', oldExpiration);
  console.log('New Expiration:', NEW_EXPIRATION);
  console.log('Extension:', daysDiff, 'days');
  console.log('');
  console.log('Version: v' + role.version, '→ v' + updated.version);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  CRITICAL: ON-CHAIN UPDATE REQUIRED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('✅ Database updated (controls app UI/permissions)');
  console.log('⏳ On-chain update needed (controls HAT token validity)');
  console.log('');
  console.log('The HAT has a time restriction stored on-chain via');
  console.log('TimeBasedToggleModule contract. This MUST be updated');
  console.log('for the extension to fully work.');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 ON-CHAIN UPDATE OPTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Option 1: Via App UI (Recommended)');
  console.log('───────────────────────────────────────');
  console.log('1. Go to /pods in your app');
  console.log('2. Find "Beta Testers Pod"');
  console.log('3. Click "Manage Roles" or "Edit Roles"');
  console.log('4. Find "Beta Tester" role');
  console.log('5. Click "Edit Time Restriction"');
  console.log('6. Update expiration to: Feb 28, 2026 23:59');
  console.log('7. Click "Commit Change" (gasless!)');
  console.log('');
  console.log('Option 2: Programmatically');
  console.log('───────────────────────────────────────');
  console.log('Use TimeBasedToggleService.setHatExpiration()');
  console.log('');
  console.log('Parameters:');
  console.log('  HAT ID:', HAT_ID);
  console.log('  Expiration (Unix):', Math.floor(new Date(NEW_EXPIRATION).getTime() / 1000));
  console.log('');
  console.log('Option 3: Direct Contract Call');
  console.log('───────────────────────────────────────');
  console.log('Contract: TimeBasedToggleModule');
  console.log('Function: setHatExpiration(uint256, uint256)');
  console.log('Network: Base Mainnet (or Sepolia for testing)');
  console.log('');
  console.log('See BETA_TESTER_HAT_UPDATE_GUIDE.md for full details.');
  console.log('');
}

updateBetaTester()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
