/**
 * Create Events On-Chain Script
 *
 * Reads events from errors2.txt.txt and creates them on-chain via EventManager contract,
 * then stores them in the database with the proper blockchain reference.
 */

import { createWalletClient, http, publicActions, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
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

// Wallet setup
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!ADMIN_PRIVATE_KEY) {
  console.error('❌ Missing ADMIN_PRIVATE_KEY or PRIVATE_KEY');
  process.exit(1);
}

const account = privateKeyToAccount(ADMIN_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
}).extend(publicActions);

// Event Manager contract
const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER;
if (!EVENT_MANAGER_ADDRESS) {
  console.error('❌ Missing NEXT_PUBLIC_EVENT_MANAGER');
  process.exit(1);
}

// Simple EventManager ABI - just the createEvent function
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
  // EventManager expects a bytes32 eventId
  // We'll use keccak256 hash of the string
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  // For simplicity, just pad/truncate to 32 bytes
  const bytes32 = '0x' + Buffer.from(str).toString('hex').padEnd(64, '0').slice(0, 64);
  return bytes32;
}

/**
 * Create a single event on-chain
 */
async function createEventOnChain(event) {
  console.log(`📅 Creating on-chain: "${event.title}" (${event.event_date})`);

  try {
    // Convert event date to Unix timestamp
    const eventDate = Math.floor(new Date(event.event_date).getTime() / 1000);

    // Convert blockchain_event_id to bytes32
    const eventIdBytes32 = stringToBytes32(event.blockchain_event_id);

    // Prepare transaction parameters
    const fundRecipient = event.manager_address || account.address;
    const priceSystem = parseEther(event.price_amount || '0');
    const priceSelf = parseEther(event.price_self_amount || '0');
    const maxAttendees = BigInt(event.max_attendees || 0);

    console.log('  📝 Transaction params:', {
      eventId: eventIdBytes32,
      title: event.title,
      eventDate,
      fundRecipient,
      priceSystem: priceSystem.toString(),
      priceSelf: priceSelf.toString(),
      maxAttendees: maxAttendees.toString(),
    });

    // Send transaction
    const hash = await walletClient.writeContract({
      address: EVENT_MANAGER_ADDRESS,
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

    console.log(`  ⏳ Transaction sent: ${hash}`);

    // Wait for confirmation
    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`  ✅ Event created on-chain (block ${receipt.blockNumber})`);
      return { success: true, hash, receipt };
    } else {
      console.log(`  ❌ Transaction failed`);
      return { success: false, error: 'Transaction reverted' };
    }
  } catch (error) {
    console.error(`  ❌ Failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update event in database with on-chain status
 */
async function updateEventInDatabase(event, txHash) {
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
  console.log('🚀 Starting on-chain event creation...');
  console.log(`📍 Using EventManager: ${EVENT_MANAGER_ADDRESS}`);
  console.log(`👛 Using account: ${account.address}`);
  console.log('');

  const results = {
    created: 0,
    failed: 0,
    skipped: 0,
  };

  // Process events sequentially to avoid nonce issues
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

    // Create on-chain
    const result = await createEventOnChain(event);

    if (result.success) {
      // Update database
      await updateEventInDatabase(event, result.hash);
      results.created++;
    } else {
      results.failed++;
    }

    console.log('');

    // Small delay between transactions
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('');
  console.log('📊 Summary:');
  console.log(`   ✅ Created on-chain: ${results.created}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log('');

  if (results.created > 0) {
    console.log('✅ Events created on blockchain!');
    console.log('   View them at: /events');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
