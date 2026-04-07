'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEvmAddress, useCurrentUser, useSendUserOperation } from '@coinbase/cdp-hooks';
import { createPublicClient, http, encodeFunctionData, parseUnits, getAddress } from 'viem';
import { base } from 'viem/chains';
import { getClientHatId } from '@/lib/hatRegistryClient';
import { Shield, RefreshCw, CheckCircle, Clock, Coins } from 'lucide-react';

const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

const MINT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

type DonationStatus =
  | 'payment_pending'
  | 'awaiting_settlement'
  | 'awaiting_executive_approval'
  | 'pending_mint'
  | 'minting'
  | 'minted'
  | 'failed'
  | 'disputed';

interface Donation {
  id: string;
  user_wallet: string;
  fiat_amount: number;
  system_tokens_to_mint: number;
  community_tokens_to_mint: number;
  org_fee: number;
  stripe_fee: number;
  payment_method: string;
  status: DonationStatus;
  settlement_date?: string;
  created_at: string;
  minted_at?: string;
  tx_hash?: string;
}

const STATUS_LABEL: Record<DonationStatus, string> = {
  payment_pending: 'Payment Pending',
  awaiting_settlement: 'Awaiting Settlement',
  awaiting_executive_approval: 'Needs Approval',
  pending_mint: 'Ready to Mint',
  minting: 'Minting…',
  minted: 'Minted',
  failed: 'Failed',
  disputed: 'Disputed',
};

const STATUS_COLOR: Record<DonationStatus, string> = {
  payment_pending: '#9CA3AF',
  awaiting_settlement: '#D97706',
  awaiting_executive_approval: '#2563EB',
  pending_mint: '#059669',
  minting: '#7C3AED',
  minted: '#065F46',
  failed: '#DC2626',
  disputed: '#DC2626',
};

