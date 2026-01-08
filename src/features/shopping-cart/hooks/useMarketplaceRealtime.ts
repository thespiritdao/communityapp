import { useEffect, useState, useCallback, useRef } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';

export enum MarketplaceEventType {
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
}

interface UseMarketplaceRealtimeOptions {
  channels?: string[];
  autoReconnect?: boolean;
  reconnectInterval?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface RealtimeState {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastEvent: MarketplaceEvent | null;
  eventHistory: MarketplaceEvent[];
  error: Error | null;
}

/**
 * Hook for real-time marketplace updates using Server-Sent Events (SSE)
 * Falls back to polling if SSE is not supported
 */
export function useMarketplaceRealtime(
  options: UseMarketplaceRealtimeOptions = {},
) {
  const { evmAddress: address } = useEvmAddress();
  const {
    channels = ['general'],
    autoReconnect = true,
    reconnectInterval = 5000,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [state, setState] = useState<RealtimeState>({
    isConnected: false,
    connectionState: 'disconnected',
    lastEvent: null,
    eventHistory: [],
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const eventHandlersRef = useRef<
    Map<MarketplaceEventType, ((data: any) => void)[]>
  >(new Map());

  // Build SSE URL
  const buildSSEUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (address) params.set('address', address);
    params.set('channels', channels.join(','));

    return `/api/marketplace/websocket/sse?${params.toString()}`;
  }, [address, channels]);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setState((prev) => ({
      ...prev,
      connectionState: 'connecting',
      error: null,
    }));

    try {
      const eventSource = new EventSource(buildSSEUrl());
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('🔄 Connected to marketplace real-time updates');
        setState((prev) => ({
          ...prev,
          isConnected: true,
          connectionState: 'connected',
          error: null,
        }));
        onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Skip heartbeat messages
          if (data.type === 'heartbeat') return;

          // Skip initial connection message
          if (data.type === 'connection') return;

          const marketplaceEvent: MarketplaceEvent = data;

          setState((prev) => ({
            ...prev,
            lastEvent: marketplaceEvent,
            eventHistory: [...prev.eventHistory.slice(-99), marketplaceEvent], // Keep last 100 events
          }));

          // Trigger specific event handlers
          const handlers =
            eventHandlersRef.current.get(marketplaceEvent.type) || [];
          handlers.forEach((handler) => {
            try {
              handler(marketplaceEvent.data);
            } catch (error) {
              console.error('Error in event handler:', error);
            }
          });
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);

        setState((prev) => ({
          ...prev,
          isConnected: false,
          connectionState: 'error',
          error: new Error('Connection failed'),
        }));

        eventSource.close();
        onError?.(new Error('SSE connection error'));

        // Auto-reconnect if enabled
        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect to marketplace updates...');
            connect();
          }, reconnectInterval);
        }
      };
    } catch (error) {
      console.error('Failed to create SSE connection:', error);
      setState((prev) => ({
        ...prev,
        connectionState: 'error',
        error: error as Error,
      }));
      onError?.(error as Error);
    }
  }, [buildSSEUrl, autoReconnect, reconnectInterval, onConnect, onError]);

  // Disconnect from SSE stream
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      connectionState: 'disconnected',
      error: null,
    }));

    onDisconnect?.();
  }, [onDisconnect]);

  // Subscribe to specific event types
  const subscribe = useCallback(
    (eventType: MarketplaceEventType, handler: (data: any) => void) => {
      const handlers = eventHandlersRef.current.get(eventType) || [];
      handlers.push(handler);
      eventHandlersRef.current.set(eventType, handlers);

      // Return unsubscribe function
      return () => {
        const currentHandlers = eventHandlersRef.current.get(eventType) || [];
        const filteredHandlers = currentHandlers.filter((h) => h !== handler);

        if (filteredHandlers.length === 0) {
          eventHandlersRef.current.delete(eventType);
        } else {
          eventHandlersRef.current.set(eventType, filteredHandlers);
        }
      };
    },
    [],
  );

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  // Reconnect when channels change
  useEffect(() => {
    if (state.isConnected) {
      disconnect();
      setTimeout(connect, 100); // Small delay to ensure clean disconnect
    }
  }, [channels.join(','), address]);

  return {
    ...state,
    connect,
    disconnect,
    subscribe,
    // Convenience methods for common events
    onProductCreated: (handler: (product: any) => void) =>
      subscribe(MarketplaceEventType.PRODUCT_CREATED, handler),
    onProductUpdated: (
      handler: (data: { productId: string; changes: any }) => void,
    ) => subscribe(MarketplaceEventType.PRODUCT_UPDATED, handler),
    onInventoryUpdated: (
      handler: (data: {
        productId: string;
        oldQuantity: number;
        newQuantity: number;
      }) => void,
    ) => subscribe(MarketplaceEventType.INVENTORY_UPDATED, handler),
    onOrderCreated: (handler: (order: any) => void) =>
      subscribe(MarketplaceEventType.ORDER_CREATED, handler),
    onPriceUpdated: (
      handler: (data: {
        productId: string;
        oldPrices: any;
        newPrices: any;
      }) => void,
    ) => subscribe(MarketplaceEventType.PRICE_UPDATED, handler),
  };
}

