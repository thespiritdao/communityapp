// src/app/explorer/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styled from 'styled-components';
import type { ExplorerEvent } from '@/app/api/explorer/route';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import { PodProfileDisplay } from '@/components/PodProfileDisplay';
import { Bot } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'pods' | 'governance' | 'treasury' | 'members' | 'bounties' | 'events' | 'marketplace' | 'forum' | 'knowledge' | 'surveys';

interface ExplorerResponse {
  items: ExplorerEvent[];
  total: number;
  offset: number;
  limit: number;
  stats: {
    totalActiveEvents: number;
    weeklyActiveEvents: number;
  };
  tokenSupply?: {
    systemTotal?: string | null;
    selfTotal?: string | null;
  };
}

// ── Styled components (matches app pattern from my-activity) ──────────────────

const PageWrapper = styled.div`
  min-height: 100vh;
  background-color: #f5f4ed;
  background-image: url('/images/chatbg.png');
`;

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px 80px;
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
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
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

// Color palette derived from SpiritDAO Visual Style Guide
// (src/guides/design/SPIRITDAO_VISUAL_STYLE_GUIDE.md). Sacred minimalism —
// no neons, no harsh blues. Each event type maps to a semantic palette role
// based on what the event communicates: forward motion, completion,
// caution, destruction, supportive coordination, contemplative thought.
const PALETTE = {
  ritualGreen: '#2F5D50',   // primary / forward motion (creation, governance proposal)
  successGreen: '#3F7A5A',  // completion / fruition (executed, approved, fulfilled)
  mutedSage: '#8FAAA1',     // supportive / harmonious (member joins, supportive coord)
  sageDeep: '#6F8F86',      // sage hover — used for less-prominent supportive events
  warmAmber: '#C6933F',     // caution / deliberation (queued, in-flight, escrow held)
  earthenRed: '#8B3A3A',    // destructive / serious (burns, vetoes, rejections)
  mutedBrown: '#9B7E5A',    // grounded earth tone (treasury motion)
  groundedNeutral: '#BFB7A8', // muted neutral (canceled, disabled, low-signal)
  contemplative: '#7A6E8F', // muted dusty violet — deliberation/knowledge/AI
};

