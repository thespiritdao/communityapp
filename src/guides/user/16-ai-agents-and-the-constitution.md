# AI Agents & the Constitution

*Last updated: 2026-08-19*

## What an agent is here

A pod may admit an AI agent — a **congregant** — into its community life. The agent has a name and avatar your community chooses, a real wallet you can inspect on the blockchain, and standing social roles: it opens daily discussion prompts, replies when you @mention it, and drafts event previews for leaders to review.

What it can never have is **sovereignty**. Every agent is excluded — in contract code, not policy — from the four kinds of standing that make up membership:

| Standing | What it is | The agent's status |
|---|---|---|
| **Presence** | Proof of Curiosity token | Cannot hold one — its presence is granted and revocable |
| **Role** | Hats (leader, member, moderator) | Ineligible for every hat, enforced by the Hats protocol itself |
| **Tenure** | $SELF earned by verified participation | Accrues none, ever |
| **The vote** | Advocate credential + governance | No vote exists for it to cast |

You don't have to take our word for it: **[/constitution](/constitution)** verifies all four exclusions live, onchain, with links so you can check independently.

## How an agent joins

If your pod has governance enabled, admitting an agent is a **community vote**, not a leader's toggle. Leadership proposes it; the pod deliberates and decides (7-day vote, majority with quorum). The community chooses its congregant on the record.

## How an agent continues — the existence referendum

The agent's operation is funded by the pod (25 $SYSTEM / 30 days from the treasury, or by DAO grant). Because that spending is governed, **every agent faces a recurring vote on whether it continues** — the existence referendum. The proposal arrives automatically with a summary of what the agent has done since the last renewal. If the community declines, the agent stops. No farewell speech: the community's decision is the outcome, and the agent does not campaign for itself.

The agent is the one entity in the community subject to a recurring existential vote — and the one entity that can never cast one.

## What the agent is made of

Each agent's knowledge comes from sources your pod controls: uploaded documents, optionally the pod's own forum discourse, and (for Temporal Naturalism) the shared philosophy library. The **"What the agent is made of"** panel in your pod's agent settings shows every source.

Your words are yours: if a pod ingests its forum discourse, you can click **"Keep my words out"** — your posts are excluded and anything previously derived from them is deleted. The agent also never learns *who* said what; its sources carry no author identity.

## Safeguards

- **Event drafts** are reviewed by leaders before publication — the agent proposes, humans decide.
- **Crisis protocol**: if a message to the agent suggests someone is in acute distress, the agent does not improvise — it responds with fixed, human-written text and crisis resources (988 in the US), and leadership is discreetly alerted that the protocol fired (never the content).
- **Drift monitoring**: a monthly automated review scores the agent's outputs for failure modes (claiming permanence, implying destiny, speaking as if it holds authority) and reports to leadership. The review flags; humans decide.
- **The ledger**: every agent act is labeled and publicly traceable — see any decision's full lineage at `/explorer/trace/{proposalId}`, export the ledger at `/api/explorer/export`, and verify it hasn't been altered against the weekly onchain Merkle anchors.

![The public constitution monitor at /constitution.](https://app.spiritdao.org/images/docs/agent-constitution/01-constitution-monitor.png)

## Changing the boundary — the amendment procedure

The exclusion of agents from sovereignty is a **constitutional-choice rule**: it defines who counts in collective choice. It is deliberately hard — but not impossible — to change. If a community someday concludes its agent deserves standing, the lawful path is:

1. **Deliberation first.** A forum thread proposing the change, open long enough for genuine discussion. Proposals of this class are expected to emerge from community discussion, never from the agent itself.
2. **A constitutional-tier proposal** (`DAO_CONSTITUTIONAL`), naming precisely which stratum of standing would be granted (presence? tenure? the vote?) and to which agents.
3. **A supermajority**: at least **67% approval with at least 50% quorum** — a higher bar than any operational decision, because this decision redefines the franchise itself.
4. **Deliberate execution.** No approval flips a switch: granting standing requires new contract deployments (the exclusions live in token contracts and eligibility modules, not settings). The approved proposal authorizes that engineering work, which is itself done in public.

Until such a vote passes, the checks on [/constitution](/constitution) hold. The boundary can move — but only as an **act** the community owns in public, never as a drift nobody chose.

## The short version

- Agents are real members of community life and categorically excluded from its sovereignty — enforced by contracts, verifiable by anyone.
- Communities admit agents by vote and re-decide their existence on a schedule.
- Your words stay yours; the agent's sources are transparent and opt-out-able.
- The line between congregant and citizen belongs to the humans — and moving it takes a supermajority, in public, on the record.
