"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from 'src/components/ui/card';
import { Button } from 'src/components/ui/button';
import { Label } from 'src/components/ui/label';
import { Transaction, TransactionButton } from '@coinbase/onchainkit/transaction';
import { useAccount } from 'wagmi';
import { parseEther } from 'viem';
import BountyManagerABI from '../../../contracts/BountyManager.json';
import UserTagging from '../../../components/UserTagging';
import { isAddress } from 'viem';

const BASE_CHAIN_ID = 8453; // Base mainnet chain ID

// ERC20 ABI for approval
const ERC20_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

interface BountyAcceptanceProps {
  bountyId: string;
  bountyTitle: string;
  bountyValue: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  bidderAddress: string;
  tokenAddress: string;
  onAccept?: () => void;
}

export const BountyAcceptance: React.FC<BountyAcceptanceProps> = ({
  bountyId,
  bountyTitle,
  bountyValue,
  bidderAddress,
  tokenAddress,
  onAccept,
}) => {
  const { address } = useAccount();
  const [technicalReviewer, setTechnicalReviewer] = useState('');
  const [finalApprover, setFinalApprover] = useState('');

  // Debug logging
  useEffect(() => {
    console.log('🔍 Debug Info:');
    console.log('Bounty ID:', bountyId);
    console.log('Bidder address (original):', bidderAddress);
    console.log('Bidder address (lowercase):', bidderAddress.toLowerCase());
    console.log('Current user address:', address);
    
    // Check if we can fetch bounty data to verify bidders
    const checkBountyState = async () => {
      try {
        // This would require a contract read - for now just log what we expect
        console.log('⚠️  To debug further, we need to:');
        console.log('1. Check if bounty exists with ID:', bountyId);
        console.log('2. Verify the bidder address is in the bounty.bidders array');
        console.log('3. Ensure the bounty status is "Open"');
        console.log('4. Confirm the current user has BOUNTY_CREATOR_ROLE');
        
        // Add a button to manually check bounty state
        console.log('🔧 Add this to your component to debug:');
        console.log(`
          const checkBountyData = async () => {
            const { data: bounty } = await readContract({
              address: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as \`0x\${string}\`,
              abi: BountyManagerABI,
              functionName: 'getBounty',
              args: [${bountyId}]
            });
            console.log('Bounty data:', bounty);
            console.log('Bidders:', bounty.bidders);
            console.log('Is bidder in list:', bounty.bidders.includes('${bidderAddress.toLowerCase()}'));
          };
        `);
      } catch (error) {
        console.error('Error checking bounty state:', error);
      }
    };
    
    checkBountyState();
  }, [bountyId, bidderAddress, address]);

  const extractAddress = (mention: string): `0x${string}` | null => {
    const match = mention.match(/@\[.*?\]\((0x[a-fA-F0-9]{40})\)/);
    const address = match ? match[1] : mention;
    return isAddress(address) ? address as `0x${string}` : null;
  };

  const techReviewerAddress = extractAddress(technicalReviewer);
  const finalApproverAddress = extractAddress(finalApprover);

  const isFormValid = techReviewerAddress && finalApproverAddress;

  // Calculate escrow amount based on payment structure
  const calculateEscrowAmount = () => {
    // This logic should match your contract's _calculateEscrowAmount function
    // For now, assuming full bounty value needs approval
    return parseEther(bountyValue.amount);
  };

  // Token approval call
  const approveTokenCall = {
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [
      process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
      calculateEscrowAmount(),
    ],
  };

  // Contract configuration for assigning bounty using the enhanced contract
  const assignBountyCall = {
    address: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
    abi: BountyManagerABI,
    functionName: 'assignBounty',
    args: [
      Number(bountyId),
      bidderAddress.toLowerCase() as `0x${string}`,
      techReviewerAddress!.toLowerCase() as `0x${string}`,
      finalApproverAddress!.toLowerCase() as `0x${string}`,
    ],
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">Accept Bid & Assign Reviewers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bounty Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">{bountyTitle}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <p>Bidder: {bidderAddress}</p>
            <p>Value: {bountyValue.amount} {bountyValue.token}</p>
          </div>
        </div>

        {/* Reviewer Assignment */}
        <div className="space-y-4">
          <div>
            <Label>Technical Reviewer</Label>
            <UserTagging
              value={technicalReviewer}
              onChange={setTechnicalReviewer}
              placeholder="Type @ to mention a technical reviewer..."
            />
            <p className="text-sm text-gray-500 mt-1">
              Technical reviewer will approve milestones and deliverables
            </p>
          </div>
          
          <div>
            <Label>Final Approver</Label>
            <UserTagging
              value={finalApprover}
              onChange={setFinalApprover}
              placeholder="Type @ to mention a final approver..."
            />
            <p className="text-sm text-gray-500 mt-1">
              Final approver will approve bounty completion and release final payment
            </p>
          </div>
        </div>

        {/* Action */}
        <Transaction
          isSponsored={true}
          address={address?.toLowerCase() as `0x${string}`}
          chainId={BASE_CHAIN_ID}
          calls={[approveTokenCall, assignBountyCall]}
          onSuccess={(receipt) => {
            console.log('✅ Tokens approved and bounty assigned successfully:', receipt);
            onAccept?.();
          }}
          onError={(error) => {
            console.error('❌ Failed to approve tokens or assign bounty:', error);
          }}
          onTransactionStarted={() => {
            console.log('🚀 Approving tokens and assigning bounty...');
          }}
        >
          <TransactionButton
            text="Approve Tokens & Assign Bounty"
            className="w-full"
            disabled={!isFormValid}
          />
        </Transaction>

        {!isFormValid && (
          <p className="text-sm text-red-600 text-center">
            Please assign both a technical reviewer and final approver
          </p>
        )}
      </CardContent>
    </Card>
  );
}; 