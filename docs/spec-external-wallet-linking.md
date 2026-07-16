# Spec — External Wallet Linking (verified) for Cross-Wallet Token Reads

*Drafted 2026-07-16. Purpose: let a member link an external wallet (e.g.
MetaMask) by signing a proof-of-ownership message, so token balances ($TGN for
TreeGens) can be read across their SpiritDAO embedded wallet + verified external
wallets. Governance-only. Per-pod, Executive-Pod-gated.*

---

## 0. Decisions (settled)

| # | Decision |
|---|---|
| D-1 | Members keep tokens in their own wallets; we only READ, never move/custody. This is the ethos-aligned path (vs. moving tokens into the embedded wallet, which our wallets aren't built to release). |
| D-2 | Ownership is proven by SIGNATURE (sign a nonce with the external wallet, server recovers + verifies the address). Not a code. |
| D-3 | Per-pod: a new `external_wallet_linking_enabled` module flag. **Executive-Pod-only** toggle (reuses `isExecPod`); pod leaders see it read-only. One-off exceptions, reusable for future communities. |
| D-4 | Counting scope: BOTH eligibility gates AND governance voting weight sum across a member's linked wallets. |
| D-5 | The connector for external wallets lives in an ISOLATED wagmi config used only by the link-wallet modal. The global config's `coinbaseWallet({ preference: 'smartWalletOnly' })` is load-bearing and must not change. |
| D-6 | Linking (the identity UI + signature) is a GLOBAL identity feature (harmless, read-only). The pod MODULE flag gates whether a pod actually COUNTS linked-wallet balances. (This resolves the "keep it pod-specific" ask: everyone can link; only enabled pods count it.) |

---

## 1. What already exists (reuse as-is)

- **`user_wallets`** table (`supabase/migrations/20260524000001_user_wallets.sql`): generic `user_id ↔ wallet_address` map, stores any EVM address (lowercased, `is_canonical`, `nickname`, `linked_via_wallet`). Not CDP-specific.
- **`userWalletsService.ts`**: `insertLinkedWallet`, `getUserWallets`, `isLinkedWallet`, `revokeWallet` (refuses canonical), `findUserByWallet`. All work with arbitrary addresses.
- **`/api/auth/linked-wallets`** (GET/DELETE/PATCH): list/revoke/rename, JWT-gated. Has NO UI yet.
- **$TGN read primitives**: `EligibilityService.evaluateRegisteredErc20Balance` + `evaluateStaking`, `hydrexStakingService.fetchQualifyingStakedTgn(wallet)`, `proposalSnapshotService.computeEligibilitySnapshot` (all single-address today).
- **Pod module system**: `pod_modules` flags + `PodModulesManager.tsx` + `/api/pods/[id]/modules`. Exec-only rendering already patterned via `isExecPod`.

## 2. What's net-new (the build)

### 2.1 Schema (small)
- `ALTER TABLE user_wallets ADD COLUMN wallet_type TEXT NOT NULL DEFAULT 'device';` — tag external links `'external'`.
- `ALTER TABLE pod_modules ADD COLUMN external_wallet_linking_enabled BOOLEAN DEFAULT FALSE;`
- A nonce store for replay protection (mirror `user_wallet_link_codes`): `wallet_link_nonces (nonce, user_id, issued_at, expires_at, consumed_at)`.

### 2.2 Signature proof-of-ownership (security core)
- `POST /api/auth/link-external/nonce` (auth'd): issue a one-time nonce + canonical message ("SpiritDAO: link wallet <addr> to my account. Nonce: <n>. Expires: <t>").
- `POST /api/auth/link-external/confirm` (auth'd): body `{ address, signature, nonce }`.
  - Verify nonce (unconsumed, unexpired, belongs to this user).
  - `verifyMessage`/`recoverMessageAddress` (viem — already a dep) → recovered address MUST equal `address`.
  - `insertLinkedWallet({ userId, walletAddress: address, wallet_type: 'external' })` (blocks cross-user hijack already).
  - Consume the nonce.
- Fails closed; never links without a valid signature.

### 2.3 External connector (isolated)
- A separate wagmi config with `injected()` + `walletConnect({ projectId })` (needs a WalletConnect project id env var). Used ONLY by the link-wallet modal. Global CDP config untouched (D-5).

### 2.4 Identity UI ("Link Wallet")
- New "Linked Wallets" section in `src/app/identity/page.tsx` (near Tenure/Credentials).
- Lists wallets from `GET /api/auth/linked-wallets` (device + external, shows type).
- "Link external wallet" button → connect (isolated connector) → sign nonce → POST confirm → refresh list. Revoke via existing DELETE.
- Descriptor copy (seamlessness + trust): *"Link a wallet you hold elsewhere (like MetaMask) to have its tokens counted for community governance. You only sign a message to prove it's yours. We never touch, move, or spend anything in it."*

### 2.5 Cross-wallet balance summing
Add a server helper `sumTokenAcrossLinkedWallets(userIdOrWallet, tokenContract, { includeStaked })`:
- Resolve `user_id` (via `findUserByWallet` if given a wallet) → `getUserWallets` → for each wallet run the EXISTING per-address read (held `balanceOf` + optional Hydrex staked) → sum.
- **Eligibility**: call it inside `evaluateRegisteredErc20Balance`/`evaluateStaking` so a member's gate uses their combined total.
- **Voting weight (snapshot)**: in `computeEligibilitySnapshot`, keep ONE row per member (keyed by their SD/canonical wallet), but compute `held/staked/total` by summing across that member's linked wallets. This preserves the per-member snapshot integrity model — no extra rows, no double-count, one weight per member.

### 2.6 Per-pod gating
- `external_wallet_linking_enabled` in `ALLOWED_KEYS` (`/api/pods/[id]/modules`), and a `ModuleInfo` card in `PodModulesManager`.
- The enable toggle rendered/permitted ONLY for the Executive Pod: gate the card behind `isExecPod` in the UI, and add an exec-membership check for that one key in the modules PUT route (~10 lines, mirroring the existing `isPodLeader` gate).
- The counting helpers (2.5) only sum linked wallets when the pod's flag is on; otherwise they read the single SD wallet as today (safe default).

## 3. Build order (phased, low-risk)

1. **Schema** (3 columns/table) — apply via Supabase SQL editor.
2. **Signature endpoints** + nonce store. Unit-test the recover/verify.
3. **Isolated connector + identity Link-Wallet UI** — members can link/see/revoke. (No counting yet: purely additive, zero risk to existing flows.)
4. **Module flag + exec gate** — EP can enable per pod.
5. **Balance summing** — wire into eligibility, then the snapshot path (the one that touches voting integrity — do last, test with TreeGens' pod behind the flag).

Phases 1–3 are safe to ship anytime. Phase 5 (snapshot) is the one to test carefully behind the pod flag before TreeGens relies on it for a real vote.

## 4. Gotchas
- Do NOT add injected/WC connectors to the global wagmi config (breaks CDP smart-wallet flows). Isolated config only.
- Store external addresses lowercased (table invariant). Recover/compare case-insensitively.
- Snapshot summing changes what a snapshot row's total means (now "member's total across wallets"). That's intended, but it's a governance-integrity change — gate strictly on the pod flag and verify with TreeGens before a live vote.
- Fail closed everywhere: no signature → no link; Hydrex unreachable → "unresolved," not zero (existing behavior, preserved).

## 5. Open items
- WalletConnect project id (env var) — needed for mobile external wallets; `injected()` alone covers desktop MetaMask.
- Whether to show linked-wallet totals to the member on their identity page (nice transparency; small add).
