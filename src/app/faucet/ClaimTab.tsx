'use client';

import React, { useState } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { toast } from 'react-hot-toast';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { useWalletClient, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import { Info, Flame, CheckCircle, Loader2 } from 'lucide-react';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';

/**
 * ClaimTab — Burn $SYSTEM tokens to request a fiat payout.
 *
 * Full flow:
 * 1. User enters amount + payout email.
 * 2. POST /api/claims/request → receive payoutRef UUID.
 * 3. Approve TOKEN_CLAIM_ADDRESS to spend `amount` of $SYSTEM.
 * 4. Call TokenClaim.burnForClaim(amount, payoutRef) on-chain.
 * 5. POST /api/claims/confirm with burnTxHash → claim moves to awaiting_executive_approval.
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

type Step = 'idle' | 'requesting' | 'approving' | 'burning' | 'confirming' | 'done' | 'error';

export default function ClaimTab() {
  const { address: walletAddress, isInitializing } = useCDPStatus();
  const isConnected = !!walletAddress && !isInitializing;
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [claimAmount, setClaimAmount] = useState('');
  const [payoutEmail, setPayoutEmail] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [burnTxHash, setBurnTxHash] = useState('');

  const isSubmitting = step !== 'idle' && step !== 'done' && step !== 'error';

  const contractsReady = !!TOKEN_CLAIM_ADDRESS && !!SYSTEM_TOKEN_ADDRESS;

  const stepLabel: Record<Step, string> = {
    idle: `Request Claim for ${claimAmount || '0'} $SYSTEM`,
    requesting: 'Creating claim record…',
    approving: 'Approving token spend…',
    burning: 'Burning tokens on-chain…',
    confirming: 'Confirming with server…',
    done: 'Claim Submitted',
    error: 'Retry',
  };

  const handleSubmitClaim = async () => {
    if (!walletAddress || !walletClient || !publicClient) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!contractsReady) {
      toast.error('Token claim contract not configured');
      return;
    }

    const amount = parseFloat(claimAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!payoutEmail || !payoutEmail.includes('@')) {
      toast.error('Please provide a valid email address');
      return;
    }

    const amountWei = parseUnits(claimAmount, 18);

    try {
      // ── Step 1: Create pending claim record, get payoutRef ─────────────────
      setStep('requesting');
      const requestRes = await fetch('/api/claims/request', {
        method: 'POST',
        headers: await ensureAuthHeaders(),
        body: JSON.stringify({ walletAddress, amount, payoutEmail, payoutNote }),
      });

      const requestData = await requestRes.json();
      if (!requestRes.ok) throw new Error(requestData.error || 'Failed to create claim record');

      const { payoutRef } = requestData;

      // ── Step 2: Approve TOKEN_CLAIM_ADDRESS to spend $SYSTEM ───────────────
      setStep('approving');
      const approveHash = await walletClient.writeContract({
        address: SYSTEM_TOKEN_ADDRESS!,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [TOKEN_CLAIM_ADDRESS!, amountWei],
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // ── Step 3: Call burnForClaim on-chain ─────────────────────────────────
      setStep('burning');
      const burnHash = await walletClient.writeContract({
        address: TOKEN_CLAIM_ADDRESS!,
        abi: TOKEN_CLAIM_ABI,
        functionName: 'burnForClaim',
        args: [amountWei, payoutRef],
      });

      await publicClient.waitForTransactionReceipt({ hash: burnHash });
      setBurnTxHash(burnHash);

      // ── Step 4: Confirm burn with server ───────────────────────────────────
      setStep('confirming');
      const session = await getCurrentSession();
      const confirmRes = await fetch('/api/claims/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ payoutRef, burnTxHash: burnHash }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || 'Failed to confirm burn');

      setStep('done');
      setClaimAmount('');
      setPayoutEmail('');
      setPayoutNote('');

    } catch (error: any) {
      console.error('❌ Claim error:', error);
      toast.error(error.message || 'Claim failed');
      setStep('error');
    }
  };

  if (step === 'done') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
        <div
          style={{
            maxWidth: '448px',
            width: '100%',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <CheckCircle size={48} color="#2F5D50" style={{ margin: '0 auto 24px' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>
            Claim Request Submitted
          </h2>
          <p style={{ color: '#6B7280', marginBottom: '8px', fontSize: '14px' }}>
            Your tokens have been burned on-chain and the Executive Pod has been notified.
            You will be contacted at your provided email once the payout is approved.
          </p>
          {burnTxHash && (
            <p style={{ fontSize: '11px', color: '#9CA3AF', wordBreak: 'break-all', marginBottom: '24px' }}>
              Tx: {burnTxHash}
            </p>
          )}
          <button
            onClick={() => setStep('idle')}
            style={{
              backgroundColor: '#2F5D50',
              color: '#FFFFFF',
              fontWeight: 500,
              padding: '10px 24px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Submit Another Claim
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* How It Works */}
      <div style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA', padding: '16px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <Info size={18} color="#2F5D50" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#1F4035' }}>
              How Claims Work
            </p>
            <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
              Burning your $SYSTEM tokens permanently destroys them on-chain and triggers a
              fiat payout request to the Executive Pod. Once approved, funds are disbursed via
              ACH or wire transfer. Payouts are processed at the original 1:1 USD rate, less any applicable transfer fees.
            </p>
          </div>
        </div>
      </div>

      {/* Burn warning */}
      <div style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8', padding: '14px 16px', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <Flame size={18} color="#92400E" style={{ flexShrink: 0, marginTop: '2px' }} />
        <p style={{ fontSize: '13px', color: '#6B5A3E', lineHeight: '1.6' }}>
          <strong>Important:</strong> Burning is irreversible. Your tokens will be destroyed
          on-chain before payout is issued. Payouts require Executive Pod approval and are
          subject to review.
        </p>
      </div>

      {/* Contract not configured warning */}
      {!contractsReady && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '14px 16px', borderRadius: '12px' }}>
          <p style={{ fontSize: '13px', color: '#991B1B' }}>
            ⚠️ Token claim contract not yet configured. Claims are temporarily unavailable.
          </p>
        </div>
      )}

      {/* Wallet status */}
      {!isConnected && (
        <div style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8', padding: '16px', borderRadius: '12px' }}>
          <p style={{ fontSize: '14px', color: '#6B5A3E' }}>
            ⚠️ Please connect your wallet to submit a claim
          </p>
        </div>
      )}

      {/* Progress indicator */}
      {isSubmitting && (
        <div style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA', padding: '14px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Loader2 size={16} color="#2F5D50" style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: '13px', color: '#1F4035', fontWeight: 500 }}>
            {stepLabel[step]}
          </p>
        </div>
      )}

      {/* Amount */}
      <div>
        <label htmlFor="claimAmount" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
          Amount to Burn ($SYSTEM)
        </label>
        <input
          id="claimAmount"
          type="number"
          min="1"
          step="1"
          value={claimAmount}
          onChange={(e) => setClaimAmount(e.target.value)}
          placeholder="0"
          disabled={!isConnected || isSubmitting}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '16px',
            boxSizing: 'border-box',
            backgroundColor: (!isConnected || isSubmitting) ? '#F9FAFB' : 'white',
          }}
        />
        {claimAmount && parseFloat(claimAmount) > 0 && (
          <p style={{ fontSize: '12px', color: '#2F5D50', marginTop: '6px' }}>
            Estimated payout: ~${parseFloat(claimAmount).toFixed(2)} USD (before transfer fees)
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="payoutEmail" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
          Email for Payout Coordination
        </label>
        <input
          id="payoutEmail"
          type="email"
          value={payoutEmail}
          onChange={(e) => setPayoutEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={!isConnected || isSubmitting}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '16px',
            boxSizing: 'border-box',
            backgroundColor: (!isConnected || isSubmitting) ? '#F9FAFB' : 'white',
          }}
        />
      </div>

      {/* Note */}
      <div>
        <label htmlFor="payoutNote" style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
          Note (optional)
        </label>
        <textarea
          id="payoutNote"
          value={payoutNote}
          onChange={(e) => setPayoutNote(e.target.value)}
          placeholder="Any additional context for your payout request..."
          rows={3}
          disabled={!isConnected || isSubmitting}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #D1D5DB',
            borderRadius: '8px',
            fontSize: '14px',
            resize: 'vertical',
            boxSizing: 'border-box',
            backgroundColor: (!isConnected || isSubmitting) ? '#F9FAFB' : 'white',
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmitClaim}
        disabled={!isConnected || isSubmitting || !claimAmount || !payoutEmail || !contractsReady}
        style={{
          backgroundColor:
            !isConnected || isSubmitting || !claimAmount || !payoutEmail || !contractsReady
              ? '#D8D2C8'
              : '#2F5D50',
          color: '#FFFFFF',
          fontWeight: 500,
          padding: '12px 24px',
          borderRadius: '12px',
          width: '100%',
          border: 'none',
          cursor: !isConnected || isSubmitting || !claimAmount || !payoutEmail || !contractsReady
            ? 'not-allowed'
            : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {isSubmitting
          ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {stepLabel[step]}</>
          : <><Flame size={18} /> {stepLabel[step]}</>
        }
      </button>

      {/* Steps */}
      <div style={{ backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '8px', fontSize: '14px' }}>
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>What happens next:</p>
        <ol style={{ color: '#6B7280', marginLeft: '20px', lineHeight: '1.8' }}>
          <li>Your $SYSTEM tokens are approved and burned on-chain (permanent)</li>
          <li>Executive Pod receives your payout request</li>
          <li>Pod reviews and approves (2-of-3 multi-sig)</li>
          <li>Fiat disbursement initiated via ACH / wire</li>
          <li>You receive funds at your verified account</li>
        </ol>
      </div>

    </div>
  );
}
