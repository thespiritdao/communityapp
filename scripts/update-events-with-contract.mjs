/**
 * Update Events with Contract Address
 *
 * Since these are beta events that don't actually need on-chain verification,
 * we can just update the database to point to the EventManager contract.
 * This allows the app to work without actually creating events on-chain.
 *
 * This is a pragmatic solution for beta testing.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Event Manager contract
const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER;
if (!EVENT_MANAGER_ADDRESS) {
  console.error('❌ Missing NEXT_PUBLIC_EVENT_MANAGER');
  process.exit(1);
}

// Read events from errors2.txt.txt
const eventsFilePath = path.join(__dirname, '..', 'src', 'features', 'pods', 'errors2.txt.txt');
const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
const eventsData = JSON.parse(eventsRaw);
const events = eventsData[0]?.jsonb_pretty ? JSON.parse(eventsData[0].jsonb_pretty) : eventsData;

console.log(`📋 Found ${events.length} events to process`);
console.log('');

async function updateEvent(event) {
  console.log(`📅 Updating: "${event.title}" (${event.event_date})`);

  try {
    const { data, error } = await supabase
      .from('events')
      .update({
        registration_contract_address: EVENT_MANAGER_ADDRESS,
        completion_contract_address: EVENT_MANAGER_ADDRESS,
        status: 'published',
      })
      .eq('blockchain_event_id', event.blockchain_event_id)
      .select()
      .single();

    if (error) {
      console.log(`  ❌ Failed:`, error.message);
      return { success: false, error };
    }

    console.log(`  ✅ Updated with contract address`);
    return { success: true };

  } catch (error) {
    console.error(`  ❌ Failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Updating events with contract address...');
  console.log(`📍 Using EventManager: ${EVENT_MANAGER_ADDRESS}`);
  console.log('');
  console.log('⚠️  NOTE: This does NOT create events on-chain.');
  console.log('   It only updates the database to reference the EventManager contract.');
  console.log('   This is sufficient for beta testing if you disable on-chain verification.');
  console.log('');

  const results = {
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  // Process events sequentially
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`[${i + 1}/${events.length}]`);

    // Skip events that already have contracts
    if (event.completion_contract_address || event.registration_contract_address) {
      console.log(`  ⏭️  Skipping "${event.title}" - already has contracts`);
      results.skipped++;
      console.log('');
      continue;
    }

    const result = await updateEvent(event);

    if (result.success) {
      results.updated++;
    } else {
      results.failed++;
    }

    console.log('');
  }

  // Summary
  console.log('');
  console.log('📊 Summary:');
  console.log(`   ✅ Updated: ${results.updated}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log('');

  if (results.updated > 0) {
    console.log('✅ Events updated successfully!');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('   1. Update EventRegistrationModal to skip on-chain verification for beta events');
    console.log('   2. Or: Fund admin account and create events on-chain properly');
    console.log('');
    console.log('   For now, you can temporarily disable the on-chain check in:');
    console.log('   src/features/events/components/EventRegistrationModal.tsx');
    console.log('');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
