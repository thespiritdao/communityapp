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
import { Alert, AlertDescription } from '@/components/ui/alert';
import BountyManagerABI from '@/abis/BountyManager.json';

// ABIs for the contracts
const SYSTEM_TOKEN_ADDRESS = '0x1317Ae277266D38C4E492558f8693F14143a6A65';
const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

const ERC20_ABI = [
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
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
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

// Using the existing BountyManager ABI from the deployed contract

export default function TestBountyEscrowPage() {
  const { address } = useAccount();
  const [testAmount, setTestAmount] = useState('0.1');
  const [bountyId, setBountyId] = useState<string>('');
  const [testPhase, setTestPhase] = useState<'approve' | 'create' | 'cancel' | 'idle'>('idle');
  const [escrowData, setEscrowData] = useState({
    walletBalance: '0',
    contractBalance: '0',
    allowance: '0'
  });

  // Read token balance
  const { data: walletTokenBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    watch: true
  });

  // Read contract escrow balance
  const { data: contractTokenBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: BOUNTY_MANAGER_ADDRESS ? [BOUNTY_MANAGER_ADDRESS] : undefined,
    watch: true
  });

  // Read allowance
  const { data: tokenAllowance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && BOUNTY_MANAGER_ADDRESS ? [address, BOUNTY_MANAGER_ADDRESS] : undefined,
    watch: true
  });

  // Update display values
  useEffect(() => {
    setEscrowData({
      walletBalance: walletTokenBalance ? formatEther(walletTokenBalance) : '0',
      contractBalance: contractTokenBalance ? formatEther(contractTokenBalance) : '0',
      allowance: tokenAllowance ? formatEther(tokenAllowance) : '0'
    });
  }, [walletTokenBalance, contractTokenBalance, tokenAllowance]);

  // Transaction calls for OnchainKit
  const approveCall = {
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve' as const,
    args: [BOUNTY_MANAGER_ADDRESS, parseEther(testAmount)]
  };

  // CORRECT: 4-parameter createBounty matching deployed BountyManagerOptimized.sol
  const createBountyCall = {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'createBounty' as const,
    args: [
      parseEther(testAmount),  // value (uint128)
      SYSTEM_TOKEN_ADDRESS,    // token (address)
      0,                       // paymentType (uint8) - 0=Completion
      'QmTest' + Date.now()    // ipfsHash (string) - metadata stored on IPFS
    ]
  };
  
  // Alternative with milestones payment structure
  const createBountyCallAlt = {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'createBounty' as const,
    args: [
      parseEther(testAmount),  // value (uint128)
      SYSTEM_TOKEN_ADDRESS,    // token (address)
      1,                       // paymentType (uint8) - 1=Milestones
      'QmTestMilestones' + Date.now() // ipfsHash (string)
    ]
  };
  
  // Log correct 4-parameter format for deployed BountyManagerOptimized contract
  console.log('🔍 CreateBounty Debug - BountyManagerOptimized Contract (4 params):', {
    contractAddress: BOUNTY_MANAGER_ADDRESS,
    parameters: {
      value: parseEther(testAmount).toString() + ' wei (' + testAmount + ' tokens)',
      token: SYSTEM_TOKEN_ADDRESS,
      paymentType: 0, // 0=Completion, 1=Milestones, 2=Split
      ipfsHash: 'QmTest' + Date.now()
    },
    userAllowance: parseFloat(escrowData.allowance),
    userBalance: parseFloat(escrowData.walletBalance),
    testAmount: parseFloat(testAmount),
    note: 'Using deployed BountyManagerOptimized.sol (4-parameter version with IPFS metadata)'
  });

  const cancelBountyCall = bountyId ? {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'cancelBounty' as const,
    args: [BigInt(bountyId)]
  } : null;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">🧪 Bounty Escrow Testing</h1>

      {/* Current Balances */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>💰 Current Balances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Your Wallet</p>
              <p className="font-mono font-bold">{escrowData.walletBalance} SYSTEM</p>
            </div>
            <div>
              <p className="text-gray-600">Contract Escrow</p>
              <p className="font-mono font-bold">{escrowData.contractBalance} SYSTEM</p>
            </div>
            <div>
              <p className="text-gray-600">Your Allowance</p>
              <p className="font-mono font-bold">{escrowData.allowance} SYSTEM</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test 1: Create Bounty with Escrow */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test 1: Create Bounty with Escrow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Test Amount (SYSTEM)</label>
            <Input
              type="number"
              step="0.1"
              value={testAmount}
              onChange={(e) => setTestAmount(e.target.value)}
              placeholder="0.1"
              className="mt-1"
            />
          </div>

          {/* Step 1: Approve */}
          {parseFloat(escrowData.allowance) < parseFloat(testAmount) ? (
            <div className="p-4 border rounded-lg">
              <p className="text-sm mb-2">Step 1: Approve SYSTEM tokens</p>
              <Transaction
                chainId={8453}
                calls={[approveCall]}
                onStatus={(status) => {
                  console.log('Approval status:', status);
                }}
              >
                <TransactionButton 
                  text="Approve Tokens"
                  className="w-full"
                />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          ) : (
            <Alert className="bg-green-50">
              <AlertDescription>
                ✅ Tokens already approved! You can create a bounty.
              </AlertDescription>
            </Alert>
          )}

          {/* Validation Check */}
          {parseFloat(escrowData.walletBalance) < parseFloat(testAmount) && (
            <Alert className="bg-red-50 mb-4">
              <AlertDescription>
                ⚠️ Insufficient SYSTEM tokens! You have {escrowData.walletBalance} but need {testAmount}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Step 2: Create Bounty */}
          <div className="p-4 border rounded-lg">
            <p className="text-sm mb-2">Step 2: Create Bounty (tokens will be escrowed)</p>
            <div className="text-xs text-gray-500 mb-2">
              🔍 Debug: Balance={escrowData.walletBalance}, Allowance={escrowData.allowance}, Amount={testAmount}
            </div>
            {/* Correct BountyManagerOptimized transaction */}
            <div className="space-y-2">
              <Transaction
                chainId={8453}
                calls={[createBountyCall]}
                onStatus={(status) => {
                  console.log('Create bounty (Completion) status:', status);
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
                  text="Create Bounty & Escrow (4-param)"
                  disabled={parseFloat(escrowData.allowance) < parseFloat(testAmount)}
                  className="w-full mb-2"
                />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
              
              {/* Alternative: Milestones payment type */}
              <Transaction
                chainId={8453}
                calls={[createBountyCallAlt]}
                onStatus={(status) => {
                  console.log('Create bounty (Milestones) status:', status);
                  if (status.statusName === 'success' && status.transactionReceipts) {
                    const logs = status.transactionReceipts[0]?.logs;
                    if (logs && logs[0]) {
                      const bountyIdHex = logs[0].topics?.[1];
                      if (bountyIdHex) {
                        const id = BigInt(bountyIdHex).toString();
                        setBountyId(id);
                        console.log('Created bounty ID (Milestones):', id);
                      }
                    }
                  }
                }}
              >
                <TransactionButton 
                  text="Create Bounty (Milestones Payment)"
                  disabled={parseFloat(escrowData.allowance) < parseFloat(testAmount)}
                  className="w-full"
                  variant="outline"
                />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          </div>

          {bountyId && (
            <Alert className="bg-blue-50">
              <AlertDescription>
                📝 Bounty Created! ID: {bountyId}
                <br />
                Check the balances above - your tokens should now be in escrow.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Test 2: Cancel Bounty & Refund */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test 2: Cancel Bounty & Refund</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Bounty ID to Cancel</label>
            <Input
              type="text"
              value={bountyId}
              onChange={(e) => setBountyId(e.target.value)}
              placeholder="Enter bounty ID"
              className="mt-1"
            />
          </div>

          {bountyId && cancelBountyCall && (
            <div className="p-4 border rounded-lg">
              <p className="text-sm mb-2">Cancel bounty and refund escrowed tokens</p>
              <Transaction
                chainId={8453}
                calls={[cancelBountyCall]}
                onStatus={(status) => {
                  console.log('Cancel status:', status);
                }}
              >
                <TransactionButton 
                  text="Cancel & Refund"
                  className="w-full"
                />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>
            </div>
          )}

          <Alert>
            <AlertDescription>
              ⚠️ Only the bounty creator or admin can cancel a bounty.
              After cancellation, check your wallet balance - tokens should be refunded.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Test 3: Monitor Escrow Changes */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Escrow Monitor & Debug</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span>Your Address:</span>
              <span className="font-mono">{address}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Bounty Contract:</span>
              <span className="font-mono">{BOUNTY_MANAGER_ADDRESS}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>SYSTEM Token:</span>
              <span className="font-mono">{SYSTEM_TOKEN_ADDRESS}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Environment Check:</span>
              <span className={`font-mono ${!BOUNTY_MANAGER_ADDRESS ? 'text-red-600' : 'text-green-600'}`}>
                {!BOUNTY_MANAGER_ADDRESS ? '❌ Missing' : '✅ Configured'}
              </span>
            </div>
          </div>

          <Alert className="mt-4">
            <AlertDescription>
              💡 <strong>How to verify escrow:</strong>
              <br />
              1. Note your wallet balance before creating a bounty
              <br />
              2. Create a bounty - your balance should decrease
              <br />
              3. Contract escrow balance should increase by the same amount
              <br />
              4. Cancel the bounty - your balance should be refunded
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}