// src/app/marketplace/my-orders/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/lib/supabase';
import { createSupabaseSession } from '@/utils/createSupabaseSession';
import styled from 'styled-components';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Clock, Truck, CheckCircle } from 'lucide-react';

interface Order {
  id: string;
  buyer_address: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price_paid_self: number;
  price_paid_system: number;
  transaction_hash: string;
  status: 'processing' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  fulfillment_manager_address?: string;
  shipping_address?: any;
  tracking_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: white;
  min-height: 100vh;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
`;

const Title = styled.h1`
  color: #333;
  font-size: 28px;
  font-weight: 600;
  margin: 0;
`;

const BackButton = styled.button`
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  
  &:hover {
    background: #5a6268;
  }
`;

const StatsSection = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 30px;
`;

const StatCard = styled.div`
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: white;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
`;

const StatNumber = styled.div`
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 5px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  opacity: 0.9;
`;

const OrdersList = styled.div`
  display: grid;
  gap: 15px;
`;

const OrderCard = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #007bff;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
  }
`;

const OrderHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: flex-start;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
  
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const ProductName = styled.h3`
  color: #333;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  flex: 1;
`;

const OrderMeta = styled.div`
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
  
  @media (max-width: 768px) {
    justify-content: space-between;
  }
`;

const StatusBadge = styled.span<{ status: string }>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => {
    switch (props.status) {
      case 'processing':
        return '#fff3cd';
      case 'preparing':
        return '#d1ecf1';
      case 'shipped':
        return '#d4edda';
      case 'delivered':
        return '#d1e7dd';
      case 'cancelled':
        return '#f8d7da';
      default:
        return '#e2e3e5';
    }
  }};
  color: ${(props) => {
    switch (props.status) {
      case 'processing':
        return '#856404';
      case 'preparing':
        return '#0c5460';
      case 'shipped':
        return '#155724';
      case 'delivered':
        return '#0f5132';
      case 'cancelled':
        return '#721c24';
      default:
        return '#383d41';
    }
  }};
`;

const OrderDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  color: #666;
  font-size: 14px;
`;

const DetailItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Label = styled.span`
  font-weight: 500;
`;

const Value = styled.span`
  color: #333;
`;

const TrackingInfo = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 10px;
  margin-top: 10px;
  font-size: 14px;
`;

const LoadingMessage = styled.div`
  text-align: center;
  color: #666;
  padding: 40px;
  font-size: 16px;
`;

const ErrorMessage = styled.div`
  background: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  border: 1px solid #f5c6cb;
`;

const EmptyState = styled.div`
  text-align: center;
  color: #666;
  padding: 60px 20px;
  font-size: 16px;
  line-height: 1.6;
`;

const TransactionLink = styled.a`
  color: #007bff;
  text-decoration: none;
  font-family: monospace;
  font-size: 12px;
  
  &:hover {
    text-decoration: underline;
  }
`;

