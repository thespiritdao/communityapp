'use client';

import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { parseUnits } from 'viem';
import { supabase } from '@/lib/supabase';
import { Gift, X, DollarSign, Loader2 } from 'lucide-react';
import {
  SafeOnchainKitWrapper,
  SafeTransaction as Transaction,
  SafeTransactionButton as TransactionButton,
  SafeTransactionSponsor as TransactionSponsor,
  SafeTransactionStatus as TransactionStatus,
  SafeTransactionStatusLabel as TransactionStatusLabel,
  SafeTransactionStatusAction as TransactionStatusAction,
} from '@/components/SafeOnchainKit';

interface GiftModalProps {
  recipientAddress: string;
  recipientName: string;
  recipientImage: string;
  onClose: () => void;
}

// Token addresses from environment
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

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
  const { address } = useAccount();
  const [selectedToken, setSelectedToken] = useState<'SYSTEM' | 'SELF'>(
    'SYSTEM',
  );
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  // Get token balances
  const { data: systemBalance } = useBalance({
    address,
    token: SYSTEM_TOKEN,
  });

  const { data: selfBalance } = useBalance({
    address,
    token: SELF_TOKEN,
  });

  // Quick amount buttons
  const quickAmounts = ['10', '25', '50', '100'];

  const getBalance = () => {
    return selectedToken === 'SYSTEM' ? systemBalance : selfBalance;
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

  const prepareTransferTransaction = () => {
    if (!selectedToken || !amount || !address) {
      throw new Error('Missing required fields');
    }

    const tokenAddress = selectedToken === 'SYSTEM' ? SYSTEM_TOKEN : SELF_TOKEN;
    const amountWei = parseUnits(amount, 18);

    console.log('[GiftModal] Preparing gift transaction:', {
      from: address,
      to: recipientAddress,
      token: selectedToken,
      amount,
      amountWei: amountWei.toString(),
    });

    return [
      {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, amountWei],
      },
    ];
  };

  const handleSuccess = async (response: any) => {
    console.log('🎁 Gift sent successfully:', response);

    // Save gift to database
    try {
      const { error } = await supabase.from('gifts').insert({
        sender_id: address,
        recipient_id: recipientAddress,
        token: selectedToken,
        amount: amount,
        message: message.trim() || null,
        transaction_hash:
          response?.transactionReceipts?.[0]?.transactionHash || null,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[GiftModal] Error saving gift to database:', error);
      }
    } catch (error) {
      console.error('[GiftModal] Error in database save:', error);
    }

    // Reset form and close
    setTimeout(() => {
      setAmount('');
      setMessage('');
      setSelectedToken('SYSTEM');
      onClose();
    }, 2000);
  };

  const handleError = (error: any) => {
    console.error('🎁 Gift failed:', error);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
          <label className="gift-label">Select Token</label>
          <div className="gift-token-options">
            <button
              onClick={() => setSelectedToken('SYSTEM')}
              className={`gift-token-option ${selectedToken === 'SYSTEM' ? 'active' : ''}`}
            >
              <div>
                <div className="gift-token-name">SYSTEM Token</div>
                <div className="gift-token-balance">
                  Balance: {formatBalance(systemBalance)}
                </div>
              </div>
            </button>
            <button
              onClick={() => setSelectedToken('SELF')}
              className={`gift-token-option ${selectedToken === 'SELF' ? 'active' : ''}`}
            >
              <div>
                <div className="gift-token-name">SELF Token</div>
                <div className="gift-token-balance">
                  Balance: {formatBalance(selfBalance)}
                </div>
              </div>
            </button>
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

        {/* Transaction Section */}
        {address && selectedToken && amount && canTransfer() ? (
          <SafeOnchainKitWrapper
            fallback={
              <button disabled className="gift-send-btn">
                <Loader2 className="spin" size={18} />
                <span>Loading transaction...</span>
              </button>
            }
            errorFallback={
              <button disabled className="gift-send-btn-disabled">
                <span>Transaction currently unavailable</span>
              </button>
            }
          >
            <Transaction
              chainId={8453} // Base mainnet
              calls={prepareTransferTransaction()}
              isSponsored={true}
              onSuccess={handleSuccess}
              onError={handleError}
            >
              <TransactionButton
                text={`Send ${amount} ${selectedToken} Gift`}
                className="gift-send-btn"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          </SafeOnchainKitWrapper>
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
          bottom: 0;
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
          border-bottom: 1px solid #eee;
        }

        .gift-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .gift-icon {
          color: #7b1fa2;
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
          background: #f9f9f9;
          border-radius: 8px;
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

        .gift-token-option {
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .gift-token-option:hover:not(:disabled) {
          border-color: #7b1fa2;
          background: #f9f5fa;
        }

        .gift-token-option.active {
          border-color: #7b1fa2;
          background: #f3e5f5;
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
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
          outline: none;
        }

        .gift-amount-input:focus {
          border-color: #7b1fa2;
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
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .gift-quick-amount-btn:hover:not(:disabled) {
          border-color: #7b1fa2;
          background: #f9f5fa;
        }

        .gift-quick-amount-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .gift-warning {
          margin-top: 8px;
          padding: 8px 12px;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 6px;
          font-size: 0.85rem;
          color: #856404;
        }

        .gift-message-input {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 0.9rem;
          font-family: inherit;
          resize: vertical;
          outline: none;
        }

        .gift-message-input:focus {
          border-color: #7b1fa2;
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
          background: #e3f2fd;
          color: #1565c0;
          border: 1px solid #90caf9;
        }

        .gift-status-success {
          background: #e8f5e9;
          color: #2e7d32;
          border: 1px solid #81c784;
        }

        .gift-status-error {
          background: #ffebee;
          color: #c62828;
          border: 1px solid #ef5350;
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
          background: linear-gradient(135deg, #7b1fa2, #9c27b0);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .gift-send-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #6a1b8f, #8e24a0);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(123, 31, 162, 0.3);
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
          background: #e0e0e0;
          color: #999;
          border: none;
          border-radius: 8px;
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
}
