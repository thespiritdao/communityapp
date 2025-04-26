// src/features/governance/pages/ProposalDetailPage.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
import { base } from 'viem/chains';
import { keccak256, decodeEventLog } from 'viem';
import { VoteButton } from 'src/features/governance/components/VoteButton';
import { useForumPostTitle } from 'src/features/governance/hooks/useForumPostTitle';

interface OnChainProposal {
  proposer: `0x${string}`;
  startBlock: bigint;
  endBlock: bigint;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  canceled: boolean;
  executed: boolean;
}

interface ProposalDetail {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  choices: string[];
  scores: number[];
  scores_total: number;
  metadata: { forumPostId: string | null };
}

export default function ProposalDetailPage() {
  const { id } = useParams();                    // proposalId as string
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [userVote, setUserVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
  const PROPOSAL_CREATED_TOPIC = keccak256(
    'ProposalCreated(uint256,address,address[],uint256[],bytes[],uint256,uint256,string)'
  );
  const eventAbi = DAOGovernorABI.find(
    (item) => item.type === 'event' && item.name === 'ProposalCreated'
  )!;

  // Fetch on‑chain proposal core + metadata
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    (async () => {
      try {
        // 1) Get ProposalCreated events for this governor
        const logs = await publicClient.getLogs({
          chainId: base.id,
          address: GOVERNOR_ADDRESS,
          topics: [PROPOSAL_CREATED_TOPIC],
        });
        // 2) Decode and filter for our proposalId
        const decoded = logs
          .map((log) =>
            decodeEventLog({
              abi: [eventAbi],
              data: log.data,
              topics: log.topics,
            })
          )
          .find((ev) => Number((ev.args as any).proposalId) === Number(id));
        const description = decoded
          ? (decoded.args as any).description as string
          : '';
        // parse title/body/forumPostId out of markdown description
        const parts = description.split('\n\n');
        const title = parts[0]?.replace(/^#\s*/, '') || '';
        const body = parts[1] || '';
        const forumPostIdMatch = description.match(
          /Forum Discussion:\s*(\S+)/
        );
        const forumPostId = forumPostIdMatch
          ? forumPostIdMatch[1]
          : null;

        // 3) Read core proposal struct
        const core = (await publicClient.readContract({
          chainId: base.id,
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'proposals',
          args: [BigInt(id)],
        })) as OnChainProposal;

        // 4) Build our ProposalDetail
        const scores = [
          Number(core.againstVotes),
          Number(core.forVotes),
          Number(core.abstainVotes),
        ];
        setProposal({
          id,
          title,
          body,
          start: Number(core.startBlock),
          end: Number(core.endBlock),
          choices: ['Against', 'For', 'Abstain'],
          scores,
          scores_total: scores.reduce((a, b) => a + b, 0),
          metadata: { forumPostId },
        });
      } catch (err) {
        console.error('Error fetching on‑chain proposal:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, publicClient]);

  // Fetch on‑chain user vote receipt
  useEffect(() => {
    if (!id || !address) return;

    (async () => {
      try {
        const receipt = (await publicClient.readContract({
          chainId: base.id,
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'getReceipt',
          args: [BigInt(id), address as `0x${string}`],
        })) as { hasVoted: boolean; support: number; votes: bigint };

        if (receipt.hasVoted) {
          setUserVote(receipt.support);
        }
      } catch (err) {
        console.error('Error fetching user vote on‑chain:', err);
      }
    })();
  }, [id, address, publicClient]);

  if (loading) return <div>Loading proposal...</div>;
  if (!proposal) return <div>Proposal not found.</div>;

  const { data: forumTitle } = useForumPostTitle(
    proposal.metadata.forumPostId || undefined
  );
  const now = Math.floor(Date.now() / 1000);
  const isOpen = now >= proposal.start && now <= proposal.end;
  const formatTimestamp = (unix: number) =>
    new Date(unix * 1000).toLocaleString();

  return (
    <div className="proposal-container">
      <h1>{proposal.title}</h1>
      <p>{proposal.body}</p>

      <div style={{ margin: '1rem 0' }}>
        <strong>Status:</strong>{' '}
        {isOpen ? (
          <span style={{ color: 'green' }}>Voting Open</span>
        ) : (
          <span style={{ color: 'red' }}>Voting Closed</span>
        )}
      </div>

      <div>
        <strong>Start:</strong> {formatTimestamp(proposal.start)}
        <br />
        <strong>End:</strong> {formatTimestamp(proposal.end)}
      </div>

      {proposal.metadata.forumPostId && (
        <div style={{ marginTop: '1rem' }}>
          <Link
            href={`/forum/thread/${proposal.metadata.forumPostId}`}
          >
            <span style={{ color: '#5ba3f4' }}>
              🔗 View Discussion:{' '}
              <strong>{forumTitle || 'View Thread'}</strong>
            </span>
          </Link>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <h3>Vote Results</h3>
        {proposal.choices.map((choice, idx) => {
          const score = proposal.scores[idx] || 0;
          const percent = proposal.scores_total
            ? ((score / proposal.scores_total) * 100).toFixed(1)
            : '0.0';
          const isUser = userVote === idx + 1;

          return (
            <div
              key={idx}
              style={{
                marginBottom: '10px',
                backgroundColor: isUser
                  ? '#e0ffe0'
                  : 'transparent',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              <strong>{choice}</strong>: {score} votes ({percent}%)
              {isUser && (
                <span style={{ marginLeft: '8px' }}>
                  ✅ You voted this
                </span>
              )}
            </div>
          );
        })}
      </div>

      {isOpen && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Cast Your Vote</h3>
          {proposal.choices.map((_, idx) => (
            <VoteButton
              key={idx}
              proposalId={proposal.id}
              choice={idx + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
