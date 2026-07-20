# Spec: Email Invites + Pod-Specific Invite Links

*Scoped 2026-07-19 from user feedback. Status: awaiting build decision.*

## What exists today (verified in code)

| Capability | State |
|---|---|
| Referral codes | ✅ Every member has a 6-char `referral_key` in `user_profiles`; validation + `invited_by` tracking + `referral_validations` table all work (`inviteCodeService.ts`) |
| Transactional email | ✅ **Resend is live** — donation receipts (`donations@spiritdao.org`), community emails (`community@spiritdao.org`), email digest. New templates are cheap. |
| Invite links (URL param) | ❌ None. Codes are typed manually into the entry modal. `app/page.tsx` doesn't read `?invite=`. |
| Pod membership grant | ⚠️ Leader-driven only: approving leader's smart wallet calls `mintHat` (they wear the management hat = on-chain mint authority) + `pod_members` DB row. No server-side path for arbitrary pods (only TN has HatMinter authority). |

## Feature 1 — Invite by email (individual or bulk)

**Effort: small.** All infrastructure exists; this is a template + API route + UI + one URL-param handler.

### Build pieces

1. **`email_invites` table** — `id, sender_wallet, email, pod_id (nullable), invite_code, sent_at, accepted_at, accepted_wallet`. Gives dedup ("already invited"), attribution, and a "your invite was accepted" story later.
2. **API route `POST /api/invites/email`** (JWT-auth'd):
   - Body: `{ emails: string[], podId?: string }` — one or many (bulk = same route).
   - Uses the sender's existing `referral_key` as the code — no new code system.
   - Boilerplate template (fixed copy — sender cannot inject arbitrary content, only their name/pod flow in):
     > **{FirstName} {LastName}** {from **{Pod Name}**} is inviting you to join SpiritDAO — a community of communities building better ways to live and decide together.
     > [Get started →] (button → `https://app.spiritdao.org/?invite=CODE`)
   - From: `community@spiritdao.org` via Resend.
   - **Rate limits**: e.g. 20 invites/day per member, max 50 per bulk call; skip emails already in `user_profiles` or already invited in last 30 days.
3. **`?invite=CODE` landing handler** (`app/page.tsx`): on load, if the param is present and no wallet/session exists, pre-validate the code and store it in sessionStorage exactly as the modal does — the new visitor never sees the referral question at all; the modal shows a "Invited by {name}" touch instead. *(Contained change: it feeds the existing `validated_invite_code` state; the fragile auth chain is untouched.)*
4. **UI**: an "Invite friends" action — natural home is `/identity/` (near the referral key) and/or the Members page. Textarea for emails (comma/newline separated), optional "from pod" selector listing pods the sender belongs to.

### Notes
- Invite emails are transactional (personal invitation, not marketing) — fine to send without list-consent, but keep the footer honest: who sent it, and that no further emails follow unless they join.
- Bulk = loop server-side with the same template; Resend handles volume fine at our scale.

## Feature 2 — Pod invite links with auto-membership

**Effort: medium.** The link/acceptance part is easy; **the on-chain hat mint without a leader present is the one real design decision.**

### Build pieces

1. **`pod_invite_links` table** — `id, pod_id, code (unique slug), role_id (which member role to grant), created_by, expires_at, max_uses, use_count, revoked_at`.
2. **Leader UI** (pod Manage → Members or Settings): "Create invite link" → picks role (member roles only — never leader roles), expiry, max uses; gets `https://app.spiritdao.org/?invite=POD-CODE`. List + revoke existing links.
3. **Acceptance flow**: link click → same `?invite=` handler recognizes a pod-link code →
   - New visitor: normal signup (the pod link also satisfies the platform referral; `invited_by` = link creator).
   - After auth (or immediately for an existing member): server route validates link (unexpired, unrevoked, under max uses) → **grants membership**.
4. **The membership grant — two-layer**:
   - **Immediately (DB)**: insert `pod_members` row + record link usage. This unlocks chat, forum, KB, events, surveys — everything gated by the DB-first permission system — the moment they accept. The member experiences "I clicked the link and I'm in."
   - **On-chain hat** (needed for fund features + strict System-B checks): see decision below.

### Decision needed: how the hat gets minted with no leader in the loop

| Option | How | Trade-offs |
|---|---|---|
| **A. Leader batch-mint queue (recommended to start)** | Acceptances queue as "pending hat mints"; pod leaders see a banner in Manage → Members and batch-mint with one gasless click (reuses the exact `mintHat` flow from application approval). | No new contract, no new authority, ships fast. Members are DB-members instantly but wait for a leader click before fund-level features. Mirrors how application approval already works. |
| **B. Server mint authority (fully automatic)** | A small contract (or extension of PodCreationManagerV2, which already wears the COMMUNITY_PODS_PARENT hat — the admin of every pod tree) exposes `mintMemberHat(hatId, recipient)` to authorized callers; the accept route mints instantly, gasless. | True "click → full member." But: new contract deploy + paymaster whitelist + audit of the authority surface (a bug mints arbitrary pod hats). Do as phase 2 if link volume justifies it. |

### Guardrails
- Links grant **member** roles only; leader roles always go through explicit approval.
- Expiry + max-uses + revocation on every link; creating links requires pod leadership (server-checked, leader-or-exec, same pattern as the modules route).
- Eligibility interplay: if the pod has eligibility criteria (e.g. TreeGens $TGN gate) — decide per pod whether a link **bypasses** or **still enforces** criteria. Default: still enforce (link = invitation, not exemption); add a per-link `skip_eligibility` flag only if a real need appears.
- Pulse: record `member_joined_pod` events on acceptance for the activity feed.

## Suggested build order

1. Feature 1 complete + the shared `?invite=` handler (small, immediately useful, and the handler is a prerequisite for Feature 2).
2. Feature 2 with **Option A** (batch-mint queue).
3. Option B contract only if/when link-driven growth makes leader batch-minting a bottleneck.
