'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useContractRead, useContractWrite } from 'wagmi';
import { parseAbiItem } from 'viem';
import DAOGovernorABI from '@/abis/DAOGovernorABI.json';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Clock, Calendar } from 'lucide-react';
import Link from 'next/link';
import { createPublicClient, http } from 'viem';

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
  metadata?: {
    forum_thread_id?: string;
    mentions?: { address?: string }[];
  };
}

export const ProposalsList: React.FC = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalData | null>(null);
  const [hasVotedMap, setHasVotedMap] = useState<Record<string, boolean>>({});

  // Cancel proposal function
  const { write: cancelProposal, isLoading: isCancelling } = useContractWrite({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'cancel',
  });

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
            createdAt: metadata?.createdAt || 0n,
            metadata: metadata
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
        // --- Fetch hasVoted for each proposal ---
        if (address && fetchedProposals.length > 0) {
          const hasVotedCalls = fetchedProposals.map((p) => ({
            address: GOVERNOR_ADDRESS,
            abi: DAOGovernorABI,
            functionName: 'hasVoted',
            args: [BigInt(p.id), address],
          }));
          const results = await publicClient.multicall({ contracts: hasVotedCalls });
          const map: Record<string, boolean> = {};
          fetchedProposals.forEach((p, i) => {
            map[p.id] = Boolean(results[i].result);
          });
          setHasVotedMap(map);
        }
        // --- End fetch hasVoted ---
      } catch (error) {
        console.error('Error fetching proposals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProposals();
  }, [publicClient, address]);

  // Handle proposal cancellation
  const handleCancelProposal = async () => {
    if (!cancelProposal || !selectedProposal) return;
    
    try {
      await cancelProposal();
      setCancelDialogOpen(false);
      setSelectedProposal(null);
      // Refresh proposals after cancellation
      // You might want to add a refetch mechanism here
    } catch (error) {
      console.error('Error cancelling proposal:', error);
    }
  };

  // Check if user can cancel proposal
  const canCancelProposal = (proposal: ProposalData) => {
    return address?.toLowerCase() === proposal.proposer.toLowerCase() && 
           proposal.state === 0; // Pending state
  };

  // Format voting deadline
  const formatVotingDeadline = (endBlock: bigint) => {
    // Convert block number to estimated date
    // This is a rough estimation - you might want to use actual block timestamps
    const estimatedEndTime = Date.now() + (Number(endBlock) * 12 * 1000); // Assuming 12s block time
    return new Date(estimatedEndTime).toLocaleDateString();
  };

  // Check if voting is active
  const isVotingActive = (proposal: ProposalData) => {
    return proposal.state === 1; // Active state
  };

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
                <div className="flex items-center gap-2">
                  <Badge variant={getStateBadgeVariant(proposal.state)}>
                    {getProposalStateText(proposal.state)}
                  </Badge>
                  {isVotingActive(proposal) && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Ends: {formatVotingDeadline(proposal.endBlock)}
                    </Badge>
                  )}
                </div>
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
              
              {proposal.metadata && (
                <div className="mt-2 text-xs text-gray-500">
                  {proposal.metadata.forum_thread_id && (
                    <div>
                      <span>Forum Thread: </span>
                      <a href={`/forum/thread/${proposal.metadata.forum_thread_id}`} className="underline text-blue-600">{proposal.metadata.forum_thread_id}</a>
                    </div>
                  )}
                  {proposal.metadata.mentions && proposal.metadata.mentions.length > 0 && (
                    <div>
                      <span>Mentions: </span>
                      {proposal.metadata.mentions.map((mention: any, idx: number) => (
                        <span key={idx} className="inline-block bg-gray-200 rounded px-2 py-1 mr-1">{mention.address || mention}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
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
              <div className="flex gap-2">
                {proposal.forumThreadId && (
                  <Link 
                    href={`/forum/${proposal.forumThreadId}`} 
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View Discussion
                  </Link>
                )}
                {canCancelProposal(proposal) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setSelectedProposal(proposal);
                      setCancelDialogOpen(true);
                    }}
                  >
                    Cancel Proposal
                  </Button>
                )}
              </div>
              {/* --- Vote button logic --- */}
              {isVotingActive(proposal) ? (
                hasVotedMap[proposal.id] ? (
                  <button
                    className="w-full py-2 px-4 bg-green-600 text-white rounded-lg font-semibold cursor-not-allowed opacity-60"
                    disabled
                    title="You have already voted on this proposal."
                    style={{ pointerEvents: 'none' }}
                  >
                    ✓ Voted
                  </button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {/* open vote modal or handle vote */}}
                  >
                    Vote
                  </Button>
                )
              ) : null}
              {/* --- End vote button logic --- */}
              <Link href={`/governance/proposal/${proposal.id}`}>
                <Button variant="outline">View Details</Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Cancel Proposal Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Cancel Proposal
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel "{selectedProposal?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Proposal
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelProposal}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Proposal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProposalsList;