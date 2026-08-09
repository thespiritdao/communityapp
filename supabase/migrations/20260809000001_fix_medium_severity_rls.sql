-- Fix MEDIUM-severity permissive write policies (G2b RLS audit).
-- Three of the six flagged tables genuinely needed tightening; the other three
-- (community_agent_posts, dm_blocks, relay_tasks) were already correct
-- (service-role or self-scoped) and are left untouched.
-- Uses public.is_current_user_wallet(text) from 20260808000002. Reversible.

-- ── order_status_history ─────────────────────────────────────────────────────
-- Was: INSERT/UPDATE/DELETE all `true`. This is an append-only audit trail of
-- who changed an order's status. Make it: INSERT attributed to the caller;
-- no UPDATE/DELETE by users (history is immutable — server/service role only).
drop policy if exists "allow_authenticated_insert_status_history" on public.order_status_history;
drop policy if exists "allow_authenticated_update_status_history" on public.order_status_history;
drop policy if exists "allow_authenticated_delete_status_history" on public.order_status_history;
drop policy if exists "Users insert own status history" on public.order_status_history;

create policy "Users insert own status history"
  on public.order_status_history for insert to authenticated
  with check (public.is_current_user_wallet(changed_by_address));
-- (no user UPDATE/DELETE policies → those actions are denied for non-service
--  roles; the pre-existing service_role grant, if any, still applies.)

-- ── hat_metadata_cache ───────────────────────────────────────────────────────
-- Was: INSERT `true` (anon could poison the cache). It's a non-sensitive
-- IPFS metadata cache, but writes should at least require a session.
-- UPDATE/DELETE are already authenticated/service — align INSERT to match.
drop policy if exists "Public insert access for hat metadata" on public.hat_metadata_cache;
drop policy if exists "Authenticated insert access for hat metadata" on public.hat_metadata_cache;

create policy "Authenticated insert access for hat metadata"
  on public.hat_metadata_cache for insert to authenticated
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── proposal_metadata ────────────────────────────────────────────────────────
-- Was: INSERT/UPDATE `true`. This is the off-chain display record for a
-- governance proposal (title/description/tags). Anyone could forge a proposal
-- row or rewrite an existing proposal's text. Scope writes to the proposer.
drop policy if exists "Anyone can create proposal metadata" on public.proposal_metadata;
drop policy if exists "Anyone can update proposal metadata" on public.proposal_metadata;
drop policy if exists "Proposer can create proposal metadata" on public.proposal_metadata;
drop policy if exists "Proposer can update proposal metadata" on public.proposal_metadata;

create policy "Proposer can create proposal metadata"
  on public.proposal_metadata for insert to authenticated
  with check (public.is_current_user_wallet(proposer_address));
create policy "Proposer can update proposal metadata"
  on public.proposal_metadata for update to authenticated
  using (public.is_current_user_wallet(proposer_address))
  with check (public.is_current_user_wallet(proposer_address));

-- NOT CHANGED (already correct): community_agent_posts (service_role writes),
-- dm_blocks (self-scoped via jwt wallet), relay_tasks (service_role writes).
