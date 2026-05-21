// src/features/governance/pages/ProposalDetailPage.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import DAOGovernorABI from '@/abis/DAO_GovernorABI.json';
import { decodeEventLog, type AbiEvent } from 'viem';
import VoteButton from '@/features/governance/components/VoteButton';
import { useForumPostTitle } from '@/features/governance/hooks/useForumPostTitle';
import { isUuidProposalId } from '@/features/governance/utils/proposalUrl';

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
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : '';
  const { evmAddress: address } = useEvmAddress();
  const publicClient = usePublicClient();

  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [userVote, setUserVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const GOVERNOR_ADDRESS = process.env
    .NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
  const eventAbi = DAOGovernorABI.find(
    (item) => item.type === 'event' && item.name === 'ProposalCreated',
  )! as AbiEvent;

  // Pod-level proposals have UUID ids and are DB-only — they don't live
  // on the Governor contract. Redirect to the index page's modal
  // deep-link form, which is the canonical surface for them. This
  // catches any stale notification URL (push or in-app inbox) that
  // points here.
  useEffect(() => {
    if (id && isUuidProposalId(id)) {
      router.replace(`/governance?proposal=${encodeURIComponent(id)}`);
    }
  }, [id, router]);

  // Fetch on‑chain proposal core + metadata
  useEffect(() => {
    if (!id || !publicClient) return;
    if (isUuidProposalId(id)) return; // handled by the redirect effect above
    setLoading(true);

    (async () => {
      try {
        // 1) Get ProposalCreated events for this governor
        const logs = await publicClient.getLogs({
          address: GOVERNOR_ADDRESS,
          event: eventAbi,
        });
        // 2) Decode and filter for our proposalId
        const decoded = logs
          .map((log) =>
            decodeEventLog({
              abi: [eventAbi],
              data: log.data,
              topics: log.topics,
            }),
          )
          .find((ev) => Number((ev.args as any).proposalId) === Number(id));
        const description = decoded
          ? ((decoded.args as any).description as string)
          : '';
        // parse title/body/forumPostId out of markdown description
        const parts = description.split('\n\n');
        const title = parts[0]?.replace(/^#\s*/, '') || '';
        const body = parts[1] || '';
        const forumPostIdMatch = description.match(/Forum Discussion:\s*(\S+)/);
        const forumPostId = forumPostIdMatch ? forumPostIdMatch[1] : null;

        // 3) Read proposal data via OpenZeppelin v5 Governor methods.
        // The legacy `proposals(uint256)` aggregate getter was removed in
        // OZ v5 — vote counts come from `proposalVotes`, timing from
        // `proposalSnapshot`/`proposalDeadline`.
        const [votes, snapshot, deadline] = await Promise.all([
          publicClient.readContract({
            address: GOVERNOR_ADDRESS,
            abi: DAOGovernorABI,
            functionName: 'proposalVotes',
            args: [BigInt(id)],
          }) as Promise<readonly [bigint, bigint, bigint]>,
          publicClient.readContract({
            address: GOVERNOR_ADDRESS,
            abi: DAOGovernorABI,
            functionName: 'proposalSnapshot',
            args: [BigInt(id)],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: GOVERNOR_ADDRESS,
            abi: DAOGovernorABI,
            functionName: 'proposalDeadline',
            args: [BigInt(id)],
          }) as Promise<bigint>,
        ]);

        // proposalVotes returns [againstVotes, forVotes, abstainVotes]
        const [againstVotes, forVotes, abstainVotes] = votes;
        const scores = [
          Number(againstVotes),
          Number(forVotes),
          Number(abstainVotes),
        ];
        setProposal({
          id,
          title,
          body,
          start: Number(snapshot),
          end: Number(deadline),
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

  // Fetch on‑chain user vote via VoteCast events.
  // OZ v5 dropped the legacy getReceipt(uint256, address) aggregate
  // accessor. `hasVoted` returns only a bool; to learn which choice the
  // user picked we scan VoteCast events filtered to this voter and this
  // proposal.
  useEffect(() => {
    if (!id || !address || !publicClient) return;
    if (isUuidProposalId(id)) return; // pod-level proposals; redirect effect handles them

    const voteCastAbi = DAOGovernorABI.find(
      (item) => item.type === 'event' && item.name === 'VoteCast',
    ) as AbiEvent | undefined;
    if (!voteCastAbi) return;

    (async () => {
      try {
        const logs = await publicClient.getLogs({
          address: GOVERNOR_ADDRESS,
          event: voteCastAbi,
          args: { voter: address as `0x${string}` },
        });
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: [voteCastAbi],
              data: log.data,
              topics: log.topics,
            });
            const args = decoded.args as any;
            if (String(args.proposalId) === String(id)) {
              // Map Governor support (0=Against, 1=For, 2=Abstain) onto the
              // 1-indexed choice the existing UI compares against (1=Against,
              // 2=For, 3=Abstain — matches choices array order).
              const support = Number(args.support);
              setUserVote(support + 1);
              break;
            }
          } catch {
            /* skip undecodable log */
          }
        }
      } catch (err) {
        console.error('Error fetching user vote on‑chain:', err);
      }
    })();
  }, [id, address, publicClient]);

  if (loading)
    return (
      <div className="max-w-4xl mx-auto p-4 bottom-nav-spacing">
        <div className="flex justify-center items-center min-h-[200px]">
          <div>Loading proposal...</div>
        </div>
      </div>
    );
  // While a UUID redirect is in flight, render a neutral loading state
  // rather than the on-chain "not found" message.
  if (isUuidProposalId(id))
    return (
      <div className="max-w-4xl mx-auto p-4 bottom-nav-spacing">
        <div className="flex justify-center items-center min-h-[200px]">
          <div>Opening proposal…</div>
        </div>
      </div>
    );
  if (!proposal)
    return (
      <div className="max-w-4xl mx-auto p-4 bottom-nav-spacing">
        <div className="flex justify-center items-center min-h-[200px]">
          <div>Proposal not found.</div>
        </div>
      </div>
    );

  const { data: forumTitle } = useForumPostTitle(
    proposal.metadata.forumPostId || undefined,
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
          <Link href={`/forum/thread/${proposal.metadata.forumPostId}`}>
            <span style={{ color: '#5ba3f4' }}>
              🔗 View Discussion: <strong>{forumTitle || 'View Thread'}</strong>
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
                backgroundColor: isUser ? '#e0ffe0' : 'transparent',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              <strong>{choice}</strong>: {score} votes ({percent}%)
              {isUser && (
                <span style={{ marginLeft: '8px' }}>✅ You voted this</span>
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
              proposalId={Number(proposal.id)}
              choice={idx + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
