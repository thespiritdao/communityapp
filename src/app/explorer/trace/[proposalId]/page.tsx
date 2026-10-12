// src/app/explorer/trace/[proposalId]/page.tsx
//
// Lineage trace view (Congregant Phase 6): deliberation → proposal → votes
// → resource movement, with human/agent provenance at every step.
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { Loader2, MessageSquare, FileText, Vote, Coins, Bot, User, Cog, ExternalLink } from 'lucide-react';

function ActorBadge({ actorType }: { actorType: string }) {
  const styles: Record<string, { bg: string; fg: string; label: string; Icon: any }> = {
    agent: { bg: '#EADFF5', fg: '#5B3E8F', label: 'AI agent', Icon: Bot },
    system: { bg: '#E5E5E5', fg: '#555555', label: 'system', Icon: Cog },
    human: { bg: '#D1E6DC', fg: '#2F5D50', label: 'human', Icon: User },
  };
  const s = styles[actorType] ?? styles.human;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

function ChainNode({ icon: Icon, title, children, last = false }: any) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#F5EDD7', border: '1px solid #D1C4A9' }}
        >
          <Icon className="h-4 w-4" style={{ color: '#8B5E3C' }} />
        </div>
        {!last && <div className="w-px flex-1 my-1" style={{ backgroundColor: '#D1C4A9' }} />}
      </div>
      <div className={`pb-6 flex-1 min-w-0 ${last ? '' : ''}`}>
        <div className="text-sm font-medium text-[#3C3C3C]">{title}</div>
        <div className="mt-1 text-xs text-[#7C6F5B] space-y-1">{children}</div>
      </div>
    </div>
  );
}

export default function TracePage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proposalId) return;
    ensureAuthHeaders()
      .then((headers) => fetch(`/api/explorer/trace/${proposalId}`, { headers }))
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(
              new Error(res.status === 401 ? 'Sign in to view decision traces.' : `HTTP ${res.status}`),
            ),
      )
      .then(setData)
      .catch((err) => setError(err.message));
  }, [proposalId]);

  const chain = data?.chain;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FBF6E9' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-[#3C3C3C]">Decision Trace</h1>
        <p className="mt-1 text-xs text-[#7C6F5B]">
          The full lineage of a governance decision — who opened the conversation, who proposed,
          who voted, and what moved. Human and artificial acts are labeled at every step.
        </p>

        {error && (
          <div className="mt-6 p-3 rounded text-sm text-red-800 bg-red-50 border border-red-200">{error}</div>
        )}
        {!chain && !error && (
          <div className="mt-8 flex items-center gap-2 text-sm text-[#7C6F5B]">
            <Loader2 className="h-4 w-4 animate-spin" /> Tracing…
          </div>
        )}

        {chain && (
          <div className="mt-6">
            {chain.deliberation ? (
              <ChainNode icon={MessageSquare} title="Deliberation">
                <div>
                  <a href={chain.deliberation.url} className="underline text-[#3C3C3C]">
                    {chain.deliberation.title}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  Opened by {chain.deliberation.openedByName || chain.deliberation.openedBy?.slice(0, 10) + '…'}{' '}
                  <ActorBadge actorType={chain.deliberation.openedByActorType} />
                </div>
                <div>
                  {new Date(chain.deliberation.openedAt).toLocaleDateString()}
                  {chain.deliberation.replyCount != null && <> · {chain.deliberation.replyCount} replies</>}
                </div>
              </ChainNode>
            ) : (
              <ChainNode icon={MessageSquare} title="Deliberation">
                <div>No forum thread linked to this proposal.</div>
              </ChainNode>
            )}

            <ChainNode icon={FileText} title="Proposal">
              <div className="text-[#3C3C3C]">{chain.proposal.title}</div>
              <div className="flex items-center gap-2">
                Created by {chain.proposal.createdBy}{' '}
                <ActorBadge actorType={chain.proposal.createdByActorType} />
              </div>
              <div>
                {chain.proposal.podName && <>{chain.proposal.podName} · </>}
                {chain.proposal.tier ?? 'untiered'} · status: {chain.proposal.status}
              </div>
              {chain.proposal.ipfsUrl && (
                <div>
                  <a href={chain.proposal.ipfsUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                    vote manifest on IPFS <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </ChainNode>

            <ChainNode icon={Vote} title="Votes">
              <div className="text-[#3C3C3C]">
                {chain.votes.tally.for} for · {chain.votes.tally.against} against · {chain.votes.tally.abstain} abstain
              </div>
              <div>
                Every vote cast by a human wallet — agents are constitutionally excluded
                (<a href="/constitution" className="underline">verify</a>).
              </div>
              {chain.votes.voters.length > 0 && (
                <details>
                  <summary className="cursor-pointer">{chain.votes.voters.length} voters</summary>
                  <ul className="mt-1 space-y-0.5">
                    {chain.votes.voters.map((v: any) => (
                      <li key={`${v.address}-${v.at}`} className="font-mono text-[10px]">
                        {v.address?.slice(0, 14)}… — {v.vote}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </ChainNode>

            <ChainNode icon={Coins} title="Resource movement" last>
              {chain.resourceMovement ? (
                <>
                  {chain.resourceMovement.amount && <div className="text-[#3C3C3C]">{chain.resourceMovement.amount}</div>}
                  {chain.resourceMovement.note && <div>{chain.resourceMovement.note}</div>}
                  {chain.resourceMovement.txUrl && (
                    <div>
                      <a href={chain.resourceMovement.txUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
                        transaction on Basescan <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div>No resource movement recorded for this decision.</div>
              )}
            </ChainNode>
          </div>
        )}

        <p className="mt-4 text-[10px] text-[#7C6F5B]">
          Raw data: <a href="/api/explorer/export" className="underline">ledger export API</a> ·
          integrity: weekly Merkle roots anchored on Base (<a href="/api/explorer/export?anchors=1" className="underline">anchors</a>).
        </p>
      </div>
    </div>
  );
}
