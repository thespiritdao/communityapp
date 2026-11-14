# Database Migrations — Canonical Source

**This directory (`supabase/migrations/`) is the canonical, active migration
source for the SpiritDAO app.** All new migrations go here.

> To create a database for a new instance, use [`../baseline/`](../baseline/README.md),
> not these files. They are the change history of the reference deployment:
> the earliest tables were created by hand and some changes came from a retired
> parallel stream, so replaying this directory does not produce a working
> schema. The baseline (2026-11-14) already contains everything here.

## Convention

- File names use the Supabase timestamp format: `YYYYMMDDHHMMSS_description.sql`
  (e.g. `20260616000001_self_mint_ledger.sql`). This guarantees a single,
  unambiguous apply order.
- Migration bodies should be **idempotent** where practical (`CREATE TABLE IF
  NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, guarded `ALTER`/policy drops) so a
  re-run is safe.
- Prefer one logical change per file.

## Applying

Migrations are currently applied **manually** against the production database
(there is no `supabase/config.toml` / CLI-linked project). When adding a
migration:

1. Add the timestamped `.sql` file here.
2. Apply it to the database (SQL editor / psql).
3. Note in the PR/commit that it was applied.

## Housekeeping notes

A few non-timestamped files exist here from earlier work
(`create_sensemaker_conversations.sql`, `_fix_hat_metadata_cache_rls.sql`,
`add_sentiment_to_forum_thread_summaries.sql`, `create_pod_application_votes.sql`,
and duplicate `*_fix_hat_metadata_cache_rls.sql` variants). These are RLS/DDL
fixes that are `IF`-guarded and safe; they can be left as-is or renamed to the
timestamp convention during a future cleanup. They do not affect apply order for
new migrations.

## Legacy source

An older, parallel migration stream lives in **`scripts/db-migrations/`**. It is
**legacy / manual** — see the README there. Do **not** add new migrations to it.
