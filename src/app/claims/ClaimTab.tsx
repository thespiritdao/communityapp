'use client';

import React, { useState } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { toast } from 'react-hot-toast';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { usePublicClient } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import { Info, Flame, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';

/**
 * ClaimTab — Burn $SYSTEM tokens to request a fiat payout.
 *
 * Uses CDP embedded wallet (sendUserOperation).
 * Approve and burn are separate user-triggered steps — matching the pattern
 * in TokenApprovalFlow — to avoid CDP session token expiry between chained awaits.
 *
 * Flow:
 * 1. POST /api/claims/request → get payoutRef UUID
 * 2. User clicks Approve → sendUserOperation approve
 * 3. User clicks Burn → sendUserOperation burnForClaim
 * 4. POST /api/claims/confirm with txHash
 */

const TOKEN_CLAIM_ADDRESS = process.env
  .NEXT_PUBLIC_TOKEN_CLAIM_ADDRESS as `0x${string}` | undefined;

const SYSTEM_TOKEN_ADDRESS = process.env
  .NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}` | undefined;

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const TOKEN_CLAIM_ABI = [
  {
    name: 'burnForClaim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'payoutRef', type: 'string' },
    ],
    outputs: [],
  },
] as const;

// Multi-step flow state
type FlowStep = 'form' | 'approving' | 'approved' | 'burning' | 'confirming' | 'done' | 'error';

export default function ClaimTab() {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const publicClient = usePublicClient();

  const smartAccount = currentUser?.evmSmartAccounts?.[0];
  const walletAddress = smartAccount as `0x${string}` | undefined;
  const isConnected = !!walletAddress;

  const [claimAmount, setClaimAmount] = useState('');
  const [payoutEmail, setPayoutEmail] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [flowStep, setFlowStep] = useState<FlowStep>('form');
  const [payoutRef, setPayoutRef] = useState('');
  const [amountWei, setAmountWei] = useState<bigint>(0n);
  const [burnTxHash, setBurnTxHash] = useState('');

  const contractsReady = !!TOKEN_CLAIM_ADDRESS && !!SYSTEM_TOKEN_ADDRESS;
  const isProcessing = flowStep === 'approving' || flowStep === 'burning' || flowStep === 'confirming';

  // ── Step 1: Validate + create claim record ─────────────────────────────────
  const handleRequestClaim = async () => {
    if (!walletAddress) { toast.error('Wallet not connected'); return; }
    if (!contractsReady) { toast.error('Contract not configured'); return; }

    const amount = parseFloat(claimAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!payoutEmail || !payoutEmail.includes('@')) { toast.error('Enter a valid email'); return; }

    try {
      const res = await fetch('/api/claims/request', {
        method: 'POST',
        headers: await ensureAuthHeaders(),
        body: JSON.stringify({ walletAddress, amount, payoutEmail, payoutNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create claim');

      setPayoutRef(data.payoutRef);
      setAmountWei(parseUnits(claimAmount, 18));
      setFlowStep('approved'); // skip straight to "ready to approve" state
    } catch (err: any) {
      toast.error(err.message || 'Failed to create claim record');
    }
  };

  // ── Step 2: Approve ────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!smartAccount) return;
    setFlowStep('approving');
    try {
      const callData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [TOKEN_CLAIM_ADDRESS!, amountWei],
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{ to: SYSTEM_TOKEN_ADDRESS!, value: 0n, data: callData }],
        useCdpPaymaster: true,
      });

      console.log('✅ Approve op complete, waiting for on-chain confirmation…', result.transactionHash);

      // Wait for the approve tx to be mined so the allowance is visible on-chain
      // before the burn op's gas estimation reads it.
      if (publicClient && result.transactionHash) {
        await publicClient.waitForTransactionReceipt({
          hash: result.transactionHash as `0x${string}`,
          timeout: 60_000,
          pollingInterval: 2_000,
        });
        console.log('✅ Approve mined');
      } else {
        // Fallback: give the chain a moment
        await new Promise((res) => setTimeout(res, 8000));
      }

      setFlowStep('approved');
      toast.success('Approval confirmed — ready to burn');
    } catch (err: any) {
      console.error('Approve failed:', err);
      toast.error(err.message || 'Approval failed');
      setFlowStep('error');
    }
  };

  // ── Step 3: Burn ───────────────────────────────────────────────────────────
  const handleBurn = async () => {
    if (!smartAccount) return;
    setFlowStep('burning');
    try {
      const callData = encodeFunctionData({
        abi: TOKEN_CLAIM_ABI,
        functionName: 'burnForClaim',
        args: [amountWei, payoutRef],
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{ to: TOKEN_CLAIM_ADDRESS!, value: 0n, data: callData }],
        useCdpPaymaster: true,
      });

      const txHash = result.transactionHash || result.userOperationHash;
      console.log('✅ Burn confirmed:', txHash);
      setBurnTxHash(txHash);

      // ── Step 4: Confirm with server ────────────────────────────────────────
      setFlowStep('confirming');
      const session = await getCurrentSession();
      const confirmRes = await fetch('/api/claims/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ payoutRef, burnTxHash: txHash }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || 'Failed to confirm burn');

      setFlowStep('done');
    } catch (err: any) {
      console.error('Burn failed:', err);
      toast.error(err.message || 'Burn failed');
      setFlowStep('error');
    }
  };

  const handleReset = () => {
    setFlowStep('form');
    setClaimAmount('');
    setPayoutEmail('');
    setPayoutNote('');
    setPayoutRef('');
    setAmountWei(0n);
    setBurnTxHash('');
  };

  // ── Done screen ────────────────────────────────────────────────────────────
  if (flowStep === 'done') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
        <div style={{ maxWidth: '448px', width: '100%', background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '32px', textAlign: 'center' }}>
          <CheckCircle size={48} color="#2F5D50" style={{ margin: '0 auto 24px' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>Claim Request Submitted</h2>
          <p style={{ color: '#6B7280', marginBottom: '8px', fontSize: '14px' }}>
            Your tokens have been burned on-chain and the Executive Pod has been notified.
            You will be contacted at your provided email once the payout is approved.
          </p>
          {burnTxHash && (
            <p style={{ fontSize: '11px', color: '#9CA3AF', wordBreak: 'break-all', marginBottom: '24px' }}>
              Tx: {burnTxHash}
            </p>
          )}
          <button onClick={handleReset} style={{ backgroundColor: '#2F5D50', color: '#FFFFFF', fontWeight: 500, padding: '10px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>
            Submit Another Claim
          </button>
        </div>
      </div>
    );
  }

  // ── Multi-step approval UI ─────────────────────────────────────────────────
  if (flowStep !== 'form') {
    const steps = [
      { key: 'approved', label: 'Approve token spend', done: flowStep === 'approved' || flowStep === 'burning' || flowStep === 'confirming' || flowStep === 'done' },
      { key: 'burning', label: 'Burn tokens on-chain', done: flowStep === 'confirming' || flowStep === 'done' },
      { key: 'confirming', label: 'Confirm with server', done: flowStep === 'done' },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ backgroundColor: 'rgba(232,241,238,0.75)', border: '1px solid #B8D9CA', padding: '16px', borderRadius: '12px' }}>
          <p style={{ fontWeight: 600, fontSize: '14px', color: '#1F4035', marginBottom: '12px' }}>
            Claiming {claimAmount} $SYSTEM
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {steps.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: s.done ? '#2F5D50' : '#6B7280' }}>
                {s.done
                  ? <CheckCircle size={16} color="#2F5D50" />
                  : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #D1D5DB' }} />
                }
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* Approve button */}
        {(flowStep === 'approved' && !burnTxHash) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '13px', color: '#374151' }}>
              Step 1: Approve the claim contract to spend your $SYSTEM tokens.
            </p>
            <button
              onClick={handleApprove}
              style={{ backgroundColor: '#2F5D50', color: 'white', padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <ArrowRight size={16} /> Approve Token Spend
            </button>
          </div>
        )}

        {/* Processing state */}
        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(249,250,251,0.7)', padding: '14px', borderRadius: '10px' }}>
            <Loader2 size={18} color="#2F5D50" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <p style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>
              {flowStep === 'approving' && 'Approving token spend…'}
              {flowStep === 'burning' && 'Burning tokens on-chain…'}
              {flowStep === 'confirming' && 'Confirming with server…'}
            </p>
          </div>
        )}

        {/* Burn button — shown after approve confirmed */}
        {flowStep === 'approved' && burnTxHash === '' && payoutRef && (
          null // handled above — approve first
        )}

        {/* After approve op returns, flowStep goes back to 'approved' — show burn button */}
        {flowStep === 'approved' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            <p style={{ fontSize: '13px', color: '#374151' }}>
              Step 2: Burn your tokens. This is irreversible.
            </p>
            <button
              onClick={handleBurn}
              style={{ backgroundColor: '#8B3A3A', color: 'white', padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Flame size={16} /> Burn {claimAmount} $SYSTEM
            </button>
          </div>
        )}

        {flowStep === 'error' && (
          <button onClick={handleReset} style={{ backgroundColor: '#6B7280', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            ← Back to Form
          </button>
        )}
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <div style={{ backgroundColor: 'rgba(232,241,238,0.75)', border: '1px solid #B8D9CA', padding: '16px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Info size={18} color="#2F5D50" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#1F4035' }}>How Claims Work</p>
            <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
              Burning your $SYSTEM tokens permanently destroys them on-chain and triggers a fiat payout request
              to the Executive Pod. Once approved, funds are disbursed via ACH or wire transfer at the original
              1:1 USD rate, less any applicable transfer fees. Payouts require Executive Pod approval and are subject to review.
            </p>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'rgba(250,244,236,0.75)', border: '1px solid #E8D7B8', padding: '14px 16px', borderRadius: '12px' }}>
        <p style={{ fontSize: '13px', color: '#6B5A3E', lineHeight: '1.6' }}>
          <strong>Before you burn:</strong> Please ensure your{' '}
          <Link href="/identity" style={{ color: '#2F5D50', textDecoration: 'underline', fontWeight: 600 }}>identity profile</Link>{' '}
          is complete, including your full name, mailing address, and contact information.
          This is required for Executive Pod to process your payout.
        </p>
      </div>

      <div style={{ backgroundColor: 'rgba(254,242,242,0.75)', border: '1px solid #FECACA', padding: '14px 16px', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <Flame size={18} color="#991B1B" style={{ flexShrink: 0, marginTop: '2px' }} />
        <p style={{ fontSize: '13px', color: '#7F1D1D', lineHeight: '1.6' }}>
          <strong>Irreversible action:</strong> Burning is permanent. Your tokens will be destroyed on-chain before payout is issued.
        </p>
      </div>

      {!contractsReady && (
        <div style={{ backgroundColor: 'rgba(254,242,242,0.75)', border: '1px solid #FECACA', padding: '14px 16px', borderRadius: '12px' }}>
          <p style={{ fontSize: '13px', color: '#991B1B' }}>⚠️ Token claim contract not yet configured. Claims are temporarily unavailable.</p>
        </div>
      )}

      {!isConnected && (
        <div style={{ backgroundColor: 'rgba(250,244,236,0.75)', border: '1px solid #E8D7B8', padding: '16px', borderRadius: '12px' }}>
          <p style={{ fontSize: '14px', color: '#6B5A3E' }}>⚠️ Please connect your wallet to submit a claim</p>
        </div>
      )}

      <div>
        <label htmlFor="claimAmount" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>Amount to Burn ($SYSTEM)</label>
        <input id="claimAmount" type="number" min="1" step="1" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} placeholder="0" disabled={!isConnected}
          style={{ width: '100%', padding: '12px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box', backgroundColor: !isConnected ? '#F9FAFB' : 'white' }} />
        {claimAmount && parseFloat(claimAmount) > 0 && (
          <p style={{ fontSize: '12px', color: '#2F5D50', marginTop: '6px' }}>Estimated payout: ~${parseFloat(claimAmount).toFixed(2)} USD (before transfer fees)</p>
        )}
      </div>

      <div>
        <label htmlFor="payoutEmail" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>Email for Payout Coordination</label>
        <input id="payoutEmail" type="email" value={payoutEmail} onChange={(e) => setPayoutEmail(e.target.value)} placeholder="your@email.com" disabled={!isConnected}
          style={{ width: '100%', padding: '12px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box', backgroundColor: !isConnected ? '#F9FAFB' : 'white' }} />
      </div>

      <div>
        <label htmlFor="payoutNote" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>Note (optional)</label>
        <textarea id="payoutNote" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} placeholder="Any additional context for your payout request..." rows={3} disabled={!isConnected}
          style={{ width: '100%', padding: '12px 16px', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', backgroundColor: !isConnected ? '#F9FAFB' : 'white' }} />
      </div>

      <button
        onClick={handleRequestClaim}
        disabled={!isConnected || !claimAmount || !payoutEmail || !contractsReady}
        style={{
          backgroundColor: !isConnected || !claimAmount || !payoutEmail || !contractsReady ? '#D8D2C8' : '#2F5D50',
          color: '#FFFFFF', fontWeight: 500, padding: '12px 24px', borderRadius: '12px', width: '100%', border: 'none',
          cursor: !isConnected || !claimAmount || !payoutEmail || !contractsReady ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        <Flame size={18} /> Request Claim for {claimAmount || '0'} $SYSTEM
      </button>

      <div style={{ backgroundColor: 'rgba(249,250,251,0.7)', padding: '16px', borderRadius: '8px', fontSize: '14px' }}>
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>What happens next:</p>
        <ol style={{ color: '#6B7280', marginLeft: '20px', lineHeight: '1.8' }}>
          <li>Your $SYSTEM tokens are approved and burned on-chain (permanent)</li>
          <li>Executive Pod receives your payout request</li>
          <li>Pod reviews and approves</li>
          <li>Fiat disbursement initiated via ACH / wire</li>
          <li>You receive funds at your verified account</li>
        </ol>
      </div>

    </div>
  );
}
