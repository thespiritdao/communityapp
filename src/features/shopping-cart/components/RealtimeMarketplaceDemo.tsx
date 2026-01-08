'use client';

import { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import {
  useMarketplaceRealtime,
  useProductRealtime,
} from '../hooks/useMarketplaceRealtime';

interface RealtimeMarketplaceDemoProps {
  productId?: string;
  className?: string;
}

/**
 * Demo component showcasing real-time marketplace functionality
 * This can be used for testing and demonstration purposes
 */
export function RealtimeMarketplaceDemo({
  productId,
  className = '',
}: RealtimeMarketplaceDemoProps) {
  const { evmAddress: address } = useEvmAddress();
  const [events, setEvents] = useState<any[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);

  // General marketplace real-time connection
  const marketplace = useMarketplaceRealtime({
    channels: ['general', 'products', 'orders'],
    onConnect: () => {
      addLog('✅ Connected to marketplace real-time updates');
    },
    onDisconnect: () => {
      addLog('❌ Disconnected from marketplace updates');
    },
    onError: (error) => {
      addLog(`⚠️ Connection error: ${error.message}`);
    },
  });

  // Product-specific real-time connection (if productId provided)
  const productRealtime = useProductRealtime(productId || '1');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConnectionLogs((prev) => [
      `[${timestamp}] ${message}`,
      ...prev.slice(0, 9),
    ]);
  };

  const addEvent = (event: any) => {
    setEvents((prev) => [event, ...prev.slice(0, 19)]);
  };

  // Subscribe to various marketplace events
  useEffect(() => {
    const unsubscribers = [
      marketplace.onProductCreated((product) => {
        addEvent({
          type: 'Product Created',
          data: `New product: ${product.name}`,
          timestamp: new Date().toISOString(),
        });
        addLog(`🆕 New product created: ${product.name}`);
      }),

      marketplace.onProductUpdated((data) => {
        addEvent({
          type: 'Product Updated',
          data: `Product ${data.productId} updated`,
          timestamp: new Date().toISOString(),
        });
        addLog(`📝 Product ${data.productId} updated`);
      }),

      marketplace.onInventoryUpdated((data: any) => {
        addEvent({
          type: 'Inventory Updated',
          data: `Product ${data.productId}: ${data.oldQuantity} → ${data.newQuantity}`,
          timestamp: new Date().toISOString(),
        });

        if (data.isOutOfStock) {
          addLog(`📦 Product ${data.productId} is now out of stock`);
        } else if (data.isBackInStock) {
          addLog(`✨ Product ${data.productId} is back in stock!`);
        } else {
          addLog(`📊 Inventory updated for product ${data.productId}`);
        }
      }),

      marketplace.onOrderCreated((order) => {
        addEvent({
          type: 'Order Created',
          data: `Order for product ${order.productId} by ${order.buyerAddress?.slice(0, 8)}...`,
          timestamp: new Date().toISOString(),
        });
        addLog(`🛒 New order created for product ${order.productId}`);
      }),

      marketplace.onPriceUpdated((data) => {
        addEvent({
          type: 'Price Updated',
          data: `Product ${data.productId} price changed`,
          timestamp: new Date().toISOString(),
        });
        addLog(`💰 Price updated for product ${data.productId}`);
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [marketplace]);

  // Simulate marketplace events for testing
  const simulateEvent = (eventType: string) => {
    const mockEvents = {
      product_created: {
        type: 'Simulated Product Created',
        data: 'Mock product: Test Item',
        timestamp: new Date().toISOString(),
      },
      inventory_updated: {
        type: 'Simulated Inventory Update',
        data: 'Product inventory changed: 10 → 5',
        timestamp: new Date().toISOString(),
      },
      order_created: {
        type: 'Simulated Order',
        data: 'New order from test user',
        timestamp: new Date().toISOString(),
      },
    };

    const event = mockEvents[eventType as keyof typeof mockEvents];
    if (event) {
      addEvent(event);
      addLog(`🎭 Simulated event: ${event.type}`);
    }
  };

  return (
    <div className={`p-6 bg-white rounded-lg shadow-sm border ${className}`}>
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">
          Real-time Marketplace Demo
        </h2>
        <div className="flex items-center gap-4 text-sm">
          <div
            className={`flex items-center gap-2 ${
              marketplace.isConnected ? 'text-green-600' : 'text-red-600'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                marketplace.isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            {marketplace.connectionState}
          </div>
          <span className="text-gray-500">
            User: {address ? `${address.slice(0, 8)}...` : 'Not connected'}
          </span>
          {productId && (
            <span className="text-gray-500">Watching Product: {productId}</span>
          )}
        </div>
      </div>

      {/* Product-specific updates */}
      {productId && productRealtime.productUpdates.lastUpdate && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">Product Updates</h3>
          <div className="text-sm text-blue-700">
            {productRealtime.productUpdates.priceChanged && (
              <div>💰 Price changed</div>
            )}
            {productRealtime.productUpdates.inventoryChanged && (
              <div>📦 Inventory changed</div>
            )}
            {productRealtime.productUpdates.generalUpdate && (
              <div>📝 General update</div>
            )}
            <div className="text-xs text-blue-600 mt-1">
              Last update:{' '}
              {productRealtime.productUpdates.lastUpdate.toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Event simulation controls */}
      <div className="mb-4">
        <h3 className="font-medium mb-2">Test Events</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => simulateEvent('product_created')}
            className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            Simulate Product Created
          </button>
          <button
            onClick={() => simulateEvent('inventory_updated')}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Simulate Inventory Update
          </button>
          <button
            onClick={() => simulateEvent('order_created')}
            className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
          >
            Simulate Order Created
          </button>
          <button
            onClick={() => {
              setEvents([]);
              setConnectionLogs([]);
            }}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Clear Events
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connection logs */}
        <div>
          <h3 className="font-medium mb-2">Connection Logs</h3>
          <div className="bg-gray-50 rounded p-3 h-48 overflow-y-auto">
            {connectionLogs.length === 0 ? (
              <p className="text-gray-500 text-sm">No connection logs yet...</p>
            ) : (
              connectionLogs.map((log, index) => (
                <div
                  key={index}
                  className="text-xs text-gray-700 mb-1 font-mono"
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Event history */}
        <div>
          <h3 className="font-medium mb-2">Event History ({events.length})</h3>
          <div className="bg-gray-50 rounded p-3 h-48 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-gray-500 text-sm">No events received yet...</p>
            ) : (
              events.map((event, index) => (
                <div key={index} className="mb-2 p-2 bg-white rounded text-xs">
                  <div className="font-medium text-gray-800">{event.type}</div>
                  <div className="text-gray-600">{event.data}</div>
                  <div className="text-gray-400 text-xs">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Debug information */}
      <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
        <details>
          <summary className="cursor-pointer font-medium">
            Debug Information
          </summary>
          <div className="mt-2 space-y-1">
            <div>Connection State: {marketplace.connectionState}</div>
            <div>Last Event: {marketplace.lastEvent?.type || 'None'}</div>
            <div>Error: {marketplace.error?.message || 'None'}</div>
            <div>Event History Count: {marketplace.eventHistory.length}</div>
            {productId && <div>Product Watching: {productId}</div>}
          </div>
        </details>
      </div>
    </div>
  );
}

export default RealtimeMarketplaceDemo;
