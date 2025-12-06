'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle, Coins } from 'lucide-react';

// Transaction components for sponsored transactions
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

// Import ABIs
const ERC20_ABI = [
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
];

// Environment variables
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
const EVENT_MANAGER = process.env.NEXT_PUBLIC_EVENT_MANAGER as `0x${string}`;
const BASE_CHAIN_ID = 8453;

interface TokenApprovalFlowProps {
  systemTokenAmount: string; // Amount in token units (e.g., "10")
  selfTokenAmount: string; // Amount in token units (e.g., "5")
  onApprovalComplete: () => void;
  onCancel: () => void;
}

interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  amount: bigint;
  userBalance: bigint;
  currentAllowance: bigint;
  needsApproval: boolean;
}

export const TokenApprovalFlow: React.FC<TokenApprovalFlowProps> = ({
  systemTokenAmount,
  selfTokenAmount,
  onApprovalComplete,
  onCancel,
}) => {
  const { address } = useAccount();
  const [approvalStep, setApprovalStep] = useState<
    'checking' | 'system' | 'self' | 'complete'
  >('checking');
  const [systemApproved, setSystemApproved] = useState(false);
  const [selfApproved, setSelfApproved] = useState(false);

  // Parse token amounts to wei
  const systemAmountWei = parseUnits(systemTokenAmount || '0', 18);
  const selfAmountWei = parseUnits(selfTokenAmount || '0', 18);

  // Read SYSTEM token data
  const { data: systemBalance } = useReadContract({
    address: SYSTEM_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const { data: systemAllowance } = useReadContract({
    address: SYSTEM_TOKEN,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, EVENT_MANAGER] : undefined,
  });

  // Read SELF token data
  const { data: selfBalance } = useReadContract({
    address: SELF_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const { data: selfAllowance } = useReadContract({
    address: SELF_TOKEN,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, EVENT_MANAGER] : undefined,
  });

  // Determine what approvals are needed
  const needsSystemApproval =
    systemAmountWei > 0n &&
    (systemAllowance ? (systemAllowance as bigint) : 0n) < systemAmountWei;
  const needsSelfApproval =
    selfAmountWei > 0n &&
    (selfAllowance ? (selfAllowance as bigint) : 0n) < selfAmountWei;

  // Only show insufficient balance if we have loaded the balance data
  // If balance is undefined, we're still loading - don't show error yet
  const hasInsufficientSystemBalance =
    systemAmountWei > 0n &&
    systemBalance !== undefined &&
    (systemBalance as bigint) < systemAmountWei;
  const hasInsufficientSelfBalance =
    selfAmountWei > 0n &&
    selfBalance !== undefined &&
    (selfBalance as bigint) < selfAmountWei;

  // Log balance checks for debugging
  useEffect(() => {
    if (systemAmountWei > 0n) {
      console.log('💰 SYSTEM Token Balance Check:', {
        required: formatTokenAmount(systemAmountWei),
        balance: systemBalance ? formatTokenAmount(systemBalance as bigint) : 'Loading...',
        allowance: systemAllowance ? formatTokenAmount(systemAllowance as bigint) : 'Loading...',
        needsApproval: needsSystemApproval,
        insufficient: hasInsufficientSystemBalance,
      });
    }
    if (selfAmountWei > 0n) {
      console.log('💰 SELF Token Balance Check:', {
        required: formatTokenAmount(selfAmountWei),
        balance: selfBalance ? formatTokenAmount(selfBalance as bigint) : 'Loading...',
        allowance: selfAllowance ? formatTokenAmount(selfAllowance as bigint) : 'Loading...',
        needsApproval: needsSelfApproval,
        insufficient: hasInsufficientSelfBalance,
      });
    }
  }, [systemBalance, selfBalance, systemAllowance, selfAllowance]);

  // Set initial step based on what's needed
  useEffect(() => {
    if (!needsSystemApproval && !needsSelfApproval) {
      setApprovalStep('complete');
      onApprovalComplete();
    } else if (needsSystemApproval) {
      setApprovalStep('system');
    } else if (needsSelfApproval) {
      setApprovalStep('self');
    }
  }, [needsSystemApproval, needsSelfApproval, onApprovalComplete]);

  // Create approval transaction calls
  const getSystemApprovalCall = () => [
    {
      address: SYSTEM_TOKEN,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [EVENT_MANAGER, systemAmountWei],
      to: SYSTEM_TOKEN,
    },
  ];

  const getSelfApprovalCall = () => [
    {
      address: SELF_TOKEN,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [EVENT_MANAGER, selfAmountWei],
      to: SELF_TOKEN,
    },
  ];

  const formatTokenAmount = (amount: bigint) => {
    return Number.parseFloat(formatUnits(amount, 18)).toFixed(4);
  };

  if (hasInsufficientSystemBalance || hasInsufficientSelfBalance) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center" style={{ color: '#8B3A3A' }}>
            <AlertCircle className="w-5 h-5 mr-2" />
            Insufficient Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasInsufficientSystemBalance && (
            <Alert variant="destructive">
              <AlertDescription>
                You need {formatTokenAmount(systemAmountWei)} SYSTEM tokens but
                only have{' '}
                {formatTokenAmount(
                  systemBalance ? (systemBalance as bigint) : 0n,
                )}
                .
              </AlertDescription>
            </Alert>
          )}
          {hasInsufficientSelfBalance && (
            <Alert variant="destructive">
              <AlertDescription>
                You need {formatTokenAmount(selfAmountWei)} SELF tokens but only
                have{' '}
                {formatTokenAmount(selfBalance ? (selfBalance as bigint) : 0n)}.
              </AlertDescription>
            </Alert>
          )}
          <Button onClick={onCancel} className="w-full">
            Cancel Registration
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Coins className="w-5 h-5 mr-2" />
          Token Approval Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress indicators */}
        <div className="space-y-3">
          {systemAmountWei > 0n && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: systemApproved
                      ? '#3F7A5A'
                      : approvalStep === 'system'
                        ? '#2F5D50'
                        : '#d1d5db',
                  }}
                >
                  {systemApproved ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : approvalStep === 'system' ? (
                    <Clock className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-white text-xs">1</span>
                  )}
                </div>
                <div>
                  <p className="font-medium">SYSTEM Token</p>
                  <p className="text-sm text-gray-600">
                    {formatTokenAmount(systemAmountWei)} tokens
                  </p>
                </div>
              </div>
              <Badge variant={systemApproved ? 'default' : 'secondary'}>
                {systemApproved ? 'Approved' : 'Pending'}
              </Badge>
            </div>
          )}

          {selfAmountWei > 0n && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: selfApproved
                      ? '#3F7A5A'
                      : approvalStep === 'self'
                        ? '#2F5D50'
                        : '#d1d5db',
                  }}
                >
                  {selfApproved ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : approvalStep === 'self' ? (
                    <Clock className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-white text-xs">2</span>
                  )}
                </div>
                <div>
                  <p className="font-medium">SELF Token</p>
                  <p className="text-sm text-gray-600">
                    {formatTokenAmount(selfAmountWei)} tokens
                  </p>
                </div>
              </div>
              <Badge variant={selfApproved ? 'default' : 'secondary'}>
                {selfApproved ? 'Approved' : 'Pending'}
              </Badge>
            </div>
          )}
        </div>

        {/* Current step UI */}
        {approvalStep === 'system' && needsSystemApproval && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Approve SYSTEM tokens to allow the event contract to collect
                payment when you register.
              </AlertDescription>
            </Alert>

            <Transaction
              chainId={BASE_CHAIN_ID}
              calls={getSystemApprovalCall()}
              isSponsored={true}
              onSuccess={() => {
                setSystemApproved(true);
                if (needsSelfApproval) {
                  setApprovalStep('self');
                } else {
                  setApprovalStep('complete');
                  onApprovalComplete();
                }
              }}
              onError={(error) => {
                console.error('SYSTEM token approval failed:', error);
              }}
            >
              <TransactionButton
                text="Approve SYSTEM Tokens"
                className="w-full text-white hover:opacity-90"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          </div>
        )}

        {approvalStep === 'self' && needsSelfApproval && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Approve SELF tokens to allow the event contract to collect
                payment when you register.
              </AlertDescription>
            </Alert>

            <Transaction
              chainId={BASE_CHAIN_ID}
              calls={getSelfApprovalCall()}
              isSponsored={true}
              onSuccess={() => {
                setSelfApproved(true);
                setApprovalStep('complete');
                onApprovalComplete();
              }}
              onError={(error) => {
                console.error('SELF token approval failed:', error);
              }}
            >
              <TransactionButton
                text="Approve SELF Tokens"
                className="w-full text-white hover:opacity-90"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          </div>
        )}

        {approvalStep === 'complete' && (
          <div className="text-center space-y-4">
            <CheckCircle
              className="w-12 h-12 mx-auto"
              style={{ color: '#3F7A5A' }}
            />
            <p className="text-lg font-medium" style={{ color: '#3F7A5A' }}>
              Approvals Complete!
            </p>
            <p className="text-gray-600">
              You can now proceed with event registration.
            </p>
          </div>
        )}

        {/* Cancel button */}
        <Button
          variant="outline"
          onClick={onCancel}
          className="w-full"
          disabled={approvalStep === 'checking'}
        >
          Cancel Registration
        </Button>
      </CardContent>
    </Card>
  );
};
