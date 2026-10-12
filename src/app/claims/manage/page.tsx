'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Shield, ArrowLeft, ExternalLink, CheckCircle, XCircle, Clock, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { getClientHatId } from '@/lib/hatRegistryClient';
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

export default function ClaimsManagePage() {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [claims, setClaims] = useState<TokenClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Auth check — must hold Exec Pod Leader hat
  useEffect(() => {
    if (!address) return;

    const checkAuth = async () => {
      try {
        const execHatId = getClientHatId('EXECUTIVE_POD_LEADER');
        if (!execHatId || !process.env.NEXT_PUBLIC_HATS_CONTRACT) {
          setAuthorized(false);
          return;
        }

        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
        });

        const balance = await publicClient.readContract({
          address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
          abi: [
            {
              name: 'balanceOf',
              type: 'function',
              inputs: [
                { name: 'wearer', type: 'address' },
                { name: 'hatId', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'balanceOf',
          args: [address as `0x${string}`, BigInt(execHatId)],
        });

        setAuthorized((balance as bigint) > 0n);
      } catch {
        setAuthorized(false);
      }
    };

    checkAuth();
  }, [address]);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all' ? '/api/claims/list?all=true' : '/api/claims/list';
      const res = await fetch(url, { headers: await ensureAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setClaims(data);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (authorized) fetchClaims();
  }, [authorized, fetchClaims]);

  const handleAction = async (claimId: string, action: 'approve' | 'reject') => {
    if (!address) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/claims/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await ensureAuthHeaders()) },
        body: JSON.stringify({
          claimId,
          action,
          reviewerAddress: address,
          note: reviewNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Action failed');
        return;
      }
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

  // Loading auth check
  if (authorized === null) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F4ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#6B7280' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <p>Verifying access…</p>
        </div>
      </div>
    );
  }

  // Not authorized
  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F4ED', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <Shield size={48} color="#9CA3AF" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#111827' }}>Access Restricted</h2>
          <p style={{ color: '#6B7280', marginBottom: '24px', fontSize: '14px' }}>
            This page is only accessible to Executive Pod members.
          </p>
          <button
            onClick={() => router.push('/claims')}
            style={{ backgroundColor: '#2F5D50', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
          >
            Go to Claims
          </button>
        </div>
      </div>
    );
  }

  const pendingCount = claims.filter((c) => c.status === 'awaiting_executive_approval').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F4ED', paddingBottom: 'var(--bottom-nav-height, 80px)' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={20} color="#2F5D50" />
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>Claims Management</h1>
            </div>
            <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>Executive Pod · Token Payout Requests</p>
          </div>
          <button
            onClick={fetchClaims}
            disabled={loading}
            style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#374151' }}
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Pending', count: pendingCount, color: '#92400E', bg: '#FEF3C7' },
            { label: 'Approved', count: claims.filter((c) => c.status === 'approved').length, color: '#065F46', bg: '#D1FAE5' },
            { label: 'Rejected', count: claims.filter((c) => c.status === 'rejected').length, color: '#991B1B', bg: '#FEE2E2' },
          ].map((stat) => (
            <div key={stat.label} style={{ background: stat.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '24px', fontWeight: 700, color: stat.color, margin: 0 }}>{stat.count}</p>
              <p style={{ fontSize: '12px', color: stat.color, margin: 0 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                border: filter === f ? 'none' : '1px solid #D1D5DB',
                background: filter === f ? '#2F5D50' : 'white',
                color: filter === f ? 'white' : '#374151',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {f === 'pending' ? 'Pending Review' : 'All Claims'}
            </button>
          ))}
        </div>

        {/* Claims list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <p>Loading claims…</p>
          </div>
        ) : claims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', color: '#9CA3AF' }}>
            <Clock size={32} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '15px', fontWeight: 500 }}>No claims found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {claims.map((claim) => {
              const sc = STATUS_COLORS[claim.status] || STATUS_COLORS['pending_burn'];
              const isReviewing = reviewingId === claim.id;
              const isPending = claim.status === 'awaiting_executive_approval';

              return (
                <div
                  key={claim.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  {/* Claim header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                        {Number(claim.system_tokens_to_burn).toLocaleString()} $SYSTEM
                      </p>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>
                        Submitted {formatDate(claim.created_at)}
                      </p>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: sc.bg,
                      color: sc.text,
                      border: `1px solid ${sc.border}`,
                    }}>
                      {STATUS_LABELS[claim.status]}
                    </span>
                  </div>

                  {/* Claimant details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', fontSize: '13px', color: '#374151' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={14} color="#6B7280" />
                      <span style={{ fontFamily: 'monospace' }}>{formatWallet(claim.wallet_address)}</span>
                      <Link
                        href={`/identity/${claim.wallet_address}`}
                        style={{ color: '#2F5D50', textDecoration: 'none', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        View Profile <ExternalLink size={11} />
                      </Link>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#9CA3AF', fontSize: '12px' }}>Email:</span>
                      <span>{claim.payout_email}</span>
                    </div>
                    {claim.payout_note && (
                      <div style={{ backgroundColor: '#F9FAFB', padding: '8px 10px', borderRadius: '6px', fontStyle: 'italic', color: '#6B7280' }}>
                        "{claim.payout_note}"
                      </div>
                    )}
                    {claim.burn_tx_hash && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#9CA3AF', fontSize: '12px' }}>Burn tx:</span>
                        <a
                          href={`https://basescan.org/tx/${claim.burn_tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2F5D50', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}
                        >
                          {formatWallet(claim.burn_tx_hash)} <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                    {claim.reviewed_by && (
                      <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        Reviewed by {formatWallet(claim.reviewed_by)} on {formatDate(claim.reviewed_at!)}
                        {claim.reviewer_note && <span> — "{claim.reviewer_note}"</span>}
                      </div>
                    )}
                  </div>

                  {/* Actions — only for pending claims */}
                  {isPending && (
                    <div>
                      {!isReviewing ? (
                        <button
                          onClick={() => setReviewingId(claim.id)}
                          style={{
                            backgroundColor: '#2F5D50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Review Claim
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <textarea
                            placeholder="Reviewer note (optional)..."
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                            rows={2}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: '1px solid #D1D5DB',
                              borderRadius: '8px',
                              fontSize: '13px',
                              resize: 'vertical',
                              boxSizing: 'border-box',
                            }}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleAction(claim.id, 'approve')}
                              disabled={actionLoading}
                              style={{
                                flex: 1,
                                backgroundColor: actionLoading ? '#D1D5DB' : '#3F7A5A',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: actionLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                            >
                              <CheckCircle size={15} /> Approve
                            </button>
                            <button
                              onClick={() => handleAction(claim.id, 'reject')}
                              disabled={actionLoading}
                              style={{
                                flex: 1,
                                backgroundColor: actionLoading ? '#D1D5DB' : '#8B3A3A',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: actionLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                              }}
                            >
                              <XCircle size={15} /> Reject
                            </button>
                            <button
                              onClick={() => { setReviewingId(null); setReviewNote(''); }}
                              disabled={actionLoading}
                              style={{
                                backgroundColor: 'white',
                                color: '#374151',
                                border: '1px solid #D1D5DB',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '13px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
