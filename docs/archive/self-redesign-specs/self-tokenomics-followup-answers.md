# $SELF Tokenomics — Follow-up Answers

*Captured 2026-06-11. Companion to `ideation-self-tokenomics.md` (full ideation)
and its addendum. This file is the clean, readable version of the four
follow-up answers that were hard to read in the console.*

These respond to four pushbacks on the original $SELF ideation:

1. If $SELF is non-transferable, how does a pod issue it?
2. The dual-membership marketplace tension (member of A *and* B earns in B,
   spends on A's exclusive product).
3. How do we actually operationalize the "hour anchor"?
4. $SELF is already deployed as an ERC-20 — how do we get epochs/expiry/
   provenance without that?

---

## 1a. "If it's non-transferable, how does a pod issue it?"

Soulbound forbids **peer-to-peer transfers**, not minting. The standard
soulbound pattern allows exactly two movements: **mint** (from the zero
address to the earner) and **burn** (redeem or expire).

The deeper consequence: **pods never hold $SELF at all.** "Issuance" is budget
accounting, not token custody.

- The pod's allocation is a number in a ledger (its epoch budget).
- When an attested action completes, the protocol mints **directly to the
  earner's wallet** and decrements the pod's budget.
- There is no pod treasury of $SELF, no distribution step, and no inventory
  for a pod admin to misroute.

The pod spends **capacity**, never tokens.

1. pods never hold $SELF at all.  -- presently our infrastructure DOES allow pods to hold self, so something to consider.  do we eliminate this, hide it, or is there a reason for pods to hold SELF?
– your point about capacity makes sense 

---

## 1b. The dual-membership marketplace tension

**Scenario:** a member of community A *also* belongs to community B, earns
$SELF in B, then spends it on A's exclusive marketplace product. He
contributed to B's effort, not A's. Is that a leak?

This pushback was correct — the original framing conflated two things every
listing actually has. They are independent knobs:

### Knob 1 — Who may buy (the gate / eligibility)

Membership in A, roles, a provenance-A $SELF minimum, per-identity quantity
limits. The dual-member **passes this legitimately — he IS a member of A.**
The true "unrelated outsider" attack is already dead at this layer.

### Knob 2 — What is burned to pay (the payment policy)

Which provenances of $SELF the listing accepts, and at what weight. This is a
**per-listing policy dial** with three sane settings:

- **Hardcore exclusive** — accepts only provenance-A $SELF. "This is for
  people who built *this* community." The dual-member must earn here to buy
  here.

- **Open sink** — accepts any $SELF at 1×. Key realization: **$SELF payments
  are burns** — community A receives nothing either way, so accepting
  B-earned $SELF costs A nothing financially. The only real question is
  *allocational* (who gets scarce items). For non-scarce items (print-on-
  demand, digital goods, events with capacity to spare), open acceptance is
  pure upside — A becomes a sink for ecosystem-wide participation, which
  federation should reward.

- **Provenance discount (recommended default)** — A-provenance pays face
  price; foreign provenance pays at A's recognition weight (e.g. at 0.5×
  recognition, the item costs outsider-earned $SELF twice as much). Insiders
  get priority pricing; cross-community effort still counts, just less. This
  reuses the recognition-weight machinery from the federation layer — one
  mechanism serving both gating and pricing.

– Open sink with province discount seems ideal?  I do think you’re onto something with ecosystem wide participation both in terms of mission orientation and cross pollination as a feature not a bug
– 


### Plus: scarcity protection (orthogonal to all three)

Limited editions can reserve N% of stock for provenance-A purchases for the
first X days.

**Bottom line:** the tension isn't a flaw to engineer away — it's a dial each
community sets per listing, defaulting to insider-priority.

Love it 

---

## 3. Operationalizing the hour anchor

The pipeline uses only existing platform primitives plus one new mint job.

1. **Events** — event records already carry start/end → scheduled duration.
   Check-in (existing flow) creates the attendance record. Phase 1 rule:
   credited hours = `min(scheduled duration, ~8h/day cap)`. No check-out
   needed for typical 1–3h events; multi-day festivals use per-day or
   per-session check-ins (sessions already exist as separate events).

