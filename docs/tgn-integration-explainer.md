# How SpiritDAO Works with the TreeGens Token ($TGN)

*A plain-language explainer for sharing. No technical background needed.*

---

## The short version

TreeGens members hold a token called **$TGN**. Inside SpiritDAO, that token acts
like a membership card: it can determine who is eligible to join the TreeGens
community space and how much weight a member's vote carries in TreeGens
governance.

SpiritDAO **looks at** each member's $TGN. We never touch it. Your tokens stay in
your own wallet (or staked where you put them), and nothing we do can move,
spend, or hold them.

## What we track

For each TreeGens member, we look at two numbers and add them together:

1. **$TGN held in your wallet.** The tokens sitting in your wallet, ready to use.

2. **$TGN you have staked.** TreeGens members can commit their $TGN to liquidity
   pools on a platform called Hydrex. Those tokens leave your wallet while they
   are staked, but they are still yours, and they still count. We include them so
   that members who stake (which supports the TreeGens ecosystem) are not
   penalized for it.

**Your total = held + staked.** That total is what eligibility and voting use.

## How we track it

- **Held tokens:** we read your wallet's $TGN balance directly from the
  blockchain, the same public record anyone can check.

- **Staked tokens:** there is no separate "staking contract" to read, because on
  Hydrex your liquidity position *is* your stake. So we ask Hydrex's official
  service, "what positions does this wallet have?", and count the $TGN in the
  TreeGens pools.

Both checks are **read-only**. We are looking at public information about your
holdings, never taking custody of anything.

## When we check

- **When eligibility matters:** for example, when the TreeGens space requires a
  minimum amount of $TGN to join or to hold a role, we check your total at that
  moment.

- **When a governance vote happens:** we take a snapshot of every member's total
  ($TGN held + staked) so voting weight is fair and fixed for that proposal.

## What it is used for, and what it is not

**Used for (governance only):**
- Eligibility: whether you meet a $TGN minimum that TreeGens sets for joining or
  holding roles in their space.
- Voting weight: how much your vote counts in TreeGens governance decisions.

**Never used for:**
- Buying or selling anything. $TGN is not connected to the SpiritDAO marketplace,
  bounties, events, or any payment feature.
- Moving your tokens. We cannot transfer, spend, stake, or unstake anything on
  your behalf. Read-only, always.

## A note on safety

If Hydrex's service is ever temporarily unreachable, we do not guess. The check
simply reports "could not verify" and errs on the side of caution rather than
granting access on incomplete information. Once the service is reachable again,
everything works normally. Your tokens are never affected either way; we were
only ever reading.

## Questions?

Ask in the TreeGens space or reach out to the SpiritDAO team. We are glad to walk
through any of this in more detail.
