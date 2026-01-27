#!/usr/bin/env node
/**
 * Update Beta Tester HAT expiration date
 *
 * This script updates the time-based eligibility criteria for the Beta Tester role
 * to extend the expiration date to the end of February 2026.
 *
 * Usage: node scripts/update-beta-tester-expiration.mjs
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

// New expiration date: February 28, 2026 at 23:59
const NEW_EXPIRATION = '2026-02-28T23:59';

async function updateBetaTesterExpiration() {
  console.log('🔍 Searching for Beta Tester module...\n');

  // 1. Search for Beta Tester module by role name
  const { data: modules, error: searchError } = await supabase
    .from('pod_modules')
    .select('*')
    .ilike('role_name', '%beta%tester%');

  if (searchError) {
    console.error('❌ Error searching for modules:', searchError);
    process.exit(1);
  }

  if (!modules || modules.length === 0) {
    console.error('❌ No Beta Tester modules found');
    console.log('\n💡 Tip: Searching for modules with "beta" and "tester" in the name');
    console.log('   If your role has a different name, update the search in this script.\n');
    process.exit(1);
  }

  // If multiple found, show them and let user choose
  if (modules.length > 1) {
    console.log('🔍 Found multiple Beta Tester modules:\n');
    modules.forEach((mod, idx) => {
      console.log(`${idx + 1}. ${mod.role_name} (ID: ${mod.id})`);
      console.log(`   Pod ID: ${mod.pod_id}`);
      console.log(`   Token: ${mod.token_address}`);
      console.log(`   Max Holders: ${mod.max_holders}, Current: ${mod.current_holders}`);
      console.log('');
    });
    console.log('⚠️  Multiple modules found. Please edit the script to specify the correct ID.\n');
    process.exit(1);
  }

  const currentModule = modules[0];
  console.log(`✅ Found module: "${currentModule.role_name}"`);
  console.log(`   ID: ${currentModule.id}\n`);

  console.log('✅ Found Beta Tester module:');
  console.log('   Role Name:', currentModule.role_name);
  console.log('   Token Address:', currentModule.token_address);
  console.log('   Max Holders:', currentModule.max_holders);
  console.log('   Current Holders:', currentModule.current_holders);
  console.log('   Is Active:', currentModule.is_active);
  console.log('');

  // 2. Parse current eligibility criteria
  let eligibilityCriteria;
  try {
    eligibilityCriteria = typeof currentModule.eligibility_criteria === 'string'
      ? JSON.parse(currentModule.eligibility_criteria)
      : currentModule.eligibility_criteria;
  } catch (e) {
    console.error('❌ Failed to parse eligibility criteria:', e);
    process.exit(1);
  }

  console.log('📋 Current eligibility criteria:');
  console.log(JSON.stringify(eligibilityCriteria, null, 2));
  console.log('');

  // 3. Find time-based criteria
  const timeBasedCriteria = eligibilityCriteria.find(
    c => c.type === 'time_based' || c.id?.includes('time_based')
  );

  if (!timeBasedCriteria) {
    console.error('❌ No time-based criteria found in module');
    process.exit(1);
  }

  console.log('⏰ Current time restriction:');
  console.log('   Valid From:', timeBasedCriteria.valid_from);
  console.log('   Valid Until:', timeBasedCriteria.valid_until);
  console.log('');

  // 4. Update the expiration date
  timeBasedCriteria.valid_until = NEW_EXPIRATION;

  console.log('🔄 Updating to new expiration:');
  console.log('   New Valid Until:', NEW_EXPIRATION);
  console.log('   Date:', new Date(NEW_EXPIRATION).toLocaleString());
  console.log('');

  // 5. Update in database
  const { data: updatedModule, error: updateError } = await supabase
    .from('pod_modules')
    .update({
      eligibility_criteria: eligibilityCriteria,
      updated_at: new Date().toISOString(),
    })
    .eq('id', BETA_TESTER_MODULE_ID)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Error updating module:', updateError);
    process.exit(1);
  }

  console.log('✅ Beta Tester expiration updated successfully!\n');
  console.log('📊 Updated module:');
  console.log('   ID:', updatedModule.id);
  console.log('   Role Name:', updatedModule.role_name);
  console.log('   Updated At:', updatedModule.updated_at);
  console.log('');

  // Parse and display updated criteria
  const updatedCriteria = typeof updatedModule.eligibility_criteria === 'string'
    ? JSON.parse(updatedModule.eligibility_criteria)
    : updatedModule.eligibility_criteria;

  console.log('✅ New eligibility criteria:');
  console.log(JSON.stringify(updatedCriteria, null, 2));
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Old Expiration: 2026-02-06T12:00');
  console.log('New Expiration: 2026-02-28T23:59');
  console.log('Change: Extended by 22 days');
  console.log('');
  console.log('⚠️  IMPORTANT NEXT STEPS:');
  console.log('');
  console.log('1. DATABASE UPDATE: ✅ COMPLETE (eligibility_criteria updated)');
  console.log('');
  console.log('2. ON-CHAIN UPDATE: ⏳ REQUIRED');
  console.log('   The time restriction may also be stored on-chain via');
  console.log('   the TimeBasedToggleModule contract.');
  console.log('');
  console.log('   To update on-chain:');
  console.log('   a) Go to your app: /pods (Pod Management)');
  console.log('   b) Find the Beta Tester pod');
  console.log('   c) Click "Manage Roles"');
  console.log('   d) Find the Beta Tester role');
  console.log('   e) Click "Edit Time Restriction"');
  console.log('   f) Update expiration to: February 28, 2026 at 23:59');
  console.log('   g) Click "Commit Change" (gasless transaction via paymaster)');
  console.log('');
  console.log('   OR use TimeBasedToggleService.setHatExpiration():');
  console.log('   - HAT ID:', currentModule.token_address);
  console.log('   - Expiration Unix timestamp:', Math.floor(new Date(NEW_EXPIRATION).getTime() / 1000));
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Run the update
updateBetaTesterExpiration()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