export default function DonationsManagePage() {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auth check — must hold Exec Pod Leader hat
  useEffect(() => {
    if (!address || !HATS_CONTRACT) return;
    const check = async () => {
      try {
        const execHatId = getClientHatId('EXECUTIVE_POD_LEADER');
        if (!execHatId) { setAuthorized(false); return; }
        const client = createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org') });
        const bal = await client.readContract({
          address: HATS_CONTRACT,
          abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'wearer', type: 'address' }, { name: 'hatId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
          functionName: 'balanceOf',
          args: [address as `0x${string}`, BigInt(execHatId)],
        });
        setAuthorized((bal as bigint) > 0n);
      } catch { setAuthorized(false); }
    };
    check();
  }, [address]);

  const fetchDonations = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? '/api/donations/list?all=true'
        : '/api/donations/list';
      const res = await fetch(url);
      if (res.ok) setDonations(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (authorized) fetchDonations();
  }, [authorized, fetchDonations]);

  // Approve donation → sets status to pending_mint
  const handleApprove = async (donationId: string) => {
    if (!address) return;
    setActionLoading(donationId);
    setError(null);
    try {
      const res = await fetch('/api/donations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donationId, executiveWallet: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      await fetchDonations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Mint tokens — two transfers in one userOp:
  // 1. mint(donorWallet, systemTokensToMint)
  // 2. mint(execTreasuryAddress, communityTokensToMint)
  const handleMint = async (donation: Donation) => {
    if (!address || !currentUser?.evmSmartAccounts?.[0]) return;
    setActionLoading(donation.id);
    setError(null);
    try {
      // Fetch Exec Pod treasury address from DB
      const podRes = await fetch('/api/donations/exec-treasury');
      if (!podRes.ok) throw new Error('Could not load Exec Pod treasury address');
      const { treasuryAddress } = await podRes.json();

      const donorAmount = parseUnits(donation.system_tokens_to_mint.toFixed(8), 18);
      const communityAmount = parseUnits((donation.community_tokens_to_mint || 0).toFixed(8), 18);

      const donorCallData = encodeFunctionData({
        abi: MINT_ABI,
        functionName: 'mint',
        args: [getAddress(donation.user_wallet), donorAmount],
      });

      const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] = [
        { to: SYSTEM_TOKEN_ADDRESS, value: 0n, data: donorCallData },
      ];

      // Only add community mint if there's a non-zero amount and treasury address
      if (communityAmount > 0n && treasuryAddress) {
        const communityCallData = encodeFunctionData({
          abi: MINT_ABI,
          functionName: 'mint',
          args: [getAddress(treasuryAddress), communityAmount],
        });
        calls.push({ to: SYSTEM_TOKEN_ADDRESS, value: 0n, data: communityCallData });
      }

      const result = await sendUserOperation({
        evmSmartAccount: currentUser.evmSmartAccounts[0],
        network: 'base',
        calls,
        useCdpPaymaster: true,
      });

      const userOpHash = (result as any)?.userOpHash || (result as any)?.transactionHash || '';

      // Record the mint
      const confirmRes = await fetch('/api/donations/mint/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donationId: donation.id, userOpHash, minter: address }),
      });
      if (!confirmRes.ok) throw new Error('Failed to record mint transaction');

      await fetchDonations();
    } catch (err: any) {
      setError(err.shortMessage || err.message || 'Mint failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (!address) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>Connect your wallet to continue.</div>;
  }

  if (authorized === null) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>Checking authorization…</div>;
  }

  if (!authorized) {
    return (
      <div style={{ maxWidth: 480, margin: '64px auto', padding: 32, textAlign: 'center', background: '#FEE2E2', borderRadius: 12 }}>
        <Shield size={40} style={{ color: '#DC2626', marginBottom: 16 }} />
        <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Access Denied</h2>
        <p style={{ color: '#6B7280' }}>You must hold the Executive Pod Leader hat to access this page.</p>
      </div>
    );
  }

  const activeDonations = donations.filter(d =>
    ['awaiting_executive_approval', 'pending_mint', 'awaiting_settlement'].includes(d.status)
  );
  const displayDonations = filter === 'active' ? activeDonations : donations;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Donation Management</h1>
          <p style={{ color: '#6B7280', fontSize: 14 }}>Approve and mint $SYSTEM tokens for incoming donations</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setFilter(f => f === 'active' ? 'all' : 'active')}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer', fontSize: 13 }}
          >
            {filter === 'active' ? 'Show All' : 'Show Active'}
          </button>
          <button
            onClick={fetchDonations}
            disabled={loading}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer' }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#991B1B', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Needs Approval', count: donations.filter(d => d.status === 'awaiting_executive_approval').length, color: '#2563EB' },
          { label: 'Ready to Mint', count: donations.filter(d => d.status === 'pending_mint').length, color: '#059669' },
          { label: 'Minted (Total)', count: donations.filter(d => d.status === 'minted').length, color: '#6B7280' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Donation list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>Loading…</div>
      ) : displayDonations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>
          {filter === 'active' ? 'No donations awaiting action.' : 'No donations found.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayDonations.map(donation => (
            <div key={donation.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#6B7280' }}>
                    {donation.user_wallet.slice(0, 10)}…{donation.user_wallet.slice(-6)}
                  </span>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                    ${donation.fiat_amount.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                    {donation.payment_method === 'us_bank_account' ? 'ACH' : 'Card'} · {new Date(donation.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                  background: STATUS_COLOR[donation.status] + '18',
                  color: STATUS_COLOR[donation.status],
                  border: `1px solid ${STATUS_COLOR[donation.status]}40`,
                }}>
                  {STATUS_LABEL[donation.status]}
                </span>
              </div>

              {/* Token breakdown */}
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#6B7280' }}>Donor receives</span>
                  <span style={{ fontWeight: 600 }}>{Number(donation.system_tokens_to_mint).toFixed(2)} $SYSTEM</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#6B7280' }}>Community pool (4%)</span>
                  <span style={{ fontWeight: 600 }}>{Number(donation.community_tokens_to_mint || 0).toFixed(2)} $SYSTEM</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: 4, marginTop: 4 }}>
                  <span style={{ color: '#6B7280' }}>Ops retained (cash)</span>
                  <span>${(donation.org_fee - Number(donation.community_tokens_to_mint || 0)).toFixed(2)}</span>
                </div>
              </div>

              {donation.status === 'awaiting_settlement' && donation.settlement_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#D97706', marginBottom: 12 }}>
                  <Clock size={13} />
                  Settlement: {new Date(donation.settlement_date).toLocaleDateString()}
                </div>
              )}

              {donation.status === 'minted' && donation.tx_hash && (
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                  Tx: <span style={{ fontFamily: 'monospace' }}>{donation.tx_hash.slice(0, 16)}…</span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                {donation.status === 'awaiting_executive_approval' && (
                  <button
                    onClick={() => handleApprove(donation.id)}
                    disabled={actionLoading === donation.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: actionLoading === donation.id ? '#D1D5DB' : '#2563EB',
                      color: 'white', fontWeight: 600, fontSize: 13, cursor: actionLoading === donation.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <CheckCircle size={14} />
                    {actionLoading === donation.id ? 'Approving…' : 'Approve'}
                  </button>
                )}

                {donation.status === 'pending_mint' && (
                  <button
                    onClick={() => handleMint(donation)}
                    disabled={actionLoading === donation.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: actionLoading === donation.id ? '#D1D5DB' : '#059669',
                      color: 'white', fontWeight: 600, fontSize: 13, cursor: actionLoading === donation.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Coins size={14} />
                    {actionLoading === donation.id ? 'Minting…' : 'Mint Tokens'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
