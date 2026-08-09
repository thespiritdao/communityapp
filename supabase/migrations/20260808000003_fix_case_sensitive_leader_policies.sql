-- Fix latent case-sensitivity bug in pod-leadership RLS policies.
--
-- pods.pod_leads and pods.created_by_address can hold CHECKSUMMED addresses
-- (0x6A2d…) while user_profiles.wallet_address is always lowercase (0x6a2d…).
-- The existing policies compare them exact-case (`= ANY(pod_leads)` /
-- `created_by_address = (select wallet_address …)`), which silently FAILS for
-- any leader stored checksummed — locking real leaders out of their own pod's
-- knowledge base, modules, forum categories, and pod update/delete.
-- (Confirmed on live DB 2026-08-08: 1 pod has a checksummed lead/creator.)
--
-- Fix: route all these through public.is_pod_leader_current_user(uuid), the
-- case-insensitive helper already deployed in 20260808000001. Behaviour is
-- otherwise identical. Reversible: recreate the old exact-case policies.
-- service_role policies untouched.

-- idempotency: drop new policy names too (safe if a prior run created any)
drop policy if exists "Pod leaders can update pods" on public.pods;
drop policy if exists "Pod leaders can delete pods" on public.pods;
drop policy if exists "Pod leaders can create knowledge items" on public.knowledge_items;
drop policy if exists "Pod leaders can update knowledge items" on public.knowledge_items;
drop policy if exists "Pod leaders can delete knowledge items" on public.knowledge_items;
drop policy if exists "Pod leaders can create knowledge categories" on public.knowledge_categories;
drop policy if exists "Pod leaders can update knowledge categories" on public.knowledge_categories;
drop policy if exists "Pod leaders can delete knowledge categories" on public.knowledge_categories;
drop policy if exists "Pod leaders can create modules" on public.pod_modules;
drop policy if exists "Pod leaders can update modules" on public.pod_modules;
drop policy if exists "Pod leaders can delete modules" on public.pod_modules;
drop policy if exists "Pod leaders can create forum categories" on public.forum_categories;
drop policy if exists "Pod leaders can update forum categories" on public.forum_categories;
drop policy if exists "Pod leaders can delete forum categories" on public.forum_categories;
drop policy if exists "Pod leaders can insert forum categories" on public.forum_categories;

-- ── pods (UPDATE / DELETE) ───────────────────────────────────────────────────
drop policy if exists "Allow pod leads to update pods"       on public.pods;
drop policy if exists "Allow pod leads to delete pods"       on public.pods;
drop policy if exists "Allow treasury operations for pod managers" on public.pods;

create policy "Pod leaders can update pods"
  on public.pods for update to authenticated
  using (public.is_pod_leader_current_user(id))
  with check (public.is_pod_leader_current_user(id));

create policy "Pod leaders can delete pods"
  on public.pods for delete to authenticated
  using (public.is_pod_leader_current_user(id));

-- ── knowledge_items ──────────────────────────────────────────────────────────
drop policy if exists "Pod leaders can create knowledge items" on public.knowledge_items;
drop policy if exists "Pod leaders can update knowledge items" on public.knowledge_items;
drop policy if exists "Pod leaders can delete knowledge items" on public.knowledge_items;

create policy "Pod leaders can create knowledge items"
  on public.knowledge_items for insert to authenticated
  with check (pod_id is not null and public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can update knowledge items"
  on public.knowledge_items for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can delete knowledge items"
  on public.knowledge_items for delete to authenticated
  using (public.is_pod_leader_current_user(pod_id));

-- ── knowledge_categories ─────────────────────────────────────────────────────
drop policy if exists "Pod leaders can create knowledge categories" on public.knowledge_categories;
drop policy if exists "Pod leaders can update knowledge categories" on public.knowledge_categories;
drop policy if exists "Pod leaders can delete knowledge categories" on public.knowledge_categories;

create policy "Pod leaders can create knowledge categories"
  on public.knowledge_categories for insert to authenticated
  with check (pod_id is not null and public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can update knowledge categories"
  on public.knowledge_categories for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can delete knowledge categories"
  on public.knowledge_categories for delete to authenticated
  using (public.is_pod_leader_current_user(pod_id));

-- ── pod_modules ──────────────────────────────────────────────────────────────
drop policy if exists "Pod managers can create modules" on public.pod_modules;
drop policy if exists "Pod managers can update modules" on public.pod_modules;
drop policy if exists "Pod managers can delete modules" on public.pod_modules;

create policy "Pod leaders can create modules"
  on public.pod_modules for insert to authenticated
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can update modules"
  on public.pod_modules for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can delete modules"
  on public.pod_modules for delete to authenticated
  using (public.is_pod_leader_current_user(pod_id));

-- ── forum_categories (DELETE was the flagged one; align all writes) ───────────
drop policy if exists "Pod managers can delete their forum categories" on public.forum_categories;
drop policy if exists "Pod managers can create their forum categories" on public.forum_categories;
drop policy if exists "Pod managers can update their forum categories" on public.forum_categories;

create policy "Pod leaders can create forum categories"
  on public.forum_categories for insert to authenticated
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can update forum categories"
  on public.forum_categories for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can delete forum categories"
  on public.forum_categories for delete to authenticated
  using (public.is_pod_leader_current_user(pod_id));

-- NOTE (not fixed here — works today, flagged for consistency): events /
-- work_submissions / bounty_* policies compare creator_address to a JWT-claim
-- address; both are lowercase in current data (events: 0/146 checksummed), so
-- they function. They remain case-SENSITIVE and would break if a checksummed
-- value is ever written. Consider normalizing on write, or a follow-up pass.