const EVENT_COLORS: Record<string, string> = {
  // pods — creation = primary; veto/deletion = destructive; modules = supportive
  pod_created: PALETTE.ritualGreen,
  pod_activated: PALETTE.successGreen,
  pod_vetoed: PALETTE.earthenRed,
  pod_deletion_proposed: PALETTE.earthenRed,
  pod_module_enabled: PALETTE.mutedSage,
  pod_module_disabled: PALETTE.groundedNeutral,
  // members — joining is harmonious / supportive
  member_joined: PALETTE.mutedSage,
  member_introduced: PALETTE.ritualGreen,
  member_joined_via_referral: PALETTE.mutedSage,
  pod_member_applied: PALETTE.mutedSage,
  pod_member_approved: PALETTE.successGreen,
  pod_member_rejected: PALETTE.earthenRed,
  hat_minted: PALETTE.warmAmber,
  hat_burned: PALETTE.earthenRed,
  hat_renounced: PALETTE.earthenRed,
  profile_updated: PALETTE.sageDeep,
  chat_channel_created: PALETTE.mutedSage,
  chat_first_message_in_pod: PALETTE.mutedSage,
  // governance — deliberation lifecycle
  proposal_created: PALETTE.ritualGreen,
  proposal_queued: PALETTE.warmAmber,
  proposal_executed: PALETTE.successGreen,
  proposal_defeated: PALETTE.earthenRed,
  proposal_canceled: PALETTE.groundedNeutral,
  vote_cast: PALETTE.contemplative,
  // treasury — earth tones for value movement
  treasury_movement: PALETTE.mutedBrown,
  donation: PALETTE.successGreen,
  gift: PALETTE.contemplative,
  burn: PALETTE.earthenRed,
  // bounties — work lifecycle
  bounty_created: PALETTE.ritualGreen,
  bounty_completed: PALETTE.successGreen,
  work_submitted: PALETTE.warmAmber,
  work_approved: PALETTE.successGreen,
  work_rejected: PALETTE.earthenRed,
  bid_placed: PALETTE.mutedSage,
  bid_accepted: PALETTE.successGreen,
  bid_rejected: PALETTE.earthenRed,
  bid_review_submitted: PALETTE.contemplative,
  milestone_reached: PALETTE.successGreen,
  dispute_opened: PALETTE.earthenRed,
  dispute_evidence_added: PALETTE.warmAmber,
  dispute_mediator_assigned: PALETTE.contemplative,
  dispute_resolved: PALETTE.successGreen,
  // events — gathering, holding, releasing
  event_published: PALETTE.ritualGreen,
  event_rsvp: PALETTE.mutedSage,
  event_escrow_held: PALETTE.warmAmber,
  event_escrow_released: PALETTE.successGreen,
  event_tokens_distributed: PALETTE.successGreen,
  // marketplace
  marketplace_purchase: PALETTE.contemplative,
  marketplace_listing_created: PALETTE.ritualGreen,
  marketplace_listing_updated: PALETTE.mutedSage,
  marketplace_order_fulfilled: PALETTE.successGreen,
  marketplace_order_shipped: PALETTE.mutedSage,
  marketplace_order_refunded: PALETTE.warmAmber,
  marketplace_order_cancelled: PALETTE.groundedNeutral,
  // forum — deliberation; moderator actions are destructive intent
  forum_thread_created: PALETTE.ritualGreen,
  forum_post_created: PALETTE.mutedSage,
  forum_poll_created: PALETTE.ritualGreen,
  forum_poll_voted: PALETTE.contemplative,
  forum_post_reaction: PALETTE.mutedSage,
  forum_moderator_action: PALETTE.earthenRed,
  forum_thread_summary_published: PALETTE.contemplative,
  forum_thread_resolved: PALETTE.successGreen,
  forum_thread_bookmarked: PALETTE.mutedSage,
  // knowledge — contemplative thought
  knowledge_item_published: PALETTE.contemplative,
  knowledge_item_updated: PALETTE.contemplative,
  // community agent — AI/contemplative
  agent_enabled: PALETTE.contemplative,
  // surveys — community input/contemplation
  survey_published: PALETTE.ritualGreen,
  survey_response_submitted: PALETTE.mutedSage,
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
  pod_activated: 'Pod Activated',
  pod_vetoed: 'Pod Vetoed',
  pod_deletion_proposed: 'Pod Deletion',
  pod_module_enabled: 'Module Enabled',
  pod_module_disabled: 'Module Disabled',
  member_joined: 'Joined',
  member_introduced: 'New Member',
  member_joined_via_referral: 'Referred',
  pod_member_applied: 'Applied',
  pod_member_approved: 'Approved',
  pod_member_rejected: 'Rejected',
  hat_minted: 'Hat Minted',
  hat_burned: 'Hat Burned',
  hat_renounced: 'Hat Renounced',
  profile_updated: 'Profile Updated',
  chat_channel_created: 'Channel Created',
  chat_first_message_in_pod: 'First Message',
  proposal_created: 'Proposal',
  proposal_queued: 'Queued',
  proposal_executed: 'Executed',
  proposal_defeated: 'Defeated',
  proposal_canceled: 'Canceled',
  vote_cast: 'Vote',
  treasury_movement: 'Treasury',
  donation: 'Donation',
  gift: 'Gift',
  burn: 'Burn',
  bounty_created: 'Bounty',
  bounty_completed: 'Completed',
  work_submitted: 'Submitted',
  work_approved: 'Approved',
  work_rejected: 'Rejected',
  bid_placed: 'Bid Placed',
  bid_accepted: 'Bid Accepted',
  bid_rejected: 'Bid Rejected',
  bid_review_submitted: 'Bid Review',
  milestone_reached: 'Milestone',
  dispute_opened: 'Dispute',
  dispute_evidence_added: 'Evidence',
  dispute_mediator_assigned: 'Mediator',
  dispute_resolved: 'Resolved',
  event_published: 'Event',
  event_rsvp: 'RSVP',
  event_escrow_held: 'Escrow Held',
  event_escrow_released: 'Escrow Released',
  event_tokens_distributed: 'Tokens Distributed',
  marketplace_purchase: 'Purchase',
  marketplace_listing_created: 'Listing',
  marketplace_listing_updated: 'Listing Updated',
  marketplace_order_fulfilled: 'Fulfilled',
  marketplace_order_shipped: 'Shipped',
  marketplace_order_refunded: 'Refunded',
  marketplace_order_cancelled: 'Cancelled',
  forum_thread_created: 'Thread',
  forum_post_created: 'Reply',
  forum_poll_created: 'Poll',
  forum_poll_voted: 'Poll Vote',
  forum_post_reaction: 'Reaction',
  forum_moderator_action: 'Moderation',
  forum_thread_summary_published: 'Summary',
  forum_thread_resolved: 'Resolved',
  forum_thread_bookmarked: 'Bookmarked',
  knowledge_item_published: 'Published',
  knowledge_item_updated: 'Updated',
  agent_enabled: 'AI Agent',
  survey_published: 'Survey',
  survey_response_submitted: 'Response',
};

