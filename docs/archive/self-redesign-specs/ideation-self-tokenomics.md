# $SELF Tokenomics — Deep Ideation

*Drafted 2026-06-11. Status: ideation, not spec. Companion to
`spec-contributor-compensation.md` (which assumes $SELF exists but not how).*

## 0. The reframe that dissolves most of the problems

$SELF is being asked to be three different things:

1. A **record of participation** — who showed up and contributed, recently
2. A **currency** — spendable on merch, events, compensation
3. A **governance weight** — future staking

Records want to be identity-bound and non-transferable. Currencies want to be
fungible and transferable. Governance weights want sybil resistance. Most of
the abuse scenarios come from letting the *currency* framing leak into the
other two.

**Keystone decision: $SELF is soulbound (non-transferable) by default.**
Earned $SELF lives in the earner's wallet and can only be *burned* (redeemed),
never sent. Look at what this kills in one stroke:

- **Secondary markets / scam value.** A fraudulent community that tricks the
  system into minting $SELF holds tokens *nobody can buy*. The scam yield of
  fake issuance is zero. This is the single strongest answer to "if
  communities can issue their own, it becomes a rampant scam."
- **The misdirected-merch problem.** Nobody can buy, borrow, or be tipped the
  $SELF needed for a gated product. The only way to hold qualifying $SELF is
  to have done the qualifying thing.
- **Cross-community arbitrage.** There is no exchange rate because there is no
  exchange. Cross-community becomes a *recognition* question (§5), which is
  policy, not price.
- **501(c)(3) cleanliness.** No transfers, no cash-out, no swap against
  $SYSTEM. $SELF stays a participation record with redemption perks — like
  airline status or library-of-things credits — not a security.

Everything below assumes soulbound. (If a transfer use-case ever becomes
essential, allow it only platform-mediated and escrowed for a specific
redemption — never free P2P.)

## 1. Issuance: who mints, and against what

### 1a. Communities never get mint keys

Don't let communities issue $SELF — let them create *opportunities to earn*
it. The platform protocol is the sole minter, and it mints only against
**attestable actions that already exist as platform primitives**:

| Trigger | Attestation that already exists | Mint |
|---|---|---|
| Event attendance | Event check-in + credential NFT (built) | per-hour rate × duration |
| Bounty completion | Submission → review → approval flow (built) | bounty's posted $SELF value |
| Governance participation | Vote records (built) | small fixed amount |
| Verification work (e.g. TreeGens verifiers) | Review/approval records | per-task rate |
| Role service (pod leadership, moderation) | Hat held + time served | epoch stipend |

A community "issuing" $SELF = scheduling events and posting bounties through
the platform. The mint happens when the *attested action* completes, with dual
attestation where possible (organizer confirms + attendee claims; both
signatures required, mirroring the authorize → userOp → dbUpdate pattern).

### 1b. The hour anchor (strongest single idea here)

Denominate $SELF issuance in **verified participation-hours**: 1 $SELF ≈ 1
human-hour of verified participation. This gives:

- **A physical inflation ceiling.** An event with 20 check-ins × 2 hours can
  mint at most 40 $SELF, *computable from event data we already have*. A
  community literally cannot claim more $SELF than attendees × duration. Fraud
  requires faking human bodies at events, which is expensive, visible, and
  attackable at the attestation layer.
- **Cross-community comparability for free.** An hour in TreeGens is an hour
  in Temporal Naturalism. Recognition policies (§5) start from a meaningful
  common unit instead of arbitrary community-set prices.
- **An audit heuristic anyone can run.** Issuance ÷ (events × attendance ×
  hours) should hover near 1. Dashboards flag outliers automatically.

