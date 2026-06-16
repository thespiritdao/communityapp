/**
 * API Route: Batch Create Events (Gasless via CDP)
 *
 * POST /api/events/batch-create-gasless
 *
 * Creates multiple events on-chain using CDP Smart Account (gasless),
 * then stores them in the database.
 *
 * This endpoint is designed to be called server-side or with proper authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { supabase } from '@/lib/supabase';
import { getWriteTransport } from '@/utils/rpcClient';

export const runtime = 'nodejs'; // Need Node.js for viem

// Event Manager ABI
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

interface EventToCreate {
  title: string;
  description: string;
  event_date: string;
  event_end_date: string;
  location: string;
  max_attendees: number;
  price_amount: string;
  price_self_amount: string;
  blockchain_event_id: string;
  manager_address: string;
  organizing_pod_id?: string;
  fund_recipient_pod_id?: string;
  required_tokens?: string[];
}

interface BatchCreateRequest {
  events: EventToCreate[];
  usePaymaster?: boolean; // Not implemented yet, but placeholder for future CDP integration
}

/**
 * Convert string to bytes32
 */
function stringToBytes32(str: string): `0x${string}` {
  const bytes32 = '0x' + Buffer.from(str).toString('hex').padEnd(64, '0').slice(0, 64);
  return bytes32 as `0x${string}`;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate: this is an admin-only endpoint, require internal API key
    const internalKey = request.headers.get('X-Internal-Key');
    const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!internalKey || internalKey !== INTERNAL_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: admin access required' },
        { status: 401 }
      );
    }

    const body: BatchCreateRequest = await request.json();
    const { events, usePaymaster = false } = body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No events provided',
        },
        { status: 400 }
      );
    }

    console.log(`📋 Batch creating ${events.length} events...`);

    // Setup wallet client (server-side)
    const PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
    const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER;

    if (!PRIVATE_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing ADMIN_PRIVATE_KEY or PRIVATE_KEY',
        },
        { status: 500 }
      );
    }

    if (!EVENT_MANAGER_ADDRESS) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing NEXT_PUBLIC_EVENT_MANAGER',
        },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: getWriteTransport(),
    }).extend(publicActions);

    console.log(`👛 Using account: ${account.address}`);
    console.log(`📍 EventManager: ${EVENT_MANAGER_ADDRESS}`);

    const results = {
      created: [] as string[],
      failed: [] as { event: string; error: string }[],
      skipped: [] as string[],
    };

    // Process events sequentially
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      console.log(`\n[${i + 1}/${events.length}] Processing: "${event.title}"`);

      try {
        // Check if event already exists in database
        const { data: existing } = await supabase
          .from('events')
          .select('id, completion_contract_address, registration_contract_address')
          .eq('blockchain_event_id', event.blockchain_event_id)
          .single();

        if (existing?.completion_contract_address || existing?.registration_contract_address) {
          console.log(`  ⏭️  Already has contracts - skipping`);
          results.skipped.push(event.title);
          continue;
        }

        // Prepare transaction parameters
        const eventDate = Math.floor(new Date(event.event_date).getTime() / 1000);
        const eventIdBytes32 = stringToBytes32(event.blockchain_event_id);
        const fundRecipient = event.manager_address as `0x${string}`;
        const priceSystem = BigInt(Math.floor((parseFloat(event.price_amount) || 0) * 1e18));
        const priceSelf = BigInt(Math.floor((parseFloat(event.price_self_amount) || 0) * 1e18));
        const maxAttendees = BigInt(event.max_attendees || 0);

        console.log(`  📝 Creating on-chain...`);

        // Create event on-chain
        const hash = await walletClient.writeContract({
          address: EVENT_MANAGER_ADDRESS as `0x${string}`,
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

          // Update or insert in database
          if (existing) {
            // Update existing event
            const { error: updateError } = await supabase
              .from('events')
              .update({
                registration_contract_address: EVENT_MANAGER_ADDRESS,
                completion_contract_address: EVENT_MANAGER_ADDRESS,
                status: 'published',
              })
              .eq('blockchain_event_id', event.blockchain_event_id);

            if (updateError) {
              console.error(`  ⚠️  Database update failed:`, updateError);
            } else {
              console.log(`  ✅ Database updated`);
            }
          } else {
            // Insert new event
            const { error: insertError } = await supabase
              .from('events')
              .insert({
                title: event.title,
                description: event.description,
                event_date: event.event_date,
                event_end_date: event.event_end_date,
                location: event.location,
                max_attendees: event.max_attendees,
                price_amount: event.price_amount,
                price_self_amount: event.price_self_amount,
                price_token: 'free',
                blockchain_event_id: event.blockchain_event_id,
                creator_address: event.manager_address.toLowerCase(),
                manager_address: event.manager_address.toLowerCase(),
                organizing_pod_id: event.organizing_pod_id,
                fund_recipient_pod_id: event.fund_recipient_pod_id,
                fund_recipient_type: 'pod',
                required_tokens: event.required_tokens || [],
                registration_contract_address: EVENT_MANAGER_ADDRESS,
                completion_contract_address: EVENT_MANAGER_ADDRESS,
                status: 'published',
                event_metadata: JSON.stringify({
                  title: event.title,
                  description: event.description,
                  location: event.location,
                  created_by: event.manager_address,
                  creation_date: new Date().toISOString(),
                  event_type: 'community_event',
                  blockchain_event_id: event.blockchain_event_id,
                }),
              });

            if (insertError) {
              console.error(`  ⚠️  Database insert failed:`, insertError);
            } else {
              console.log(`  ✅ Database inserted`);
            }
          }

          results.created.push(event.title);
        } else {
          throw new Error('Transaction reverted');
        }

        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error: any) {
        console.error(`  ❌ Failed:`, error.message);
        results.failed.push({
          event: event.title,
          error: error.message,
        });
      }
    }

    console.log('');
    console.log('📊 Batch Creation Summary:');
    console.log(`   ✅ Created: ${results.created.length}`);
    console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
    console.log(`   ❌ Failed: ${results.failed.length}`);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: events.length,
        created: results.created.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
      },
    });

  } catch (error: any) {
    console.error('❌ Batch creation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create events',
      },
      { status: 500 }
    );
  }
}