export default function MyOrdersPage() {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [stats, setStats] = useState({
    total: 0,
    processing: 0,
    preparing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  });

  useEffect(() => {
    if (!address) return;
    loadMyOrders();
  }, [address]);

  const loadMyOrders = async () => {
    if (!address) return;

    try {
      setIsLoading(true);
      setError('');

      // Ensure user is authenticated with Supabase
      console.log('🔐 Ensuring Supabase authentication for my orders...');
      try {
        const authResponse = await fetch('/api/auth/onchainkit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.toLowerCase() }),
        });

        if (!authResponse.ok) {
          throw new Error(`Auth API failed: ${authResponse.status}`);
        }

        const authData = await authResponse.json();
        await createSupabaseSession(
          authData.supabaseToken,
          authData.supabaseRefreshToken,
        );
        console.log('✅ Supabase session established for my orders');
      } catch (authError) {
        console.error('❌ Authentication failed:', authError);
        setError('Authentication failed. Please try again.');
        return;
      }

      // Get orders for the current user
      const { data: ordersData, error: ordersError } = await supabase
        .from('marketplace_orders')
        .select('*')
        .eq('buyer_address', address.toLowerCase())
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Error fetching user orders:', ordersError);
        setError('Failed to load your orders');
        return;
      }

      setOrders(ordersData || []);
      calculateStats(ordersData || []);
    } catch (error) {
      console.error('Error loading user orders:', error);
      setError('Failed to load your order history');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = (orderData: Order[]) => {
    const stats = {
      total: orderData.length,
      processing: orderData.filter((o) => o.status === 'processing').length,
      preparing: orderData.filter((o) => o.status === 'preparing').length,
      shipped: orderData.filter((o) => o.status === 'shipped').length,
      delivered: orderData.filter((o) => o.status === 'delivered').length,
      cancelled: orderData.filter((o) => o.status === 'cancelled').length,
    };
    setStats(stats);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (selfPrice: number, systemPrice: number) => {
    const parts = [];
    if (selfPrice > 0) parts.push(`${selfPrice} $SELF`);
    if (systemPrice > 0) parts.push(`${systemPrice} $SYSTEM`);
    return parts.join(' + ') || '0';
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!address) {
    return (
      <Container>
        <Header>
          <Title>My Orders</Title>
        </Header>
        <ErrorMessage>
          Please connect your wallet to view your order history.
        </ErrorMessage>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container>
        <LoadingMessage>Loading your order history...</LoadingMessage>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Header>
          <Title>My Orders</Title>
          <BackButton onClick={() => router.push('/market')}>
            ← Back to Market
          </BackButton>
        </Header>
        <ErrorMessage>{error}</ErrorMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>My Orders</Title>
        <BackButton onClick={() => router.push('/market')}>
          ← Back to Market
        </BackButton>
      </Header>

      {orders.length > 0 && (
        <div className="space-y-3 mb-6 max-w-3xl mx-auto">
          {/* First Row: Total, Processing, Preparing */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-sage-600 mb-1" />
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.total}
                </p>
                <p className="text-xs text-gray-600">Total</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-earth-400 mb-1" />
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.processing}
                </p>
                <p className="text-xs text-gray-600">Processing</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-earth-500 mb-1" />
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.preparing}
                </p>
                <p className="text-xs text-gray-600">Preparing</p>
              </CardContent>
            </Card>
          </div>

          {/* Second Row: Shipped, Delivered */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 max-w-md mx-auto">
            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-sage-300 mb-1" />
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.shipped}
                </p>
                <p className="text-xs text-gray-600">Shipped</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-3 sm:p-4 text-center">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-sage-500 mb-1" />
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {stats.delivered}
                </p>
                <p className="text-xs text-gray-600">Delivered</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <OrdersList>
        {orders.length === 0 ? (
          <EmptyState>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📦</div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '600',
                marginBottom: '10px',
              }}
            >
              No Orders Yet
            </div>
            <div>
              You haven't made any purchases yet. Visit the marketplace to
              explore available products!
            </div>
          </EmptyState>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              onClick={() => router.push(`/marketplace/orders/${order.id}`)}
            >
              <OrderHeader>
                <ProductName>{order.product_name}</ProductName>
                <OrderMeta>
                  <StatusBadge status={order.status}>
                    {order.status}
                  </StatusBadge>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    {formatDate(order.created_at)}
                  </span>
                </OrderMeta>
              </OrderHeader>

              <OrderDetails>
                <DetailItem>
                  <Label>Quantity:</Label>
                  <Value>{order.quantity}</Value>
                </DetailItem>
                <DetailItem>
                  <Label>Total Paid:</Label>
                  <Value>
                    {formatPrice(
                      order.price_paid_self,
                      order.price_paid_system,
                    )}
                  </Value>
                </DetailItem>
                <DetailItem>
                  <Label>Order ID:</Label>
                  <Value style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {order.id.slice(0, 8)}...
                  </Value>
                </DetailItem>
                {order.transaction_hash && (
                  <DetailItem>
                    <Label>Transaction:</Label>
                    <TransactionLink
                      href={`https://basescan.org/tx/${order.transaction_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatAddress(order.transaction_hash)}
                    </TransactionLink>
                  </DetailItem>
                )}
              </OrderDetails>

              {order.tracking_number && (
                <TrackingInfo>
                  <strong>Tracking Number:</strong> {order.tracking_number}
                </TrackingInfo>
              )}
            </OrderCard>
          ))
        )}
      </OrdersList>
    </Container>
  );
}