2. **Mint window** — when the event ends, a dispute window opens (~72h). The
   organizer confirms the attendance list (dual attestation: their hat-signed
   confirmation + the attendee's own check-in). After the window, a server
   mint job processes the batch.

3. **Budget ledger** — `pod_self_budgets` (pod, epoch, allocated, spent).
   The mint job decrements atomically; mints that would exceed budget queue
   for Exec review instead of failing silently.
– 1 self equal one hour, so we should only allow it to break into minutes - or do you suggest an alternative?



4. **Member curve** — per-member per-epoch earning cap with diminishing
   returns applied at mint time (full rate for first ~10h/epoch, tapering).
   All parameters are platform-level constants at first, not per-pod knobs.

5. **Bounties** — poster sets estimated hours at posting (visible on the
   bounty); approval (existing review flow) triggers mint of the estimate.
   Estimates count against the same pod budget, so inflated estimates eat the
   pod's own capacity — self-policing.

6. **Votes** — flat micro-mint (e.g. 0.25h equivalent) per vote, capped per
   epoch, batched weekly.
Expand on what you intend from a ux perspective of this

7. **Audit surface** — per-pod ratio `minted ÷ attended-hours` on an admin
   dashboard + Pulse entries per mint batch. Ratio should sit ≈ 1.0–1.3
   (bounties push it above 1); alert outside bands.  
– great idea, does it make sense to flag certain transactions over a set amount to the executive pod (and build the ux for the EP exclusively to manage) 

8. **Gas reality** — mints are batched (weekly or post-event) by a dedicated
   protocol minter key. This is a protocol write, not a user action, so the
   no-admin-EOA rule for user flows doesn't apply; the minter pays its own gas
   on Base (cents per batch).
– all of our transactions must be sponsored. We use coinbase paymaster for this exact reason.  So far all app contracts are whitelisted, but perhaps scheduling a review in the future to ensure this is ideal.
– we can add any new contract to the paymasters in a csv order, no spaces, including functions ()

---

## 4. "$SELF is already an ERC-20" — migration workarounds

The deployed ERC-20 can't encode epochs/provenance and (if standard) can't
block transfers. Paths, in build order:

### D1. Authoritative platform ledger (ship first, no new contracts)

- Keep the ERC-20 as a **cosmetic on-chain mirror** of "live total."
- Run epochs, provenance, expiry, and redemption in a platform ledger
  (`self_epoch_ledger`: wallet, pod, epoch, earned, burned).
- All gating, marketplace payment, and recognition logic reads the **LEDGER,
  never raw `balanceOf`**.
- **Decisive property:** even though the ERC-20 is transferable on-chain,
  **transferring it moves nothing in the ledger** — bought tokens carry no
  earning records, gate nothing, and buy nothing. We don't have to *prevent*
  transfers; we make them pointless. Transferability becomes harmless because
  the chain balance isn't the source of truth.
- Expiry = ledger rows aging out + a periodic sweep that burns the mirrored
  ERC-20 amounts (admin burn if the contract allows; if not, the mirror just
  reads "live ledger total" and the raw ERC-20 number is explicitly
  decorative).

### D2. SelfEpochs ERC-1155 (when governance staking needs on-chain truth)

- Deploy the `(community, epoch)`-id ERC-1155 with transfers disabled.
- Migrate by snapshotting the **ledger** (not the ERC-20) and minting current
  live epochs.
- The ERC-20 retires or remains a read-only legacy display.
– we just need this now, lets do it right from the start, retire it and rebuild towards the ideal

### D3. Interim hybrid (depends on what the deployed contract can do)

- Audit the actual deployed contract first. If it's pausable/upgradeable or
  has admin burn, D1's mirror can be kept exactly honest automatically.
- If it's a vanilla ERC-20, D1 still works — just with the "decorative
  balance" caveat documented.

**The arc:** D1 → D2 mirrors the pod-governance pattern elsewhere in the
platform — DB-first for velocity, on-chain when a layer actually needs
trustlessness. Conveniently, D1's ledger is the system of record that makes
the eventual D2 migration trivial.

We just move to D2 immediately, no communities onboarded yet, but as we do, (before or after) ill need a compiled list of all contracts that need redeploying (using self).  
---also need to revise the pod UX 

## One-line summary of the whole $SELF design

> $SELF is verified human time, recorded where it was spent, that fades unless
> renewed — and it never becomes money.

Great tag line, remember it because after we build well need a newsletter description
