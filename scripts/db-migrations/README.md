# Legacy Migrations (manual) — DO NOT ADD NEW FILES HERE

**This directory is legacy.** It was a parallel, hand-applied migration stream
used March–May 2026. The **canonical** migration source is
[`supabase/migrations/`](../../supabase/migrations/README.md) — add all new
migrations there.

This directory is kept (not deleted) because several files here have **no
equivalent** in the canonical tree and may or may not have been applied to
production. It should be treated as a historical record to be reconciled, not a
source of truth.

## ⚠️ Known issues in this directory

### Sequence-number collisions
The `NNN_` prefixes are **not unique** — the same number was reused for
unrelated migrations, so this directory **cannot be replayed by number alone**:

- `004_sub_pods_and_creation_manager.sql` (Mar 5) **vs** `004_fix_knowledge_base_rls.sql` (Apr 24)
- `005_token_claims_review_columns.sql` (Mar 10) **vs** `005_update_kb_urls_and_add_new_videos.sql` (Apr 24)
- `006_user_presence.sql` (Mar 16) **vs** `006_set_kb_thumbnails.sql` (Apr 24)

### Cross-directory overlap
Some topics were migrated in **both** trees (whichever ran last wins, and the
order isn't encoded anywhere). Known example:
- Knowledge-base RLS: `004_fix_knowledge_base_rls.sql` here **and**
  `supabase/migrations/20260126000004_add_knowledge_base_rls.sql`.

### Known-pending
- `003_forum_child_table_rls.sql` — flagged as **not yet applied** (re-enable RLS
  on forum child tables). Verify before assuming it ran.

## Reconciliation plan (future, when someone has time)

1. Audit which of these files actually ran in prod (read-only DB check).
2. For each confirmed-applied file, optionally re-export into
   `supabase/migrations/` with a proper `YYYYMMDD…` timestamp (idempotent bodies
   make this safe), then move the original into `_archived/`.
3. Apply any confirmed-pending files (starting with `003`), then archive.

Until then: **new migrations → `supabase/migrations/` only.**
