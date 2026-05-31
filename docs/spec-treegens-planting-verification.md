# Spec — TreeGens Planting Verification Workflow (Phase 2)

*Last updated: 2026-05-30*
*Status: FUTURE — documented only, no code. Blocked on MGRO token/contract.*

## Why deferred

Per the TreeGens onboarding conversation (`TreeGens __ SpiritDAO.md`), the planting-
verification workflow (AI tree counting → verifier review → MGRO minting) is a
dedicated Phase 2 initiative, explicitly **after** TreeGens is operational on the
platform and **after** MGRO's token and contract are finalized. MGRO does not exist
yet, so the mint-on-completion step cannot be built. This spec captures the shape so
Phase 2 starts from a plan, not a blank page.

## What the platform already provides (~90%)

The existing **bounty system** is the submission → review → payout spine:

- **Submission** (`work_submissions` table; `api/bounty/work/submit`) — supports
  `deliverable_urls` + `attachment_urls`. Planting **photo evidence** = IPFS/Pinata
  URLs pasted as attachments (Pinata is already wired via `BountyIPFSService`).
- **Review** (`api/bounty/work/review`) — gated to bounty creator / pod leader /
  `bountyManagement` role. This is the **Verifier** review step.
- **Payout** (`BountyPaymentTransaction` → `releasePayment`, or pod-treasury
  `distributeTokens`) — gasless via CDP Paymaster. This moves **existing** tokens.

## The Phase-2 gaps (what must be built when MGRO exists)

1. **MGRO token + mint authority.** A deployed MGRO contract and a mint path the
   platform can call. NOTE: minting is a token-issuance action — confirm it fits the
   501(c)(3) posture (MGRO as a non-speculative reward credential, not a tradable
   asset; no platform-run swaps).
2. **Mint-on-approval trigger.** A new step after work-approval that mints MGRO to the
   submitter. The bounty payout path today *transfers existing* tokens; it has no
   *mint* path. Likely a new `api/bounty/work/reward` route gated by a dedicated
   permission flag (e.g. `mintManagement`), calling the MGRO mint via the pod's
   gas-sponsored smart-wallet path (never an admin EOA — see pod-review architecture).
3. **Verifier staking threshold (optional).** If verifier eligibility should require
   staked $TGN rather than held $TGN, that rides on the same eligibility seam built in
   Phase 1 (`hydrexStakingService` / future SD-native staking) — pending Hydrex
   snapshot confirmation.
4. **AI tree counting (optional, novel).** Photo → count. A separate model/service;
   produces a number the verifier confirms before approval. Can be additive to the
   review UI; not required for a manual-verify MVP.

## Recommended Phase-2 sequencing

1. Manual-verify MVP: photo submission + verifier review using the bounty spine, MGRO
   minted on approval (once MGRO exists). No AI.
2. Add AI tree counting as a verifier assist (suggested count, human confirms).
3. Add staking-based verifier eligibility if/when staking snapshot is settled.

## Cross-community note (from the TreeGens doc)

MGRO/$TGN remain **non-cross-communal**: other communities cannot exchange them. The
platform integrates them as governance/permission/reward signals **within** TreeGens
only and supports **no swaps of any kind**.

## Related
- `treegens-integration.md` — Phase 1 (eligibility gate) that this builds on.
- Bounty spine: `src/features/bounty/` (submission/review/payout services + routes).
