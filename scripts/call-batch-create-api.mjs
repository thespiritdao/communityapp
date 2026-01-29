/**
 * Call Batch Create Events API
 *
 * Calls the /api/events/batch-create-gasless endpoint to create
 * all events from errors2.txt.txt on-chain using CDP Paymaster.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Read events from errors2.txt.txt
const eventsFilePath = path.join(__dirname, '..', 'src', 'features', 'pods', 'errors2.txt.txt');
const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
const eventsData = JSON.parse(eventsRaw);
const events = eventsData[0]?.jsonb_pretty ? JSON.parse(eventsData[0].jsonb_pretty) : eventsData;

console.log(`📋 Found ${events.length} events to create`);
console.log('');

// Determine API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const endpoint = `${API_URL}/api/events/batch-create-gasless`;

console.log(`🚀 Calling API: ${endpoint}`);
console.log('');

async function main() {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: events,
        usePaymaster: true,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', result.error || response.statusText);
      process.exit(1);
    }

    console.log('');
    console.log('✅ Batch creation complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   ✅ Created: ${result.summary.created}`);
    console.log(`   ⏭️  Skipped: ${result.summary.skipped}`);
    console.log(`   ❌ Failed: ${result.summary.failed}`);
    console.log('');

    if (result.results.created.length > 0) {
      console.log('✅ Successfully created events:');
      result.results.created.forEach((title, i) => {
        console.log(`   ${i + 1}. ${title}`);
      });
      console.log('');
    }

    if (result.results.failed.length > 0) {
      console.log('❌ Failed events:');
      result.results.failed.forEach(({ event, error }, i) => {
        console.log(`   ${i + 1}. ${event}: ${error}`);
      });
      console.log('');
    }

    if (result.results.skipped.length > 0) {
      console.log('⏭️  Skipped events (already created):');
      result.results.skipped.forEach((title, i) => {
        console.log(`   ${i + 1}. ${title}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
