// src/app/marketplace/orders/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUserWallet, useSigningWallet } from '@/hooks/useUserWallet';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { supabase } from '@/lib/supabase';
import { createSupabaseSession } from '@/utils/createSupabaseSession';
import { requestSupabaseSession } from '@/features/identity/lib/cdpSession';
import { getAuthHeaders } from '@/lib/authHeaders';
import styled from 'styled-components';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

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

interface StatusHistory {
  id: string;
  old_status: string;
  new_status: string;
  changed_by_address: string;
  notes?: string;
  created_at: string;
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

const OrderGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #e0e0e0;
`;

const CardTitle = styled.h3`
  color: #333;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #dee2e6;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 8px 0;
`;

const Label = styled.span`
  font-weight: 500;
  color: #666;
`;

const Value = styled.span`
  color: #333;
  word-break: break-all;
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => {
    switch (props.$status) {
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
    switch (props.$status) {
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

const StatusSection = styled.div`
  margin-top: 20px;
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 10px;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  resize: vertical;
  min-height: 80px;
  margin-bottom: 10px;
  box-sizing: border-box;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 10px;
  box-sizing: border-box;
`;

const UpdateButton = styled.button`
  background: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  width: 100%;
  
  &:hover:not(:disabled) {
    background: #218838;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

const HistoryItem = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 10px;
`;

const HistoryHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 10px;
`;

const HistoryDate = styled.span`
  font-size: 12px;
  color: #666;
`;

const ErrorMessage = styled.div`
  background: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  border: 1px solid #f5c6cb;
`;

const LoadingMessage = styled.div`
  text-align: center;
  color: #666;
  padding: 40px;
  font-size: 16px;
`;

const TransactionLink = styled.a`
  color: #007bff;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  // Identity wallet — buyer check, token-balance permissions, and actor
  // attribution (fulfillment manager / status-history / notification sender).
  const address = useUserWallet();
  // Device signing wallet — used only to (re)establish the Supabase session.
  const { address: signingAddress } = useSigningWallet();
  // Order management is gated by the pod `marketplaceManage` permission (same
  // as product management), not hardcoded Exec/Market hat balances.
  const { permissions } = useHatPermissions();
  const orderId = typeof params.id === 'string' ? params.id : '';

  const [order, setOrder] = useState<Order | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  const [buyerProfile, setBuyerProfile] = useState<any>(null); // Store buyer's profile with shipping info
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [canManage, setCanManage] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Form state for status updates
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  useEffect(() => {
    if (!address || !orderId) return;
    loadOrderData();
  }, [address, orderId]);

  const loadOrderData = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Ensure user is authenticated with Supabase before querying orders
      console.log('🔐 Ensuring Supabase authentication for order access...');
      try {
        // Get or create auth tokens via API
        const authResponse = await requestSupabaseSession({
          address: (signingAddress ?? address)?.toLowerCase() ?? '',
        });

        if (!authResponse.ok) {
          throw new Error(`Auth API failed: ${authResponse.status}`);
        }

        const authData = await authResponse.json();
        console.log('✅ Auth API response received:', {
          hasToken: !!authData.supabaseToken,
        });

        // Create Supabase session
        await createSupabaseSession(
          authData.supabaseToken,
          authData.supabaseRefreshToken,
        );
        console.log('✅ Supabase session established for order access');
      } catch (authError) {
        console.error('❌ Failed to establish Supabase session:', authError);
        setError('Authentication failed. Please try again.');
        return;
      }

      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('marketplace_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) {
        console.error('Error fetching order:', orderError);
        setError('Order not found');
        return;
      }

      if (!orderData) {
        setError('Order not found');
        return;
      }

      setOrder(orderData);
      setNewStatus(orderData.status);
      setTrackingNumber(orderData.tracking_number || '');

      // Get status history
      const { data: historyData, error: historyError } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (historyError) {
        console.error('Error fetching status history:', historyError);
      } else {
        setStatusHistory(historyData || []);
      }

      // Get buyer's profile information for shipping details. Stays on the
      // base table because the view has no address columns; email is
      // deliberately not read (contact is via in-app messages).
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select(
          'first_name, last_name, address_1, address_2, city, state, zip, phone',
        )
        .eq('wallet_address', orderData.buyer_address.toLowerCase())
        .single();

      if (profileError) {
        console.error('Error fetching buyer profile:', profileError);
        setBuyerProfile(null);
      } else {
        console.log('✅ Buyer profile loaded:', profileData);
        setBuyerProfile(profileData);
      }

      // Management access is derived reactively from hat permissions (effect
      // below) — no per-order token check needed here.
    } catch (error) {
      console.error('Error loading order data:', error);
      setError('Failed to load order information');
    } finally {
      setIsLoading(false);
    }
  };

  // Management access is the pod `marketplaceManage` role permission. Kept as a
  // small effect (rather than inline) so canManage stays reactive as the hat
  // permissions resolve after mount.
  useEffect(() => {
    setCanManage(!!permissions?.marketplaceManage);
  }, [permissions?.marketplaceManage]);

  const handleStatusUpdate = async () => {
    if (!order || !address || !canManage) return;

    try {
      setIsUpdating(true);
      setError('');

      // Update order status and tracking number
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (trackingNumber.trim()) {
        updateData.tracking_number = trackingNumber.trim();
      }

      if (!order.fulfillment_manager_address) {
        updateData.fulfillment_manager_address = address;
      }

      const { error: updateError } = await supabase
        .from('marketplace_orders')
        .update(updateData)
        .eq('id', orderId);

      if (updateError) {
        console.error('Error updating order:', updateError);
        setError('Failed to update order status');
        return;
      }

      // Add status history entry
      const { error: historyError } = await supabase
        .from('order_status_history')
        .insert({
          order_id: orderId,
          old_status: order.status,
          new_status: newStatus,
          changed_by_address: address,
          notes: statusNotes.trim() || null,
        });

      if (historyError) {
        console.error('Error creating status history:', historyError);
        // Don't fail the update for history errors
      }

      // Send notification to buyer about status update
      try {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: JSON.stringify({
            type: 'order_status_updated',
            recipientAddress: order.buyer_address,
            senderAddress: address,
            orderStatus: newStatus,
            productName: order.product_name,
            orderId: orderId,
            trackingNumber: trackingNumber.trim() || undefined,
            notes: statusNotes.trim() || undefined,
          }),
        });
      } catch (notificationError) {
        console.error(
          'Failed to send status update notification:',
          notificationError,
        );
        // Don't fail the status update for notification errors
      }

      // Clear form and reload data
      setStatusNotes('');
      await loadOrderData();
    } catch (error) {
      console.error('Error updating order status:', error);
      setError('Failed to update order status');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTotalValue = (
    selfPaid: number | string,
    systemPaid: number | string,
  ) => {
    // Convert to numbers to handle string values from database
    const selfAmount = Number(selfPaid) || 0;
    const systemAmount = Number(systemPaid) || 0;

    // Debug logging
    console.log('💰 Total Value Debug:', {
      selfPaid,
      systemPaid,
      selfAmount,
      systemAmount,
      selfType: typeof selfPaid,
      systemType: typeof systemPaid,
      selfIsPositive: selfAmount > 0,
      systemIsPositive: systemAmount > 0,
    });

    const parts = [];
    if (selfAmount > 0) parts.push(`${selfAmount} $SELF`);
    if (systemAmount > 0) parts.push(`${systemAmount} $SYSTEM`);

    if (parts.length === 0) return 'Free';
    if (parts.length === 1) return parts[0];
    return parts.join(' + ');
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingMessage>Loading order details...</LoadingMessage>
      </Container>
    );
  }

