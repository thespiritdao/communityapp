/**
 * Preview only — prints generated event dates without touching the DB.
 * Run: node scripts/preview-recurring-events.mjs
 */

const END_DATE = new Date('2026-12-31T23:59:59Z');

const SERIES = [
  { key: 'town-hall',      title: 'Town Hall',      day_of_week: 1, hour_est: 20, minute: 0, duration_minutes: 60  },
  { key: 'first-contact',  title: 'First Contact',  day_of_week: 3, hour_est: 12, minute: 0, duration_minutes: 45  },
  { key: 'feedback-loops', title: 'Feedback Loops', day_of_week: 5, hour_est: 12, minute: 0, duration_minutes: 60  },
];

function isEDT(date) {
  const year = date.getUTCFullYear();
  const marchStart = new Date(Date.UTC(year, 2, 1));
  const marchDay = marchStart.getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, (7 - marchDay) % 7 + 8));
  dstStart.setUTCHours(7, 0, 0, 0);
  const novStart = new Date(Date.UTC(year, 10, 1));
  const novDay = novStart.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, (7 - novDay) % 7 + 1));
  dstEnd.setUTCHours(6, 0, 0, 0);
  return date >= dstStart && date < dstEnd;
}

function nextWeekday(startFrom, dayOfWeek) {
  const d = new Date(startFrom);
  const diff = (dayOfWeek - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const HOLIDAYS_2026 = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19',
  '2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25',
]);
function isHoliday(date) { return HOLIDAYS_2026.has(date.toISOString().slice(0, 10)); }

for (const series of SERIES) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let current = nextWeekday(today, series.day_of_week);
  const occurrences = [];

  while (current <= END_DATE) {
    if (isHoliday(current)) { current = new Date(current); current.setUTCDate(current.getUTCDate() + 7); continue; }
    const utcOffset = isEDT(current) ? 4 : 5;
    const utcHour = series.hour_est + utcOffset;
    const eventStart = new Date(current);
    eventStart.setUTCHours(utcHour, series.minute, 0, 0);
    if (utcHour >= 24) {
      eventStart.setUTCDate(eventStart.getUTCDate() + 1);
      eventStart.setUTCHours(utcHour - 24, series.minute, 0, 0);
    }
    const tz = isEDT(current) ? 'EDT' : 'EST';
    const dateStr = current.toISOString().slice(0, 10).replace(/-/g, '');
    occurrences.push(`  ${DAY_NAMES[current.getUTCDay()]} ${current.toISOString().slice(0,10)}  ${series.hour_est}:00${series.minute===0?'':series.minute} ${tz}  (UTC: ${eventStart.toISOString()})  id: ${series.key}-${dateStr}`);
    current = new Date(current);
    current.setUTCDate(current.getUTCDate() + 7);
  }

  console.log(`\n=== ${series.title} — ${occurrences.length} occurrences ===`);
  // Print first 4 and last 2 as sample
  occurrences.slice(0, 4).forEach(l => console.log(l));
  if (occurrences.length > 6) console.log(`  ... (${occurrences.length - 6} more) ...`);
  occurrences.slice(-2).forEach(l => console.log(l));
}
