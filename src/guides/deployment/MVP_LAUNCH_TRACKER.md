# SpiritDAO MVP Launch Tracker
_Last updated: 2026-03-04_

This document tracks all work completed in the pre-launch session and what still
needs to be deployed / activated before going live.

---

## ✅ CODE CHANGES COMPLETED (need to ship to Vercel)

### Hat Registry & TypeScript Cleanup
- Narrowed `HatKey` type to 4 valid values: `EXECUTIVE_POD_LEADER`, `COMMUNITY_PODS_PARENT`, `TEMPORAL_NATURALISM`, `TEMPORAL_NATURALISM_MEMBER`
- Removed all references to retired hats (beta tester, exec member, dev pod) across 27 files
- Hat IDs now sourced from `pod_role_permissions.token_address` — not env vars

### HatMinter.sol (contract + route)
- Renamed `betaTesterHatId` → `temporalNaturalismMemberId` throughout
- Renamed functions: `mintBetaTesterHat` → `mintTNMemberHat`, `batchMintBetaTesterHats` → `batchMintTNMemberHats`, `hasBetaTesterHat` → `hasTNMemberHat`
- Event renamed: `BetaTesterHatMinted` → `TNMemberHatMinted`
- Updated `HAT_MINTER_ABI` in `src/app/api/onboarding/mint-hat/route.ts` to match
- **Requires redeployment of HatMinter contract** (see Contracts section below)

### EligibilityModule.sol
- Fixed import paths: `./interfaces/IHats.sol` → `./IHats.sol` (Remix flat folder fix)

### BountyManagerV4.sol
- Added missing state variables `platformFeeRate` and `feeRecipient`

### Bounty permissions route
- `src/app/api/bounty/permissions/route.ts` — updated from V3 to V4 address env var (`NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS`)

### ClaimTab.tsx — full burn flow wired
- Was: POST to `/api/claims/request` only (no on-chain burn)
- Now: full 4-step flow:
  1. POST `/api/claims/request` → get `payoutRef`
  2. `systemToken.approve(TOKEN_CLAIM_ADDRESS, amount)` on-chain
  3. `TokenClaim.burnForClaim(amount, payoutRef)` on-chain
  4. POST `/api/claims/confirm` with burn tx hash
- Shows per-step progress, graceful "unavailable" state when env var missing

---

## 🔴 CONTRACTS STILL NEEDING DEPLOYMENT

| Contract | Status | Constructor Notes |
|---|---|---|
| `HatMinter.sol` | Needs redeploy | `(_hatsProtocol, _temporalNaturalismMember, _executiveLeaderHatId, _initialOwner)` — use new `0x00000749` tree hat IDs |
| `TokenClaim.sol` | Not yet deployed | `(_systemToken)` — deploy when ready to enable burn/claim flow |

---

## 🟡 ENV VARS TO ADD / UPDATE WHEN DEPLOYING

```bash
# Update after HatMinter redeployment
NEXT_PUBLIC_HAT_MINTER=<new HatMinter address>

# Add after TokenClaim deployment
NEXT_PUBLIC_TOKEN_CLAIM_ADDRESS=<TokenClaim address>

# Update to new BountyManagerV4
NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS=0x8Af29E57A962216C4661c36737CbF33510356DAD
# Remove this — no longer needed
# NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS=...
```

---

## 🟡 DATABASE ACTIONS NEEDED

| Action | Table | Notes |
|---|---|---|
| Set `management_hat_id` | `pods` | Update rows for Community (86d2d359) and TN (f2bc166d) pods with new `0x00000749` tree hat IDs |
| Activate exec pod leader hat | `pod_role_permissions` | Set `is_active=true` for Executive Pod Leader row once new hat tree is live |
| Run migration | — | `001_rename_mercury_to_stripe.sql` — not yet run in Supabase |

---

## 🟡 POST-DEPLOYMENT STEPS (after HatMinter redeploy)

1. Mint the **Executive Pod Leader** hat to the new `HatMinter` contract address (so it can mint TN Member hats)
2. Mint the **Executive Pod Leader** hat to your backend service wallet (`POD_ADMIN_PRIVATE_KEY`)
3. Verify via `hasAdminHat()` on the contract returns `true`

---

## 📌 FUTURE FEATURES (bookmarked, do not build yet)

### Permissionless Pod Creation
- New flow: pod activates when 3 members each sign SpiritDAO core TOS on-chain
- Pod starts as `pending_members`, activates on 3rd signature
- No exec pre-approval; exec notified, retains moderation/removal rights
- Pod leader limit: max 2 pods as leader (spam prevention)
- All new members auto-receive TN Member HAT by default
- Key files: `podGovernanceService.ts`, `CONFIG_FLAGS.FORCE_APPROVAL_FLOW`

### Exec Pod Moderation Dashboard
- DB soft-delete (`is_active=false`, `status='removed'`) + hat revocation
- Review/appeal process for removed pods
- Backend routes at `/api/claims/` exist but no exec-side UI built yet

---

## ✅ PREVIOUSLY DEPLOYED (confirmed working, no changes needed)

| Contract | Env Var | Notes |
|---|---|---|
| Hats Protocol | — | `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137` — immutable, Base mainnet |
| PodAuthProxy | `NEXT_PUBLIC_POD_AUTH_PROXY` | No deps changed, keep as-is |
| PodAuthorizationFactory | `NEXT_PUBLIC_POD_AUTH_FACTORY` | No deps changed, keep as-is |
| PodBountyService | `NEXT_PUBLIC_POD_BOUNTY_SERVICE` | No deps changed, keep as-is |
| DAOTimelock | `NEXT_PUBLIC_DAO_TIMELOCK` | Deployed this session |
| DAOGovernor | `NEXT_PUBLIC_DAO_GOVERNOR` | Deployed this session (enable optimizer for size) |
| PodTreasuryV2 | — | Deployed this session, stored in DB per-pod |
| PodTreasuryFactory | `NEXT_PUBLIC_TREASURY_FACTORY` | Deployed this session |
| PodCreationManager | `NEXT_PUBLIC_POD_FACTORY_V2_ADDRESS` | Deployed this session, activate post-launch |
| BountyManagerV4 | `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS` | `0x8Af29E57A962216C4661c36737CbF33510356DAD` |
