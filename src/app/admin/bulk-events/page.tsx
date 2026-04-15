'use client';

/**
 * Admin Bulk Event Creation Page
 *
 * Creates all events from errors2.txt.txt on-chain using CDP Paymaster (gasless).
 * Must be logged in with admin account.
 */

import { useState, useEffect } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { encodeFunctionData } from 'viem';

const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER as `0x${string}`;

const EVENT_MANAGER_ABI = [
  {
    inputs: [
      { name: 'eventId', type: 'string' },
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
] as const;

interface EventData {
  title: string;
  event_date: string;
  blockchain_event_id: string;
  manager_address: string;
  max_attendees: number;
  price_amount: string;
  price_self_amount: string;
}

export default function BulkEventsPage() {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();

  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{
    created: string[];
    failed: Array<{ event: string; error: string }>;
  }>({
    created: [],
    failed: [],
  });

  // Load events from API
  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch('/api/events/bulk-events-data');
        const data = await response.json();
        if (data.success) {
          setEvents(data.events);
        } else {
          console.error('Failed to load events:', data.error);
        }
      } catch (error) {
        console.error('Error loading events:', error);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  const createEvent = async (event: EventData) => {
    console.log(`📅 Creating: "${event.title}"`);

    const smartAccount = currentUser?.evmSmartAccounts?.[0];
    if (!smartAccount) {
      throw new Error('No smart account found');
    }

    const eventDate = Math.floor(new Date(event.event_date).getTime() / 1000);
    const eventId = event.blockchain_event_id; // Use string directly, not bytes32
    const fundRecipient = event.manager_address as `0x${string}`;
    const priceSystem = BigInt(Math.floor((parseFloat(event.price_amount) || 0) * 1e18));
    const priceSelf = BigInt(Math.floor((parseFloat(event.price_self_amount) || 0) * 1e18));
    const maxAttendees = BigInt(event.max_attendees || 0);

    console.log('📝 Event creation params:', {
      eventId,
      title: event.title,
      eventDate,
      fundRecipient,
      priceSystem: priceSystem.toString(),
      priceSelf: priceSelf.toString(),
      maxAttendees: maxAttendees.toString(),
    });

    const callData = encodeFunctionData({
      abi: EVENT_MANAGER_ABI,
      functionName: 'createEvent',
      args: [
        eventId, // String, not bytes32
        event.title,
        BigInt(eventDate),
        fundRecipient,
        priceSystem,
        priceSelf,
        maxAttendees,
      ],
    });

    console.log('📝 Sending gasless transaction via CDP Paymaster...');

    const result = await sendUserOperation({
      evmSmartAccount: smartAccount,
      network: 'base',
      calls: [{
        to: EVENT_MANAGER_ADDRESS,
        value: 0n,
        data: callData,
      }],
      useCdpPaymaster: true, // ✅ GASLESS!
    });

    console.log('✅ Transaction sent:', result);
    return result;
  };

  const handleBulkCreate = async () => {
    if (!currentUser) {
      alert('Please log in first!');
      return;
    }

    setCreating(true);
    const newResults = { created: [], failed: [] } as typeof results;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      setCurrentIndex(i + 1);

      try {
        await createEvent(event);
        newResults.created.push(event.title);

        // Update database
        await fetch('/api/events/update-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockchain_event_id: event.blockchain_event_id,
            contract_address: EVENT_MANAGER_ADDRESS,
          }),
        });

        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`❌ Failed to create "${event.title}":`, error);
        newResults.failed.push({
          event: event.title,
          error: error.message,
        });
      }

      setResults({ ...newResults });
    }

    setCreating(false);
    console.log('🎉 Bulk creation complete!');
  };

  return (
    <div className="container mx-auto p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Bulk Event Creation (Gasless via CDP Paymaster)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            {loading ? (
              <p className="text-sm text-gray-600 mb-4">Loading events...</p>
            ) : (
              <p className="text-sm text-gray-600 mb-4">
                This will create {events.length} events on-chain using your CDP Smart Account.
                <br />
                <strong>✅ Completely gasless - no ETH required!</strong>
              </p>
            )}

            {!address && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <p className="text-yellow-800">⚠️ Please log in with your admin account first</p>
              </div>
            )}

            {address && (
              <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Wallet:</strong> {address}
                  <br />
                  <strong>Smart Account:</strong> {currentUser?.evmSmartAccounts?.[0]?.address || 'Loading...'}
                </p>
              </div>
            )}
          </div>

          <div>
            <Button
              onClick={handleBulkCreate}
              disabled={creating || !address || loading || events.length === 0}
              className="w-full"
              size="lg"
            >
              {loading
                ? 'Loading events...'
                : creating
                ? `Creating ${currentIndex}/${events.length}...`
                : events.length === 0
                ? 'No events to create'
                : `Create ${events.length} Events (Gasless)`}
            </Button>
          </div>

          {results.created.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <h3 className="font-semibold text-green-800 mb-2">
                ✅ Created ({results.created.length}):
              </h3>
              <ul className="text-sm text-green-700 space-y-1">
                {results.created.map((title, i) => (
                  <li key={i}>• {title}</li>
                ))}
              </ul>
            </div>
          )}

          {results.failed.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <h3 className="font-semibold text-red-800 mb-2">
                ❌ Failed ({results.failed.length}):
              </h3>
              <ul className="text-sm text-red-700 space-y-1">
                {results.failed.map(({ event, error }, i) => (
                  <li key={i}>• {event}: {error}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
