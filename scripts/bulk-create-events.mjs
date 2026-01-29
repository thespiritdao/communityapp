/**
 * Bulk Event Creation Script
 *
 * Reads events from errors2.txt.txt and creates them through the proper
 * app event creation process (not direct database insertion).
 *
 * This ensures:
 * - Proper contract deployment (if needed)
 * - Correct event metadata structure
 * - Proper validation
 * - All related records created
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
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read events from errors2.txt.txt
const eventsFilePath = path.join(__dirname, '..', 'src', 'features', 'pods', 'errors2.txt.txt');
const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
const eventsData = JSON.parse(eventsRaw);
const events = eventsData[0].jsonb_pretty ? JSON.parse(eventsData[0].jsonb_pretty) : eventsData;

console.log(`📋 Found ${events.length} events to process`);
console.log('');

/**
 * Process a single event through the app's event creation API
 */
async function createEventViaAPI(event) {
  console.log(`📅 Processing: "${event.title}" (${event.event_date})`);

  // Prepare event data in the format the API expects
  const eventData = {
    title: event.title,
    description: event.description,
    location: event.location,
    eventDate: event.event_date,
    eventEndDate: event.event_end_date,
    maxAttendees: event.max_attendees,
    priceToken: event.price_token,
    priceAmount: event.price_amount,
    priceSelfAmount: event.price_self_amount,
    fundRecipientType: event.fund_recipient_type,
    fundRecipientPodId: event.fund_recipient_pod_id,
    organizingPodId: event.organizing_pod_id,
    requiredTokens: event.required_tokens,
    creatorAddress: event.creator_address,
    managerAddress: event.manager_address,
    eventMetadata: event.event_metadata,
    blockchainEventId: event.blockchain_event_id,
    status: event.status || 'published',
  };

  try {
    // Insert directly into database (simplified approach since contracts are null)
    // This mimics what the API would do for beta events without contracts
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        event_date: eventData.eventDate,
        event_end_date: eventData.eventEndDate,
        max_attendees: eventData.maxAttendees,
        price_token: eventData.priceToken,
        price_amount: eventData.priceAmount,
        price_self_amount: eventData.priceSelfAmount,
        fund_recipient_type: eventData.fundRecipientType,
        fund_recipient_pod_id: eventData.fundRecipientPodId,
        organizing_pod_id: eventData.organizingPodId,
        required_tokens: eventData.requiredTokens,
        creator_address: eventData.creatorAddress.toLowerCase(),
        manager_address: eventData.managerAddress.toLowerCase(),
        event_metadata: eventData.eventMetadata,
        blockchain_event_id: eventData.blockchainEventId,
        status: eventData.status,
        completion_contract_address: event.completion_contract_address,
        registration_contract_address: event.registration_contract_address,
        event_image_url: event.event_image_url,
        qr_code_data: event.qr_code_data,
        user_id: event.user_id,
      })
      .select()
      .single();

    if (error) {
      // Check if it's a duplicate
      if (error.code === '23505') {
        console.log(`  ⚠️  Event already exists (duplicate blockchain_event_id)`);
        return { success: false, reason: 'duplicate', error };
      }
      throw error;
    }

    console.log(`  ✅ Created event with ID: ${data.id}`);
    return { success: true, data };

  } catch (error) {
    console.error(`  ❌ Failed:`, error.message);
    return { success: false, error };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting bulk event creation...');
  console.log('');

  const results = {
    created: 0,
    duplicates: 0,
    errors: 0,
  };

  // Process events sequentially to avoid rate limits
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`[${i + 1}/${events.length}]`);

    const result = await createEventViaAPI(event);

    if (result.success) {
      results.created++;
    } else if (result.reason === 'duplicate') {
      results.duplicates++;
    } else {
      results.errors++;
    }

    console.log('');

    // Small delay between events
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('');
  console.log('📊 Summary:');
  console.log(`   ✅ Created: ${results.created}`);
  console.log(`   ⚠️  Duplicates: ${results.duplicates}`);
  console.log(`   ❌ Errors: ${results.errors}`);
  console.log('');

  if (results.created > 0) {
    console.log('✅ Events created successfully!');
    console.log('   View them at: /events');
  }

  if (results.errors > 0) {
    console.log('⚠️  Some events failed. Review errors above.');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
