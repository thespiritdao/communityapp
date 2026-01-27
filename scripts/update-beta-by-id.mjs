#!/usr/bin/env node
/**
 * Update Beta Tester by exact module ID
 *
 * Uses the module ID we just discovered: 1d3c9d19-61f4-4deb-bba5-a9f34280ccff
 *
 * Usage: node scripts/update-beta-by-id.mjs
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

// Module ID we found
const MODULE_ID = '1d3c9d19-61f4-4deb-bba5-a9f34280ccff';
const NEW_EXPIRATION = '2026-02-28T23:59';

async function updateBetaTester() {
  console.log('🔍 Fetching Beta Tester module by ID...\n');
  console.log('   Module ID:', MODULE_ID);
  console.log('');

  // Fetch module by ID only - select ALL columns
  const { data: module, error: fetchError } = await supabase
    .from('pod_modules')
    .select('*')
    .eq('id', MODULE_ID)
    .single();

  if (fetchError) {
    console.error('❌ Error fetching module:', fetchError);
    process.exit(1);
  }

  if (!module) {
    console.error('❌ Module not found');
    process.exit(1);
  }

  console.log('✅ Found module! Here are ALL the fields:\n');
  console.log(JSON.stringify(module, null, 2));
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if eligibility_criteria exists
  if (!module.eligibility_criteria) {
    console.error('❌ Module has no eligibility_criteria field');
    console.log('   Available fields:', Object.keys(module).join(', '));
    process.exit(1);
  }

  // Parse eligibility criteria
  let eligibilityCriteria;
  try {
    eligibilityCriteria = typeof module.eligibility_criteria === 'string'
      ? JSON.parse(module.eligibility_criteria)
      : module.eligibility_criteria;
  } catch (e) {
    console.error('❌ Failed to parse eligibility criteria:', e);
    console.log('   Raw value:', module.eligibility_criteria);
    process.exit(1);
  }

  console.log('📋 Current eligibility criteria:');
  console.log(JSON.stringify(eligibilityCriteria, null, 2));
  console.log('');

  // Find time-based criteria
  if (!Array.isArray(eligibilityCriteria)) {
    console.error('❌ eligibility_criteria is not an array');
    console.log('   Type:', typeof eligibilityCriteria);
    console.log('   Value:', eligibilityCriteria);
    process.exit(1);
  }

  const timeBasedCriteria = eligibilityCriteria.find(
    c => c.type === 'time_based' || c.id?.includes('time_based')
  );

  if (!timeBasedCriteria) {
    console.error('❌ No time-based criteria found');
    console.log('   Criteria items:', eligibilityCriteria.length);
    eligibilityCriteria.forEach((c, i) => {
      console.log(`   ${i + 1}. Type: ${c.type}, ID: ${c.id}`);
    });
    process.exit(1);
  }

  console.log('⏰ Current time restriction:');
  console.log('   Valid From:', timeBasedCriteria.valid_from);
  console.log('   Valid Until:', timeBasedCriteria.valid_until);
  console.log('');

  // Update expiration
  const oldExpiration = timeBasedCriteria.valid_until;
  timeBasedCriteria.valid_until = NEW_EXPIRATION;

  console.log('🔄 Updating expiration...');
  console.log('   From:', oldExpiration);
  console.log('   To:  ', NEW_EXPIRATION);
  console.log('   Date:', new Date(NEW_EXPIRATION).toLocaleString());
  console.log('');

  // Update in database
  const { data: updated, error: updateError } = await supabase
    .from('pod_modules')
    .update({
      eligibility_criteria: eligibilityCriteria,
      updated_at: new Date().toISOString(),
    })
    .eq('id', MODULE_ID)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Error updating module:', updateError);
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
  console.log('   Matches target:', updatedTimeBased.valid_until === NEW_EXPIRATION ? '✅ YES' : '❌ NO');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DATABASE UPDATE COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Module ID:', MODULE_ID);
  console.log('Old Expiration:', oldExpiration);
  console.log('New Expiration:', NEW_EXPIRATION);
  console.log('Extension: 22 days (Feb 6 → Feb 28, 2026)');
  console.log('');
  console.log('⚠️  NEXT STEP: Update on-chain expiration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('The Beta Tester HAT also has an on-chain time restriction.');
  console.log('You must update it via TimeBasedToggleModule contract.');
  console.log('');
  console.log('Steps:');
  console.log('1. Go to /pods in your app');
  console.log('2. Find "Beta Testers Pod"');
  console.log('3. Manage roles');
  console.log('4. Edit the Beta Tester role time restriction');
  console.log('5. Update expiration to Feb 28, 2026 23:59');
  console.log('6. Click "Commit Change" (gasless transaction)');
  console.log('');
  console.log('Or use TimeBasedToggleService programmatically.');
  console.log('See BETA_TESTER_HAT_UPDATE_GUIDE.md for details.');
  console.log('');
}

updateBetaTester()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
