'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { useBalance } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import { Gift, X, DollarSign, Loader2 } from 'lucide-react';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';
import { getAuthHeaders } from '@/lib/authHeaders';

interface GiftModalProps {
  recipientAddress: string;
  recipientName: string;
  recipientImage: string;
  onClose: () => void;
}

// Token addresses from environment
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;

// Standard ERC20 ABI for transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export function GiftModal({
  recipientAddress,
  recipientName,
  recipientImage,
  onClose,
}: GiftModalProps) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  // $SELF is soulbound and earned through participation, so gifting is $SYSTEM only.
  const selectedToken = 'SYSTEM' as const;
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [vpOffset, setVpOffset] = useState({ top: 0, height: '100dvh' });

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const updateVp = () => {
      const vv = window.visualViewport;
      if (vv) setVpOffset({ top: vv.offsetTop, height: `${vv.height}px` });
    };

    updateVp();
    window.visualViewport?.addEventListener('resize', updateVp);
    window.visualViewport?.addEventListener('scroll', updateVp);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.visualViewport?.removeEventListener('resize', updateVp);
      window.visualViewport?.removeEventListener('scroll', updateVp);
    };
  }, []);
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // Get token balances
  const { data: systemBalance } = useBalance({
    address: address || undefined,
    token: SYSTEM_TOKEN,
  });

  // Quick amount buttons
  const quickAmounts = ['10', '25', '50', '100'];

  const getBalance = () => {
    return systemBalance;
  };

  const canTransfer = () => {
    const balance = getBalance();
    if (!balance || !amount) return false;

    try {
      const amountWei = parseUnits(amount, 18);
      return balance.value >= amountWei;
    } catch {
      return false;
    }
  };

  const formatBalance = (balance: any) => {
    return balance ? Number(balance.formatted).toFixed(4) : '0.0000';
  };

  // CDP-based gift sending handler
  const handleSendGift = async () => {
    if (!currentUser?.evmSmartAccounts?.[0] || !selectedToken || !amount || !address) {
      setStatusMessage('Missing required fields');
      setTxStatus('error');
      return;
    }

    setIsSending(true);
    setTxStatus('pending');
    setStatusMessage('Sending gift...');

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];
      const tokenAddress = SYSTEM_TOKEN;
      const amountWei = parseUnits(amount, 18);

      console.log('🎁 Sending gift via CDP:', {
        from: address,
        to: recipientAddress,
        token: selectedToken,
        amount,
        amountWei: amountWei.toString(),
      });

      const callData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, amountWei],
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: tokenAddress,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Gift sent successfully:', result);
      setTxStatus('success');
      setStatusMessage('Gift sent successfully!');

      // Save gift to database via server-side API (bypasses RLS)
      try {
        const session = await getCurrentSession();
        const authToken = session?.access_token;
        const recordRes = await fetch('/api/gifts/record', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            sender_id: address,
            recipient_id: recipientAddress,
            token: selectedToken,
            amount,
            message: message.trim() || null,
            transaction_hash: (result as any)?.transactionHash || null,
          }),
        });
        if (!recordRes.ok) {
          const errData = await recordRes.json().catch(() => ({}));
          console.error('[GiftModal] Error saving gift to database:', errData);
        }
      } catch (error) {
        console.error('[GiftModal] Error in database save:', error);
      }

      // Fire-and-forget: notify recipient by email
      fetch('/api/gifts/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({
          recipient_wallet: recipientAddress,
          sender_wallet: address,
          amount,
          token: selectedToken,
        }),
      }).catch(() => {});

      // Reset form and close after delay
      setTimeout(() => {
        setAmount('');
        setMessage('');
        setTxStatus('idle');
        setStatusMessage('');
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('❌ Gift failed:', error);
      setTxStatus('error');
      setStatusMessage(error.shortMessage || error.message || 'Failed to send gift');
    } finally {
      setIsSending(false);
    }
  };

  const content = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ top: vpOffset.top, height: vpOffset.height }}
    >
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="gift-header">
          <div className="gift-header-info">
            <Gift className="gift-icon" size={20} />
            <h3>Send Gift to {recipientName}</h3>
          </div>
          <button onClick={onClose} className="gift-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Recipient Display */}
        <div className="gift-recipient">
          <img
            src={recipientImage}
            alt={recipientName}
            className="gift-avatar"
          />
          <div>
            <div className="gift-recipient-name">{recipientName}</div>
            <div className="gift-recipient-address">
              {recipientAddress.substring(0, 10)}...
            </div>
          </div>
        </div>

        {/* Token Selection */}
        <div className="gift-section">
          <label className="gift-label">Token</label>
          <div className="gift-token-options gift-token-options-single">
            <button
              className="gift-token-option active"
              type="button"
            >
              <div>
                <div className="gift-token-name">SYSTEM Token</div>
                <div className="gift-token-balance">
                  Balance: {formatBalance(systemBalance)}
                </div>
              </div>
            </button>
          </div>
          <div className="gift-token-note">
            $SELF is soulbound and earned through participation, so it can't be gifted.
          </div>
        </div>

        {/* Amount Input */}
        <div className="gift-section">
          <label className="gift-label">Amount ({selectedToken})</label>
          <div className="gift-amount-input-container">
            <DollarSign size={18} className="gift-amount-icon" />
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="gift-amount-input"
            />
          </div>

          {/* Quick Amount Buttons */}
          <div className="gift-quick-amounts">
            {quickAmounts.map((quickAmount) => (
              <button
                key={quickAmount}
                onClick={() => setAmount(quickAmount)}
                className="gift-quick-amount-btn"
              >
                ${quickAmount}
              </button>
            ))}
          </div>

          {/* Insufficient Balance Warning */}
          {amount && !canTransfer() && (
            <div className="gift-warning">Insufficient balance</div>
          )}
        </div>

        {/* Optional Message */}
        <div className="gift-section">
          <label className="gift-label">Message (Optional)</label>
          <textarea
            placeholder="Add a personal note with your gift..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="gift-message-input"
            rows={3}
          />
        </div>

        {/* Transaction Status */}
        {txStatus !== 'idle' && (
          <div className={`gift-status gift-status-${txStatus}`}>
            {txStatus === 'pending' && <Loader2 className="spin gift-status-icon" size={18} />}
            {txStatus === 'success' && <Gift className="gift-status-icon" size={18} />}
            {txStatus === 'error' && <X className="gift-status-icon" size={18} />}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Send Gift Button */}
        {address && selectedToken && amount && canTransfer() ? (
          <button
            onClick={handleSendGift}
            disabled={isSending || txStatus === 'success'}
            className="gift-send-btn"
          >
            {isSending ? (
              <>
                <Loader2 className="spin" size={18} />
                <span>Sending Gift...</span>
              </>
            ) : txStatus === 'success' ? (
              <>
                <Gift size={18} />
                <span>Gift Sent!</span>
              </>
            ) : (
              <>
                <Gift size={18} />
                <span>Send {amount} {selectedToken} Gift</span>
              </>
            )}
          </button>
        ) : (
          <button disabled className="gift-send-btn-disabled">
            <Gift size={18} />
            <span>
              {!amount
                ? 'Enter an amount'
                : !canTransfer()
                  ? 'Insufficient balance'
                  : 'Send Gift'}
            </span>
          </button>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 100dvh;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1001;
        }

        .gift-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          padding: 20px;
        }

        .gift-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #B8D9CA;
        }

        .gift-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .gift-icon {
          color: #2F5D50;
        }

        .gift-header h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .gift-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
          padding: 4px;
          border-radius: 4px;
        }

        .gift-close-btn:hover {
          background: #f5f5f5;
        }

        .gift-recipient {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #E8F1EE;
          border: 1px solid #B8D9CA;
          border-radius: 12px;
          margin-bottom: 20px;
        }

        .gift-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
        }

        .gift-recipient-name {
          font-weight: 600;
          font-size: 0.95rem;
        }

        .gift-recipient-address {
          font-size: 0.75rem;
          color: #666;
          font-family: monospace;
        }

        .gift-section {
          margin-bottom: 20px;
        }

        .gift-label {
          display: block;
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 8px;
          color: #333;
        }

        .gift-token-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .gift-token-options-single {
          grid-template-columns: 1fr;
        }

        .gift-token-note {
          margin-top: 8px;
          font-size: 0.75rem;
          color: #666;
        }

        .gift-token-option {
          padding: 12px;
          border: 2px solid #D1C4A9;
          border-radius: 12px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .gift-token-option:hover:not(:disabled) {
          border-color: #2F5D50;
          background: #E8F1EE;
        }

        .gift-token-option.active {
          border-color: #2F5D50;
          background: #E8F1EE;
        }

        .gift-token-option:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .gift-token-name {
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 4px;
        }

        .gift-token-balance {
          font-size: 0.75rem;
          color: #666;
        }

        .gift-amount-input-container {
          position: relative;
          display: flex;
          align-items: center;
        }

        .gift-amount-icon {
          position: absolute;
          left: 12px;
          color: #999;
        }

        .gift-amount-input {
          width: 100%;
          padding: 10px 10px 10px 36px;
          border: 1px solid #D1C4A9;
          border-radius: 8px;
          font-size: 1rem;
          outline: none;
        }

        .gift-amount-input:focus {
          border-color: #2F5D50;
        }

        .gift-amount-input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .gift-quick-amounts {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .gift-quick-amount-btn {
          padding: 6px;
          border: 1px solid #D1C4A9;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .gift-quick-amount-btn:hover:not(:disabled) {
          border-color: #2F5D50;
          background: #E8F1EE;
        }

        .gift-quick-amount-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .gift-warning {
          margin-top: 8px;
          padding: 8px 12px;
          background: #FAF4EC;
          border: 1px solid #E8D7B8;
          border-radius: 8px;
          font-size: 0.85rem;
          color: #6B5A3E;
        }

        .gift-message-input {
          width: 100%;
          padding: 10px;
          border: 1px solid #D1C4A9;
          border-radius: 8px;
          font-size: 0.9rem;
          font-family: inherit;
          resize: vertical;
          outline: none;
        }

        .gift-message-input:focus {
          border-color: #2F5D50;
        }

        .gift-message-input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .gift-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 0.9rem;
        }

        .gift-status-pending,
        .gift-status-confirming {
          background: #E8F1EE;
          color: #1F453A;
          border: 1px solid #B8D9CA;
        }

        .gift-status-success {
          background: #E8F1EE;
          color: #3F7A5A;
          border: 1px solid #B8D9CA;
        }

        .gift-status-error {
          background: #F5E6E6;
          color: #8B3A3A;
          border: 1px solid #D9B3B3;
        }

        .gift-status-icon {
          flex-shrink: 0;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .gift-send-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: #2F5D50;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .gift-send-btn:hover:not(:disabled) {
          background: #254A40;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(47, 93, 80, 0.3);
        }

        .gift-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .gift-send-btn-disabled {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          background: #D8D2C8;
          color: #8FAAA1;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: not-allowed;
        }

        @media (max-width: 600px) {
          .gift-modal {
            width: 95%;
            padding: 16px;
          }

          .gift-token-options {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
}
