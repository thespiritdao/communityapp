/**
 * Update Event Dates to Future
 *
 * Shifts all event dates forward by a number of weeks to make them in the future.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How many weeks to shift forward?
const WEEKS_FORWARD = 4; // Shift all events 4 weeks into the future

async function main() {
  console.log(`🚀 Updating event dates (shifting ${WEEKS_FORWARD} weeks forward)...`);
  console.log('');

  // Get all events
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, event_date, event_end_date, blockchain_event_id')
    .order('event_date');

  if (error) {
    console.error('❌ Failed to fetch events:', error);
    return;
  }

  console.log(`📋 Found ${events.length} events`);
  console.log('');

  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    const currentDate = new Date(event.event_date);
    const currentEndDate = new Date(event.event_end_date);

    // Calculate new dates (add WEEKS_FORWARD weeks)
    const newDate = new Date(currentDate.getTime() + (WEEKS_FORWARD * 7 * 24 * 60 * 60 * 1000));
    const newEndDate = new Date(currentEndDate.getTime() + (WEEKS_FORWARD * 7 * 24 * 60 * 60 * 1000));

    // Check if new date is in the future
    if (newDate <= new Date()) {
      console.log(`⏭️  Skipping "${event.title}" - still in past after shift`);
      skipped++;
      continue;
    }

    console.log(`📅 Updating "${event.title}"`);
    console.log(`   Old: ${currentDate.toISOString()}`);
    console.log(`   New: ${newDate.toISOString()}`);

    const { error: updateError } = await supabase
      .from('events')
      .update({
        event_date: newDate.toISOString(),
        event_end_date: newEndDate.toISOString(),
      })
      .eq('id', event.id);

    if (updateError) {
      console.error(`   ❌ Failed:`, updateError.message);
    } else {
      console.log(`   ✅ Updated`);
      updated++;
    }
    console.log('');
  }

  console.log('📊 Summary:');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log('');

  if (updated > 0) {
    console.log('✅ Event dates updated! Now you can create them on-chain.');
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
