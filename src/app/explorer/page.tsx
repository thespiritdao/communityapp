// src/app/explorer/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import type { ExplorerEvent } from '@/app/api/explorer/route';

// ── Types ──────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'pods' | 'governance' | 'treasury' | 'members' | 'bounties';

interface ExplorerResponse {
  items: ExplorerEvent[];
  total: number;
  offset: number;
  limit: number;
  stats: {
    totalActiveEvents: number;
    weeklyActiveEvents: number;
  };
}

// ── Styled components (matches app pattern from my-activity) ──────────────────

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px 80px;
  background: white;
  min-height: 100vh;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`;

const Title = styled.h1`
  color: #1a1a1a;
  font-size: 26px;
  font-weight: 700;
  margin: 0;
`;

const Subtitle = styled.p`
  color: #666;
  font-size: 14px;
  margin: 0 0 24px 0;
`;

const StatsRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const StatChip = styled.div`
  background: #f0f4f0;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 13px;
  color: #2F5D50;
  font-weight: 500;
`;

const TabsContainer = styled.div`
  display: flex;
  margin-bottom: 24px;
  border-bottom: 2px solid #e0e0e0;
  overflow-x: auto;
  gap: 0;
`;

const Tab = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  padding: 12px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  color: ${(p) => (p.$active ? '#2F5D50' : '#666')};
  border-bottom: 2px solid ${(p) => (p.$active ? '#2F5D50' : 'transparent')};
  margin-bottom: -2px;
  transition: color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: #2F5D50;
  }
`;

const FeedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const EVENT_COLORS: Record<string, string> = {
  pod_created: '#2F5D50',
  member_joined: '#0ea5e9',
  proposal_created: '#7c3aed',
  vote_cast: '#2563eb',
  treasury_movement: '#d97706',
  donation: '#16a34a',
  bounty_created: '#db2777',
  bounty_completed: '#059669',
};

const EventCard = styled.div<{ $type: string }>`
  background: white;
  border: 1px solid #e5e7eb;
  border-left: 4px solid ${(p) => EVENT_COLORS[p.$type] ?? '#6b7280'};
  border-radius: 8px;
  padding: 16px 18px;
  cursor: ${(p) => (p.onClick ? 'pointer' : 'default')};
  transition: box-shadow 0.15s ease, transform 0.15s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }
`;

const CardRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const CardLeft = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardMeta = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b7280;
`;

const TypeBadge = styled.span<{ $type: string }>`
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: ${(p) => EVENT_COLORS[p.$type] ?? '#6b7280'}22;
  color: ${(p) => EVENT_COLORS[p.$type] ?? '#6b7280'};
`;

const AmountBadge = styled.span`
  font-weight: 600;
  color: #374151;
`;

const LoadMoreButton = styled.button`
  width: 100%;
  margin-top: 20px;
  padding: 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: #e5e7eb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  color: #9ca3af;
  padding: 60px 20px;
  font-size: 15px;
`;

const LoadingMessage = styled.div`
  text-align: center;
  color: #9ca3af;
  padding: 40px;
  font-size: 15px;
`;

// ── Helpers ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  pod_created: 'Pod Created',
  member_joined: 'Joined',
  proposal_created: 'Proposal',
  vote_cast: 'Vote',
  treasury_movement: 'Treasury',
  donation: 'Donation',
  bounty_created: 'Bounty',
  bounty_completed: 'Completed',
};

const TAB_LABELS: Record<FilterTab, string> = {
  all: 'All',
  pods: 'Pods',
  governance: 'Governance',
  treasury: 'Treasury',
  members: 'Members',
  bounties: 'Bounties',
};

function truncateAddress(addr?: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [items, setItems] = useState<ExplorerEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState({ totalActiveEvents: 0, weeklyActiveEvents: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchEvents = useCallback(
    async (tab: FilterTab, currentOffset: number, append: boolean) => {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      const params = new URLSearchParams({ offset: String(currentOffset) });
      if (tab !== 'all') params.set('type', tab);

      try {
        const res = await fetch(`/api/explorer?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data: ExplorerResponse = await res.json();

        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setStats(data.stats);
        setOffset(currentOffset + data.items.length);
      } catch (err) {
        console.error('[explorer] fetch error', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    setOffset(0);
    setItems([]);
    fetchEvents(activeTab, 0, false);
  }, [activeTab, fetchEvents]);

  const handleLoadMore = () => {
    fetchEvents(activeTab, offset, true);
  };

  const handleCardClick = (item: ExplorerEvent) => {
    if (item.url) router.push(item.url);
  };

  const hasMore = items.length < total;

  return (
    <Container>
      <Header>
        <Image
          src="/images/icons/pulseicon.png"
          alt="Pulse"
          width={36}
          height={36}
          style={{ borderRadius: 8 }}
        />
        <Title>DAO Pulse</Title>
      </Header>
      <Subtitle>Live activity across all pods, governance, and treasury.</Subtitle>

      <StatsRow>
        <StatChip>
          {stats.totalActiveEvents} active event{stats.totalActiveEvents !== 1 ? 's' : ''}
        </StatChip>
        <StatChip>
          {stats.weeklyActiveEvents} new this week
        </StatChip>
      </StatsRow>

      <TabsContainer>
        {(Object.keys(TAB_LABELS) as FilterTab[]).map((tab) => (
          <Tab
            key={tab}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </Tab>
        ))}
      </TabsContainer>

      {isLoading ? (
        <LoadingMessage>Loading activity…</LoadingMessage>
      ) : items.length === 0 ? (
        <EmptyState>No activity found for this filter.</EmptyState>
      ) : (
        <FeedList>
          {items.map((item) => (
            <EventCard
              key={item.id}
              $type={item.type}
              onClick={() => handleCardClick(item)}
            >
              <CardRow>
                <CardLeft>
                  <CardTitle>{item.title}</CardTitle>
                  <CardMeta>
                    <TypeBadge $type={item.type}>
                      {TYPE_LABELS[item.type] ?? item.type}
                    </TypeBadge>
                    {item.pod_name && <span>{item.pod_name}</span>}
                    {item.actor && <span>{truncateAddress(item.actor)}</span>}
                    {item.amount && <AmountBadge>{item.amount}</AmountBadge>}
                    <span>{formatDate(item.timestamp)}</span>
                  </CardMeta>
                </CardLeft>
              </CardRow>
            </EventCard>
          ))}

          {hasMore && (
            <LoadMoreButton onClick={handleLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading…' : `Load more (${total - items.length} remaining)`}
            </LoadMoreButton>
          )}
        </FeedList>
      )}
    </Container>
  );
}
