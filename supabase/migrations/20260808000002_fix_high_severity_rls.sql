-- Fix HIGH-severity permissive write policies found in the G2b RLS audit
-- (src/guides/architecture/RLS_AUDIT_2026-08-08.md). Each table below had
-- write policies of `true` or `auth.uid() IS NOT NULL` (any logged-in user).
-- Reuses public.is_pod_leader_current_user(uuid) from
-- 20260808000001_fix_pod_role_permissions_rls.sql. Reads left unchanged.
-- Reversible: drop the new policies and recreate the old permissive ones.
-- service_role policies are preserved everywhere (server routes need them).

-- Helper: is the current caller the wallet in question? (case-insensitive,
-- SECURITY DEFINER so it can read user_profiles regardless of caller visibility)
create or replace function public.is_current_user_wallet(target_wallet text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid()
      and lower(up.wallet_address) = lower(target_wallet)
  );
$$;
revoke all on function public.is_current_user_wallet(text) from public;
grant execute on function public.is_current_user_wallet(text) to authenticated, service_role;

-- ── pod_members ──────────────────────────────────────────────────────────────
-- Was: INSERT/UPDATE `true` (anyone could forge/alter membership). Membership
-- writes happen (a) when a leader manages members and (b) during a user's own
-- onboarding/self-join. Allow either: a pod leader, OR the caller acting on
-- their OWN wallet row. (Most membership is actually written server-side via
-- the service role, which is unaffected.)
drop policy if exists "Anyone can insert pod members" on public.pod_members;
drop policy if exists "Anyone can update pod members" on public.pod_members;

create policy "Leaders or self can insert pod members"
  on public.pod_members for insert to authenticated
  with check (
    public.is_pod_leader_current_user(pod_id)
    or public.is_current_user_wallet(wallet)
  );

create policy "Leaders or self can update pod members"
  on public.pod_members for update to authenticated
  using (
    public.is_pod_leader_current_user(pod_id)
    or public.is_current_user_wallet(wallet)
  )
  with check (
    public.is_pod_leader_current_user(pod_id)
    or public.is_current_user_wallet(wallet)
  );

-- ── pods (INSERT only; UPDATE/DELETE are already leader-gated) ────────────────
-- Was: INSERT `true`. Pod creation must record the creator honestly — require
-- the caller to be creating a pod under their OWN wallet as created_by_address.
drop policy if exists "Allow authenticated users to create pods" on public.pods;

create policy "Authenticated users create pods as themselves"
  on public.pods for insert to authenticated
  with check (public.is_current_user_wallet(created_by_address));

-- ── forum_templates (global admin resource) ──────────────────────────────────
-- Was: INSERT/UPDATE/DELETE = auth.uid() IS NOT NULL (any logged-in user could
-- manage GLOBAL forum templates). These are platform-wide, not pod-scoped, so
-- restrict to the admin-token holder (the existing "ALL" policy already uses
-- has_admin_token; drop the permissive per-command overrides so ALL governs).
drop policy if exists "forum_templates_insert" on public.forum_templates;
drop policy if exists "forum_templates_update" on public.forum_templates;
drop policy if exists "forum_templates_delete" on public.forum_templates;
-- The remaining ALL policy "Allow token holders to manage templates"
-- (has_admin_token) now solely governs writes.

-- ── hats_module_deployments (pod-scoped infra records) ────────────────────────
-- Was: all writes = auth.uid() IS NOT NULL. Scope to the pod's leaders.
drop policy if exists "Authenticated users can create module deployments" on public.hats_module_deployments;
drop policy if exists "Pod managers can update their module deployments" on public.hats_module_deployments;
drop policy if exists "Pod managers can delete their module deployments" on public.hats_module_deployments;

create policy "Pod leaders can create module deployments"
  on public.hats_module_deployments for insert to authenticated
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can update module deployments"
  on public.hats_module_deployments for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));
create policy "Pod leaders can delete module deployments"
  on public.hats_module_deployments for delete to authenticated
  using (public.is_pod_leader_current_user(pod_id));

-- ── pod_audit_log (append-only, must not be forgeable) ───────────────────────
-- Was: INSERT `true`. An audit row should be attributable — require the
-- performed_by wallet to be the caller. (UPDATE/DELETE already `false`.)
drop policy if exists "Authenticated users can insert audit logs" on public.pod_audit_log;

create policy "Users can insert audit logs as themselves"
  on public.pod_audit_log for insert to authenticated
  with check (public.is_current_user_wallet(performed_by));
