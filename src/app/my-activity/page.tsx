// src/app/my-activity/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { supabase } from '@/lib/supabase';
import styled from 'styled-components';

interface Order {
  id: string;
  product_name: string;
  quantity: number;
  price_paid_self: number;
  price_paid_system: number;
  status: string;
  created_at: string;
  transaction_hash: string;
}

interface ActivityItem {
  id: string;
  type: 'purchase' | 'vote' | 'proposal' | 'event' | 'forum';
  title: string;
  description: string;
  status: string;
  date: string;
  url?: string;
  metadata?: any;
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

const TabsContainer = styled.div`
  display: flex;
  margin-bottom: 30px;
  border-bottom: 2px solid #e0e0e0;
  overflow-x: auto;
`;

const Tab = styled.button<{ active: boolean }>`
  background: none;
  border: none;
  padding: 15px 25px;
  cursor: pointer;
  font-weight: 500;
  color: ${(props) => (props.active ? '#007bff' : '#666')};
  border-bottom: 2px solid ${(props) => (props.active ? '#007bff' : 'transparent')};
  white-space: nowrap;
  transition: all 0.2s ease;
  
  &:hover {
    color: #007bff;
  }
`;

const ActivityList = styled.div`
  display: grid;
  gap: 15px;
`;

const ActivityCard = styled.div<{ type: string }>`
  background: white;
  border: 1px solid #e0e0e0;
  border-left: 4px solid ${(props) => {
    switch (props.type) {
      case 'purchase':
        return '#28a745';
      case 'vote':
        return '#007bff';
      case 'proposal':
        return '#6f42c1';
      case 'event':
        return '#fd7e14';
      case 'forum':
        return '#20c997';
      default:
        return '#6c757d';
    }
  }};
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #007bff;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
    transform: translateY(-1px);
  }
`;

const ActivityHeader = styled.div`
  display: flex;
  justify-content: between;
  align-items: flex-start;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
`;

const ActivityTitle = styled.h3`
  color: #333;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  flex: 1;
`;

const ActivityMeta = styled.div`
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 14px;
  color: #666;
`;

const TypeBadge = styled.span<{ type: string }>`
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  background: ${(props) => {
    switch (props.type) {
      case 'purchase':
        return '#d4edda';
      case 'vote':
        return '#d1ecf1';
      case 'proposal':
        return '#e2d9f3';
      case 'event':
        return '#ffeaa7';
      case 'forum':
        return '#d1f2eb';
      default:
        return '#e9ecef';
    }
  }};
  color: ${(props) => {
    switch (props.type) {
      case 'purchase':
        return '#155724';
      case 'vote':
        return '#0c5460';
      case 'proposal':
        return '#4a148c';
      case 'event':
        return '#8b4513';
      case 'forum':
        return '#00695c';
      default:
        return '#495057';
    }
  }};
`;

const StatusBadge = styled.span<{ status: string }>`
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: ${(props) => {
    switch (props.status.toLowerCase()) {
      case 'completed':
      case 'delivered':
      case 'approved':
        return '#d4edda';
      case 'pending':
      case 'processing':
        return '#fff3cd';
      case 'cancelled':
      case 'rejected':
        return '#f8d7da';
      default:
        return '#e9ecef';
    }
  }};
  color: ${(props) => {
    switch (props.status.toLowerCase()) {
      case 'completed':
      case 'delivered':
      case 'approved':
        return '#155724';
      case 'pending':
      case 'processing':
        return '#856404';
      case 'cancelled':
      case 'rejected':
        return '#721c24';
      default:
        return '#495057';
    }
  }};
`;

const ActivityDescription = styled.p`
  color: #666;
  font-size: 14px;
  margin: 10px 0 0 0;
  line-height: 1.4;
`;

const EmptyState = styled.div`
  text-align: center;
  color: #666;
  padding: 60px 20px;
  font-size: 16px;
  line-height: 1.6;
`;

const LoadingMessage = styled.div`
  text-align: center;
  color: #666;
  padding: 40px;
  font-size: 16px;
`;

export default function MyActivityPage() {
  const router = useRouter();
  const { address } = useAccount();

  const [activeTab, setActiveTab] = useState<
    'all' | 'purchases' | 'governance' | 'events' | 'forum'
  >('all');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    loadActivities();
  }, [address]);

  const loadActivities = async () => {
    if (!address) return;

    try {
      setIsLoading(true);
      const allActivities: ActivityItem[] = [];

      // Load purchase orders
      const { data: orders } = await supabase
        .from('marketplace_orders')
        .select('*')
        .eq('buyer_address', address.toLowerCase())
        .order('created_at', { ascending: false });

      if (orders) {
        const purchaseActivities = orders.map((order: Order) => ({
          id: `purchase-${order.id}`,
          type: 'purchase' as const,
          title: `Purchased ${order.product_name}`,
          description: `Bought ${order.quantity} unit(s) for ${order.price_paid_self > 0 ? `${order.price_paid_self} $SELF` : ''}${order.price_paid_self > 0 && order.price_paid_system > 0 ? ' + ' : ''}${order.price_paid_system > 0 ? `${order.price_paid_system} $SYSTEM` : ''}`,
          status: order.status,
          date: order.created_at,
          url: `/marketplace/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            transactionHash: order.transaction_hash,
          },
        }));
        allActivities.push(...purchaseActivities);
      }

      // TODO: Add other activity types here
      // - Governance votes
      // - Proposal submissions
      // - Event registrations/attendance
      // - Forum posts/replies

      // Sort all activities by date (most recent first)
      allActivities.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      setActivities(allActivities);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredActivities = activities.filter((activity) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'purchases') return activity.type === 'purchase';
    if (activeTab === 'governance')
      return ['vote', 'proposal'].includes(activity.type);
    if (activeTab === 'events') return activity.type === 'event';
    if (activeTab === 'forum') return activity.type === 'forum';
    return true;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleActivityClick = (activity: ActivityItem) => {
    if (activity.url) {
      router.push(activity.url);
    }
  };

  if (!address) {
    return (
      <Container>
        <Header>
          <Title>My Activity</Title>
        </Header>
        <EmptyState>
          Please connect your wallet to view your activity history.
        </EmptyState>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container>
        <LoadingMessage>Loading your activity history...</LoadingMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>My Activity</Title>
        <BackButton onClick={() => router.back()}>← Back</BackButton>
      </Header>

      <TabsContainer>
        <Tab active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
          All Activity ({activities.length})
        </Tab>
        <Tab
          active={activeTab === 'purchases'}
          onClick={() => setActiveTab('purchases')}
        >
          Purchases ({activities.filter((a) => a.type === 'purchase').length})
        </Tab>
        <Tab
          active={activeTab === 'governance'}
          onClick={() => setActiveTab('governance')}
        >
          Governance (
          {
            activities.filter((a) => ['vote', 'proposal'].includes(a.type))
              .length
          }
          )
        </Tab>
        <Tab
          active={activeTab === 'events'}
          onClick={() => setActiveTab('events')}
        >
          Events ({activities.filter((a) => a.type === 'event').length})
        </Tab>
        <Tab
          active={activeTab === 'forum'}
          onClick={() => setActiveTab('forum')}
        >
          Forum ({activities.filter((a) => a.type === 'forum').length})
        </Tab>
      </TabsContainer>

      <ActivityList>
        {filteredActivities.length === 0 ? (
          <EmptyState>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎯</div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '600',
                marginBottom: '10px',
              }}
            >
              No Activity Found
            </div>
            <div>
              {activeTab === 'all'
                ? "You haven't participated in any activities yet. Start by exploring the marketplace, governance, or events!"
                : `No ${activeTab} activity found. Try a different tab or start participating!`}
            </div>
          </EmptyState>
        ) : (
          filteredActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              type={activity.type}
              onClick={() => handleActivityClick(activity)}
            >
              <ActivityHeader>
                <ActivityTitle>{activity.title}</ActivityTitle>
                <ActivityMeta>
                  <TypeBadge type={activity.type}>{activity.type}</TypeBadge>
                  <StatusBadge status={activity.status}>
                    {activity.status}
                  </StatusBadge>
                  <span>{formatDate(activity.date)}</span>
                </ActivityMeta>
              </ActivityHeader>
              <ActivityDescription>{activity.description}</ActivityDescription>
            </ActivityCard>
          ))
        )}
      </ActivityList>
    </Container>
  );
}
