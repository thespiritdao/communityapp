'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { supabase } from '@/utils/supabaseClient';
import { User, Search } from 'lucide-react';
import type { UserProfile } from '@/features/identity/types';
import { ProfileModal } from '@/features/identity/components/ProfileModal';

interface MemberWithPods extends UserProfile {
  pods: { pod_id: string; name: string; membership_type: string }[];
}

const CONNECT_LABELS: Record<string, string> = {
  low_limited: 'Low / Limited',
  open_available: 'Open / Available',
  actively_collaborate: 'Actively Collaborating',
};

const CONNECT_COLORS: Record<string, string> = {
  low_limited: '#8FA09A',
  open_available: '#4A7C6F',
  actively_collaborate: '#2F5D50',
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export default function MembersPage() {
  const address = useUserWallet();
  const [members, setMembers] = useState<MemberWithPods[]>([]);
  const [pods, setPods] = useState<{ id: string; name: string }[]>([]);
  const [onlineWallets, setOnlineWallets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPod, setFilterPod] = useState('');
  const [filterConnect, setFilterConnect] = useState('');
  const [selected, setSelected] = useState<MemberWithPods | null>(null);

  useEffect(() => {
    const load = async () => {
      // Load all pods for filter dropdown
      const { data: podData } = await supabase
        .from('pods')
        .select('id, name')
        .eq('status', 'active')
        .order('name');

      if (podData) setPods(podData);

      // Load all TOS-signed user profiles (primary source — not limited to pod members)
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .not('tos_signed_at', 'is', null);

      if (!profiles || profiles.length === 0) {
        setLoading(false);
        return;
      }

      // Load all active pod members to enrich profiles with pod badges
      const { data: memberRows } = await supabase
        .from('pod_members')
        .select('wallet, pod_id, membership_type')
        .eq('is_active', true);

      // Build pod lookup
      const podMap = new Map((podData || []).map((p) => [p.id, p.name]));

      // Attach pod memberships to each profile
      const enriched: MemberWithPods[] = profiles.map((profile) => {
        const profilePods = (memberRows || [])
          .filter((r) => r.wallet.toLowerCase() === profile.wallet_address.toLowerCase())
          .map((r) => ({
            pod_id: r.pod_id,
            name: podMap.get(r.pod_id) || 'Unknown Pod',
            membership_type: r.membership_type,
          }));
        return { ...profile, pods: profilePods };
      });

      // Sort: actively_collaborate first, then open_available, then rest; alphabetical within
      enriched.sort((a, b) => {
        const order = { actively_collaborate: 0, open_available: 1, low_limited: 2 };
        const aOrder = order[a.open_to_connect as keyof typeof order] ?? 3;
        const bOrder = order[b.open_to_connect as keyof typeof order] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return aName.localeCompare(bName);
      });

      // Fetch presence (who was active in the last 5 minutes)
      const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      const { data: presenceRows } = await supabase
        .from('user_presence')
        .select('wallet_address')
        .gte('last_seen_at', cutoff);

      if (presenceRows) {
        setOnlineWallets(new Set(presenceRows.map((r) => r.wallet_address.toLowerCase())));
      }

      setMembers(enriched);
      setLoading(false);
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const connectOrder = { actively_collaborate: 0, open_available: 1, low_limited: 2 };
    return members
      .filter((m) => {
        const name = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
        if (search && !name.includes(search.toLowerCase())) return false;
        if (filterPod && !m.pods.some((p) => p.pod_id === filterPod)) return false;
        if (filterConnect && m.open_to_connect !== filterConnect) return false;
        return true;
      })
      .sort((a, b) => {
        const aOnline = onlineWallets.has(a.wallet_address.toLowerCase()) ? 0 : 1;
        const bOnline = onlineWallets.has(b.wallet_address.toLowerCase()) ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        const aConn = connectOrder[a.open_to_connect as keyof typeof connectOrder] ?? 3;
        const bConn = connectOrder[b.open_to_connect as keyof typeof connectOrder] ?? 3;
        if (aConn !== bConn) return aConn - bConn;
        const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return aName.localeCompare(bName);
      });
  }, [members, onlineWallets, search, filterPod, filterConnect]);

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Please connect your wallet to view members.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1A2E28', marginBottom: '0.25rem' }}>
          Members
        </h1>
        <p style={{ color: '#5F7A74', fontSize: '0.95rem' }}>
          {loading ? 'Loading…' : `${filtered.length} member${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8FA09A' }} />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '34px',
              paddingRight: '12px',
              paddingTop: '8px',
              paddingBottom: '8px',
              border: '1px solid #C8D8D4',
              borderRadius: '8px',
              fontSize: '0.9rem',
              color: '#1A2E28',
              background: '#fff',
              outline: 'none',
            }}
          />
        </div>

        {/* Pod filter */}
        <select
          value={filterPod}
          onChange={(e) => setFilterPod(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #C8D8D4',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#1A2E28',
            background: '#fff',
            minWidth: '160px',
          }}
        >
          <option value="">All Pods</option>
          {pods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Connect filter */}
        <select
          value={filterConnect}
          onChange={(e) => setFilterConnect(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #C8D8D4',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#1A2E28',
            background: '#fff',
            minWidth: '180px',
          }}
        >
          <option value="">All Availability</option>
          <option value="actively_collaborate">Actively Collaborating</option>
          <option value="open_available">Open / Available</option>
          <option value="low_limited">Low / Limited</option>
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ background: '#F0F5F3', borderRadius: '12px', height: '140px', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#8FA09A' }}>
          <User size={48} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <p>No members found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {filtered.map((member) => (
            <MemberCard
              key={member.wallet_address}
              member={member}
              isOnline={onlineWallets.has(member.wallet_address.toLowerCase())}
              onClick={() => setSelected(member)}
            />
          ))}
        </div>
      )}

      {/* Profile Modal */}
      {selected && (
        <ProfileModal
          user={selected}
          users={members}
          pods={selected.pods}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function MemberCard({ member, isOnline, onClick }: { member: MemberWithPods; isOnline: boolean; onClick: () => void }) {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Anonymous Member';
  const connectColor = CONNECT_COLORS[member.open_to_connect || ''] || '#C8D8D4';
  const connectLabel = CONNECT_LABELS[member.open_to_connect || ''];

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid #E0EEEA',
        borderRadius: '12px',
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(47,93,80,0.12)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'none';
      }}
    >
      {/* Avatar + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Avatar with online dot */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', background: '#E8F1EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {member.profile_picture ? (
              <img src={member.profile_picture} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={22} color="#6F9E90" />
            )}
          </div>
          {isOnline && (
            <span style={{
              position: 'absolute',
              bottom: '1px',
              right: '1px',
              width: '11px',
              height: '11px',
              borderRadius: '50%',
              background: '#22C55E',
              border: '2px solid #fff',
            }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#1A2E28', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          {connectLabel && (
            <div style={{ fontSize: '0.75rem', color: connectColor, fontWeight: 500, marginTop: '2px' }}>
              {connectLabel}
            </div>
          )}
        </div>
      </div>

      {/* Bio snippet */}
      {member.bio && (
        <p style={{ fontSize: '0.82rem', color: '#5F7A74', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
          {member.bio}
        </p>
      )}

      {/* Pod badges */}
      {member.pods.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {member.pods.slice(0, 3).map((p) => (
            <span key={p.pod_id} style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: '999px',
              background: p.membership_type === 'leader' ? '#2F5D50' : '#E8F1EE',
              color: p.membership_type === 'leader' ? '#fff' : '#2F5D50',
              fontWeight: 500,
            }}>
              {p.name}
            </span>
          ))}
          {member.pods.length > 3 && (
            <span style={{ fontSize: '0.7rem', color: '#8FA09A' }}>+{member.pods.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  );
}

