'use client';

import { useState, useEffect, useMemo } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';
import { User, X, Search, ExternalLink, Twitter, Instagram, Facebook, Youtube, Github, Linkedin, Mail, MessageCircle, Video } from 'lucide-react';
import {
  interestsOptions,
  seekingOptions,
} from '@/features/identity/constants/profileOptions';
import { mapStoredValuesToLabels } from '@/features/identity/utils/formatProfileValues';
import type { UserProfile } from '@/features/identity/types';

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

const SOCIAL_PLATFORMS = [
  { key: 'twitter', label: 'Twitter', Icon: Twitter },
  { key: 'tiktok', label: 'TikTok', Icon: Video },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'discord', label: 'Discord', Icon: MessageCircle },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'twitch', label: 'Twitch', Icon: Video },
  { key: 'github', label: 'GitHub', Icon: Github },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { key: 'email', label: 'Email', Icon: Mail },
];

export default function MembersPage() {
  const { evmAddress: address } = useEvmAddress();
  const [members, setMembers] = useState<MemberWithPods[]>([]);
  const [pods, setPods] = useState<{ id: string; name: string }[]>([]);
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

      // Load all active pod members with their wallets
      const { data: memberRows } = await supabase
        .from('pod_members')
        .select('wallet, pod_id, membership_type')
        .eq('is_active', true);

      if (!memberRows || memberRows.length === 0) {
        setLoading(false);
        return;
      }

      // Unique wallets that have signed TOS
      const uniqueWallets = [...new Set(memberRows.map((r) => r.wallet.toLowerCase()))];

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .in('wallet_address', uniqueWallets)
        .not('tos_signed_at', 'is', null);

      if (!profiles) {
        setLoading(false);
        return;
      }

      // Build pod lookup
      const podMap = new Map((podData || []).map((p) => [p.id, p.name]));

      // Attach pod memberships to each profile
      const enriched: MemberWithPods[] = profiles.map((profile) => {
        const profilePods = memberRows
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

      setMembers(enriched);
      setLoading(false);
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (filterPod && !m.pods.some((p) => p.pod_id === filterPod)) return false;
      if (filterConnect && m.open_to_connect !== filterConnect) return false;
      return true;
    });
  }, [members, search, filterPod, filterConnect]);

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
            <MemberCard key={member.wallet_address} member={member} onClick={() => setSelected(member)} />
          ))}
        </div>
      )}

      {/* Profile Modal */}
      {selected && (
        <MemberModal member={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function MemberCard({ member, onClick }: { member: MemberWithPods; onClick: () => void }) {
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
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#E8F1EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {member.profile_picture ? (
            <img src={member.profile_picture} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <User size={22} color="#6F9E90" />
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

function MemberModal({ member, onClose }: { member: MemberWithPods; onClose: () => void }) {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Anonymous Member';
  const interests = member.interests ? mapStoredValuesToLabels(member.interests, interestsOptions) : [];
  const seeking = member.seeking ? mapStoredValuesToLabels(member.seeking, seekingOptions) : [];
  const connectLabel = CONNECT_LABELS[member.open_to_connect || ''];
  const connectColor = CONNECT_COLORS[member.open_to_connect || ''];
  const socials = SOCIAL_PLATFORMS.filter(({ key }) => !!(member as any)[key]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#8FA09A' }}>
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#E8F1EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {member.profile_picture ? (
              <img src={member.profile_picture} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={32} color="#6F9E90" />
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1A2E28', marginBottom: '4px' }}>{name}</h2>
            {connectLabel && (
              <span style={{ fontSize: '0.8rem', color: connectColor, fontWeight: 600 }}>{connectLabel}</span>
            )}
            {member.website && (
              <a href={member.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#4A7C6F', marginTop: '4px', textDecoration: 'none' }}>
                <ExternalLink size={12} /> {member.website.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}
              </a>
            )}
          </div>
        </div>

        {/* Bio */}
        {member.bio && (
          <p style={{ fontSize: '0.9rem', color: '#3A3A3A', lineHeight: 1.6, marginBottom: '1.25rem' }}>{member.bio}</p>
        )}

        {/* Pods */}
        {member.pods.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Pods</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {member.pods.map((p) => (
                <span key={p.pod_id} style={{
                  fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px',
                  background: p.membership_type === 'leader' ? '#2F5D50' : '#E8F1EE',
                  color: p.membership_type === 'leader' ? '#fff' : '#2F5D50',
                  fontWeight: 500,
                }}>
                  {p.name}{p.membership_type === 'leader' ? ' · Leader' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interests */}
        {interests.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Interests</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {interests.map((label, i) => (
                <span key={i} style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', background: '#F0F5F3', color: '#2F5D50', fontWeight: 500 }}>{label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Seeking */}
        {seeking.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Seeking</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {seeking.map((label, i) => (
                <span key={i} style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', background: '#F9F5F0', color: '#6B5A3E', fontWeight: 500 }}>{label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Socials */}
        {socials.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Connect</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {socials.map(({ key, label, Icon }) => {
                const url = (member as any)[key] as string;
                return (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#2F5D50', textDecoration: 'none' }}>
                    <Icon size={14} />
                    <span style={{ color: '#5F7A74' }}>{label}:</span>
                    <span style={{ color: '#2F5D50' }}>{url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
