#!/usr/bin/env node
/**
 * Simple Beta Tester HAT expiration update
 *
 * Uses the exact module ID you provided to update the expiration date.
 *
 * Usage: node scripts/update-beta-tester-simple.mjs
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

// Your Beta Tester module details
const POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';  // Beta Testers Pod
const TOKEN_ADDRESS = '0x000000880001000b000000000000000000000000000000000000000000000000';  // Management HAT
const NEW_EXPIRATION = '2026-02-28T23:59';

async function updateBetaTester() {
  console.log('🔍 Looking for Beta Tester module...\n');
  console.log('   Pod ID:', POD_ID);
  console.log('   Token:', TOKEN_ADDRESS);
  console.log('');

  // Try to fetch module by pod_id and token_address
  const { data: module, error: fetchError } = await supabase
    .from('pod_modules')
    .select('*')
    .eq('pod_id', POD_ID)
    .eq('token_address', TOKEN_ADDRESS)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching module:', fetchError);

    // Try alternative approach - fetch all modules for this pod
    console.log('\n💡 Trying alternative: Fetch all modules for this pod...\n');

    const { data: allModules, error: allError } = await supabase
      .from('pod_modules')
      .select('*')
      .eq('pod_id', POD_ID);

    if (allError) {
      console.error('❌ Error fetching pod modules:', allError);
      process.exit(1);
    }

    if (!allModules || allModules.length === 0) {
      console.error('❌ No modules found for this pod');
      console.log('   This might be a permissions issue or table structure difference.\n');
      process.exit(1);
    }

    console.log(`✅ Found ${allModules.length} module(s) for this pod:\n`);
    allModules.forEach((mod, idx) => {
      console.log(`${idx + 1}. Module ID: ${mod.id}`);
      console.log(`   Token: ${mod.token_address}`);
      console.log(`   Max Holders: ${mod.max_holders}`);
      console.log('');
    });

    console.log('⚠️  Could not auto-select the Beta Tester module.');
    console.log('   Please check the list above and update the script with the correct module ID.\n');
    process.exit(1);
  }

  console.log('✅ Found Beta Tester module!');
  console.log(`   Module ID: ${module.id}`);
  console.log(`   Token: ${module.token_address}`);
  console.log(`   Max Holders: ${module.max_holders}`);
  console.log(`   Current Holders: ${module.current_holders || 0}`);
  console.log('');

  // Parse eligibility criteria
  let eligibilityCriteria;
  try {
    eligibilityCriteria = typeof module.eligibility_criteria === 'string'
      ? JSON.parse(module.eligibility_criteria)
      : module.eligibility_criteria;
  } catch (e) {
    console.error('❌ Failed to parse eligibility criteria:', e);
    process.exit(1);
  }

  console.log('📋 Current eligibility criteria:');
  console.log(JSON.stringify(eligibilityCriteria, null, 2));
  console.log('');

  // Find time-based criteria
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

  // Update expiration
  timeBasedCriteria.valid_until = NEW_EXPIRATION;

  console.log('🔄 Updating to:');
  console.log('   New Valid Until:', NEW_EXPIRATION);
  console.log('   Date:', new Date(NEW_EXPIRATION).toLocaleString());
  console.log('');

  // Update in database
  const { data: updated, error: updateError } = await supabase
    .from('pod_modules')
    .update({
      eligibility_criteria: eligibilityCriteria,
      updated_at: new Date().toISOString(),
    })
    .eq('id', module.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Error updating module:', updateError);
    process.exit(1);
  }

  console.log('✅ Beta Tester expiration updated successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Module ID:', updated.id);
  console.log('Old Expiration: 2026-02-06T12:00');
  console.log('New Expiration: 2026-02-28T23:59');
  console.log('Extension: 22 days');
  console.log('');
  console.log('⚠️  IMPORTANT: Database update complete!');
  console.log('');
  console.log('Next step: Update ON-CHAIN expiration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('The time restriction also exists on-chain via TimeBasedToggleModule.');
  console.log('You must update it there too for the full extension to work.');
  console.log('');
  console.log('Option 1: Via UI');
  console.log('  1. Go to /pods in your app');
  console.log('  2. Find "Beta Testers Pod"');
  console.log('  3. Manage roles → Edit Beta Tester role');
  console.log('  4. Update expiration → Click "Commit Change"');
  console.log('');
  console.log('Option 2: Programmatically');
  console.log('  Use TimeBasedToggleService.setHatExpiration()');
  console.log('  HAT ID:', TOKEN_ADDRESS);
  console.log('  Expiration (Unix):', Math.floor(new Date(NEW_EXPIRATION).getTime() / 1000));
  console.log('');
}

updateBetaTester()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
