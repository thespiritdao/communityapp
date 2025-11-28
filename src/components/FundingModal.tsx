'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAccount } from 'wagmi';
import { useBalance } from 'wagmi';
import {
  SafeOnchainKitWrapper,
  SafeTransaction as Transaction,
  SafeTransactionButton as TransactionButton,
  SafeTransactionSponsor as TransactionSponsor,
  SafeTransactionStatus as TransactionStatus,
  SafeTransactionStatusLabel as TransactionStatusLabel,
  SafeTransactionStatusAction as TransactionStatusAction,
} from './SafeOnchainKit';
import { parseUnits } from 'viem';
import { DollarSign, User, Users, Wallet, AlertCircle } from 'lucide-react';

// Token addresses from environment
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
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
  const { address } = useAccount();
  const [selectedToken, setSelectedToken] = useState<'SYSTEM' | null>('SYSTEM');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  // Early return if no recipient or recipientType (modal closed state)
  if (!recipient || !recipientType) {
    return null;
  }

  // Get token balances
  const { data: systemBalance, error: systemError } = useBalance({
    address,
    token: SYSTEM_TOKEN,
  });

  // SELF token transfers removed - non-transferable

  // Quick amount buttons
  const quickAmounts = ['10', '25', '50', '100'];

  const handleSuccess = (response: any) => {
    console.log('💰 Funding successful:', response);
    onSuccess?.(amount, selectedToken || 'SYSTEM');

    // Broadcast treasury update event for any listening treasury components
    // Include both the recipient address and podId for treasury components to match
    window.dispatchEvent(
      new CustomEvent('treasuryUpdated', {
        detail: {
          recipientAddress: recipient.address,
          podId: recipient.podId, // Include podId for treasury proxy transactions
          isTreasury: recipient.isTreasury,
          amount,
          token: selectedToken || 'SYSTEM',
        },
      }),
    );

    // Reset form
    setAmount('');
    setMessage('');
    setSelectedToken('SYSTEM');
    onClose();
  };

  const handleError = (error: any) => {
    console.error('💰 Funding failed:', error);
  };

  const prepareTransferTransaction = () => {
    if (!selectedToken || !amount || !address) {
      throw new Error('Missing required fields');
    }

    const tokenAddress = selectedToken === 'SYSTEM' ? SYSTEM_TOKEN : SELF_TOKEN;
    const amountWei = parseUnits(amount, 18);

    // If funding a treasury contract, use proxy for sponsored transactions
    if (recipient.isTreasury && recipient.podId && TREASURY_PROXY_ADDRESS) {
      console.log('💰 Preparing treasury proxy funding transaction:', {
        proxyAddress: TREASURY_PROXY_ADDRESS,
        podId: recipient.podId,
        tokenAddress,
        amount: amountWei.toString(),
        method: 'proxyReceiveTokens',
      });

      return [
        // Step 1: Approve proxy to spend tokens
        {
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [TREASURY_PROXY_ADDRESS, amountWei],
        },
        // Step 2: Call proxy's proxyReceiveTokens function
        {
          address: TREASURY_PROXY_ADDRESS,
          abi: TREASURY_PROXY_ABI,
          functionName: 'proxyReceiveTokens',
          args: [recipient.podId, tokenAddress as `0x${string}`, amountWei],
        },
      ];
    }

    // For regular member funding, use direct transfer
    console.log('💰 Preparing member funding transaction:', {
      recipientAddress: recipient.address,
      tokenAddress,
      amount: amountWei.toString(),
      method: 'transfer',
    });

    return [
      {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient.address as `0x${string}`, amountWei],
      },
    ];
  };

  const getBalance = () => {
    return systemBalance; // Only SYSTEM tokens are transferable
  };

  const getBalanceError = () => {
    return systemError;
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
              <DollarSign className="h-5 w-5 text-blue-600" />
              <span>Fund {recipientType === 'member' ? 'Member' : 'Pod'}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Recipient Display */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="relative">
              {recipient.image ? (
                <img
                  src={recipient.image}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/observableinfinities.png';
                  }}
                />
              ) : (
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  {recipientType === 'member' ? (
                    <User className="h-6 w-6 text-blue-600" />
                  ) : (
                    <Users className="h-6 w-6 text-blue-600" />
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {recipient.name}
              </h3>
              <p className="text-sm text-gray-500 font-mono truncate">
                {recipient.address.slice(0, 8)}...{recipient.address.slice(-6)}
              </p>
              {recipient.description && (
                <p className="text-xs text-gray-400 mt-1">
                  {recipient.description}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Payment Token</Label>
            <div className="p-3 border border-blue-500 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">SYSTEM Token</div>
                  <div className="text-sm text-gray-500">
                    Transferable • 1:1 USD
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    {systemError ? (
                      <span className="text-red-500">Error</span>
                    ) : (
                      `${formatBalance(systemBalance)} SYSTEM`
                    )}
                  </div>
                  <Badge variant="outline" size="sm">
                    Available
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          {selectedToken && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="amount">Amount ({selectedToken})</Label>
                <div className="text-sm text-gray-500">
                  Balance: {formatBalance(getBalance())} {selectedToken}
                </div>
              </div>

              <div className="space-y-2">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-right text-lg"
                />

                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((quickAmount) => (
                    <Button
                      key={quickAmount}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAmount(quickAmount)}
                      className="text-xs"
                    >
                      ${quickAmount}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {amount && !canTransfer() && (
                <div className="flex items-center gap-2 p-2 bg-red-50 text-red-700 rounded text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Insufficient balance
                </div>
              )}
            </div>
          )}

          {/* Optional Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder={`Add a note for this ${recipientType === 'member' ? 'transfer' : 'contribution'}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>

          {/* Transaction Section */}
          <div className="border-t pt-4">
            {address && selectedToken && amount && canTransfer() ? (
              <SafeOnchainKitWrapper
                fallback={
                  <Button disabled={true} className="w-full h-12">
                    Loading transaction...
                  </Button>
                }
                errorFallback={
                  <Button
                    disabled={true}
                    variant="outline"
                    className="w-full h-12"
                  >
                    Transaction currently unavailable
                  </Button>
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
                    text={`Send ${amount} ${selectedToken}`}
                    className="w-full h-12 text-white font-semibold"
                    style={{ backgroundColor: '#2F5D50' }}
                  />
                  <TransactionSponsor />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              </SafeOnchainKitWrapper>
            ) : (
              <div className="text-center py-4">
                <Wallet className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500 mb-1">
                  Ready to send funds?
                </p>
                <div className="text-xs text-gray-400 space-y-1">
                  <div className={selectedToken ? 'text-green-600' : ''}>
                    {selectedToken ? '✓' : '○'} Token selected
                  </div>
                  <div
                    className={amount && canTransfer() ? 'text-green-600' : ''}
                  >
                    {amount && canTransfer() ? '✓' : '○'} Valid amount entered
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
