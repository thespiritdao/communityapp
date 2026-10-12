'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { ExternalLink, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/utils/supabaseClient';
import { ensureAuthHeaders } from '@/lib/authHeaders';

type ClaimStatus = 'awaiting_executive_approval' | 'approved' | 'rejected' | 'pending_burn';

interface TokenClaim {
  id: string;
  wallet_address: string;
  system_tokens_to_burn: number;
  payout_email: string;
  payout_note?: string;
  status: ClaimStatus;
  burn_tx_hash?: string;
  burned_at?: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_note?: string;
}

interface UserProfile {
  wallet_address: string;
  first_name?: string;
  last_name?: string;
  profile_picture?: string;
}

const STATUS_LABELS: Record<ClaimStatus, string> = {
  awaiting_executive_approval: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  pending_burn: 'Pending Burn',
};

const STATUS_COLORS: Record<ClaimStatus, { bg: string; text: string; border: string }> = {
  awaiting_executive_approval: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  approved: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  rejected: { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  pending_burn: { bg: '#EDE9FE', text: '#4C1D95', border: '#C4B5FD' },
};

function ProfileCard({ profile, walletAddress }: { profile?: UserProfile; walletAddress: string }) {
  const fullName = profile?.first_name || profile?.last_name
    ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
    : null;
  const initials = fullName ? fullName[0].toUpperCase() : '?';

  return (
    <Link href={`/identity/${walletAddress}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {profile?.profile_picture ? (
        <img
          src={profile.profile_picture}
          alt={fullName || walletAddress}
          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280' }}>{initials}</span>
        </div>
      )}
      <div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>
          {fullName || 'Unknown Member'}
        </p>
        <p style={{ fontSize: '11px', color: '#2F5D50', margin: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
          View Profile <ExternalLink size={9} />
        </p>
      </div>
    </Link>
  );
}

function SystemTokenBadge({ amount }: { amount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <img
        src="/images/erc20tokens/SystemToken.png"
        alt="$SYSTEM"
        style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
      <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>
        {Number(amount).toLocaleString()} $SYSTEM
      </span>
    </div>
  );
}

interface ClaimsManagementPanelProps {
  canManage: boolean;
}

export function ClaimsManagementPanel({ canManage }: ClaimsManagementPanelProps) {
  const { evmAddress: address } = useEvmAddress();
  const [allClaims, setAllClaims] = useState<TokenClaim[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      // Always fetch all claims so stats are always accurate
      const res = await fetch('/api/claims/list?all=true', {
        headers: await ensureAuthHeaders(),
      });
      if (res.ok) {
        const data: TokenClaim[] = await res.json();
        setAllClaims(data);

        // Fetch profiles for all unique wallets
        const wallets = [...new Set(data.map((c) => c.wallet_address))];
        if (wallets.length > 0) {
          const { data: profileData } = await supabase
            .from('public_profiles')
            .select('wallet_address, first_name, last_name, profile_picture')
            .in('wallet_address', wallets);
          if (profileData) {
            const map: Record<string, UserProfile> = {};
            for (const p of profileData) map[p.wallet_address] = p;
            setProfiles(map);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleAction = async (claimId: string, action: 'approve' | 'reject') => {
    if (!address) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/claims/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await ensureAuthHeaders()) },
        body: JSON.stringify({ claimId, action, reviewerAddress: address, note: reviewNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Action failed'); return; }
      setReviewingId(null);
      setReviewNote('');
      await fetchClaims();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const formatWallet = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Stats always use the full set; display list is filtered by tab
  const claims = filter === 'pending'
    ? allClaims.filter((c) => c.status === 'awaiting_executive_approval')
    : allClaims;

  const pendingCount = allClaims.filter((c) => c.status === 'awaiting_executive_approval').length;

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280' }}>
        <p>You do not have permission to manage claims.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Token Claim Requests</h3>
          <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Member fiat payout requests requiring EP approval</p>
        </div>
        <button onClick={fetchClaims} disabled={loading}
          style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#374151' }}>
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {[
          { label: 'Pending', count: pendingCount, color: '#92400E', bg: '#FEF3C7' },
          { label: 'Approved', count: allClaims.filter((c) => c.status === 'approved').length, color: '#065F46', bg: '#D1FAE5' },
          { label: 'Rejected', count: allClaims.filter((c) => c.status === 'rejected').length, color: '#991B1B', bg: '#FEE2E2' },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: s.color, margin: 0 }}>{s.count}</p>
            <p style={{ fontSize: '11px', color: s.color, margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['pending', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '5px 14px', borderRadius: '20px', border: filter === f ? 'none' : '1px solid #D1D5DB', background: filter === f ? '#2F5D50' : 'white', color: filter === f ? 'white' : '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            {f === 'pending' ? 'Pending' : 'All'}
          </button>
        ))}
      </div>

      {/* Claims list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#9CA3AF' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px' }}>Loading…</p>
        </div>
      ) : claims.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', background: '#F9FAFB', borderRadius: '10px', color: '#9CA3AF' }}>
          <Clock size={28} style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: '14px', fontWeight: 500 }}>No claims found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {claims.map((claim) => {
            const sc = STATUS_COLORS[claim.status] || STATUS_COLORS['pending_burn'];
            const isPending = claim.status === 'awaiting_executive_approval';
            const isReviewing = reviewingId === claim.id;
            const profile = profiles[claim.wallet_address];

            return (
              <div key={claim.id} style={{ background: 'white', borderRadius: '10px', padding: '14px', border: '1px solid #E5E7EB' }}>

                {/* Header row: profile card + status badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <ProfileCard profile={profile} walletAddress={claim.wallet_address} />
                  <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, flexShrink: 0 }}>
                    {STATUS_LABELS[claim.status]}
                  </span>
                </div>

                {/* Amount row */}
                <div style={{ marginBottom: '10px' }}>
                  <SystemTokenBadge amount={claim.system_tokens_to_burn} />
                  <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0 28px' }}>{formatDate(claim.created_at)}</p>
                </div>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', color: '#374151', marginBottom: '10px' }}>
                  <div><span style={{ color: '#9CA3AF' }}>Email: </span>{claim.payout_email}</div>
                  {claim.payout_note && (
                    <div style={{ fontStyle: 'italic', color: '#6B7280', backgroundColor: '#F9FAFB', padding: '6px 8px', borderRadius: '6px' }}>
                      "{claim.payout_note}"
                    </div>
                  )}
                  {claim.burn_tx_hash && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: '#9CA3AF' }}>Burn tx: </span>
                      <a href={`https://basescan.org/tx/${claim.burn_tx_hash}`} target="_blank" rel="noreferrer"
                        style={{ color: '#2F5D50', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {formatWallet(claim.burn_tx_hash)} <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                  {claim.reviewed_by && (
                    <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                      Reviewed on {formatDate(claim.reviewed_at!)}
                      {claim.reviewer_note && <span> — "{claim.reviewer_note}"</span>}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {isPending && (
                  !isReviewing ? (
                    <button onClick={() => setReviewingId(claim.id)}
                      style={{ backgroundColor: '#2F5D50', color: 'white', border: 'none', borderRadius: '7px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Review
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <textarea placeholder="Reviewer note (optional)..." value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '7px', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleAction(claim.id, 'approve')} disabled={actionLoading}
                          style={{ flex: 1, backgroundColor: actionLoading ? '#D1D5DB' : '#3F7A5A', color: 'white', border: 'none', borderRadius: '7px', padding: '7px', fontSize: '12px', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <CheckCircle size={13} /> Approve
                        </button>
                        <button onClick={() => handleAction(claim.id, 'reject')} disabled={actionLoading}
                          style={{ flex: 1, backgroundColor: actionLoading ? '#D1D5DB' : '#8B3A3A', color: 'white', border: 'none', borderRadius: '7px', padding: '7px', fontSize: '12px', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <XCircle size={13} /> Reject
                        </button>
                        <button onClick={() => { setReviewingId(null); setReviewNote(''); }} disabled={actionLoading}
                          style={{ backgroundColor: 'white', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '7px', padding: '7px 10px', fontSize: '12px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
