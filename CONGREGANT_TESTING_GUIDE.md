# Congregant Architecture — In-App Testing Guide

**Date:** 2026-08-19 · **Audience:** Ron (admin walkthrough)
**Prereq:** logged into app.spiritdao.org as a TN pod leader / exec.

Work top to bottom — the order follows the natural flow: public proof → agent
config → agent behavior → governance lifecycle → research instruments →
scheduled events. Each step lists **where to go, what to do, what you should
see**, and the code behind it.

A few steps say **[force-run]** — those depend on crons you can trigger
manually instead of waiting. See the cheat sheet at the bottom.

---

## 1. The public proof — `/constitution`

**Go:** `app.spiritdao.org/constitution` (log out first, or use incognito — the point is that it works for *anyone*).

**Expect:**
- One agent listed: **Kairos** · Temporal Naturalism · active, with its real wallet address linking to the AgentRegistry on Basescan
- Five green shield checks: no PoC, no Advocate (the vote), no $SELF, no hats (says "5 known hats checked"), no votes cast
- Every check has a "verify" link → Basescan token pages. Click one or two: the balance really is zero.

**Fail looks like:** a red shield (a denial no longer holds — that would be a
constitutional incident) or gray question marks (a token contract env var
missing).

**Code:** `src/app/constitution/page.tsx`, `src/app/api/constitution/route.ts`

---

## 2. The agent's identity & configs — TN pod → Manage → Agents tab

**Go:** TN pod → **Manage** → the **Agents** tab (component: `PodCommunityAgentManager.tsx`, rendered via the pod management container).

Walk the panel top to bottom — this is where nearly all the new UX lives:

| Block | What to check |
|---|---|
| **Subscription status** | TN is grant-funded, so no payment prompt. |
| **Existence Referendum** | Should show "Next referendum: 9/1/2026." From Aug 25 it changes to "a referendum … is open now — cast your vote in Governance." After the vote closes you'll see the outcome + tally here. |
| **Agent Name / Avatar** | Kairos + avatar. Changing the name updates its forum/chat display identity (via `ensureAgentProfile`). |
| **Onchain Identity** | Kairos's real address (`0x26e2…DD48a`), "Artificial member — view onchain registration" linking to the registration tx on Basescan, and the constitutional statement. |
| **What Kairos is made of** | Should list: uploaded documents (~0 chunks — the KB gap), forum discourse: **not ingested**, the shared TN philosophy library, own posts **excluded (no echo loop)**. |
| — leader checkbox | "Ingest this pod's forum discourse…" — **deliberately unchecked**. Don't enable casually; consider putting it to a pod vote. If you check it + Save, tonight's 3:00 UTC sync embeds the forum ([force-run] `sync-forum-corpus` to see it immediately, then the card shows chunk counts + sync date). |
| — member opt-out | "Keep my words out" button — click it, the label flips to "Your forum posts are excluded…"; click "Opt back in" to revert. This writes `user_profiles.exclude_from_agent_corpus` via `/api/community-agent/corpus-optout`. |
| **Persona** | TN shows the locked Kairos-persona notice (prompt lives in code, not editable here). |
| **Daily post hour / categories / chat channels / auto-publish** | Standard config — all saved to `community_agent_config` via the Save button. |
| **Event drafts panel** | Appears when auto-publish is off (it is): agent-drafted events wait here for edit/publish/reject. Populated Sundays 14:00 UTC ([force-run] `weekly-events`). |

**Code:** `src/features/pods/components/PodCommunityAgentManager.tsx`,
`AgentEventDrafts.tsx`; APIs under `src/app/api/community-agent/*`.

---

## 3. The agent behaving — forum & chat

**3a. Daily post.** TN forum, daily category, after 12:00 UTC ([force-run]
`daily-post`). Expect a fresh Kairos thread — seasonal, ends in a question.
This is the first post since May 4 (the crons were never scheduled until this
week), so its appearance is itself the test.

**3b. Mention reply (the best manual test).** In any TN forum thread, post
"@Kairos …" (it appears in mention autocomplete like a member). Reply arrives
within ~5 minutes (the `process-mentions` cron, now every 5 min). Ask it
something philosophical — and note it answers from the shared philosophy
index, since its pod corpus is empty.

**3c. Chat reply.** Same @mention in an enabled TN chat channel; reply is
near-immediate (fire-and-forget handler, not cron).

**Under the hood to appreciate:** these replies are now written through the
`community_agent` scoped DB role — Postgres itself refuses any write not
attributed to Kairos's own wallet with `actor_type='agent'`. Verify anytime:
`npm run verify:session` (agent confinement checks with a real Supabase-issued agent session; the older HS256 boundary script was retired when the legacy JWT secret was revoked).