const TAB_LABELS: Record<FilterTab, string> = {
  all: 'All',
  pods: 'Pods',
  governance: 'Governance',
  treasury: 'Treasury',
  members: 'Members',
  bounties: 'Bounties',
  events: 'Events',
  marketplace: 'Marketplace',
  forum: 'Forum',
  knowledge: 'Knowledge',
  surveys: 'Surveys',
};


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
  const [tokenSupply, setTokenSupply] = useState<{ systemTotal?: string | null; selfTotal?: string | null }>({});
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
        if (data.tokenSupply) setTokenSupply(data.tokenSupply);
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
    <PageWrapper>
    <Container>
      <Header>
        <Image
          src="/images/icons/pulseicon.png"
          alt="Pulse"
          width={36}
          height={36}
        />
        <Title>SpiritDAO Pulse</Title>
      </Header>
      <Subtitle>Live activity across all pods, governance, and treasury.</Subtitle>

      <StatsRow>
        <StatChip>
          {stats.totalActiveEvents} upcoming event{stats.totalActiveEvents !== 1 ? 's' : ''}
        </StatChip>
        <StatChip>
          {stats.weeklyActiveEvents} new this week
        </StatChip>
      </StatsRow>

      {(tokenSupply.systemTotal || tokenSupply.selfTotal) && (
        <div style={{
          display: 'flex',
          gap: 12,
          marginBottom: 24,
        }}>
          {tokenSupply.systemTotal && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#fff',
              border: '1px solid #D8D2C8',
              borderRadius: 10,
              padding: '8px 14px',
              minWidth: 0,
            }}>
              <Image
                src="/images/erc20tokens/SystemToken.png"
                alt="$SYSTEM"
                width={22}
                height={22}
                style={{ borderRadius: '50%' }}
              />
              <div style={{ fontSize: 12 }}>
                <div style={{ color: '#5F5A54', fontWeight: 500, lineHeight: 1.2 }}>$SYSTEM Total</div>
                <div style={{ color: '#1a1a1a', fontWeight: 600, fontSize: 14 }}>
                  {Number(tokenSupply.systemTotal).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}
          {tokenSupply.selfTotal && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#fff',
              border: '1px solid #D8D2C8',
              borderRadius: 10,
              padding: '8px 14px',
              minWidth: 0,
            }}>
              <Image
                src="/images/erc20tokens/SelfToken.png"
                alt="$SELF"
                width={22}
                height={22}
                style={{ borderRadius: '50%' }}
              />
              <div style={{ fontSize: 12 }}>
                <div style={{ color: '#5F5A54', fontWeight: 500, lineHeight: 1.2 }}>$SELF Minted</div>
                <div style={{ color: '#1a1a1a', fontWeight: 600, fontSize: 14 }}>
                  {Number(tokenSupply.selfTotal).toLocaleString('en-US', { maximumFractionDigits: 2 })} hrs
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
                    {item.amount && <AmountBadge>{item.amount}</AmountBadge>}
                    <span>{formatDate(item.timestamp)}</span>
                  </CardMeta>
                  {/* Fee breakdown — only for minted donations that carry the
                      full breakdown metadata. Direct donations (no fee split /
                      no $SYSTEM) skip it, so no $NaN rows are ever shown. */}
                  {item.type === 'donation' && item.metadata &&
                    item.metadata.fiatAmount != null &&
                    !Number.isNaN(Number(item.metadata.fiatAmount)) && (
                    <div style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      background: '#E8F1EE',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#3A3A3A',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: '4px 16px',
                      lineHeight: 1.6,
                    }}>
                      <span>Donation</span>
                      <span style={{ textAlign: 'right', fontWeight: 500 }}>${Number(item.metadata.fiatAmount).toFixed(2)}</span>
                      <span style={{ fontWeight: 600, gridColumn: '1 / -1', marginTop: 4, color: '#2F5D50' }}>Fees</span>
                      <span style={{ paddingLeft: 8 }}>Stripe processing</span>
                      <span style={{ textAlign: 'right', color: '#5F5A54' }}>-${Number(item.metadata.stripeFee || 0).toFixed(2)}</span>
                      <span style={{ paddingLeft: 8 }}>Operations (4%)</span>
                      <span style={{ textAlign: 'right', color: '#5F5A54' }}>-${Number(item.metadata.operationsFee || 0).toFixed(2)}</span>
                      <span style={{ paddingLeft: 8 }}>Eight Dignities (4%)</span>
                      <span style={{ textAlign: 'right', color: '#5F5A54' }}>-${Number(item.metadata.dignitiesFee || 0).toFixed(2)} $SYSTEM</span>
                      <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #D8D2C8', margin: '4px 0' }} />
                      <span style={{ fontWeight: 600, color: '#2F5D50' }}>$SYSTEM Generated</span>
                      <span style={{ textAlign: 'right', fontWeight: 600, color: '#3F7A5A' }}>
                        {Number(item.metadata.systemTokens || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} $SYSTEM
                      </span>
                    </div>
                  )}
                  {(item.type === 'treasury_movement' || item.type === 'gift') && (item.actor_address || item.recipient_address) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                      {item.actor_address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                          <span style={{ width: 32, flexShrink: 0 }}>From:</span>
                          <UserProfileDisplay walletAddress={item.actor_address} size="sm" showModal={true} />
                        </div>
                      )}
                      {item.recipient_address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                          <span style={{ width: 32, flexShrink: 0 }}>To:</span>
                          <UserProfileDisplay walletAddress={item.recipient_address} size="sm" showModal={true} />
                        </div>
                      )}
                    </div>
                  )}
                  {item.type === 'agent_enabled' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                      {item.pod_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                          <span style={{ width: 32, flexShrink: 0 }}>Pod:</span>
                          <PodProfileDisplay podId={item.pod_id} size="sm" />
                        </div>
                      )}
                      {item.actor_address && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                          <span style={{ width: 32, flexShrink: 0 }}>By:</span>
                          <UserProfileDisplay walletAddress={item.actor_address} size="sm" showModal={true} />
                        </div>
                      )}
                      {item.metadata?.agent_name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7A6E8F' }}>
                          <span style={{ width: 32, flexShrink: 0 }}>
                            <Bot style={{ width: 14, height: 14 }} />
                          </span>
                          <span style={{ fontWeight: 500 }}>{item.metadata.agent_name}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {item.type !== 'treasury_movement' && item.type !== 'gift' && item.type !== 'agent_enabled' && item.actor && (
                    <CardMeta style={{ marginTop: 4 }}>
                      <span>{item.actor}</span>
                    </CardMeta>
                  )}
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
    </PageWrapper>
  );
}