Bounties and stipends get hour-denominated valuations at posting time ("this
bounty is worth ~6 hours"), reviewed in the same budget pipeline.

### 1c. Budget models — layered, not either/or

Ron's instinct (petition Exec Pod, monthly cap) is right as the *human* layer
but wrong as the *only* layer — pure petition makes Exec a bottleneck and a
political target, and it doesn't scale past a handful of communities.

Layer it:

1. **Algorithmic baseline (no petition needed):** every community gets an
   epoch budget computed from measured reality — something like
   `base + α × verified-active-members + β × attended-hours-last-epoch`.
   Predictable, boring, self-adjusting. New communities start with a small
   probationary base.
2. **Exec petition for exceptions (Ron's mechanism):** a community planning a
   big festival or launch petitions for a one-time budget boost. Exec approves
   against the plan; unspent boost expires. Exec also holds an emergency brake
   (freeze a community's issuance pending fraud review).
3. **Optional skin-in-the-game multiplier:** a community that locks $SYSTEM in
   its pod treasury unlocks a higher budget ceiling (capacity multiplier, not
   a purchase of tokens). Scam communities won't lock real capital. This also
   ties the two-token system together without ever exchanging one for the
   other.

Budgets cap *minting capacity*, not entitlement — unspent budget doesn't roll
over (or rolls at 50%), so there's no incentive to farm allocation.

## 2. Time-bound mechanics

Options considered:

- **Epoch expiry (recommended):** tokens carry their mint epoch; they expire
  K epochs later (e.g. earned in Q3 → expires end of Q1 next year, K=2).
  Implementation: ERC-1155 where token id encodes (community, epoch); "live
  balance" = sum of non-expired ids. Fully verifiable on-chain, batch-friendly,
  and the id encoding gives us provenance (§5) for free.
- Continuous decay (demurrage): mathematically elegant, UX-hostile ("why is my
  number lower than yesterday?"). Pass.
- Activity-refresh (tokens live while you stay active, lapse after 90 days
  idle): nice retention mechanic, but makes balances unpredictable for gating.
  Could be a later modifier, not the base.
- **Seasonal harvest (gamified wrapper on epochs):** frame epochs as seasons —
  earn all season, spend window at season end, expired $SELF converts to a
  permanent non-numeric **prestige credential** ("Season 4 contributor", with
  tier). People hate losing value; they hate it much less when it *transmutes*
  into legacy. Prestige credentials become their own gating signal ("3+
  seasons of participation") without ever being spendable. Strongly worth
  pairing with epoch expiry.

Expiry is also the macro stabilizer: steady-state supply ≈ issuance rate ×
lifetime. Supply cannot run away because the past continuously falls off.

## 3. Anti-abuse stack (defense in depth)

1. **Attestation-gated minting** (§1a) — no mint without a platform-verified
   action; dual attestation for events.
2. **Hour anchor** (§1b) — physics-bounded issuance per event; automated
   anomaly math.
3. **Per-member earning caps with diminishing returns** — first event in an
   epoch pays 100%, the fifth pays 40%. Caps wash-event farming; a sybil
   farmer needs many *accounts attending real events*, not one busy account.
4. **Per-community budgets** (§1c) — worst-case corruption is a community
   wasting its own capped budget on itself, visibly.
5. **Radical transparency** — every mint is public in the activity feed
   (Pulse infra exists): amount, trigger, event, attestors. Scams need
   darkness; the explorer is floodlights.
6. **Dispute window + clawback** — mints are revocable by Exec for ~14 days
   on fraud findings. Soulbound makes clawback clean: there are never innocent
   third-party holders.
7. **Identity layer (existing roadmap)** — sybil resistance ultimately lives
   at account level (personal onboarding now; attestation/passport later).
   The token layer's job is to make sybils *unprofitable*, which 1–6 do.

## 4. Redemption, gating, claiming

### Provenance-aware gating

Because token ids encode (community, epoch), every gate can express:

- "≥ N $SELF from *our* community" — community-exclusive merch/events. This
  directly solves the stated fear: a member of an unrelated community holding
  $SELF earned elsewhere simply doesn't match the gate.
- "≥ N $SELF from anywhere" — ecosystem-wide perks.
- "≥ N from us OR from a trusted community at recognition weight w" (§5).

### Burn + receipt claiming

Redemption **burns** the epoch tokens and mints a non-transferable
**redemption receipt** credential to the same wallet (item, event, timestamp).
Fulfillment then keys off the receipt:

- **Physical merch:** receipt + verified delivery details on the same account;
  per-identity quantity limits per item.
- **Event perks:** receipt checked at the door exactly like event check-in
  works today (wallet-signed QR).
- Entitlements are themselves soulbound until fulfilled — no buying-to-resell
  a claim.

Oldest epochs burn first (FIFO), so expiry pressure encourages spending and
nobody is surprised by what expired.

### Pricing sanity

Keep redemption values nominal relative to participation (a hoodie ≈ a
season's casual participation, not an hour's). $SELF prices for goods are set
by the issuing community but displayed in hours ("this costs ~20 verified
hours"), which keeps pricing honest and comparable.

## 5. Cross-community: recognition, not exchange

There is no $SELF exchange. Instead, communities publish **recognition
policies**:

- Default: external $SELF counts at weight 0 (community-scoped, like the
  $TGN owner_pod_id model already enforces for third-party tokens).
- A community may recognize specific others: "TreeGens $SELF counts at 0.5×
  for our event gates." Provenance in the token id makes this enforceable.
- **Exec-maintained default trust list:** communities in good standing get a
  baseline mutual-recognition weight (say 0.25×) for ecosystem-wide perks;
  pods can extend or zero it per relationship. Think visa agreements /
  university credit transfer, not currency markets.
- Inter-pod agreements (see `spec-inter-pod-agreements.md`) are the natural
  vehicle: a formal agreement between pods can include reciprocal recognition
  clauses — measurable, revocable, on the record.

Recognition weights are *policy applied at gate-evaluation time*, never a
conversion of tokens. Nothing moves; nothing is priced; nothing is swappable.
This is the part that keeps the whole system out of scam/securities territory
while still letting effort travel.

## 6. Governance staking (future, sketched)

"Stake $SELF for governance weight" becomes: **lock live epochs to refresh a
decaying Voice score.** Voice decays each epoch unless re-fed with fresh
$SELF — so governance weight always reflects *recent* participation, which is
the philosophical point of a time-bound token. Locked $SELF doesn't expire
while locked but can't be redeemed either: choose voice or perks with the same
earned hour. (Keeps redemption sinks and governance sinks competing healthily.)

## 7. Wilder ideas (parking lot)

- **Mutual-aid transfers:** the one exception to soulbound — allow *donating*
  $SELF into a community pool (one-way, irreversible, pool can only fund
  scholarships/access for members). Generosity without markets.
- **Participation insurance:** communities can underwrite "guaranteed minimum
  earn" for organizers of risky new event formats, from their budget.
- **Cross-community quests:** Exec-sponsored multi-community challenges where
  $SELF earned carries a special provenance honored everywhere at 1× — the
  federated layer paying for federation-building behavior.
- **Decay-to-commons:** expired $SELF doesn't vanish; it aggregates into a
  public "commons score" per community — a permanent record of total life
  participation, usable for community-level reputation (and lovely data for
  the digest/newsletter).
- **Hour futures for planning:** communities pre-announce next epoch's event
  calendar; the algorithmic budget partially fronts capacity against the
  calendar, trued-up against actual attendance. (Petition mechanism becomes
  mostly automatic.)

## 8. What to build first (phasing sketch)

1. **Phase 1 — earn loop, one community, no expiry yet:** protocol-minted
   $SELF on event check-in (hour-anchored) + bounty completion. Soulbound
   ERC-1155 with (community, epoch) ids. Transparency feed entries. Manual
   Exec budget per epoch (the petition model is fine at N=3 communities).
2. **Phase 2 — spend loop:** provenance-aware gating in the existing
   eligibility framework (it already supports registered-token criteria; add
   an epoch-aware balance resolver), burn-and-receipt redemption for merch and
   event perks.
3. **Phase 3 — time actually binds:** turn on epoch expiry + prestige
   conversion. (Deliberately last: expiry before there are sinks to spend into
   just punishes early adopters.)
4. **Phase 4 — federation:** recognition weights, trust list, algorithmic
   budgets replacing routine petitions.

## 9. Direct answers to the prompt's questions

- **"How do we generate it automatically?"** Mint on attested platform actions
  (check-ins, approved bounties, votes), hour-anchored. No human in the loop
  for routine earning; humans set budgets and handle disputes.
- **"Ensure it's not being cheated?"** Soulbound (no scam yield) + hour anchor
  (physics cap) + dual attestation + diminishing per-member returns + public
  mints + clawback window.
- **"Protocol for intercommunity exchange?"** Don't exchange — recognize.
  Provenance-encoded tokens + per-community recognition weights + Exec trust
  list + inter-pod agreements.
- **"Communities petition Exec for X/month?"** Keep it, but as the exception
  layer on top of an algorithmic, activity-measured baseline; otherwise Exec
  becomes a bottleneck and a political target as the ecosystem grows.
- **"Gated product bought by unrelated member?"** Impossible by construction:
  soulbound (can't acquire someone else's) + provenance gates (theirs doesn't
  match) + identity-bound fulfillment (receipt + delivery on same verified
  account).

---

# Addendum — follow-up round (2026-06-11)

## A. "If it's non-transferable, how does a pod issue it?"

Soulbound forbids **peer-to-peer transfers**, not minting. The standard SBT
pattern allows exactly two movements: mint (from the zero address to the
earner) and burn (redeem/expire). Pods never hold $SELF inventory at all —
"issuance" is *budget accounting*, not token custody. The pod's epoch budget
is a number in a ledger; when an attested action completes, the protocol mints
directly to the earner's wallet and decrements the pod's budget. No pod
treasury of $SELF, no distribution step, nothing for a pod admin to misroute.

## B. The dual-membership marketplace tension (the real version)

Scenario: a member of community A *also* belongs to community B, earns $SELF
in B, and spends it on A's exclusive marketplace product. They contributed to
B's effort, not A's. Is that a leak?

Resolution: a marketplace listing has **two independent knobs** that were
conflated before:

1. **Who may buy** — the gate: membership in A, a role, a provenance-A $SELF
   minimum, per-identity quantity limits. This is eligibility.
2. **What is burned to pay** — the payment policy: which provenances of $SELF
   the listing accepts, and at what weight.

The dual-member passes knob 1 legitimately (they ARE a member of A — the
"unrelated outsider" attack is already dead). Knob 2 is then a *policy choice
per listing*, and three useful settings exist:

- **Hardcore exclusive:** accept only provenance-A $SELF. "This hoodie is for
  people who built *this* community." The dual-member must earn here to buy
  here.
- **Open sink:** accept any $SELF at 1×. Key realization: $SELF payments are
  **burns** — the community receives nothing either way, so accepting foreign
  $SELF costs A nothing financially. The only real question is *allocational*:
  who gets scarce items. For non-scarce items (print-on-demand, digital,
  event capacity with room), open acceptance is pure upside — A becomes a sink
  for ecosystem-wide participation, which federation should reward.
- **Provenance discount (recommended default):** A-provenance pays face price;
  foreign provenance pays at the community's recognition weight (e.g. 0.5× →
  costs 2× as much). Insiders get priority pricing; cross-community effort
  still counts, just less. This is the recognition-weight machinery (§5)
  applied to payment instead of gating — one mechanism, both uses.

Plus scarcity protection orthogonal to all three: limited editions reserve N%
of stock for provenance-A purchases for the first X days.

So the tension isn't a flaw to eliminate — it's a *dial each community sets
per listing*, with the dial defaulting to insider-priority.

## C. Operationalizing the hour anchor

Concrete pipeline, using only existing primitives plus one new job:

1. **Events:** event records already carry start/end → scheduled duration.
   Check-in (existing flow) creates the attendance record. Phase 1 rule:
   credited hours = min(scheduled duration, daily cap of ~8h). No check-out
   needed for typical 1–3h events; multi-day festivals use per-day or
   per-session check-ins (sessions already exist as separate events).
2. **Mint window:** when the event ends, a dispute window opens (~72h). The
   organizer confirms the attendance list (dual attestation: their hat-signed
   confirmation + the attendee's own check-in). After the window, a server
   mint job processes the batch.
3. **Budget ledger:** `pod_self_budgets` (pod, epoch, allocated, spent). The
   mint job decrements atomically; mints that would exceed budget queue for
   Exec review instead of failing silently.
4. **Member curve:** per-member per-epoch earning cap with diminishing
   returns applied at mint time (full rate for first ~10h/epoch, tapering).
   All parameters platform-level constants at first, not per-pod knobs.
5. **Bounties:** poster sets estimated hours at posting (visible on the
   bounty); approval (existing review flow) triggers mint of the estimate.
   Estimates count against the same pod budget, so inflated estimates eat the
   pod's own capacity.
6. **Votes:** flat micro-mint (e.g. 0.25h equivalent) per vote, capped per
   epoch, batched weekly.
7. **Audit surface:** per-pod ratio `minted ÷ attended-hours` on an admin
   dashboard + Pulse entries per mint batch. Ratio should sit ≈ 1.0–1.3
   (bounties push it above 1); alert outside bands.
8. **Gas reality:** mints are batched (weekly or post-event) by a dedicated
   protocol minter key — this is a protocol write, not a user action, so the
   no-admin-EOA rule for user flows doesn't apply; the minter pays its own
   gas on Base (cents per batch).

## D. "$SELF is already an ERC-20" — migration workarounds

The deployed ERC-20 can't encode epochs/provenance and (if standard) can't
block transfers. Paths, in build order:

- **D1. Authoritative platform ledger (ship first, no new contracts):** keep
  the ERC-20 as a cosmetic on-chain mirror of "live total"; run epochs,
  provenance, expiry, and redemption in a platform ledger
  (`self_epoch_ledger`: wallet, pod, epoch, earned, burned). All gating,
  marketplace payment, and recognition logic reads the LEDGER, never raw
  `balanceOf`. Decisive property: even though the ERC-20 is transferable
  on-chain, **transferring it moves nothing in the ledger** — bought tokens
  carry no earning records, gate nothing, and buy nothing. Transferability
  becomes harmless because the chain balance isn't the source of truth.
  Expiry = ledger rows aging out + a periodic sweep that burns the mirrored
  ERC-20 amounts (admin burn if the contract allows; if not, the mirror just
  reads "live ledger total" and the raw ERC-20 number is explicitly
  decorative).
- **D2. SelfEpochs ERC-1155 (when governance staking needs on-chain truth):**
  deploy the (community, epoch)-id 1155 with transfers disabled; migrate by
  snapshotting the ledger (not the ERC-20) and minting current live epochs.
  The ERC-20 retires or remains a read-only legacy display.
- **D3. Interim hybrid:** if the deployed ERC-20 happens to be
  pausable/upgradeable or has admin burn (worth auditing the actual contract
  before choosing), D1's mirror can be kept honest automatically; if it's a
  vanilla ERC-20, D1 still works — just with the "decorative balance" caveat
  documented.

D1 → D2 is the same arc as the pod-governance pattern elsewhere in the
platform: DB-first for velocity, on-chain when a layer actually needs
trustlessness.
