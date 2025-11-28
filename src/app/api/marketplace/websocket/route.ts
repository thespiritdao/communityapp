import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';

// WebSocket connection store (in production, use Redis)
const connections = new Map<
  string,
  {
    socket: any;
    subscriptions: Set<string>;
    lastSeen: number;
    userAddress?: string;
  }
>();

// Event types for real-time updates
// Note: Not exported as Next.js route files can only export HTTP handlers
enum MarketplaceEventType {
  PRODUCT_CREATED = 'product_created',
  PRODUCT_UPDATED = 'product_updated',
  PRODUCT_DELETED = 'product_deleted',
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',
  INVENTORY_UPDATED = 'inventory_updated',
  PRICE_UPDATED = 'price_updated',
  USER_ACTIVITY = 'user_activity',
}

interface MarketplaceEvent {
  type: MarketplaceEventType;
  data: any;
  timestamp: string;
  source: 'api' | 'database' | 'external';
  channels: string[]; // Which channels to broadcast to
}

/**
 * WebSocket handler for real-time marketplace updates
 * This would typically be implemented with a proper WebSocket library
 * or service like Socket.IO, Pusher, or native WebSocket API
 */
export async function GET(request: NextRequest) {
  // This is a placeholder for WebSocket upgrade
  // In a real implementation, you'd use a WebSocket library

  const searchParams = new URL(request.url).searchParams;
  const userAddress = searchParams.get('address');
  const channels = searchParams.get('channels')?.split(',') || ['general'];

  return new Response(
    JSON.stringify({
      message: 'WebSocket endpoint - upgrade to WebSocket protocol required',
      supportedChannels: [
        'general', // General marketplace updates
        'products', // Product-specific updates
        'orders', // Order-specific updates
        'inventory', // Inventory updates
        `user_${userAddress}`, // User-specific updates
      ],
      events: Object.values(MarketplaceEventType),
      endpoint: '/api/marketplace/websocket',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        Upgrade: 'websocket',
        Connection: 'Upgrade',
      },
    },
  );
}

/**
 * Real-time event broadcaster
 * Note: Not exported as Next.js route files can only export HTTP handlers
 */
class MarketplaceEventBroadcaster {
  private static instance: MarketplaceEventBroadcaster;

  static getInstance(): MarketplaceEventBroadcaster {
    if (!MarketplaceEventBroadcaster.instance) {
      MarketplaceEventBroadcaster.instance = new MarketplaceEventBroadcaster();
    }
    return MarketplaceEventBroadcaster.instance;
  }

  /**
   * Broadcast event to subscribed channels
   */
  broadcast(event: MarketplaceEvent) {
    const timestamp = new Date().toISOString();
    const eventWithTimestamp = { ...event, timestamp };

    // Log the event
    console.log(
      `[${timestamp}] Broadcasting ${event.type} to channels: ${event.channels.join(', ')}`,
    );

    // In a real implementation, this would:
    // 1. Send to WebSocket connections subscribed to these channels
    // 2. Possibly store in Redis for offline users
    // 3. Send push notifications for mobile users

    event.channels.forEach((channel) => {
      this.broadcastToChannel(channel, eventWithTimestamp);
    });
  }

  private broadcastToChannel(
    channel: string,
    event: MarketplaceEvent & { timestamp: string },
  ) {
    // Placeholder for actual WebSocket broadcasting
    // In production, you'd iterate through connections subscribed to this channel

    for (const [connectionId, connection] of connections) {
      if (connection.subscriptions.has(channel)) {
        try {
          // connection.socket.send(JSON.stringify(event));
          console.log(
            `Sent ${event.type} to connection ${connectionId} on channel ${channel}`,
          );
        } catch (error) {
          console.error(`Failed to send to connection ${connectionId}:`, error);
          // Remove failed connection
          connections.delete(connectionId);
        }
      }
    }
  }

  /**
   * Product-specific event helpers
   */
  productCreated(product: any) {
    this.broadcast({
      type: MarketplaceEventType.PRODUCT_CREATED,
      data: {
        product: {
          id: product.id,
          name: product.name,
          price_system: product.price_system,
          price_self: product.price_self,
          required_token: product.required_token,
          created_at: product.created_at,
        },
      },
      source: 'api',
      channels: ['general', 'products'],
      timestamp: '',
    });
  }

  productUpdated(productId: string, changes: any) {
    this.broadcast({
      type: MarketplaceEventType.PRODUCT_UPDATED,
      data: {
        productId,
        changes,
        updatedAt: new Date().toISOString(),
      },
      source: 'api',
      channels: ['general', 'products', `product_${productId}`],
      timestamp: '',
    });
  }

