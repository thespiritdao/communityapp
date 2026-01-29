/**
 * Check if Events Exist On-Chain
 *
 * Verifies which events from errors2.txt.txt actually exist on the EventManager contract
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER;

const EVENT_MANAGER_ABI = [
  {
    inputs: [{ name: 'eventId', type: 'string' }],
    name: 'events',
    outputs: [
      { name: 'eventId', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'eventDate', type: 'uint256' },
      { name: 'fundRecipient', type: 'address' },
      { name: 'priceSystem', type: 'uint256' },
      { name: 'priceSelf', type: 'uint256' },
      { name: 'maxAttendees', type: 'uint256' },
      { name: 'currentAttendees', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

async function checkEventOnChain(blockchainEventId) {
  try {
    const result = await publicClient.readContract({
      address: EVENT_MANAGER_ADDRESS,
      abi: EVENT_MANAGER_ABI,
      functionName: 'events',
      args: [blockchainEventId],
    });

    // If eventId is empty string, event doesn't exist
    return result[0] !== '';
  } catch (error) {
    console.error(`Error checking ${blockchainEventId}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Checking which events exist on-chain...\n');
  console.log(`EventManager: ${EVENT_MANAGER_ADDRESS}\n`);

  // Load events from errors2.txt.txt
  const eventsFilePath = path.join(process.cwd(), 'src', 'features', 'pods', 'errors2.txt.txt');
  const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
  const events = JSON.parse(eventsRaw);

  console.log(`📋 Found ${events.length} events in errors2.txt.txt\n`);

  const results = {
    onChain: [],
    notOnChain: [],
  };

  for (const event of events) {
    const exists = await checkEventOnChain(event.blockchain_event_id);

    if (exists) {
      console.log(`✅ ON-CHAIN:     "${event.title}" (${event.blockchain_event_id})`);
      results.onChain.push(event);
    } else {
      console.log(`❌ NOT ON-CHAIN: "${event.title}" (${event.blockchain_event_id})`);
      results.notOnChain.push(event);
    }

    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ On-chain:     ${results.onChain.length}`);
  console.log(`   ❌ Not on-chain: ${results.notOnChain.length}`);
  console.log('');

  if (results.notOnChain.length > 0) {
    console.log('⚠️  Events need to be created on-chain!');
    console.log('');
    console.log('📋 Events NOT on-chain:');
    results.notOnChain.forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.title} - ${event.blockchain_event_id}`);
    });
  } else {
    console.log('✅ All events are already on-chain!');
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
