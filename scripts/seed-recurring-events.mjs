/**
 * Seed recurring weekly events directly into Supabase (DB-only, no on-chain).
 * Run: node scripts/seed-recurring-events.mjs
 *
 * Schedules 3 weekly series from today through Dec 31 2026:
 *   - Town Hall       — Mondays   8:00pm EST (01:00 UTC Tuesday), 1 hour
 *   - First Contact   — Wednesdays 12:00pm EST (17:00 UTC), 45 min
 *   - Feedback Loops  — Fridays   12:00pm EST (17:00 UTC), 1 hour
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env manually (no dotenv dependency needed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const envVars = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) envVars[match[1]] = match[2].trim();
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY // bypass RLS
);

const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

// US federal holidays 2026 (fixed + observed dates, YYYY-MM-DD)
const HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day (3rd Mon Jan)
  '2026-02-16', // Presidents' Day (3rd Mon Feb)
  '2026-05-25', // Memorial Day (last Mon May)
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day observed (Jul 4 is Sat)
  '2026-09-07', // Labor Day (1st Mon Sep)
  '2026-10-12', // Columbus Day (2nd Mon Oct)
  '2026-11-11', // Veterans Day
  '2026-11-26', // Thanksgiving (4th Thu Nov)
  '2026-12-25', // Christmas Day
]);

function isHoliday(date) {
  return HOLIDAYS_2026.has(date.toISOString().slice(0, 10));
}
const CREATOR_ADDRESS = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';
const END_DATE = new Date('2026-12-31T23:59:59Z');

// Series definitions
// EST offset: UTC-5 (standard) / UTC-4 (daylight saving)
// We store UTC. For simplicity we use fixed UTC offsets and note DST shifts inline.
// Mondays 8pm EST = Tuesday 01:00 UTC (EST, Nov-Mar) / Monday 00:00 UTC (EDT, Mar-Nov)
// We generate dates and apply correct UTC offset per date using JS Date logic.
const SERIES = [
  {
    key: 'town-hall',
    title: 'Town Hall',
    description: 'Town Hall is a standing community gathering with the purpose of creating space for conversation, questions, and shared presence.',
    location: 'https://meet.google.com/twa-ghig-qxp',
    max_attendees: 100,
    duration_minutes: 60,
    metadata: { cta: 'Join Town Hall', series: 'Town Hall', tagline: 'Your voice, heard.' },
    // Mondays 8pm EST
    day_of_week: 1, // 0=Sun, 1=Mon
    hour_est: 20,
    minute: 0,
  },
  {
    key: 'first-contact',
    title: 'First Contact',
    description: "First Contact is the official starting point for new members of the SpiritDAO Community App. You'll get a peer-to-peer orientation into how participation works here: events, profiles, and how to take your first meaningful actions once you're inside.",
    location: 'https://meet.google.com/twa-ghig-qxp',
    max_attendees: 50,
    duration_minutes: 45,
    metadata: { cta: 'Join First Contact', series: 'First Contact', tagline: 'Your peer-to-peer orientation into participation.' },
    // Wednesdays 12pm EST
    day_of_week: 3, // Wed
    hour_est: 12,
    minute: 0,
  },
  {
    key: 'feedback-loops',
    title: 'Feedback Loops',
    description: "Feedback Loops is a live working session where the community helps shape the SpiritDAO Community App. We'll review recent changes, present bugs, and what remains unclear. Then we'll turn to you for your insights into your app experience. Anything confusing, slowing you down, or surprising you? Let us know!",
    location: 'https://meet.google.com/twa-ghig-qxp',
    max_attendees: 40,
    duration_minutes: 60,
    metadata: { cta: 'Join Feedback Loops', series: 'Feedback Loops', tagline: 'Co-creating the experience in public.' },
    // Fridays 12pm EST
    day_of_week: 5, // Fri
    hour_est: 12,
    minute: 0,
  },
];

/**
 * Returns true if date is in US Eastern Daylight Time (EDT, UTC-4).
 * EDT runs from second Sunday in March to first Sunday in November.
 */