/**
 * Hook for product-specific real-time updates
 */
export function useProductRealtime(productId: string) {
  const realtime = useMarketplaceRealtime({
    channels: ['general', 'products', `product_${productId}`],
  });

  const [productUpdates, setProductUpdates] = useState<{
    lastUpdate: Date | null;
    priceChanged: boolean;
    inventoryChanged: boolean;
    generalUpdate: boolean;
  }>({
    lastUpdate: null,
    priceChanged: false,
    inventoryChanged: false,
    generalUpdate: false,
  });

  useEffect(() => {
    const unsubscribers = [
      realtime.onProductUpdated((data) => {
        if (data.productId === productId) {
          setProductUpdates((prev) => ({
            ...prev,
            lastUpdate: new Date(),
            generalUpdate: true,
          }));
        }
      }),

      realtime.onPriceUpdated((data) => {
        if (data.productId === productId) {
          setProductUpdates((prev) => ({
            ...prev,
            lastUpdate: new Date(),
            priceChanged: true,
          }));
        }
      }),

      realtime.onInventoryUpdated((data) => {
        if (data.productId === productId) {
          setProductUpdates((prev) => ({
            ...prev,
            lastUpdate: new Date(),
            inventoryChanged: true,
          }));
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [productId, realtime]);

  // Clear update flags after a delay
  useEffect(() => {
    if (productUpdates.lastUpdate) {
      const timeout = setTimeout(() => {
        setProductUpdates((prev) => ({
          ...prev,
          priceChanged: false,
          inventoryChanged: false,
          generalUpdate: false,
        }));
      }, 5000); // Clear flags after 5 seconds

      return () => clearTimeout(timeout);
    }
  }, [productUpdates.lastUpdate]);

  return {
    ...realtime,
    productUpdates,
  };
}

/**
 * Hook for order-specific real-time updates
 */
export function useOrderRealtime(userAddress?: string) {
  const channels = ['orders'];
  if (userAddress) {
    channels.push(`user_${userAddress}`);
  }

  const realtime = useMarketplaceRealtime({ channels });

  const [orderNotifications, setOrderNotifications] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = realtime.onOrderCreated((order) => {
      if (!userAddress || order.buyerAddress === userAddress) {
        setOrderNotifications((prev) => [...prev.slice(-9), order]); // Keep last 10 notifications
      }
    });

    return unsubscribe;
  }, [userAddress, realtime]);

  return {
    ...realtime,
    orderNotifications,
    clearNotifications: () => setOrderNotifications([]),
  };
}
