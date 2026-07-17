# SpiritDAO Community Update — July 2026

*Draft for Paragraph. Written 2026-07-17. Covers the mid-July platform work.*

---

Hello friends,

A big stretch of building to share this time — a new capability that deepens our first community partnership, and a major expansion of how the platform teaches itself to you.

## Link your own wallet — your tokens count, wherever they live

Communities that join SpiritDAO bring their own histories with them — including, sometimes, their own tokens. Our partnership with **Treegens DAO** is the first: holding their $TGN token is part of eligibility for Treegens roles and votes on our platform.

But most Treegens members hold $TGN in their own wallets — MetaMask, Coinbase Wallet — not in the SpiritDAO wallet the app creates for you. Asking people to move their tokens to us was never the answer. Your assets should stay yours, where you keep them.

So we built **wallet linking**. From your Identity page, you can now connect a personal wallet and sign a single free message proving it's yours. That's the whole thing. Nothing moves. We can never touch, spend, or transfer anything in your wallet — the platform only *reads* the balance. Once linked, the tokens you hold there count toward your community's eligibility and votes, combined with anything in your SpiritDAO wallet.

A few design choices we want to be transparent about:

- **It's per-community, and deliberately gated.** Wallet linking is switched on pod-by-pod, and only SpiritDAO's Executive Pod can enable it — a community's own leaders can't quietly change what counts for their votes.
- **It's governance-only.** Partner tokens like $TGN are a signal of standing in that community — they're never involved in bounties, the marketplace, or anything financial in the app.
- **Voting stays one person, one vote.** Tokens affect *whether* you're eligible, never how much your voice weighs.

If you're a Treegens member, there's a step-by-step guide waiting in your pod's knowledge base.

## The platform now explains itself — everywhere

We finished a full pass on our documentation this month, and it shows up in three places at once:

- **Sixteen written guides** now cover every part of the app — from getting started, pods, and governance to the features that never had documentation before: surveys, the encrypted password vault, pod AI agents, chat and direct messages, pod agreements, and a plain-language explainer of **$SELF and Tenure** (how participation is earned, why it fades, and why your lifetime standing only ever grows).
- All sixteen live in the **in-app Knowledge Base**, alongside our video library — now reorganized, de-duplicated, and easier to browse.
- **Sensemaker**, our community AI, has been retrained on all of it. Ask it how anything works — wallet linking included — and it answers from the same guides.

One source of truth, three doors in. When we update a guide, everything updates together.

## Under the hood

The less glamorous work that makes everything steadier:

- **Onboarding is smoother** — a batch of first-run fixes (app install, sign-up flow) from watching real new members join.
- **Permissions got a hard look.** We unified how the app decides who can manage what, fixed several inconsistencies (including one that showed members buttons they couldn't use), and wrote down the architecture so it stays fixed.
- **$SELF displays are accurate everywhere** following the token's redesign — Pulse, gifting, and treasury views all reflect the new soulbound token correctly.
- **Pods scale further** — member limits raised well beyond our current size, ready for the communities ahead.

## What's next

Testing wallet linking live with Treegens members, and continuing to prepare the platform for the communities lining up behind them. If you hit anything odd — or anything delightful — tell us in the forum.

With gratitude,
**Ron & the SpiritDAO team**

---

*SpiritDAO is a community of communities — a registered 501(c)(3) nonprofit and decentralized platform built on Base. [Launch the app](https://app.spiritdao.org) · [Read the docs](https://spiritdao.org/docs/)*
