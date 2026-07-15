'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { useBalance } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import { DollarSign, User, Users, AlertCircle, Loader2 } from 'lucide-react';

// Token addresses from environment
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const TREASURY_PROXY_ADDRESS = process.env
  .NEXT_PUBLIC_TREASURY_PROXY as `0x${string}`;

// Standard ERC20 ABI for transfer and approve
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
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

// Treasury Proxy ABI for proxyReceiveTokens
const TREASURY_PROXY_ABI = [
  {
    name: 'proxyReceiveTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

interface FundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientType: 'member' | 'pod' | null;
  recipient: {
    address: string;
    name: string;
    image?: string;
    description?: string;
    isTreasury?: boolean; // New prop to indicate treasury funding
    podId?: string; // Pod ID for treasury proxy routing
  } | null;
  onSuccess?: (amount: string, token: string) => void;
}

export default function FundingModal({
  isOpen,
  onClose,
  recipientType,
  recipient,
  onSuccess,
}: FundingModalProps) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  // $SELF is soulbound and earned through participation, so funding is $SYSTEM only.
  const selectedToken = 'SYSTEM' as const;
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Early return if no recipient or recipientType (modal closed state)
  if (!recipient || !recipientType) {
    return null;
  }

  // Get token balances
  const { data: systemBalance, error: systemError } = useBalance({
    address: address || undefined,
    token: SYSTEM_TOKEN,
  });

  // Quick amount buttons
  const quickAmounts = ['10', '25', '50', '100'];

  // CDP-based funding handler
  const handleSendFunds = async () => {
    if (!currentUser?.evmSmartAccounts?.[0] || !selectedToken || !amount || !address) {
      console.error('Missing required fields');
      return;
    }

    setIsSending(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];
      const tokenAddress = SYSTEM_TOKEN;
      const amountWei = parseUnits(amount, 18);

      // If funding a treasury contract, use proxy for sponsored transactions
      if (recipient.isTreasury && recipient.podId && TREASURY_PROXY_ADDRESS) {
        console.log('💰 Funding treasury via CDP proxy:', {
          proxyAddress: TREASURY_PROXY_ADDRESS,
          podId: recipient.podId,
          tokenAddress,
          amount: amountWei.toString(),
        });

        // Step 1: Approve proxy to spend tokens
        const approveCallData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [TREASURY_PROXY_ADDRESS, amountWei],
        });

        // Step 2: Call proxy's proxyReceiveTokens function
        const proxyCallData = encodeFunctionData({
          abi: TREASURY_PROXY_ABI,
          functionName: 'proxyReceiveTokens',
          args: [recipient.podId, tokenAddress as `0x${string}`, amountWei],
        });

        await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: 'base',
          calls: [
            { to: tokenAddress, value: 0n, data: approveCallData },
            { to: TREASURY_PROXY_ADDRESS, value: 0n, data: proxyCallData },
          ],
          useCdpPaymaster: true,
        });
      } else {
        // For regular member funding, use direct transfer
        console.log('💰 Funding member via CDP:', {
          recipientAddress: recipient.address,
          tokenAddress,
          amount: amountWei.toString(),
        });

        const transferCallData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipient.address as `0x${string}`, amountWei],
        });

        await sendUserOperation({
          evmSmartAccount: smartAccount,
          network: 'base',
          calls: [{ to: tokenAddress, value: 0n, data: transferCallData }],
          useCdpPaymaster: true,
        });
      }

      console.log('✅ Funding successful');
      onSuccess?.(amount, selectedToken || 'SYSTEM');

      // Broadcast treasury update event for any listening treasury components
      window.dispatchEvent(
        new CustomEvent('treasuryUpdated', {
          detail: {
            recipientAddress: recipient.address,
            podId: recipient.podId,
            isTreasury: recipient.isTreasury,
            amount,
            token: selectedToken || 'SYSTEM',
          },
        }),
      );

      // Reset form
      setAmount('');
      setMessage('');
      onClose();
    } catch (error: any) {
      console.error('❌ Funding failed:', error);
    } finally {
      setIsSending(false);
    }
  };

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="mx-auto w-[92vw] max-w-[56rem] rounded-2xl pt-6 px-6 pb-24">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <DollarSign className="h-5 w-5 text-[#2F5D50]" />
              <span>Fund {recipientType === 'member' ? 'Member' : 'Pod'}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Recipient Display */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              background: '#E8F1EE',
              border: '1px solid #B8D9CA',
              borderRadius: '12px',
            }}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {recipient.image ? (
                <img
                  src={recipient.image}
                  alt=""
                  style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.src = '/observableinfinities.png';
                  }}
                />
              ) : (
                <div style={{ width: '48px', height: '48px', background: '#D1E6DC', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {recipientType === 'member' ? (
                    <User style={{ width: '24px', height: '24px', color: '#2F5D50' }} />
                  ) : (
                    <Users style={{ width: '24px', height: '24px', color: '#2F5D50' }} />
                  )}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontWeight: 600, color: '#1F453A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {recipient.name}
              </h3>
              <p style={{ fontSize: '14px', color: '#5F5A54', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {recipient.address.slice(0, 8)}...{recipient.address.slice(-6)}
              </p>
              {recipient.description && (
                <p style={{ fontSize: '12px', color: '#8FAAA1', marginTop: '4px', margin: '4px 0 0' }}>
                  {recipient.description}
                </p>
              )}
            </div>
          </div>

          {/* Token Selection */}
          <div>
            <Label style={{ display: 'block', marginBottom: '8px' }}>Token</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              <button
                type="button"
                style={{
                  padding: '12px',
                  border: '2px solid #2F5D50',
                  borderRadius: '12px',
                  background: '#E8F1EE',
                  cursor: 'default',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>$SYSTEM</div>
                <div style={{ fontSize: '12px', color: '#5F5A54' }}>1:1 USD backed</div>
                <div style={{ fontSize: '12px', color: '#8FAAA1', marginTop: '4px' }}>
                  {systemError ? (
                    <span style={{ color: '#8B3A3A' }}>Error</span>
                  ) : (
                    `Bal: ${formatBalance(systemBalance)}`
                  )}
                </div>
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#8FAAA1', marginTop: '8px' }}>
              $SELF is soulbound and earned through participation, so it can't be used for funding.
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Label htmlFor="amount">Amount ({selectedToken})</Label>
              <span style={{ fontSize: '14px', color: '#5F5A54' }}>
                Balance: {formatBalance(getBalance())} {selectedToken}
              </span>
            </div>

            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ textAlign: 'right', fontSize: '18px', borderColor: '#D1C4A9', borderRadius: '8px' }}
            />

            {/* Quick Amount Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px' }}>
              {quickAmounts.map((quickAmount) => (
                <button
                  key={quickAmount}
                  type="button"
                  onClick={() => setAmount(quickAmount)}
                  style={{
                    padding: '6px',
                    border: '1px solid #D1C4A9',
                    borderRadius: '8px',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '13px',
                    transition: 'all 0.2s',
                  }}
                >
                  ${quickAmount}
                </button>
              ))}
            </div>

            {/* Insufficient Balance Warning */}
            {amount && !canTransfer() && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#FAF4EC', border: '1px solid #E8D7B8', borderRadius: '8px', fontSize: '14px', color: '#6B5A3E', marginTop: '8px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Insufficient balance
              </div>
            )}
          </div>

          {/* Optional Message */}
          <div>
            <Label htmlFor="message" style={{ display: 'block', marginBottom: '8px' }}>Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder={`Add a note for this ${recipientType === 'member' ? 'transfer' : 'contribution'}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              style={{ borderColor: '#D1C4A9', borderRadius: '8px' }}
            />
          </div>

          {/* Send Button */}
          <div style={{ borderTop: '1px solid #B8D9CA', paddingTop: '16px' }}>
            <button
              onClick={handleSendFunds}
              disabled={!address || !selectedToken || !amount || !canTransfer() || isSending}
              style={{
                width: '100%',
                height: '48px',
                background: (!address || !selectedToken || !amount || !canTransfer() || isSending) ? '#D8D2C8' : '#2F5D50',
                color: (!address || !selectedToken || !amount || !canTransfer() || isSending) ? '#8FAAA1' : '#FFFFFF',
                fontWeight: 600,
                fontSize: '16px',
                border: 'none',
                borderRadius: '12px',
                cursor: (!address || !selectedToken || !amount || !canTransfer() || isSending) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
              }}
            >
              {isSending ? (
                <>
                  <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                  Sending...
                </>
              ) : !amount ? (
                'Enter an amount'
              ) : !canTransfer() ? (
                'Insufficient balance'
              ) : (
                `Send ${amount} ${selectedToken}`
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
