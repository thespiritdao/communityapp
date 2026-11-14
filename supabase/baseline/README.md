# Database baseline

*Generated 2026-11-14 from the reference deployment. Structure only: no rows,
no member data.*

Use these files to create the database for a new instance. Apply them in order
to an empty Supabase project, as the `postgres` role (SQL editor or `psql`):

| File | Contents |
|---|---|
| `00_prerequisites.sql` | Extensions (`uuid-ossp`, `hstore` in `public`) and the `community_agent` database role used by community agents. |
| `01_schema.sql` | The whole `public` schema: 146 tables, 13 views, 157 functions, 100 triggers, 373 Row Level Security policies and all grants. RLS is enabled on every table, and the `anon` role has no table grants. |
| `02_storage.sql` | 13 storage buckets and their 39 access policies. |

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/00_prerequisites.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/01_schema.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline/02_storage.sql
```

## After applying

1. **Enable the access-token hook.** In the Supabase dashboard, Authentication,
   Hooks: set the custom access token hook to `public.custom_access_token_hook`.
   It stamps each session with the member's wallet address and the agent role.
   Without it, Row Level Security sees no wallet and members can read almost
   nothing.
2. **Disable public email sign-up.** Authentication, Providers, Email. Members
   sign in through Coinbase embedded wallets; the server issues Supabase
   sessions.
3. **Create the structural pods.** Insert your governance pod and community
   parent pod rows, deploy their hats, and set `management_hat_id` on each.
   Put their ids in `NEXT_PUBLIC_GOVERNANCE_POD_ID` and
   `NEXT_PUBLIC_COMMUNITY_POD_ID` (see `docs/configuration.md`).

## How this relates to `supabase/migrations/`

`supabase/migrations/` is the change history of the reference deployment. It
does not create the database from nothing: the earliest tables were created by
hand, and some changes were applied from a separate, now-retired migration
stream. The baseline captures the end result of all of it.

For a new instance: apply the baseline, then any migration in
`supabase/migrations/` dated after 2026-11-14.

## Verification

The baseline was applied to an empty PostgreSQL 16 database with minimal
stand-ins for Supabase's `auth` and `storage` schemas and default roles. It
applied without errors, and the table, view, function, trigger, policy, bucket
and grant counts matched the reference deployment exactly.

## Regenerating

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-comments \
  | grep -v '^CREATE SCHEMA public;$' > supabase/baseline/01_schema.sql
```

`02_storage.sql` is generated from `storage.buckets` and `pg_policies`
(schema `storage`). Re-scan any regenerated file for literals before committing.
