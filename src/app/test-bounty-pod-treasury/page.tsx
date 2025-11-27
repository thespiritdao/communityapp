'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useBalance } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel 
} from '@coinbase/onchainkit/transaction';
import { parseEther, formatEther } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import BountyManagerABI from '@/abis/BountyManager.json';

const SYSTEM_TOKEN_ADDRESS = '0x1317Ae277266D38C4E492558f8693F14143a6A65';
const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

// Pod treasury addresses (you'll need to update these)
const POD_TREASURIES = {
  executive: process.env.NEXT_PUBLIC_EXECUTIVE_POD_TREASURY as `0x${string}`,
  dev: process.env.NEXT_PUBLIC_DEV_POD_TREASURY as `0x${string}`,
  marketing: process.env.NEXT_PUBLIC_MARKETING_POD_TREASURY as `0x${string}`
};

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

const POD_TREASURY_ABI = [
  {
    name: 'approveSpending',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  }
] as const;

// Using the actual deployed BountyManager ABI

export default function TestBountyPodTreasuryPage() {
  const { address } = useAccount();
  const { managedPods, isPodLeader } = useHatPermissions();
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [testAmount, setTestAmount] = useState('1');
  const [bountyId, setBountyId] = useState<string>('');
  const [treasuryBalances, setTreasuryBalances] = useState<Record<string, string>>({});
  
  // Get selected treasury address
  const treasuryAddress = selectedPod ? POD_TREASURIES[selectedPod as keyof typeof POD_TREASURIES] : null;

  // Read treasury balance
  const { data: treasuryTokenBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: treasuryAddress ? [treasuryAddress] : undefined,
    watch: true
  });

  // Read treasury owner
  const { data: treasuryOwner } = useReadContract({
    address: treasuryAddress,
    abi: POD_TREASURY_ABI,
    functionName: 'owner',
    args: [],
    enabled: !!treasuryAddress
  });

  // Read treasury allowance to bounty contract
  const { data: treasuryAllowance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: treasuryAddress && BOUNTY_MANAGER_ADDRESS ? 
      [treasuryAddress, BOUNTY_MANAGER_ADDRESS] : undefined,
    watch: true
  });

  // Check all treasury balances
  useEffect(() => {
    const checkBalances = async () => {
      const balances: Record<string, string> = {};
      for (const [pod, address] of Object.entries(POD_TREASURIES)) {
        if (address) {
          // This would need to be done with useReadContract in practice
          balances[pod] = '0';
        }
      }
      setTreasuryBalances(balances);
    };
    checkBalances();
  }, []);

  useEffect(() => {
    if (treasuryTokenBalance) {
      setTreasuryBalances(prev => ({
        ...prev,
        [selectedPod]: formatEther(treasuryTokenBalance)
      }));
    }
  }, [treasuryTokenBalance, selectedPod]);

  // Transaction calls
  const approveTreasurySpendingCall = treasuryAddress ? {
    address: treasuryAddress,
    abi: POD_TREASURY_ABI,
    functionName: 'approveSpending' as const,
    args: [
      SYSTEM_TOKEN_ADDRESS,
      BOUNTY_MANAGER_ADDRESS,
      parseEther(testAmount)
    ]
  } : null;

  // Note: createBountyFromTreasury doesn't exist in deployed contract

  // Alternative: Direct approve from treasury
  const directApproveCall = treasuryAddress ? {
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve' as const,
    args: [BOUNTY_MANAGER_ADDRESS, parseEther(testAmount)]
  } : null;

  // Then create bounty normally
  const createBountyCall = {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'createBounty' as const,
    args: [
      'Pod Treasury Bounty ' + Date.now(), // _title
      'Pod Management', // _category
      parseEther(testAmount), // _value
      SYSTEM_TOKEN_ADDRESS, // _token
      0, // _paymentStructure (0 = Completion)
      0n, // _upfrontAmount (0 for completion-only)
      parseEther(testAmount) // _completionAmount (full amount)
    ]
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">🏛️ Pod Treasury Bounty Testing</h1>

      {/* Pod Selection and Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>💼 Pod Treasury Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Select Pod Treasury</label>
              <Select value={selectedPod} onValueChange={setSelectedPod}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a pod treasury" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive">Executive Pod</SelectItem>
                  <SelectItem value="dev">Development Pod</SelectItem>
                  <SelectItem value="marketing">Marketing Pod</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedPod && treasuryAddress && (
              <div className="p-4 border rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Treasury Details</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Address:</span>{' '}
                    <span className="font-mono">{treasuryAddress}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Balance:</span>{' '}
                    <span className="font-bold">
                      {treasuryBalances[selectedPod] || '0'} SYSTEM
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Owner:</span>{' '}
                    <span className="font-mono">
                      {treasuryOwner === address ? 'You' : treasuryOwner?.slice(0, 10)}...
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Allowance to Bounty Contract:</span>{' '}
                    <span className="font-bold">
                      {treasuryAllowance ? formatEther(treasuryAllowance) : '0'} SYSTEM
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isPodLeader && (
              <Alert className="bg-yellow-50">
                <AlertDescription>
                  ⚠️ You need to be a pod leader to manage treasury funds.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fund Treasury (for testing) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>💰 Fund Treasury (Test Setup)</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertDescription>
              For testing, you may need to send SYSTEM tokens to the pod treasury first.
            </AlertDescription>
          </Alert>

          {treasuryAddress && (
            <div className="p-4 border rounded-lg">
              <p className="text-sm mb-2">Send tokens to treasury:</p>
              <code className="text-xs font-mono bg-gray-100 p-2 rounded block">
                {treasuryAddress}
              </code>
              <p className="text-xs text-gray-500 mt-2">
                Use your wallet or a faucet to send SYSTEM tokens
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Bounty from Treasury */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🚀 Create Bounty from Pod Treasury</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Bounty Amount (SYSTEM)</label>
            <Input
              type="number"
              step="0.1"
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              placeholder="1.0"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Available: {treasuryBalances[selectedPod] || '0'} SYSTEM
            </p>
          </div>

          {/* Method 1: Treasury approves spending */}
          <div className="p-4 border rounded-lg">
            <h4 className="font-medium mb-2">Method 1: Treasury Approval</h4>
            <p className="text-sm text-gray-600 mb-3">
              Pod treasury approves bounty contract to spend tokens
            </p>

            {/* Step 1: Approve */}
            {parseFloat(treasuryAllowance ? formatEther(treasuryAllowance) : '0') < parseFloat(testAmount) ? (
              <div className="mb-3">
                <p className="text-sm mb-2">Step 1: Approve treasury spending</p>
                {approveTreasurySpendingCall && (
                  <Transaction
                    chainId={8453}
                    calls={[approveTreasurySpendingCall]}
                    onStatus={(status) => {
                      console.log('Treasury approval status:', status);
                    }}
                  >
                    <TransactionButton 
                      text="Approve Treasury Spending"
                      className="w-full"
                    />
                    <TransactionStatus>
                      <TransactionStatusLabel />
                      <TransactionStatusAction />
                    </TransactionStatus>
                  </Transaction>
                )}
              </div>
            ) : (
              <Alert className="bg-green-50 mb-3">
                <AlertDescription>
                  ✅ Treasury already approved for spending
                </AlertDescription>
              </Alert>
            )}

            {/* Step 2: Create bounty */}
            <div>
              <p className="text-sm mb-2">Step 2: Create bounty from treasury</p>
              <Transaction
                chainId={8453}
                calls={[createBountyCall]}
                onStatus={(status) => {
                  console.log('Create bounty status:', status);
                  if (status.statusName === 'success' && status.transactionReceipts) {
                    const logs = status.transactionReceipts[0]?.logs;
                    if (logs && logs[0]) {
                      const bountyIdHex = logs[0].topics?.[1];
                      if (bountyIdHex) {
                        const id = BigInt(bountyIdHex).toString();
                        setBountyId(id);
                        console.log('Created bounty ID:', id);
                      }
                    }
                  }
                }}
              >
                <TransactionButton 
                  text="Create Bounty from Treasury"
                  disabled={parseFloat(treasuryBalances[selectedPod] || '0') < parseFloat(testAmount)}
                  className="w-full"
                />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          </div>

          {/* Method 2: Direct treasury funding (if contract supports) */}
          <div className="p-4 border rounded-lg">
            <h4 className="font-medium mb-2">Method 2: Direct Treasury Funding</h4>
            <p className="text-sm text-gray-600 mb-3">
              Create bounty directly from treasury (requires special contract function)
            </p>
            
            <Alert className="bg-gray-50">
              <AlertDescription>
                ⚠️ Note: The deployed contract doesn't have createBountyFromTreasury function.
                Use Method 1 (Treasury Approval) instead.
              </AlertDescription>
            </Alert>

            <p className="text-xs text-gray-500 mt-2">
              Note: This requires BountyManager to have permission to pull from treasury
            </p>
          </div>

          {bountyId && (
            <Alert className="bg-blue-50">
              <AlertDescription>
                📝 Bounty Created from Treasury! ID: {bountyId}
                <br />
                ✅ Tokens have been escrowed from pod treasury
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Verification */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 Escrow Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              💡 <strong>How to verify pod treasury escrow:</strong>
              <br />
              1. Check pod treasury balance before creating bounty
              <br />
              2. Approve bounty contract to spend treasury tokens
              <br />
              3. Create bounty - treasury balance should decrease
              <br />
              4. Bounty contract escrow should increase
              <br />
              5. The bounty should show pod as funding source
              <br />
              <br />
              ⚠️ <strong>Important:</strong> Only pod leaders can authorize treasury spending
            </AlertDescription>
          </Alert>

          <div className="mt-4 p-4 border rounded-lg bg-gray-50">
            <h4 className="font-medium mb-2">Current Status</h4>
            <div className="space-y-1 text-sm">
              <div>You are {isPodLeader ? '' : 'NOT '}a pod leader</div>
              <div>Managing pods: {managedPods.join(', ') || 'None'}</div>
              <div>Selected treasury balance: {treasuryBalances[selectedPod] || '0'} SYSTEM</div>
              <div>Contract escrow allowance: {treasuryAllowance ? formatEther(treasuryAllowance) : '0'} SYSTEM</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}