  if (error || !order) {
    return (
      <Container>
        <Header>
          <Title>Order Not Found</Title>
          <BackButton onClick={() => router.back()}>← Back</BackButton>
        </Header>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Order #{order.id.slice(0, 8)}</Title>
        <BackButton onClick={() => router.back()}>← Back</BackButton>
      </Header>

      <OrderGrid>
        <div>
          <Card>
            <CardTitle>Order Details</CardTitle>
            <InfoRow>
              <Label>Product:</Label>
              <Value>{order.product_name}</Value>
            </InfoRow>
            <InfoRow>
              <Label>Quantity:</Label>
              <Value>{order.quantity}</Value>
            </InfoRow>
            <InfoRow>
              <Label>Status:</Label>
              <StatusBadge $status={order.status}>{order.status}</StatusBadge>
            </InfoRow>
            <InfoRow>
              <Label>Buyer:</Label>
              <Value>
                <UserProfileDisplay
                  walletAddress={order.buyer_address}
                  size="sm"
                  className="inline-flex"
                />
              </Value>
            </InfoRow>
            <InfoRow>
              <Label>Order Date:</Label>
              <Value>{formatDate(order.created_at)}</Value>
            </InfoRow>
            {order.tracking_number && (
              <InfoRow>
                <Label>Tracking:</Label>
                <Value>{order.tracking_number}</Value>
              </InfoRow>
            )}
            {order.transaction_hash && (
              <InfoRow>
                <Label>Transaction:</Label>
                <Value>
                  <TransactionLink
                    href={`https://basescan.org/tx/${order.transaction_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {formatAddress(order.transaction_hash)}
                  </TransactionLink>
                </Value>
              </InfoRow>
            )}
          </Card>

          <Card style={{ marginTop: '20px' }}>
            <CardTitle>Payment Details</CardTitle>
            {Number(order.price_paid_self) > 0 && (
              <InfoRow>
                <Label>$SELF Paid:</Label>
                <Value>{Number(order.price_paid_self)} $SELF</Value>
              </InfoRow>
            )}
            {Number(order.price_paid_system) > 0 && (
              <InfoRow>
                <Label>$SYSTEM Paid:</Label>
                <Value>{Number(order.price_paid_system)} $SYSTEM</Value>
              </InfoRow>
            )}
            <InfoRow>
              <Label>Total Value:</Label>
              <Value>
                {formatTotalValue(
                  order.price_paid_self,
                  order.price_paid_system,
                )}
              </Value>
            </InfoRow>
          </Card>

          {/* Shipping Information */}
          {buyerProfile && (
            <Card style={{ marginTop: '20px' }}>
              <CardTitle>Shipping Information</CardTitle>
              {buyerProfile.first_name || buyerProfile.last_name ? (
                <InfoRow>
                  <Label>Name:</Label>
                  <Value>
                    {[buyerProfile.first_name, buyerProfile.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </Value>
                </InfoRow>
              ) : null}

              {buyerProfile.address_1 && (
                <InfoRow>
                  <Label>Address:</Label>
                  <Value>
                    <div>
                      <div>{buyerProfile.address_1}</div>
                      {buyerProfile.address_2 && (
                        <div>{buyerProfile.address_2}</div>
                      )}
                      <div>
                        {[
                          buyerProfile.city,
                          buyerProfile.state,
                          buyerProfile.zip,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    </div>
                  </Value>
                </InfoRow>
              )}

              {buyerProfile.phone && (
                <InfoRow>
                  <Label>Phone:</Label>
                  <Value>{buyerProfile.phone}</Value>
                </InfoRow>
              )}

              {(!buyerProfile.address_1 ||
                !buyerProfile.city ||
                !buyerProfile.state ||
                !buyerProfile.zip) && (
                <InfoRow>
                  <Label>⚠️ Notice:</Label>
                  <Value style={{ color: '#d63384', fontSize: '0.9rem' }}>
                    Incomplete shipping address. Customer needs to update their
                    profile.
                  </Value>
                </InfoRow>
              )}
            </Card>
          )}

          {/* If no buyer profile found */}
          {!buyerProfile && (
            <Card style={{ marginTop: '20px' }}>
              <CardTitle>Shipping Information</CardTitle>
              <InfoRow>
                <Label>Status:</Label>
                <Value style={{ color: '#d63384' }}>
                  No shipping information available. Customer has not completed
                  their profile.
                </Value>
              </InfoRow>
            </Card>
          )}
        </div>

        <div>
          {canManage && (
            <Card>
              <CardTitle>Update Status</CardTitle>
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                disabled={isUpdating}
              >
                <option value="processing">Processing</option>
                <option value="preparing">Preparing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </Select>

              <Input
                type="text"
                placeholder="Tracking number (optional)"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                disabled={isUpdating}
              />

              <TextArea
                placeholder="Status update notes (optional)"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                disabled={isUpdating}
              />

              <UpdateButton
                onClick={handleStatusUpdate}
                disabled={isUpdating || newStatus === order.status}
              >
                {isUpdating ? 'Updating...' : 'Update Status'}
              </UpdateButton>
            </Card>
          )}

          <Card style={{ marginTop: canManage ? '20px' : '0' }}>
            <CardTitle>Status History</CardTitle>
            {statusHistory.length === 0 ? (
              <div style={{ color: '#666', fontStyle: 'italic' }}>
                No status updates yet
              </div>
            ) : (
              statusHistory.map((entry) => (
                <HistoryItem key={entry.id}>
                  <HistoryHeader>
                    <div>
                      <StatusBadge $status={entry.old_status || 'unknown'}>
                        {entry.old_status || 'initial'}
                      </StatusBadge>
                      {' → '}
                      <StatusBadge $status={entry.new_status}>
                        {entry.new_status}
                      </StatusBadge>
                    </div>
                    <HistoryDate>{formatDate(entry.created_at)}</HistoryDate>
                  </HistoryHeader>
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#666',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>Updated by:</span>
                    <UserProfileDisplay
                      walletAddress={entry.changed_by_address}
                      size="sm"
                      className="inline-flex"
                    />
                  </div>
                  {entry.notes && (
                    <div style={{ fontSize: '14px', marginTop: '5px' }}>
                      {entry.notes}
                    </div>
                  )}
                </HistoryItem>
              ))
            )}
          </Card>
        </div>
      </OrderGrid>
    </Container>
  );
}
