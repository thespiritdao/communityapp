# PodTreasury V3 — Audit, Deployment, and Lessons Learned

**Date:** 2026-05-20
**Status:** On-chain infrastructure complete; app-side integration (PR 2) pending
**Roadmap item:** [#3 — Treasury Quorum Customization](roadmap-action-items-2026-05.md)

---

## 1. What this is

A new treasury contract system (`PodTreasuryV3`) replacing `PodTreasuryV2WithVoting` for new pods, with configurable multi-sig approval thresholds. This document records:

- The architecture decisions
- The security audit findings and remediations across three review rounds
- The final deployed contracts and addresses
- The on-chain wiring + smoke test results
- Lessons learned (operational, not just technical) from the deployment process

---

## 2. Architecture

### Design goals

1. **Self-sovereign** — any approved pod can create its own treasury without admin intervention
2. **Configurable thresholds** — pods choose their multi-sig approval bar (50%+1 / 66% / 100% / custom) at creation, can change via vote
3. **Floor enforced** — threshold can never drop below 50%+1
4. **Backwards compatible** — existing V2 pods continue running unchanged; V3 is new-pods-only
5. **Front-run resistant** — attackers cannot squat a pod's identity at deployment time
6. **Self-mutable** — pod governance can change its threshold via the same multi-sig flow that gates fund movement

### Final design: three contracts in a chain

```
Pod leader (CDP wallet, gas-sponsored)
   │
   ▼
PodTreasuryDeployerV3 (permissionless wrapper)
   │ ✓ caller wears the management hat (balanceOf > 0)
   │ ✓ hat's top-32-bit domain matches a canonical SpiritDAO tree (0x00000749)
   ▼
PodTreasuryFactoryV3 (gated factory)
   │ ✓ msg.sender == authorizedDeployer (the wrapper above)
   ▼
new PodTreasuryV3 instance (per pod)
```

### Threshold model

- Stored as **basis points** (5001-10000), e.g.:
  - 5001 = 50.01% (effectively "50%+1")
  - 6667 = 66.67% (2/3 supermajority)
  - 10000 = 100% (unanimous)
- Required approvals computed live at execution: `ceil(totalManagers * thresholdBps / 10000)`, with a floor of `(totalManagers / 2) + 1` (preserves V2's "more than half" minimum even if rounding lands below)
- Changes to threshold go through the same `ThresholdChange` proposal/approve/auto-execute flow, gated by the CURRENT threshold
- `THRESHOLD_FLOOR_BPS = 5001` enforced in both constructor and `proposeThresholdChange`

### Six proposal types in `PodTreasuryV3`

1. `Distribution` — move funds to recipients
2. `EmergencyWithdraw` — single-recipient escape hatch
3. `AddToken` — register a new ERC-20 in supportedTokens
4. `ThresholdChange` — modify the approval threshold
5. `SetProxy` — rotate the authorizedProxy (used by paymaster-sponsored flows)
6. `RevokeBountyApproval` — pull a token approval from a compromised BountyManager

All proposal types share the same auto-execute-on-threshold pattern. Required approvals are computed at execution time (not snapshotted at creation) so changes during a proposal's lifetime are respected.

---

## 3. Security audit history

Three rounds of structured security review, each documented below. Auditor was a Claude agent given the standard senior-engineer procedure prompt and an explicit audit framework covering access control, voting logic, reentrancy, integer math, proposal lifecycle, hat-supply edge cases, direct-call functions, front-running, V2 comparison, and miscellaneous concerns.

### Round 1 — Initial review

Findings on the first draft of `PodTreasuryV3` + `PodTreasuryFactoryV3`:

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 5 |
| Medium | 6 |
| Low | 5 |
| Informational | 7 |

**Critical (C-1):** Direct distribution paths (`distributeTokens`, `distributeTokensEvenly`, `emergencyWithdraw`, `addSupportedToken`, `setAuthorizedProxy`, `syncTokenBalance`) were gated by `onlyPodManagersOrProxy`, which any single hat-holder satisfied. The entire multi-sig threshold model was decorative — any single manager could drain the treasury without any vote.

**High findings:**
- H-1: Permissionless factory `deployTreasury` allowed front-run squatting of any pod's UUID
- H-2: `setAuthorizedProxy` was single-manager-controlled, enabling self-elevation
- H-3: `bountyManager` got irrevocable unlimited approval at construction
- H-4: Direct `addSupportedToken` bypassed `proposeAddToken` voting
- H-5: `requiredAtCreation` snapshot meant proposals could execute under outdated rules after hat supply or threshold changed

**Verdict:** Do not deploy. Fundamental redesign needed.

### Round 2 — After remediation

Changes made:

- **C-1:** Removed `distributeTokensEvenly`, `emergencyWithdraw`, direct `addSupportedToken`, direct `setAuthorizedProxy`. Remaining `distributeTokens` + `syncTokenBalance` direct paths restricted to `onlyAuthorizedProxy` only.
- **H-1:** Added `onlyOwner` to factory `deployTreasury` — *this was wrong, see Round 3*
- **H-2:** Added `ProposalType.SetProxy` and `proposeSetProxy`. Direct setter deleted.
- **H-3:** Added `ProposalType.RevokeBountyApproval` so token approvals can be pulled via vote.
- **H-4:** Direct `addSupportedToken` deleted. `_executeAddTokenProposal` now also grants bountyManager approval for the new token (consistency with constructor).
- **H-5:** Removed `requiredAtCreation` snapshot. Both `approveProposal` and `_executeProposal` now call `getRequiredApprovals()` live.
- M-3, M-5, L-1, L-2, L-5: also addressed.

New issue introduced and immediately patched: **N-1** — `proposeSetProxy` did not reject `address(0)`, creating a footgun where managers could brick the proxy paths until a recovery vote. One-line require added.

Verdict: Ship with the N-1 fix applied.

### Round 3 — After user pushback on H-1 fix

The `onlyOwner` fix to H-1 broke pod self-sovereignty (only a central admin could deploy treasuries). User correctly pushed back. Replaced with two more iterations:

**Iteration A:** Hat-gating — caller must hold the management hat they're deploying for. Auditor caught: Hats Protocol is permissionless for tree creation, so an attacker can mint their own hat and pass the check.

**Iteration B (final):** Added a wrapper contract `PodTreasuryDeployerV3` that:
- Enforces `balanceOf > 0` (caller wears the hat)
- Enforces `uint32(managementHatId >> 224) == canonical top-hat domain` (the hat is in the SpiritDAO Hats tree, not a self-issued attacker tree)

Factory is now `onlyAuthorizedDeployer`-gated; only the wrapper can call it.

**Residual accepted:** A current SpiritDAO hat-holder could theoretically squat another pod's UUID in the factory registry. This is now narrowed to insider griefing (not open-internet attack), socially recoverable, and UUIDs aren't predictable. Documented as accepted risk.

---

## 4. Deployed contracts (Base mainnet, 2026-05-19/20)

| Contract | Address | Owner |
|---|---|---|
| `PodTreasuryFactoryV3` | `0x6CeD549C1f08690e435007E661552f4F76229a9B` | Personal wallet (`0xd481...533d`) |
| `PodTreasuryDeployerV3` | `0x1c7b54794d2DF824e4E77D50e27f01A0D5736A2A` | Personal wallet |
| `PodCreationManagerFactory` (redeployed) | `0x18B947c7b92F73e6081c059316806001EDe23d3d` | Personal wallet |

### Setter calls executed during wiring

| Contract | Call | New value |
|---|---|---|
| `PodTreasuryDeployerV3` | `updateFactory(...)` | V3 factory address |
| `PodTreasuryFactoryV3` | `updateAuthorizedDeployer(...)` | V3 deployer address |
| `PodCreationManagerV2` (`0x2Af75c...`) | `updateTreasuryFactory(...)` | V3 factory |
| `PodSELFDistributor` | `updateTreasuryFactory(...)` | V3 factory |
| `PurchaseRouterDecentralized` | `updateTreasuryFactory(...)` | V3 factory |
| (deferred) `PodCreationManagerFactory` (old at `0x99A291f4...`) — replaced by redeploy rather than setter | — | — |

### Coinbase Paymaster whitelist updates

- **Replaced** `PodCreationManagerFactory` entry (old → new address) with full function list
- **Replaced** `PodCreationManager` entry (`0x086eD4...` → `0x2Af75c32...`) — old address was stale in env, now corrected
- **Added** `PodTreasuryFactoryV3` with full function list
- **Added** `PodTreasuryDeployerV3` with full function list

---

## 5. Final smoke test (executed 2026-05-20)

| Test | Result |
|---|---|
| Wrapper rejects callers who don't hold the management hat | ✅ PASS |
| Wrapper rejects hats outside the canonical 0x00000749 tree | ✅ PASS |
| Factory rejects direct calls (only `authorizedDeployer` can invoke) | ✅ PASS |
| Threshold below floor (5001 bps) rejected | ✅ PASS |
| New `PodCreationManagerFactory` correctly wired to V3 | ✅ PASS |

Plus 13 wiring-state checks via `scripts/deploy/audit-contract-ownership.mjs` — all passing.

---

## 6. App-side integration (PR 2 — shipped 2026-05-21, commit `8ebea237`)

PR 2 wired the V3 contracts into the app. New files: `TreasuryThresholdPicker.tsx`, `TreasuryActivationCard.tsx`, three V3 ABIs under `src/abis/`. Modified files: `treasuryAddressUtils.ts`, `HatsModulePodCreationForm.tsx`, `PodService.ts`, `pods/[id]/page.tsx`, `api/paymaster/route.ts`, the `Pod` type.

### What shipped

1. **Threshold picker** (`TreasuryThresholdPicker.tsx`) — three preset chips (Simple 50.01% / Strict 66.67% / Unanimous 100%) plus a 1%-step Custom slider. Lives in the existing pod creation form's Treasury Settings section. Persists to `pods.treasury_threshold_bps`.
2. **Activation card** (`TreasuryActivationCard.tsx`) — renders on `/pods/[id]` for any V3-eligible pod (`treasury_threshold_bps IS NOT NULL`). Pre-deploy mode shows a leader-gated "Deploy Treasury" CTA that calls `PodTreasuryDeployerV3.deployTreasury(podId, managementHatId, [SYSTEM, SELF], thresholdBps)` from the leader's CDP smart wallet via `useSendUserOperationWithAttribution`, polls receipt via `useWaitForUserOperation`, parses the factory's `TreasuryDeployed` event, and writes `treasury_contract_address`. Post-deploy mode shows short address + copy + Basescan link, live-read threshold percent badge, supported-tokens count badge.
3. **V2 fallback preserved** — pods with `treasury_threshold_bps IS NULL` continue rendering the existing FundButton/warning. Zero behavior change for legacy pods.
4. **Page-load backfill** — if a V3 treasury exists on-chain but the DB write was missed (tab closed mid-deploy), the load block queries the V3 factory and persists the address idempotently on first visit.
5. **Self-heal on "already deployed"** — if the deploy reverts because the treasury exists, the card queries the factory, writes the existing address, and switches to status mode.

### Paymaster wiring

The deploy itself targets the statically-whitelisted `PodTreasuryDeployerV3`, so `useCdpPaymaster: true` is sufficient.

For **subsequent** treasury operations (proposal create / approve, not in PR 2 scope), the existing ERC-7677 proxy at `src/app/api/paymaster/route.ts` was extended to match `treasury_contract_address` in addition to `creation_manager_address`. New per-pod treasuries auto-qualify for gas sponsorship without any Coinbase whitelist update — the address is recorded on the pod row, so the proxy's DB lookup will allow it. The match is case-insensitive (`.ilike`) so checksummed-vs-lowercase mismatches can't silently deny sponsorship.

### Key contract addresses (Base mainnet — required env vars)

```
NEXT_PUBLIC_POD_TREASURY_FACTORY_V3=0x6CeD549C1f08690e435007E661552f4F76229a9B
NEXT_PUBLIC_POD_TREASURY_DEPLOYER_V3=0x1c7b54794d2DF824e4E77D50e27f01A0D5736A2A
NEXT_PUBLIC_SYSTEM_TOKEN=0x00f75717Ab019DE0e452605098cFDc4FccEbc701
NEXT_PUBLIC_SELF_TOKEN=0x2d9e8A4DdED7438C2D4C8050Ed58B9F4Bc0c8298
```

V2 vars (`NEXT_PUBLIC_POD_TREASURY_FACTORY`, `NEXT_PUBLIC_TREASURY_PROXY`) remain in use for legacy pods and must stay set.

### Deferred to a follow-up PR

- **Threshold change UI** — proposing a new threshold via the on-chain `ThresholdChange` proposal type. PR 2 lets pods *set* a threshold at creation; *changing* it post-deploy is a separate UI.
- **Paymaster route TS fix** — pre-existing `extractTargets` type errors in `paymaster/route.ts` lines 112/118 are out of scope.
- **Treasury proposal/approval UI for V3** — V2 had a proposal flow at `TreasuryManagement.tsx`; a V3-aware equivalent needs to be built next.
- **V2→V3 migration for existing pods** — explicitly out of scope per architecture decision; V3 is new-pods-only.

---

## 7. Lessons learned

Honest reflection on what made this deployment harder than it needed to be:

### What went well

- **Three-round audit caught real issues.** The initial draft would have shipped a critical vulnerability (C-1). Each round added value.
- **The wrapper architecture is structurally sound.** Self-sovereignty + on-chain enforcement of the canonical Hats tree is a clean pattern, reusable for future contracts.
- **Idempotent wire-up script** meant we could safely re-run after partial failures.

### What didn't

- **Ownership audit should have happened on day one.** The contracts were owned by three different wallets (personal `0xd481...`, deployer `0x4156...`, POD_ADMIN `0x617b...`), and we didn't map this until we hit a "you're not the owner" revert mid-deploy. A 5-minute audit upfront would have saved hours.
- **Wrong contract version deployed.** Early in the session we shipped an intermediate version of `PodTreasuryFactoryV3` to Base before the final auth fix landed. Required a second deploy to a new address (`0xBA56...1Dbc` is now dead; `0x6CeD549C...` is live). Avoidable if I had pinned the deploy to a specific commit hash.
- **Stale env vars caused real confusion.** `NEXT_PUBLIC_POD_CREATION_MANAGER` pointed at `0x086e...` (an old dead instance) instead of the live `0x2Af75c32...`. We attempted a setter call against the stale address and got a misleading revert. Env hygiene should be part of the standard pre-deploy checklist.
- **POD_ADMIN wallet had no ETH.** Failed transaction; required a small ETH transfer mid-deploy. Should have funded operational wallets ahead of session.
- **Iteration cost.** Each "fix this finding" added a deploy, a Paymaster whitelist update, an env update, and (sometimes) a setter call. Bundle redeploys when possible.

### For future contract work

- Run an ownership + version audit BEFORE deploying anything. Document which wallet owns which contract and where each key lives.
- Pin every deploy to a specific git commit. Verify the deployed bytecode after each deploy.
- Maintain a single source of truth for env vars. Stale addresses are silent failures.
- Keep operational wallets funded with a small ETH buffer on Base ahead of session.
- For any contract holding funds, bundle the audit into the development loop, not the post-development loop.

---

## 8. References

- Source: `src/contracts/PodTreasuryV3.sol`, `PodTreasuryFactoryV3.sol`, `PodTreasuryDeployerV3.sol`
- Hardhat-compile mirror: `src/contracts/treasury-deploy/`
- Wiring script: `scripts/deploy/wire-treasury-factory.mjs`
- Ownership audit script: `scripts/deploy/audit-contract-ownership.mjs`
- Schema migration: `supabase/migrations/20260519000001_add_treasury_threshold.sql`
- Roadmap: `docs/roadmap-action-items-2026-05.md`

## 9. Open follow-up items

- **PR 2** — app-side UI + activation flow integration
- **Env hygiene cleanup** — `NEXT_PUBLIC_POD_CREATION_MANAGER` is stale; `POD_CREATION_MANAGER_FACTORY_NEW` is misnamed
- **`PodCreationManagerFactory` old instance** (`0x99A291f4...`) is now orphaned. Optionally `transferOwnership` to a burn address to make it visibly defunct
- **Old factory** (`0xBA56...1Dbc`) is dead but still deployed. Same treatment optional
- **Per-pod `PodTreasuryV3` Paymaster whitelist workflow** — each new pod deploy creates a new treasury address that needs Paymaster sponsorship for its functions. Need a script to automate this as pods come online
