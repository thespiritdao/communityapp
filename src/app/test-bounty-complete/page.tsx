'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BountyManagerABI from '@/abis/BountyManager.json';

const SYSTEM_TOKEN_ADDRESS = '0x1317Ae277266D38C4E492558f8693F14143a6A65';
const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

// Using the actual deployed BountyManager ABI

export default function TestBountyCompletePage() {
  const { address } = useAccount();
  const [bountyId, setBountyId] = useState<string>('');
  const [bidderAddress, setBidderAddress] = useState<string>('');
  const [reviewerAddress, setReviewerAddress] = useState<string>('');
  const [approverAddress, setApproverAddress] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  // Note: approveCompletion releases full bounty amount, no partial amounts
  const [bountyInfo, setBountyInfo] = useState<any>(null);
  const [assignmentInfo, setAssignmentInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('bid');

  // Parse bounty ID (handle both numeric and UUID inputs)
  const parseBountyId = (id: string): bigint | undefined => {
    if (!id) return undefined;
    // If it's a UUID, extract numeric part or use fallback
    if (id.includes('-')) {
      console.warn('UUID detected. Smart contract needs numeric ID. Try entering 1, 2, 3, etc.');
      return undefined;
    }
    try {
      return BigInt(id);
    } catch (e) {
      console.error('Invalid bounty ID format:', id);
      return undefined;
    }
  };

  // Read bounty data
  const { data: bountyData } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'getBounty',
    args: parseBountyId(bountyId) ? [parseBountyId(bountyId)] : undefined,
    watch: true
  });

  // Read assignment data
  const { data: assignmentData } = useReadContract({
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'getAssignment',
    args: parseBountyId(bountyId) ? [parseBountyId(bountyId)] : undefined,
    watch: true
  });

  // Read bidder balance
  const { data: bidderBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: bidderAddress ? [bidderAddress as `0x${string}`] : undefined,
    watch: true
  });

  useEffect(() => {
    if (bountyData) {
      const [creator, value, token, status, ipfsHash] = bountyData;
      setBountyInfo({
        creator,
        value: formatEther(value),
        token,
        status: ['Open', 'Assigned', 'Completed', 'Cancelled'][status],
        statusCode: status,
        ipfsHash
      });
      
      // Set default payment amount to full bounty value
      if (!paymentAmount) {
        setPaymentAmount(formatEther(value));
      }
    }
  }, [bountyData]);

  useEffect(() => {
    if (assignmentData) {
      const [bidder, reviewer, escrowAmount, paidAmount] = assignmentData;
      setAssignmentInfo({
        bidder,
        reviewer,
        escrowAmount: formatEther(escrowAmount),
        paidAmount: formatEther(paidAmount),
        remaining: formatEther(escrowAmount - paidAmount)
      });
      
      // Auto-fill addresses if assigned
      if (bidder !== '0x0000000000000000000000000000000000000000') {
        setBidderAddress(bidder);
        setReviewerAddress(reviewer);
      }
    }
  }, [assignmentData]);

  // Transaction calls
  const numericBountyId = parseBountyId(bountyId);
  const placeBidCall = numericBountyId ? {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'placeBid' as const,
    args: [numericBountyId]
  } : null;

  const assignBountyCall = numericBountyId && bidderAddress && reviewerAddress && approverAddress ? {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'assignBounty' as const,
    args: [
      numericBountyId,
      bidderAddress as `0x${string}`,
      reviewerAddress as `0x${string}`,
      approverAddress as `0x${string}`
    ]
  } : null;

  const releasePaymentCall = numericBountyId && paymentAmount ? {
    address: BOUNTY_MANAGER_ADDRESS,
    abi: BountyManagerABI,
    functionName: 'releasePayment' as const,
    args: [numericBountyId, parseEther(paymentAmount)]
  } : null;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">🧪 Bounty Completion & Payout Testing</h1>

      {/* Bounty Selection */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>📋 Select Bounty</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Bounty ID (Numeric Only)</label>
              <Input
                type="text"
                value={bountyId}
                onChange={(e) => setBountyId(e.target.value)}
                placeholder="Enter numeric ID (1, 2, 3...)"
                className="mt-1"
              />
              {bountyId && bountyId.includes('-') && (
                <p className="text-xs text-red-500 mt-1">
                  ⚠️ UUID detected. Please enter the numeric on-chain ID instead.
                </p>
              )}
            </div>

            {bountyInfo && (
              <div className="p-4 border rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Bounty Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Creator: <span className="font-mono">{bountyInfo.creator?.slice(0, 10)}...</span></div>
                  <div>Value: <span className="font-bold">{bountyInfo.value} SYSTEM</span></div>
                  <div>Status: <span className="font-bold">{bountyInfo.status}</span></div>
                  <div>IPFS: <span className="font-mono">{bountyInfo.ipfsHash?.slice(0, 10)}...</span></div>
                </div>
              </div>
            )}

            {assignmentInfo && assignmentInfo.bidder !== '0x0000000000000000000000000000000000000000' && (
              <div className="p-4 border rounded-lg bg-blue-50">
                <h4 className="font-medium mb-2">Assignment Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Bidder: <span className="font-mono">{assignmentInfo.bidder?.slice(0, 10)}...</span></div>
                  <div>Reviewer: <span className="font-mono">{assignmentInfo.reviewer?.slice(0, 10)}...</span></div>
                  <div>Escrowed: <span className="font-bold">{assignmentInfo.escrowAmount} SYSTEM</span></div>
                  <div>Paid: <span className="font-bold">{assignmentInfo.paidAmount} SYSTEM</span></div>
                  <div className="col-span-2">
                    Remaining: <span className="font-bold text-green-600">{assignmentInfo.remaining} SYSTEM</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test Workflow */}
      <Card>
        <CardHeader>
          <CardTitle>🔄 Complete Bounty Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="bid">1. Bid</TabsTrigger>
              <TabsTrigger value="assign">2. Assign</TabsTrigger>
              <TabsTrigger value="payout">3. Payout</TabsTrigger>
            </TabsList>

            {/* Step 1: Place Bid */}
            <TabsContent value="bid" className="space-y-4">
              <Alert>
                <AlertDescription>
                  📝 Place a bid on the bounty. This registers your interest in completing the work.
                </AlertDescription>
              </Alert>

              {placeBidCall && bountyInfo?.statusCode === 0 && (
                <Transaction
                  chainId={8453}
                  calls={[placeBidCall]}
                  onStatus={(status) => {
                    console.log('Bid status:', status);
                    if (status.statusName === 'success') {
                      setActiveTab('assign');
                    }
                  }}
                >
                  <TransactionButton 
                    text="Place Bid"
                    className="w-full"
                  />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              )}

              {bountyInfo?.statusCode !== 0 && (
                <Alert className="bg-yellow-50">
                  <AlertDescription>
                    ⚠️ This bounty is not open for bidding (Status: {bountyInfo?.status})
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Step 2: Assign Bounty */}
            <TabsContent value="assign" className="space-y-4">
              <Alert>
                <AlertDescription>
                  👥 Assign the bounty to a bidder with reviewer and approver roles.
                  <br />⚠️ Only the bounty creator or admin can assign.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Bidder Address</label>
                  <Input
                    type="text"
                    value={bidderAddress}
                    onChange={(e) => setBidderAddress(e.target.value)}
                    placeholder="0x..."
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use your own address for testing: {address}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Technical Reviewer Address</label>
                  <Input
                    type="text"
                    value={reviewerAddress}
                    onChange={(e) => setReviewerAddress(e.target.value)}
                    placeholder="0x..."
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Final Approver Address</label>
                  <Input
                    type="text"
                    value={approverAddress}
                    onChange={(e) => setApproverAddress(e.target.value)}
                    placeholder="0x..."
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    For testing, you can use your address for all roles
                  </p>
                </div>
              </div>

              {assignBountyCall && bountyInfo?.statusCode === 0 && (
                <Transaction
                  chainId={8453}
                  calls={[assignBountyCall]}
                  onStatus={(status) => {
                    console.log('Assignment status:', status);
                    if (status.statusName === 'success') {
                      setActiveTab('payout');
                    }
                  }}
                >
                  <TransactionButton 
                    text="Assign Bounty"
                    className="w-full"
                  />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              )}
            </TabsContent>

            {/* Step 3: Release Payment */}
            <TabsContent value="payout" className="space-y-4">
              <Alert className="bg-green-50">
                <AlertDescription>
                  💰 Release payment to the bidder. This transfers escrowed funds.
                  <br />⚠️ Only the approver can release payment.
                </AlertDescription>
              </Alert>

              {bidderAddress && (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm mb-2">Bidder Balance</p>
                  <p className="font-mono font-bold text-lg">
                    {bidderBalance ? formatEther(bidderBalance) : '0'} SYSTEM
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Watch this increase after payment release
                  </p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Payment Amount (SYSTEM)</label>
                <Input
                  type="number"
                  step="0.001"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount to release"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Available: {assignmentInfo?.remaining || '0'} SYSTEM
                </p>
              </div>

              <Alert className="bg-blue-50">
                <AlertDescription>
                  📝 <strong>Note:</strong> BountyManagerOptimized supports partial payments via `releasePayment`.
                  You can release any amount up to the remaining escrow balance.
                </AlertDescription>
              </Alert>

              {releasePaymentCall && bountyInfo?.statusCode === 1 && (
                <Transaction
                  chainId={8453}
                  calls={[releasePaymentCall]}
                  onStatus={(status) => {
                    console.log('Payment release status:', status);
                  }}
                >
                  <TransactionButton 
                    text={`Release ${paymentAmount} SYSTEM Payment`}
                    disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                    className="w-full"
                  />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              )}

              {bountyInfo?.statusCode !== 1 && (
                <Alert className="bg-yellow-50">
                  <AlertDescription>
                    ⚠️ Bounty must be assigned before payment can be released
                  </AlertDescription>
                </Alert>
              )}

              {assignmentInfo && parseFloat(assignmentInfo.paidAmount) > 0 && (
                <Alert className="bg-blue-50">
                  <AlertDescription>
                    ✅ {assignmentInfo.paidAmount} SYSTEM has been paid out
                    <br />
                    📊 {assignmentInfo.remaining} SYSTEM remains in escrow
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Escrow Monitor */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>📊 Escrow Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span>Contract Escrow Address:</span>
              <span className="font-mono">{BOUNTY_MANAGER_ADDRESS}</span>
            </div>
            {assignmentInfo && (
              <>
                <div className="flex justify-between py-2 border-b">
                  <span>Total Escrowed:</span>
                  <span className="font-bold">{assignmentInfo.escrowAmount} SYSTEM</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Already Paid:</span>
                  <span className="font-bold">{assignmentInfo.paidAmount} SYSTEM</span>
                </div>
                <div className="flex justify-between py-2">
                  <span>Available for Payout:</span>
                  <span className="font-bold text-green-600">{assignmentInfo.remaining} SYSTEM</span>
                </div>
              </>
            )}
          </div>

          <Alert className="mt-4">
            <AlertDescription>
              💡 <strong>How to verify payout:</strong>
              <br />
              1. Note bidder's balance before payment release
              <br />
              2. Release payment through the approver role
              <br />
              3. Bidder's balance should increase by the payment amount
              <br />
              4. Contract escrow should decrease by the same amount
              <br />
              5. Platform fee (if any) is automatically deducted
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}