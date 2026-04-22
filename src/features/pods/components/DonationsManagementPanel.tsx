'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData, parseUnits, getAddress } from 'viem';
import { CheckCircle, Clock, RefreshCw, Coins, ExternalLink } from 'lucide-react';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';

const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;

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
  mint_transaction_hash?: string;
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

const STATUS_COLOR: Record<DonationStatus, { bg: string; text: string; border: string }> = {
  payment_pending:              { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
  awaiting_settlement:          { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  awaiting_executive_approval:  { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
  pending_mint:                 { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  minting:                      { bg: '#EDE9FE', text: '#4C1D95', border: '#C4B5FD' },
  minted:                       { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  failed:                       { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  disputed:                     { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
};

interface DonationsManagementPanelProps {
  canManage: boolean;
}

export function DonationsManagementPanel({ canManage }: DonationsManagementPanelProps) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();

  const [allDonations, setAllDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDonations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/donations/list?all=true');
      if (res.ok) setAllDonations(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) fetchDonations();
  }, [canManage, fetchDonations]);

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

  const handleMint = async (donation: Donation) => {
    if (!address || !currentUser?.evmSmartAccounts?.[0]) return;
    setActionLoading(donation.id);
    setError(null);
    try {
      const podRes = await fetch('/api/donations/exec-treasury');
      if (!podRes.ok) throw new Error('Could not load Exec Pod treasury address');
      const { treasuryAddress } = await podRes.json();

      const donorAmount = parseUnits(Number(donation.system_tokens_to_mint).toFixed(8), 18);
      const communityAmount = parseUnits(Number(donation.community_tokens_to_mint || 0).toFixed(8), 18);

      const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] = [
        {
          to: SYSTEM_TOKEN_ADDRESS,
          value: 0n,
          data: encodeFunctionData({ abi: MINT_ABI, functionName: 'mint', args: [getAddress(donation.user_wallet), donorAmount] }),
        },
      ];

      if (communityAmount > 0n && treasuryAddress) {
        calls.push({
          to: SYSTEM_TOKEN_ADDRESS,
          value: 0n,
          data: encodeFunctionData({ abi: MINT_ABI, functionName: 'mint', args: [getAddress(treasuryAddress), communityAmount] }),
        });
      }

      const result = await sendUserOperation({
        evmSmartAccount: currentUser.evmSmartAccounts[0],
        network: 'base',
        calls,
        useCdpPaymaster: true,
      });

      const userOpHash = (result as any)?.userOpHash || (result as any)?.transactionHash || '';

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

  if (!canManage) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280' }}>
        <p>You do not have permission to manage donations.</p>
      </div>
    );
  }

  const activeDonations = allDonations.filter(d =>
    ['payment_pending', 'awaiting_settlement', 'awaiting_executive_approval', 'pending_mint', 'minting'].includes(d.status)
  );
  const displayDonations = filter === 'active' ? activeDonations : allDonations;

  const needsAction  = allDonations.filter(d => ['payment_pending', 'awaiting_settlement', 'awaiting_executive_approval'].includes(d.status)).length;
  const readyToMint  = allDonations.filter(d => d.status === 'pending_mint').length;
  const totalMinted  = allDonations.filter(d => d.status === 'minted').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Donation Management</h3>
          <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Approve incoming donations and mint $SYSTEM tokens</p>
        </div>
        <button onClick={fetchDonations} disabled={loading}
          style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#374151' }}>
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {[
          { label: 'Needs Action', count: needsAction, color: '#1E40AF', bg: '#DBEAFE' },
          { label: 'Ready to Mint',  count: readyToMint,  color: '#065F46', bg: '#D1FAE5' },
          { label: 'Total Minted',   count: totalMinted,  color: '#6B7280', bg: '#F3F4F6' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: s.color, margin: 0 }}>{s.count}</p>
            <p style={{ fontSize: '11px', color: s.color, margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['active', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '5px 14px', borderRadius: '20px', border: filter === f ? 'none' : '1px solid #D1D5DB', background: filter === f ? '#2F5D50' : 'white', color: filter === f ? 'white' : '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            {f === 'active' ? 'Active' : 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', color: '#991B1B', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#9CA3AF' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px' }}>Loading…</p>
        </div>
      ) : displayDonations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', background: '#F9FAFB', borderRadius: '10px', color: '#9CA3AF' }}>
          <Clock size={28} style={{ margin: '0 auto 10px' }} />
          <p style={{ fontSize: '14px', fontWeight: 500 }}>
            {filter === 'active' ? 'No donations awaiting action.' : 'No donations found.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {displayDonations.map(donation => {
            const sc = STATUS_COLOR[donation.status];
            const isActioning = actionLoading === donation.id;
            const communityTokens = Number(donation.community_tokens_to_mint || 0);
            const opsCash = donation.org_fee - communityTokens;

            return (
              <div key={donation.id} style={{ background: 'white', borderRadius: '10px', padding: '14px', border: '1px solid #E5E7EB' }}>

                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ marginBottom: '4px' }}>
                      <UserProfileDisplay walletAddress={donation.user_wallet} size="sm" showModal={true} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <img src="/images/erc20tokens/SystemToken.png" alt="$SYSTEM"
                        style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                      <span style={{ fontSize: '17px', fontWeight: 700, color: '#111827' }}>
                        ${donation.fiat_amount.toFixed(2)}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '2px 0 0' }}>
                      {donation.payment_method === 'us_bank_account' ? 'ACH' : 'Card'} · {new Date(donation.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, flexShrink: 0 }}>
                    {STATUS_LABEL[donation.status]}
                  </span>
                </div>

                {/* Token breakdown */}
                <div style={{ background: '#F9FAFB', borderRadius: '7px', padding: '9px 12px', marginBottom: '10px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6B7280' }}>Donor receives</span>
                    <span style={{ fontWeight: 600 }}>{Number(donation.system_tokens_to_mint).toFixed(2)} $SYSTEM</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6B7280' }}>Community pool (4%)</span>
                    <span style={{ fontWeight: 600 }}>{communityTokens.toFixed(2)} $SYSTEM</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E5E7EB', paddingTop: '4px', marginTop: '2px' }}>
                    <span style={{ color: '#6B7280' }}>Ops (cash, not minted)</span>
                    <span>${opsCash.toFixed(2)}</span>
                  </div>
                </div>

                {donation.status === 'awaiting_settlement' && donation.settlement_date && (
                  <p style={{ fontSize: '12px', color: '#D97706', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={12} /> Settles {new Date(donation.settlement_date).toLocaleDateString()}
                  </p>
                )}

                {donation.mint_transaction_hash && (
                  <a href={`https://basescan.org/tx/${donation.mint_transaction_hash}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: '11px', color: '#2F5D50', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px', textDecoration: 'none' }}>
                    Tx: {donation.mint_transaction_hash.slice(0, 16)}… <ExternalLink size={10} />
                  </a>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['payment_pending', 'awaiting_settlement', 'awaiting_executive_approval'].includes(donation.status) && (
                    <button onClick={() => handleApprove(donation.id)} disabled={isActioning}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '7px', border: 'none', background: isActioning ? '#D1D5DB' : '#3F7A5A', color: 'white', fontWeight: 600, fontSize: '12px', cursor: isActioning ? 'not-allowed' : 'pointer' }}>
                      <CheckCircle size={13} />
                      {isActioning ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                  {donation.status === 'pending_mint' && (
                    <button onClick={() => handleMint(donation)} disabled={isActioning}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '7px', border: 'none', background: isActioning ? '#D1D5DB' : '#2F5D50', color: 'white', fontWeight: 600, fontSize: '12px', cursor: isActioning ? 'not-allowed' : 'pointer' }}>
                      <Coins size={13} />
                      {isActioning ? 'Minting…' : 'Mint Tokens'}
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