function isEDT(date) {
  const year = date.getUTCFullYear();

  // Second Sunday in March
  const marchStart = new Date(Date.UTC(year, 2, 1));
  const marchDay = marchStart.getUTCDay(); // 0=Sun
  const dstStart = new Date(Date.UTC(year, 2, (7 - marchDay) % 7 + 8)); // second Sunday
  dstStart.setUTCHours(7, 0, 0, 0); // 2am EST = 7am UTC

  // First Sunday in November
  const novStart = new Date(Date.UTC(year, 10, 1));
  const novDay = novStart.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, (7 - novDay) % 7 + 1)); // first Sunday
  dstEnd.setUTCHours(6, 0, 0, 0); // 2am EDT = 6am UTC

  return date >= dstStart && date < dstEnd;
}

/**
 * Get next occurrence of a given day_of_week on or after startFrom.
 */
function nextWeekday(startFrom, dayOfWeek) {
  const d = new Date(startFrom);
  const currentDay = d.getUTCDay();
  const diff = (dayOfWeek - currentDay + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * Generate all weekly occurrences of a series from today through END_DATE.
 */
function generateOccurrences(series) {
  const occurrences = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let current = nextWeekday(today, series.day_of_week);

  while (current <= END_DATE) {
    if (isHoliday(current)) {
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + 7);
      continue;
    }

    // Determine UTC offset: EDT = -4, EST = -5
    const utcOffset = isEDT(current) ? 4 : 5;
    const utcHour = series.hour_est + utcOffset;

    const eventStart = new Date(current);
    eventStart.setUTCHours(utcHour, series.minute, 0, 0);
    // Handle day rollover (e.g. Mon 8pm EST = Tue 01:00 UTC)
    if (utcHour >= 24) {
      eventStart.setUTCDate(eventStart.getUTCDate() + 1);
      eventStart.setUTCHours(utcHour - 24, series.minute, 0, 0);
    }

    const eventEnd = new Date(eventStart.getTime() + series.duration_minutes * 60 * 1000);

    // Generate a stable, unique blockchain_event_id from series key + date
    const dateStr = current.toISOString().slice(0, 10).replace(/-/g, '');
    const blockchainId = `${series.key}-${dateStr}`;

    occurrences.push({
      title: series.title,
      description: series.description,
      event_date: eventStart.toISOString(),
      event_end_date: eventEnd.toISOString(),
      location: series.location,
      max_attendees: series.max_attendees,
      price_amount: '0',
      price_self_amount: '0',
      price_token: 'free',
      blockchain_event_id: blockchainId,
      creator_address: CREATOR_ADDRESS,
      manager_address: CREATOR_ADDRESS,
      organizing_pod_id: EXEC_POD_ID,
      fund_recipient_pod_id: EXEC_POD_ID,
      fund_recipient_type: 'pod',
      required_tokens: [],
      status: 'published',
      event_metadata: JSON.stringify(series.metadata),
    });

    // Advance one week
    current = new Date(current);
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return occurrences;
}

async function main() {
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const series of SERIES) {
    const occurrences = generateOccurrences(series);
    console.log(`\n[${series.title}] ${occurrences.length} occurrences to insert`);

    for (const event of occurrences) {
      // Check for existing row with same blockchain_event_id (idempotent)
      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('blockchain_event_id', event.blockchain_event_id)
        .maybeSingle();

      if (existing) {
        process.stdout.write('s');
        totalSkipped++;
        continue;
      }

      const { error } = await supabase.from('events').insert(event);

      if (error) {
        console.error(`\n  FAILED ${event.blockchain_event_id}:`, error.message);
        totalFailed++;
      } else {
        process.stdout.write('.');
        totalInserted++;
      }
    }
  }

  console.log('\n\nDone.');
  console.log(`  Inserted: ${totalInserted}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Failed:   ${totalFailed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