  inventoryUpdated(
    productId: string,
    oldQuantity: number,
    newQuantity: number,
  ) {
    this.broadcast({
      type: MarketplaceEventType.INVENTORY_UPDATED,
      data: {
        productId,
        oldQuantity,
        newQuantity,
        isOutOfStock: newQuantity === 0,
        isBackInStock: oldQuantity === 0 && newQuantity > 0,
      },
      source: 'api',
      channels: ['general', 'inventory', `product_${productId}`],
      timestamp: '',
    });
  }

  orderCreated(order: any) {
    const channels = ['general', 'orders'];

    // Add user-specific channels
    if (order.buyer_address) {
      channels.push(`user_${order.buyer_address}`);
    }

    // Add product-specific channel
    if (order.product_id) {
      channels.push(`product_${order.product_id}`);
    }

    this.broadcast({
      type: MarketplaceEventType.ORDER_CREATED,
      data: {
        orderId: order.id,
        productId: order.product_id,
        buyerAddress: order.buyer_address,
        quantity: order.quantity,
        totalPrice:
          (order.price_paid_system || 0) + (order.price_paid_self || 0),
        status: order.status,
      },
      source: 'api',
      channels,
      timestamp: '',
    });
  }
}

/**
 * Database trigger integration for real-time updates
 * This would be called by database triggers or change streams
 * Note: Not exported as it's not a route handler
 */
function handleDatabaseChange(
  table: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  oldRecord?: any,
  newRecord?: any,
) {
  const broadcaster = MarketplaceEventBroadcaster.getInstance();

  switch (table) {
    case 'products':
      if (operation === 'INSERT') {
        broadcaster.productCreated(newRecord);
      } else if (operation === 'UPDATE') {
        // Check for specific changes
        if (oldRecord.units_available !== newRecord.units_available) {
          broadcaster.inventoryUpdated(
            newRecord.id,
            oldRecord.units_available,
            newRecord.units_available,
          );
        }

        if (
          oldRecord.price_system !== newRecord.price_system ||
          oldRecord.price_self !== newRecord.price_self
        ) {
          broadcaster.broadcast({
            type: MarketplaceEventType.PRICE_UPDATED,
            data: {
              productId: newRecord.id,
              oldPrices: {
                system: oldRecord.price_system,
                self: oldRecord.price_self,
              },
              newPrices: {
                system: newRecord.price_system,
                self: newRecord.price_self,
              },
            },
            source: 'database',
            channels: ['general', 'products', `product_${newRecord.id}`],
            timestamp: '',
          });
        }
      }
      break;

    case 'marketplace_orders':
      if (operation === 'INSERT') {
        broadcaster.orderCreated(newRecord);
      } else if (
        operation === 'UPDATE' &&
        oldRecord.status !== newRecord.status
      ) {
        broadcaster.broadcast({
          type: MarketplaceEventType.ORDER_UPDATED,
          data: {
            orderId: newRecord.id,
            oldStatus: oldRecord.status,
            newStatus: newRecord.status,
            buyerAddress: newRecord.buyer_address,
          },
          source: 'database',
          channels: [
            'orders',
            `user_${newRecord.buyer_address}`,
            `order_${newRecord.id}`,
          ],
          timestamp: '',
        });
      }
      break;
  }
}

/**
 * Server-Sent Events (SSE) alternative for browsers that don't support WebSockets
 * Note: Not exported as it's not a route handler - use GET endpoint instead
 */
async function handleSSE(request: NextRequest) {
  const userAddress = new URL(request.url).searchParams.get('address');
  const channels = new URL(request.url).searchParams
    .get('channels')
    ?.split(',') || ['general'];

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const connectionData = `data: ${JSON.stringify({
        type: 'connection',
        message: 'Connected to marketplace events',
        channels,
        timestamp: new Date().toISOString(),
      })}\n\n`;

      controller.enqueue(new TextEncoder().encode(connectionData));

      // Set up periodic heartbeat
      const heartbeat = setInterval(() => {
        const heartbeatData = `data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        })}\n\n`;

        try {
          controller.enqueue(new TextEncoder().encode(heartbeatData));
        } catch (error) {
          clearInterval(heartbeat);
          controller.close();
        }
      }, 30000); // Every 30 seconds

      // Store connection for event broadcasting
      const connectionId = createHash('md5')
        .update(`${userAddress || 'anonymous'}_${Date.now()}`)
        .digest('hex');

      connections.set(connectionId, {
        socket: {
          send: (data: string) => {
            try {
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            } catch (error) {
              console.error('SSE send error:', error);
            }
          },
        },
        subscriptions: new Set(channels),
        lastSeen: Date.now(),
        userAddress: userAddress || undefined,
      });

      // Cleanup on close
      return () => {
        clearInterval(heartbeat);
        connections.delete(connectionId);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}
