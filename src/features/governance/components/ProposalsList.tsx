'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useContractRead } from 'wagmi';
import { parseAbiItem } from 'viem';
import DAOGovernorABI from '@/abis/DAOGovernorABI.json';
import MembershipNFTABI from '@/abis/MembershipNFTABI.json';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

// Contract addresses from environment variables
const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

interface ProposalData {
  id: string;
  title: string;
  description: string;
  proposer: string;
  startBlock: bigint;
  endBlock: bigint;
  state: number;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  forumThreadId?: string;
  createdAt?: bigint;
}

export const ProposalsList: React.FC = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch proposals from on-chain events
  useEffect(() => {
    if (!publicClient) return;

    const fetchProposals = async () => {
      try {
        setIsLoading(true);
        
        // Get proposal created events
        const proposalCreatedEvents = await publicClient.getLogs({
          address: GOVERNOR_ADDRESS,
          event: parseAbiItem('event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)'),
          fromBlock: 'earliest', // You might want to limit this range in production
          toBlock: 'latest',
        });

        // Get metadata events (if any)
        const metadataEvents = await publicClient.getLogs({
          address: GOVERNOR_ADDRESS,
          event: parseAbiItem('event ProposalCreatedWithMetadata(uint256 proposalId, address proposer, string title, string forumThreadId, uint256 createdAt)'),
          fromBlock: 'earliest',
          toBlock: 'latest',
        });

        // Create a lookup map for metadata events
        const metadataMap = new Map();
        metadataEvents.forEach(event => {
          if (event.args && event.args.proposalId) {
            metadataMap.set(event.args.proposalId.toString(), {
              title: event.args.title || '',
              forumThreadId: event.args.forumThreadId || '',
              createdAt: event.args.createdAt || 0n
            });
          }
        });

        // Process proposal events into our data format
        const proposalPromises = proposalCreatedEvents.map(async (event) => {
          if (!event.args) return null;
          
          const proposalId = event.args.proposalId?.toString();
          if (!proposalId) return null;
          
          // Get proposal state
          let state = 0;
          try {
            state = await publicClient.readContract({
              address: GOVERNOR_ADDRESS,
              abi: DAOGovernorABI,
              functionName: 'state',
              args: [proposalId],
            }) as number;
          } catch (error) {
            console.error('Error fetching proposal state:', error);
          }

          // Get proposal votes
          let forVotes = 0n;
          let againstVotes = 0n;
          let abstainVotes = 0n;
          
          try {
            const proposalVotes = await publicClient.readContract({
              address: GOVERNOR_ADDRESS,
              abi: DAOGovernorABI,
              functionName: 'proposalVotes',
              args: [proposalId],
            }) as [bigint, bigint, bigint];
            
            [againstVotes, forVotes, abstainVotes] = proposalVotes;
          } catch (error) {
            console.error('Error fetching proposal votes:', error);
          }

          // Parse description to get title if no metadata
          let title = '';
          let description = event.args.description || '';
          
          // Try to extract title from markdown-formatted description
          if (!metadataMap.has(proposalId) && description.startsWith('# ')) {
            const titleEndIndex = description.indexOf('\n');
            if (titleEndIndex > 0) {
              title = description.substring(2, titleEndIndex).trim();
              description = description.substring(titleEndIndex + 1).trim();
            }
          }

          // Get metadata if available
          const metadata = metadataMap.get(proposalId);
          
          return {
            id: proposalId,
            title: metadata?.title || title || `Proposal ${proposalId.substring(0, 8)}...`,
            description: description,
            proposer: event.args.proposer || '0x0',
            startBlock: event.args.startBlock || 0n,
            endBlock: event.args.endBlock || 0n,
            state: state,
            forVotes,
            againstVotes,
            abstainVotes,
            forumThreadId: metadata?.forumThreadId || '',
            createdAt: metadata?.createdAt || 0n
          };
        });

        const fetchedProposals = (await Promise.all(proposalPromises))
          .filter((p): p is ProposalData => p !== null)
          .sort((a, b) => {
            // Sort by creation time or block number (most recent first)
            if (a.createdAt && b.createdAt) {
              return Number(b.createdAt - a.createdAt);
            }
            return Number(b.startBlock - a.startBlock);
          });

        setProposals(fetchedProposals);
      } catch (error) {
        console.error('Error fetching proposals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProposals();
  }, [publicClient]);

  // Utility function to get state badge color
  const getStateBadgeVariant = (state: number) => {
    switch (state) {
      case 1: // Active
        return "default"; // Green
      case 2: // Canceled
        return "destructive"; // Red
      case 3: // Defeated
        return "destructive"; // Red
      case 4: // Succeeded
        return "success"; // Green
      case 5: // Queued
        return "outline"; // Gray outline
      case 6: // Expired
        return "secondary"; // Gray
      case 7: // Executed
        return "success"; // Green
      default: // Pending or unknown
        return "secondary"; // Gray
    }
  };

  // Map proposal state to human-readable text
  const getProposalStateText = (state: number) => {
    const states = [
      'Pending',
      'Active',
      'Canceled',
      'Defeated',
      'Succeeded',
      'Queued',
      'Expired',
      'Executed'
    ];
    return states[state] || 'Unknown';
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Governance Proposals</h2>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="w-full">
            <CardHeader>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-24" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  // Render empty state
  if (proposals.length === 0) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold mb-4">Governance Proposals</h2>
        <p className="text-gray-500 mb-6">No proposals have been created yet.</p>
        <Link href="/governance/create">
          <Button>Create First Proposal</Button>
        </Link>
      </div>
    );
  }

  // Render proposals list
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Governance Proposals</h2>
        <Link href="/governance/create">
          <Button>Create Proposal</Button>
        </Link>
      </div>
      
      <div className="space-y-4">
        {proposals.map((proposal) => (
          <Card key={proposal.id} className="proposal-card">
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle>{proposal.title}</CardTitle>
                <Badge variant={getStateBadgeVariant(proposal.state)}>
                  {getProposalStateText(proposal.state)}
                </Badge>
              </div>
              <CardDescription>
                Proposed by {proposal.proposer.substring(0, 6)}...{proposal.proposer.substring(38)}
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <p className="text-sm text-gray-700 mb-4">
                {proposal.description.length > 200 
                  ? `${proposal.description.substring(0, 200)}...` 
                  : proposal.description}
              </p>
              
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-gray-500">For</p>
                  <p className="font-medium">{proposal.forVotes.toString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Against</p>
                  <p className="font-medium">{proposal.againstVotes.toString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Abstain</p>
                  <p className="font-medium">{proposal.abstainVotes.toString()}</p>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex justify-between">
              {proposal.forumThreadId && (
                <Link 
                  href={`/forum/${proposal.forumThreadId}`} 
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Discussion
                </Link>
              )}
              <Link href={`/governance/proposal/${proposal.id}`}>
                <Button variant="outline">View Details</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ProposalsList;