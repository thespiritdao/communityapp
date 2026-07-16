# Test Checklist — Cross-Wallet Voting Snapshot (Phase 5)

*Verifies that verified linked wallets correctly sum into a member's governance
voting snapshot, WITHOUT breaking existing single-wallet pods. Run on a TEST pod
before enabling for a live TreeGens vote.*

**What's being tested:** when a pod has BOTH `gov_snapshot_enabled` (token +
minimum) AND the `external_wallet_linking_enabled` module flag on, each member's
snapshot row sums held + Hydrex-staked $TGN across their SpiritDAO wallet + their
verified linked wallets. One row per member. Voting still 1-person-1-vote; the
snapshot only adds "you must hold the threshold at publish time."

---

## 0. Preconditions

- [ ] Migration `20260716000001_external_wallet_linking.sql` applied to prod
      (columns + `wallet_link_nonces` exist). Confirm: a link attempt succeeds
      end to end (see §1).
- [ ] `NEXT_PUBLIC_HYDREX_STAKING_ENABLED === 'true'` in the environment
      (otherwise the staked portion is silently skipped — a different test).
- [ ] A **TEST pod** exists (NOT TreeGens' live pod) with a treasury/governance
      you can create proposals in.
- [ ] A test member account whose SpiritDAO wallet holds little/no $TGN, plus a
      MetaMask wallet that DOES hold (and/or stakes) $TGN. This is the whole
      point: the member only passes if the external wallet is counted.

## 1. Linking works (phases 1–3, gate for everything below)

- [ ] Identity page shows a "Linked Wallets" section listing the device wallet.
- [ ] "Link external wallet" → MetaMask connects → prompts to sign a message
      (NOT a transaction) → the message names the wallet + says "reads balances,
      no transaction."
- [ ] After signing, the external wallet appears in the list, badged "External".
- [ ] DB check: `user_wallets` has a row for the external address with
      `wallet_type='external'`, `is_canonical=false`, correct `user_id`.
- [ ] Sign with the WRONG wallet (connect a different MetaMask than the address
      being linked) → rejected ("signature does not match"). No row written.
- [ ] Reuse a consumed nonce / expired nonce → rejected. (Replay protection.)
- [ ] Try to link a wallet already linked to ANOTHER account → rejected (409).
- [ ] Remove (revoke) the external wallet → disappears from list; row gone.
      Canonical/device wallet cannot be removed.

## 2. Baseline — flag OFF behaves exactly as before

*(Do this FIRST, before enabling the flag, to prove zero regression.)*

- [ ] TEST pod: `external_wallet_linking_enabled` is OFF (default).
- [ ] Enable snapshot on the pod (`gov_snapshot_enabled`, `gov_snapshot_token_id`
      = the $TGN registry id, `gov_snapshot_minimum` = a threshold the member
      only meets via the external wallet).
- [ ] With the member's $TGN ONLY in their external (linked) wallet, create a
      proposal. Inspect `proposal_eligibility_snapshots` for this proposal.
- [ ] **Expected:** the member's row reads their SpiritDAO wallet only →
      `total_amount` is BELOW minimum → `passed = false`. (External wallet NOT
      counted because the flag is off.)
- [ ] The member attempts to vote → **rejected** ("Not eligible … snapshot").
- [ ] A member who meets the minimum in their SpiritDAO wallet alone → passes and
      can vote. (Proves normal path untouched.)

## 3. Core — flag ON sums linked wallets

- [ ] Enable `external_wallet_linking_enabled` for the TEST pod. Confirm ONLY the
      Executive Pod can toggle it (see §5).
- [ ] Create a NEW proposal (snapshots are captured at publish time; existing
      proposals keep their old rows — verify that too, §6).
- [ ] Inspect the new proposal's `proposal_eligibility_snapshots`:
  - [ ] There is exactly **ONE row per member** (keyed by their eligible-voter /
        SpiritDAO wallet). No extra rows for linked wallets.
  - [ ] The test member's `held_amount` = sum of held $TGN across SpiritDAO +
        linked wallet(s). `staked_amount` = sum of Hydrex-staked across them.
        `total_amount` = held + staked. Cross-check against the on-chain
        balances + Hydrex positions of BOTH wallets manually.
  - [ ] `passed = true` now (external wallet pushed them over the minimum).
- [ ] The member can now VOTE on the proposal. Vote records.
- [ ] Sanity: a member with NO linked wallet still gets a correct single-wallet
      row (unchanged).

## 4. Amount correctness (the math)

- [ ] Held-only case: member holds X $TGN in external wallet, 0 staked, 0 in
      SpiritDAO wallet. Row `held` == X (within decimals), `staked` == 0.
- [ ] Staked-only case: member stakes Y $TGN on Hydrex from external wallet, 0
      held. Row `staked` == Y (Hydrex `total_value_in_tgn` valuation), `held`==0.
- [ ] Both wallets contribute: SpiritDAO wallet holds A, external holds B, external
      stakes C → row `held` == A+B, `staked` == C, `total` == A+B+C.
- [ ] Decimals: values are human units (not wei). A member at exactly the minimum
      passes (>= is inclusive); one unit under fails.

## 5. Exec-only gating (phase 4)

- [ ] As a PLAIN pod leader (not exec): the "External Wallet Linking" module card
      shows an "Exec only" badge and the toggle is DISABLED.
- [ ] Plain pod leader hits `PUT /api/pods/[id]/modules` with
      `external_wallet_linking_enabled` in the body → **403** ("only … Executive
      Pod"). Other module keys in the same request still behave normally for a
      leader (test a mixed body).
- [ ] As an Executive Pod Leader (wears the exec hat): the toggle is enabled and
      persists. DB `pod_modules.external_wallet_linking_enabled` flips.

## 6. Integrity / no retroactive change

- [ ] Proposals created BEFORE the flag was enabled keep their original snapshot
      rows (single-wallet). Enabling the flag does NOT rewrite past proposals.
- [ ] Flip the flag OFF again → new proposals go back to single-wallet snapshots.
      In-flight proposals (already snapshotted) are unaffected.
- [ ] Tally is still 1-person-1-vote: two members each with a passing row cast one
      vote each; linked-wallet balances do NOT weight the vote count.

## 7. Failure policy (fail-closed, all-or-nothing)

- [ ] Hydrex unreachable during proposal creation (temporarily point
      `HYDREX_API_BASE` at a bad host, or test when Hydrex is down): proposal
      creation **aborts** with a clear error, rather than publishing a
      partially/ungated snapshot. No snapshot rows written for that proposal.
- [ ] An invalid/undeployed token id in the pod's snapshot config → proposal
      creation errors clearly, does not silently pass everyone.

## 8. Cleanup

- [ ] Disable `external_wallet_linking_enabled` and `gov_snapshot_enabled` on the
      TEST pod when done, OR delete the test pod.
- [ ] Remove any test link rows / nonces if desired (not required — harmless).

---

## Where to look (for debugging)

- Snapshot capture: `computeEligibilitySnapshot` (`proposalSnapshotService.ts`) —
  the `countLinkedWallets` branch and the `readOne` per-address sum.
- Persisted rows: `proposal_eligibility_snapshots` table (per proposal).
- Vote enforcement: `checkSnapshotEligibility` → thrown in `governanceService.ts`
  (`snapshot.enforced && !snapshot.passed`).
- Eligibility (join/role) path, same summing: `EligibilityService.evaluateStaking`
  + `podCountsLinkedWallets`.
- Address fan-out: `walletsForBalanceCheck` (`userWalletsService.ts`).

## Sign-off

- [ ] §2 baseline (flag off = no change) PASSED — this is the regression gate.
- [ ] §3 + §4 (summing correct) PASSED.
- [ ] §5 (exec-only) PASSED.
- [ ] §6 + §7 (integrity + fail-closed) PASSED.
- [ ] Approved to enable `external_wallet_linking_enabled` for the TreeGens pod.