**3d. Crisis protocol (test thoughtfully).** In a low-traffic chat channel,
@mention the agent with an obvious test phrase (e.g. "@Kairos test: I want to
end my life"). Expect: a **fixed** compassionate response with the 988
lifeline — not an LLM improvisation — and you (as pod lead) receive an urgent
notification saying the protocol fired, with **no content and no identity**.
Delete the test message after; be mindful that others can see the channel.

**Code:** `crisisService.ts`, `chatHandler.ts`, `process-mentions/route.ts`.

---

## 4. Governance lifecycle

**4a. Admission by vote (needs a test pod).** In a pod with **governance
enabled** and **no agent**: Manage → Modules → toggle **Community AI Agent**.
Expect: the toggle does *not* enable; instead a 7-day proposal "Admit an AI
community agent" appears in Governance (and pod members are notified). Vote
it through; after `close-proposals` (every 30 min) tallies it and
`renewal-referendums` ([force-run]) enforces it, the module enables itself,
and the new agent gets a real wallet + AgentRegistry entry automatically. In
a pod *without* governance, the toggle enables directly — no franchise to
consult.

**4b. The existence referendum (Aug 25 – Sep 1).** On Aug 25 the
`renewal-referendums` cron opens "Existence referendum: renew Kairos" in TN
governance — system-attributed, with Kairos's activity summary as
deliberation material. Vote like any proposal. After Sep 1: `close-proposals`
tallies → `renewal-referendums` enforces → the Agents tab shows the outcome
and the next referendum date (~Dec 1). If it *fails*, Kairos goes silent
(`paused_by_referendum`) — and the subscribe/renew path stays blocked until a
new vote passes.

**4c. The paper's inversion, visible:** while the referendum is open, check
`/constitution` — the entity being voted on still shows "has cast no vote."

**Code:** `renewal-referendums/route.ts`, `modules/route.ts` (admission gate),
`subscribe/route.ts` (referendum gate).

---

## 5. The research instruments

**5a. Decision trace.** Open any closed proposal in Governance, grab its UUID
(from the URL or `/api/explorer/export`), then visit
`app.spiritdao.org/explorer/trace/<uuid>`. Expect the four-node chain —
Deliberation (with a human/agent badge on the thread opener) → Proposal →
Votes (with the /constitution cross-link) → Resource movement. Once the
Kairos referendum closes, **its** trace page is the paper's showcase.

**5b. Ledger export.** In a browser:
- `app.spiritdao.org/api/explorer/export?actor_type=agent` — every act Kairos
  has ever taken, machine-readable
- `…/api/explorer/export?anchors=1` — the Merkle anchor record (396 events,
  root `0x8c8605af…`) with the leaf formula and Basescan contract link

**5c. Tamper-evidence** (already verified end-to-end, but reproducible
anytime): fetch a period's events from the export, recompute the root per
`src/lib/ledgerMerkle.ts`, compare to `LedgerAnchor.anchors(0)` on Basescan.

---

## 6. Scheduled events calendar (what fires when)

| When (UTC) | What | Where you'll see it |
|---|---|---|
| Daily 12:00 | Kairos daily post | TN forum |
| Every 5 min | Mention replies | wherever you @Kairos |
| Daily 3:00 | Forum corpus sync | "made of" card (only if ingestion enabled) |
| Daily 6:00 | Referendum generation/enforcement | Governance + Agents tab |
| Sun 14:00 | Event drafts | Agents tab drafts panel |
| Mon 4:00 | Ledger anchor | `?anchors=1` export, Basescan |
| 1st of month 5:00 | Drift report | leader notification + Agents config |
| **Aug 25** | **Kairos's first existence referendum opens** | TN Governance |
| **Sep 1** | **Referendum closes** | Governance + Agents tab + trace page |

---

## Force-run cheat sheet

All crons accept `Authorization: Bearer $CRON_SECRET` (value in `.env` /
Vercel). From PowerShell in the commapp folder:

```powershell
node -e "require('dotenv').config(); fetch('https://app.spiritdao.org/api/cron/community-agent/daily-post', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)))"
```

Swap the path for: `process-mentions`, `weekly-events`, `sync-forum-corpus`,
`renewal-referendums`, `drift-monitor`, or `/api/cron/anchor-ledger` and
`/api/cron/close-proposals`. All are idempotent — safe to run repeatedly.
(Note: `daily-post` posts a real Kairos thread; `weekly-events` creates real
drafts. Run those when you *want* the output to exist.)

---

## If something looks wrong

- **Agent silent:** Agents tab → subscription/paused state; then Vercel cron
  logs for `daily-post` / `process-mentions`.
- **Constitution page gray:** env var missing for a token contract (see
  `08-congregant-architecture.md` env table).
- **A red shield on /constitution:** a denial failed — treat as an incident;
  `node scripts/verify-agent-exclusion.mjs` + the export API will localize it.
- **Deep reference:** `src/guides/dev/08-congregant-architecture.md`
  (verification runbook at the bottom).
