# Cron Jobs — Catalog

*Last updated: 2026-05-23*

All cron jobs run on Vercel's cron scheduler, defined in
`vercel.json`. Each job is a route under `src/app/api/cron/`. This
catalog exists so you can see the full schedule + failure modes at a
glance before adding job #11.

## The schedule

| Schedule | Path | Purpose |
|---|---|---|
| `*/2 * * * *` | `cron/community-agent/process-mentions` | Process queued @-mentions of pod AI agents |
| `*/5 * * * *` | `cron/update-pending-bounties-v3` | Refresh bounty state from chain → DB |
| `*/5 * * * *` | `cron/update-pending-bids` | Refresh bid state from chain → DB |
| `*/5 * * * *` | `cron/process-settlements` | Settle Stripe holds → mint $SYSTEM via Exec Pod |
| `*/30 * * * *` | `cron/voting-reminders` | Notify eligible voters of active proposals |
| `0 */6 * * *` | `cron/event-reminders` | Notify event registrants ahead of start time |
| `0 12 * * *` | `cron/community-agent/daily-post` | Each subscribed pod's agent posts daily |
| `0 14 * * *` | `cron/email-digest-daily` | Daily email digest (notification preferences-driven) |
| `0 14 * * 1` | `cron/email-digest` | Weekly Monday digest |
| `0 14 * * 0` | `cron/community-agent/weekly-events` | Each agent posts weekly events summary |
| `0 0 * * *` | `cron/community-agent/check-subscriptions` | Audit agent subscriptions, expire/notify |

All times are UTC.

## Job conventions

Every cron route follows the same shape:

```typescript
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // 1. Auth check
  if (!isAuthorizedCron(req)) return 401;

  // 2. Work loop
  const results = [];
  for (const target of await findWork()) {
    try { results.push(await processOne(target)); }
    catch (e) { results.push({ target, error: e.message }); }
  }

  // 3. Return summary for Vercel logs
  return NextResponse.json({ processed: results.length, results });
}
```

### Auth

Vercel cron requests carry an `Authorization: Bearer <CRON_SECRET>`
header. Routes check this via a small helper (varies per route — some
inline, some use a shared util). Without the secret, the route 401s.

**Never expose a cron route without auth.** They're scheduled to run
unattended; an unauthenticated invocation can trigger side effects
(mints, emails, notifications).

### Idempotency

Most jobs are designed to be safely re-runnable:

- Bounty/bid updaters compare on-chain state to DB and only write
  diffs.
- Settlement processor uses a `status` column to skip already-handled
  rows.
- Email digests check a `last_sent_at` timestamp per user to avoid
  duplicates.
- Voting reminders deduplicate by `(user_id, proposal_id,
  reminder_kind)`.

When adding a new job, build in idempotency from the start. Vercel
can retry on transient failure.

### Failure modes

Each job logs to Vercel's runtime console. Failures don't auto-page;
operational monitoring is by reading logs or noticing downstream
breakage (no digest arrived, etc.).

Common patterns:

| Failure | Symptom | Where to look |
|---|---|---|
| Stripe webhook delayed | Settlement stuck in `processing` | `cron/process-settlements`, Stripe dashboard |
| RPC rate limit | Bounty state stale | `cron/update-pending-bounties-v3` logs |
| SMTP / email provider down | No digests | `cron/email-digest*` logs |
| Pinecone outage | Agent posts skipped | `cron/community-agent/*` logs |

## Notable per-job context

### `update-pending-bounties-v3`

V3 is the active version. V1 and V2 are kept in the codebase for
historical reference but are no longer scheduled in `vercel.json`. The
v3 differences are mostly around milestone state and dispute handling.

### `process-settlements`

The settlement pipeline turns Stripe payments into $SYSTEM mints:

1. Stripe webhook writes a `pending` row.
2. This cron picks it up, validates the hold period has passed.
3. Routes to Exec Pod approval (notification to leaders).
4. Exec leader approves → mint $SYSTEM via the treasury approval flow.

See `donations-and-claims-bridge.md` (not yet written; consider
adding if you touch this code).

### `community-agent/process-mentions`

When a forum post mentions a pod's AI agent (e.g. `@SpiritAgent`), the
mention is queued in DB. This cron processes the queue every 2
minutes:

1. Fetch unprocessed mentions
2. For each: load pod's agent config + corpus context (Pinecone)
3. Generate reply via the agent service
4. Post reply as the agent's user
5. Mark mention processed

Each subscribed pod can have one agent (free) or a paid agent with
extended capabilities. Subscription state is checked in
`check-subscriptions`.

### `voting-reminders`

Half-hourly because proposals are short and the reminder window is
narrow. Filters by:

- Proposal is active (not closed/canceled)
- User is eligible to vote (governance participation flag)
- User hasn't voted yet
- User hasn't been reminded for this proposal recently

## Adding a new cron job

1. Create `src/app/api/cron/<name>/route.ts` following the shape above.
2. Add an entry to `vercel.json`'s `crons` array.
3. Implement auth via the shared cron-auth helper.
4. Build in idempotency.
5. **Update this doc** with the new entry.

## Operational guidance

- **To run a cron job manually for testing:** call its route with the
  `Authorization` header set to your `CRON_SECRET`. Use `curl` or
  Postman.
- **To suspend a cron job:** comment it out in `vercel.json`. Vercel
  redeploys the cron schedule on each deploy.
- **To debug a stuck job:** check Vercel function logs (filtered by
  the route path) for the last successful run.

## File map

| Path | Role |
|---|---|
| `vercel.json` | Schedule definitions (single source of truth) |
| `src/app/api/cron/*/route.ts` | Job implementations |
