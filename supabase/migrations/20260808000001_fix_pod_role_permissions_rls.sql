-- Fix: pod_role_permissions was writable by ANY authenticated user
-- (INSERT/UPDATE/DELETE/ALL policies all evaluated `true`), letting anyone
-- grant themselves any capability in any pod. See
-- src/guides/architecture/RLS_AUDIT_2026-08-08.md.
--
-- This replaces the four permissive write policies with pod-leadership checks,
-- mirroring the proven pattern already used on `pods` (UPDATE/DELETE) and
-- `knowledge_items` (INSERT): the caller's wallet must be in the target pod's
-- pod_leads array OR be the pod's created_by_address.
--
-- Reads are intentionally left open (permissions are not secret) and the
-- service_role full-access policy is preserved (server routes use it).
--
-- Reversible: to roll back, DROP the four new policies and recreate the old
-- `... using (true)` versions.

-- Helper: is the current authenticated caller a leader of this pod?
-- SECURITY DEFINER so it can read pods/user_profiles regardless of the caller's
-- own row-level visibility; STABLE + schema-qualified for RLS use.
create or replace function public.is_pod_leader_current_user(target_pod_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Case-insensitive wallet comparison: pod_leads stores checksummed addresses
  -- (0x6A2d…) while user_profiles.wallet_address is lowercase (0x6a2d…), so an
  -- exact-case `= ANY(pod_leads)` silently fails for real leaders. Lowercase
  -- both sides. (The existing pods/knowledge_items policies have this same
  -- latent bug; tracked in RLS_AUDIT_2026-08-08.md for a follow-up.)
  with me as (
    select lower(up.wallet_address) as wallet
    from public.user_profiles up
    where up.user_id = auth.uid()
    limit 1
  )
  select exists (
    select 1
    from public.pods p, me
    where p.id = target_pod_id
      and (
        me.wallet = any (select lower(x) from unnest(p.pod_leads) as x)
        or lower(p.created_by_address) = me.wallet
      )
  );
$$;

revoke all on function public.is_pod_leader_current_user(uuid) from public;
grant execute on function public.is_pod_leader_current_user(uuid) to authenticated, service_role;

-- Drop the permissive write policies (names verified against live DB 2026-08-08).
drop policy if exists "Pod leaders can manage permissions"            on public.pod_role_permissions;
drop policy if exists "Authenticated users can insert role permissions" on public.pod_role_permissions;
drop policy if exists "Authenticated users can update role permissions" on public.pod_role_permissions;
drop policy if exists "Authenticated users can delete role permissions" on public.pod_role_permissions;

-- Recreate them, leader-gated. pod_id on this table is the target pod.
create policy "Pod leaders can insert role permissions"
  on public.pod_role_permissions for insert to authenticated
  with check (public.is_pod_leader_current_user(pod_id));

create policy "Pod leaders can update role permissions"
  on public.pod_role_permissions for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));

create policy "Pod leaders can delete role permissions"
  on public.pod_role_permissions for delete to authenticated
  using (public.is_pod_leader_current_user(pod_id));

-- NOTE: the "Service role full access to role permissions" (ALL, service_role)
-- policy is intentionally left in place — server-side routes with the service
-- key must retain full access.
