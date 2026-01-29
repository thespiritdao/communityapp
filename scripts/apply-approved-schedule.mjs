/**
 * Apply Approved Event Schedule
 *
 * Updates all 22 events from errors2.txt.txt with the new approved schedule.
 * Schedule pattern: Wed 12pm EST (First Contact), Fri 11am EST (Feedback Loops), Mon 8pm EST (Town Hall/Horizons alternating)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Approved schedule with EST times (will convert to UTC)
// EST is UTC-5
const APPROVED_SCHEDULE = {
  // Week 1
  'beta-first-contact-757050be2daa4613ae1bba4b6bf629cd': { date: '2026-01-29', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-feedback-loops-783b0f9941414dc4ba858ccbf588303c': { date: '2026-01-31', time: '11:00', duration: 60, series: 'Feedback Loops' }, // Fri 11am

  // Week 2
  'beta-town-hall-a8e38519d2b84e899bde78be08f47100': { date: '2026-02-02', time: '20:00', duration: 60, series: 'Town Hall' }, // Mon 8pm
  'beta-first-contact-a583c5babf1a416fa61ea26fca6f4179': { date: '2026-02-04', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-feedback-loops-9fc5bc0efc634614bda0121a62aa09ed': { date: '2026-02-06', time: '11:00', duration: 60, series: 'Feedback Loops' }, // Fri 11am

  // Week 3
  'beta-horizons-e213f5514754412e84b7c37eb466a5dc': { date: '2026-02-09', time: '20:00', duration: 90, series: 'Horizons' }, // Mon 8pm
  'beta-first-contact-10fb9ddb0cdc42d1b418fdcea7f0e86a': { date: '2026-02-11', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-feedback-loops-4f1c6983dcc54e7b9aece48f8e0accf7': { date: '2026-02-13', time: '11:00', duration: 60, series: 'Feedback Loops' }, // Fri 11am

  // Week 4
  'beta-town-hall-8f8b7ea190ee46c390757f2fe9bf0a23': { date: '2026-02-16', time: '20:00', duration: 60, series: 'Town Hall' }, // Mon 8pm
  'beta-first-contact-fef1cec945b940d1af87f87c53a29a68': { date: '2026-02-18', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-feedback-loops-9a02ea6ca89e4c139c654ac35a2ce2d1': { date: '2026-02-20', time: '11:00', duration: 60, series: 'Feedback Loops' }, // Fri 11am

  // Week 5
  'beta-horizons-86e01361dba441469630117dfc69d034': { date: '2026-02-23', time: '20:00', duration: 90, series: 'Horizons' }, // Mon 8pm
  'beta-first-contact-43ef3a48ede94104990ae7dc554d6947': { date: '2026-02-25', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-feedback-loops-a607eaa652ea419dae44d3f6debcfc85': { date: '2026-02-27', time: '11:00', duration: 60, series: 'Feedback Loops' }, // Fri 11am

  // Week 6
  'beta-town-hall-ae28bb3b64cb4f62a13edb93fed92711': { date: '2026-03-02', time: '20:00', duration: 60, series: 'Town Hall' }, // Mon 8pm
  'beta-first-contact-3dc329292c9e435d9fa8bdabfe58b6e3': { date: '2026-03-04', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-town-hall-a0b64e4a00e4409684aaa8258db7fbed': { date: '2026-03-06', time: '11:00', duration: 60, series: 'Town Hall' }, // Fri 11am (special)

  // Additional events to reach 22 total
  'beta-horizons-ca4e0b5285754b079eda3d4c409c921b': { date: '2026-03-09', time: '20:00', duration: 90, series: 'Horizons' }, // Mon 8pm
  'beta-first-contact-05a98201a9bb4d478015937001766428': { date: '2026-03-11', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm
  'beta-first-contact-75da64aed01949cc82cbe54892c0979d': { date: '2026-03-13', time: '11:00', duration: 45, series: 'First Contact' }, // Fri 11am (special)
  'beta-first-contact-1552e39bf7ae4d79ae6037a80e5d507c': { date: '2026-03-16', time: '20:00', duration: 45, series: 'First Contact' }, // Mon 8pm (special)
  'beta-first-contact-88f20409baa744f5a1a011b0028b4cd5': { date: '2026-03-18', time: '12:00', duration: 45, series: 'First Contact' }, // Wed 12pm (special)
};

/**
 * Convert EST to UTC
 * EST is UTC-5, so we add 5 hours
 */
function estToUtc(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Create date in UTC directly
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));

  return utcDate.toISOString().replace('T', ' ').replace('.000Z', '+00');
}

async function main() {
  console.log('📅 Applying Approved Event Schedule...\n');

  // Load events from errors2.txt.txt
  const eventsFilePath = path.join(process.cwd(), 'src', 'features', 'pods', 'errors2.txt.txt');
  const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
  const events = JSON.parse(eventsRaw);

  console.log(`📋 Found ${events.length} events in errors2.txt.txt\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of events) {
    const scheduleEntry = APPROVED_SCHEDULE[event.blockchain_event_id];

    if (!scheduleEntry) {
      console.log(`⏭️  Skipping "${event.title}" (${event.blockchain_event_id}) - not in approved schedule`);
      skipped++;
      continue;
    }

    // Calculate new dates
    const eventDate = estToUtc(scheduleEntry.date, scheduleEntry.time);
    const endDate = new Date(eventDate.replace('+00', 'Z'));
    endDate.setMinutes(endDate.getMinutes() + scheduleEntry.duration);
    const eventEndDate = endDate.toISOString().replace('T', ' ').replace('.000Z', '+00');

    console.log(`📅 Updating "${event.title}" (${scheduleEntry.series})`);
    console.log(`   Schedule: ${scheduleEntry.date} ${scheduleEntry.time} EST (${scheduleEntry.duration} min)`);
    console.log(`   Old:      ${event.event_date}`);
    console.log(`   New:      ${eventDate}`);
    console.log(`   End:      ${eventEndDate}`);

    // Update in database
    const { error: updateError } = await supabase
      .from('events')
      .update({
        event_date: eventDate,
        event_end_date: eventEndDate,
      })
      .eq('blockchain_event_id', event.blockchain_event_id);

    if (updateError) {
      console.error(`   ❌ Failed:`, updateError.message);
      failed++;
    } else {
      console.log(`   ✅ Updated`);
      updated++;
    }
    console.log('');
  }

  console.log('📊 Summary:');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log('');

  if (updated > 0) {
    console.log('✅ Event schedule updated!');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('   1. Start your dev server: npm run dev');
    console.log('   2. Log in with your admin account');
    console.log('   3. Visit http://localhost:3000/admin/bulk-events');
    console.log('   4. Click "Create Events (Gasless)"');
    console.log('');
    console.log('💰 Total cost: $0 (CDP Paymaster covers gas)');
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
