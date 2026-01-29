/**
 * Create Events On-Chain (Gasless via CDP Paymaster)
 *
 * Uses Coinbase Developer Platform to create events gaslessly,
 * just like the app's event creation flow.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { encodeFunctionData } from 'viem';

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

// EventManager ABI
const EVENT_MANAGER_ABI = [
  {
    inputs: [
      { name: 'eventId', type: 'bytes32' },
      { name: 'title', type: 'string' },
      { name: 'eventDate', type: 'uint256' },
      { name: 'fundRecipient', type: 'address' },
      { name: 'priceSystem', type: 'uint256' },
      { name: 'priceSelf', type: 'uint256' },
      { name: 'maxAttendees', type: 'uint256' },
    ],
    name: 'createEvent',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Read events from errors2.txt.txt
const eventsFilePath = path.join(__dirname, '..', 'src', 'features', 'pods', 'errors2.txt.txt');
const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
const eventsData = JSON.parse(eventsRaw);
const events = eventsData[0]?.jsonb_pretty ? JSON.parse(eventsData[0].jsonb_pretty) : eventsData;

console.log(`📋 Found ${events.length} events to process`);
console.log('');

/**
 * Convert blockchain_event_id string to bytes32
 */
function stringToBytes32(str) {
  const bytes32 = '0x' + Buffer.from(str).toString('hex').padEnd(64, '0').slice(0, 64);
  return bytes32;
}

/**
 * Generate transaction data for event creation
 */
function getEventCreationData(event) {
  const eventDate = Math.floor(new Date(event.event_date).getTime() / 1000);
  const eventIdBytes32 = stringToBytes32(event.blockchain_event_id);
  const fundRecipient = event.manager_address || '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

  // Convert to wei (assuming amounts are in ether)
  const priceSystem = BigInt(Math.floor((parseFloat(event.price_amount) || 0) * 1e18));
  const priceSelf = BigInt(Math.floor((parseFloat(event.price_self_amount) || 0) * 1e18));
  const maxAttendees = BigInt(event.max_attendees || 0);

  const data = encodeFunctionData({
    abi: EVENT_MANAGER_ABI,
    functionName: 'createEvent',
    args: [
      eventIdBytes32,
      event.title,
      BigInt(eventDate),
      fundRecipient,
      priceSystem,
      priceSelf,
      maxAttendees,
    ],
  });

  return {
    to: EVENT_MANAGER_ADDRESS,
    data,
    eventIdBytes32,
    eventDate,
    fundRecipient,
    priceSystem: priceSystem.toString(),
    priceSelf: priceSelf.toString(),
    maxAttendees: maxAttendees.toString(),
  };
}

/**
 * Update event in database with on-chain status
 */
async function updateEventInDatabase(event) {
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
      console.log(`  ⚠️  Database update failed:`, error.message);
      return false;
    }

    console.log(`  ✅ Database updated with contract address`);
    return true;
  } catch (error) {
    console.error(`  ❌ Database error:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Preparing gasless event creation transactions...');
  console.log(`📍 Using EventManager: ${EVENT_MANAGER_ADDRESS}`);
  console.log('');
  console.log('⚠️  IMPORTANT: This script generates transaction data.');
  console.log('   You need to execute these transactions through your CDP-enabled app.');
  console.log('');

  const eventsToCreate = [];

  // Process events
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Skip events that already have contracts
    if (event.completion_contract_address || event.registration_contract_address) {
      console.log(`⏭️  Skipping "${event.title}" (${event.event_date}) - already has contracts`);
      continue;
    }

    console.log(`📅 Preparing: "${event.title}" (${event.event_date})`);
    const txData = getEventCreationData(event);

    console.log(`  📝 Transaction params:`, {
      eventId: txData.eventIdBytes32,
      title: event.title,
      eventDate: txData.eventDate,
      fundRecipient: txData.fundRecipient,
      priceSystem: txData.priceSystem,
      priceSelf: txData.priceSelf,
      maxAttendees: txData.maxAttendees,
    });

    eventsToCreate.push({
      event,
      txData,
    });

    console.log('');
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`   📝 Events to create: ${eventsToCreate.length}`);
  console.log('');

  // Generate batch transaction file
  const batchTxFile = {
    network: 'base',
    contractAddress: EVENT_MANAGER_ADDRESS,
    transactions: eventsToCreate.map(({ event, txData }) => ({
      title: event.title,
      eventDate: event.event_date,
      blockchain_event_id: event.blockchain_event_id,
      to: txData.to,
      data: txData.data,
    })),
  };

  const outputPath = path.join(__dirname, 'event-transactions.json');
  fs.writeFileSync(outputPath, JSON.stringify(batchTxFile, null, 2));

  console.log('✅ Transaction data generated!');
  console.log(`📄 Saved to: ${outputPath}`);
  console.log('');
  console.log('📋 Next Steps:');
  console.log('');
  console.log('1. Option A: Use the API endpoint (recommended):');
  console.log('   Create an API endpoint at /api/events/batch-create that:');
  console.log('   - Reads event-transactions.json');
  console.log('   - Uses CDP hooks to send gasless transactions');
  console.log('   - Updates database after each success');
  console.log('');
  console.log('2. Option B: Manual creation through UI:');
  console.log('   - Visit /events/create in your app');
  console.log('   - Create each event manually (app will use CDP Paymaster)');
  console.log('');
  console.log('3. Option C: Use the batch transaction script (I can create this):');
  console.log('   - A Node.js script that calls your API endpoint');
  console.log('   - Sends each transaction one by one with delays');
  console.log('');
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
