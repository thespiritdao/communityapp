'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const EventManagerABI = require('src/abis/EventManager.json');
const EVENT_MANAGER_CONTRACT = process.env
  .NEXT_PUBLIC_EVENT_MANAGER as `0x${string}`;

interface EventDebugInfo {
  id: string;
  title: string;
  blockchain_event_id: string | null;
  status: string;
  created_at: string;
  existsOnChain?: boolean;
  onChainData?: any;
}

export const EventBlockchainDebugger: React.FC = () => {
  const [events, setEvents] = useState<EventDebugInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  // Check individual event on blockchain
  const { data: onChainEvent, error: contractError } = useReadContract({
    address: EVENT_MANAGER_CONTRACT,
    abi: EventManagerABI,
    functionName: 'getEvent',
    args: [selectedEventId],
    query: {
      enabled: !!selectedEventId,
      retry: false,
    },
  });

  const loadEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, blockchain_event_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkEventOnChain = async (eventId: string) => {
    setSelectedEventId(eventId);
  };

  useEffect(() => {
    if (selectedEventId && onChainEvent) {
      setEvents((prev) =>
        prev.map((event) =>
          event.blockchain_event_id === selectedEventId ||
          event.id === selectedEventId
            ? { ...event, existsOnChain: true, onChainData: onChainEvent }
            : event,
        ),
      );
    } else if (selectedEventId && contractError) {
      setEvents((prev) =>
        prev.map((event) =>
          event.blockchain_event_id === selectedEventId ||
          event.id === selectedEventId
            ? { ...event, existsOnChain: false, onChainData: null }
            : event,
        ),
      );
    }
  }, [selectedEventId, onChainEvent, contractError]);

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <Card className="max-w-6xl mx-auto">
      <CardHeader>
        <CardTitle>Event Blockchain Debugger</CardTitle>
        <p className="text-sm text-gray-600">
          Check which events exist on the blockchain vs database only
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button onClick={loadEvents} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Events'}
          </Button>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">
                    Title
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    DB ID
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Blockchain ID
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Status
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    On-Chain
                  </th>
                  <th className="border border-gray-300 p-2 text-left">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const checkId = event.blockchain_event_id || event.id;
                  const statusColor =
                    event.existsOnChain === true
                      ? '#3F7A5A'
                      : event.existsOnChain === false
                        ? '#8B3A3A'
                        : '#6b7280';

                  return (
                    <tr key={event.id}>
                      <td className="border border-gray-300 p-2">
                        {event.title}
                      </td>
                      <td className="border border-gray-300 p-2 font-mono text-xs">
                        {event.id.substring(0, 8)}...
                      </td>
                      <td className="border border-gray-300 p-2 font-mono text-xs">
                        {event.blockchain_event_id
                          ? event.blockchain_event_id.substring(0, 12) + '...'
                          : 'None'}
                      </td>
                      <td className="border border-gray-300 p-2">
                        <span
                          className="px-2 py-1 rounded text-xs"
                          style={{
                            backgroundColor:
                              event.status === 'published'
                                ? '#E8F1EE'
                                : event.status === 'draft'
                                  ? '#FAF4EC'
                                  : '#f3f4f6',
                            color:
                              event.status === 'published'
                                ? '#1F453A'
                                : event.status === 'draft'
                                  ? '#7A5F3F'
                                  : '#1f2937',
                          }}
                        >
                          {event.status}
                        </span>
                      </td>
                      <td
                        className="border border-gray-300 p-2"
                        style={{ color: statusColor }}
                      >
                        {event.existsOnChain === true
                          ? '✅ Exists'
                          : event.existsOnChain === false
                            ? '❌ Missing'
                            : '❓ Unknown'}
                      </td>
                      <td className="border border-gray-300 p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkEventOnChain(checkId)}
                          disabled={!checkId}
                        >
                          Check Chain
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {events.length === 0 && !loading && (
            <p className="text-center text-gray-500 py-8">
              No events found in database
            </p>
          )}
        </div>

        {/* Debug Info */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">Debug Information</h4>
          <div className="text-sm space-y-1">
            <p>
              <strong>Contract Address:</strong>{' '}
              {EVENT_MANAGER_CONTRACT || '❌ Not configured'}
            </p>
            <p>
              <strong>System Token:</strong>{' '}
              {process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '❌ Not configured'}
            </p>
            <p>
              <strong>Self Token:</strong>{' '}
              {process.env.NEXT_PUBLIC_SELF_TOKEN || '❌ Not configured'}
            </p>
            <p>
              <strong>Paymaster:</strong>{' '}
              {process.env.NEXT_PUBLIC_PAYMASTER
                ? '✅ Configured'
                : '❌ Not configured'}
            </p>
            <p>
              <strong>Chain ID:</strong> Base (8453)
            </p>
            <p>
              <strong>Total Events in DB:</strong> {events.length}
            </p>
            <p>
              <strong>Events with blockchain_event_id:</strong>{' '}
              {events.filter((e) => e.blockchain_event_id).length}
            </p>
            <p>
              <strong>Events confirmed on-chain:</strong>{' '}
              {events.filter((e) => e.existsOnChain === true).length}
            </p>
            <p>
              <strong>Events missing on-chain:</strong>{' '}
              {events.filter((e) => e.existsOnChain === false).length}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
