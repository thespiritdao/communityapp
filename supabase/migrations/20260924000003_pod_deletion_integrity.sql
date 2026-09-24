-- Applied to production 2026-09-24.
-- Pod deletion: the multi-leader approval is enforced by the database.
--
-- Before (found 2026-09-24):
--   * pods DELETE only required the caller to be a pod leader, so any single
--     leader could delete a pod through the API regardless of proposals.
--   * pod_deletion_proposals allowed any member to INSERT/UPDATE/DELETE, and
--     add_pod_deletion_approval() appended whatever address it was given,
--     so approvals, required_approvals and status could all be forged.
--
-- After:
--   * Proposals are created by /api/pod-deletion/create-proposal (service
--     role). Members cannot insert or delete them.
--   * add_pod_deletion_approval() adds only the caller's own wallet, only if
--     the caller leads the pod, only while the proposal is pending and not
--     expired. It marks the proposal approved when distinct approvals from
--     the pod's current leaders reach required_approvals.
--   * Leaders may record the outcome afterwards (executed / failed and the
--     related columns); every other column is fixed.
--   * A pod can be deleted only by one of its leaders AND only with an
--     approved, unexpired proposal whose approvals still come from enough
--     current leaders (pod_deletion_authorized).

begin;

-- Distinct approvals that still belong to current leaders of the pod.
create or replace function public.pod_deletion_valid_approvals(p_proposal_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct lower(a))::integer
  from public.pod_deletion_proposals pr
  join public.pods p on p.id = pr.pod_id
  cross join lateral unnest(pr.current_approvals) a
  where pr.id = p_proposal_id
    and (lower(a) = any (select lower(x) from unnest(p.pod_leads) x)
         or lower(a) = lower(p.created_by_address));
$$;
revoke execute on function public.pod_deletion_valid_approvals(uuid) from public, anon;
grant execute on function public.pod_deletion_valid_approvals(uuid) to authenticated;

create or replace function public.pod_deletion_authorized(p_pod_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pod_deletion_proposals pr
    where pr.pod_id = p_pod_id
      and pr.status = 'approved'
      and (pr.expires_at is null or pr.expires_at > now())
      and public.pod_deletion_valid_approvals(pr.id) >= greatest(pr.required_approvals, 1)
  );
$$;
revoke execute on function public.pod_deletion_authorized(uuid) from public, anon;
grant execute on function public.pod_deletion_authorized(uuid) to authenticated;

-- ── pods: delete needs an approved proposal ─────────────────────────────
drop policy if exists "Pod leaders can delete pods" on public.pods;
create policy "Pod leaders can delete pods" on public.pods
  for delete to authenticated
  using (public.is_pod_leader_current_user(id) and public.pod_deletion_authorized(id));

-- ── proposals ───────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can create pod deletion proposals" on public.pod_deletion_proposals;
drop policy if exists "Authenticated users can delete pod deletion proposals" on public.pod_deletion_proposals;
drop policy if exists "Authenticated users can update pod deletion proposals" on public.pod_deletion_proposals;
drop policy if exists "Pod leaders record deletion outcome" on public.pod_deletion_proposals;
create policy "Pod leaders record deletion outcome" on public.pod_deletion_proposals
  for update to authenticated
  using (public.is_pod_leader_current_user(pod_id))
  with check (public.is_pod_leader_current_user(pod_id));

create or replace function public.pod_deletion_proposals_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bad text[];
begin
  if auth.role() is distinct from 'authenticated'
     or current_setting('app.pod_deletion_approval', true) = 'on' then
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'executed_at', 'executed_by', 'hat_deactivation_tx',
                               'execution_error', 'updated_at'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Deletion proposal fields cannot be changed directly: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'approved' and new.status in ('executed', 'failed')) then
    raise exception 'A proposal can only move from approved to executed or failed'
      using errcode = '42501';
  end if;
  if new.executed_by is distinct from old.executed_by
     and not public.is_my_wallet(new.executed_by) then
    raise exception 'executed_by must be your own wallet' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pod_deletion_proposals_guard on public.pod_deletion_proposals;
create trigger trg_pod_deletion_proposals_guard
  before update on public.pod_deletion_proposals
  for each row execute function public.pod_deletion_proposals_guard();

-- Same signature the approval flow already calls; approver_address must be
-- the caller's own wallet (it used to be trusted as given).
create or replace function public.add_pod_deletion_approval(proposal_id uuid, approver_address text)
returns public.pod_deletion_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.pod_deletion_proposals;
  v_approver text := lower(approver_address);
begin
  select * into v_proposal from public.pod_deletion_proposals where id = proposal_id for update;
  if not found then
    raise exception 'Proposal not found';
  end if;
  if not public.is_my_wallet(v_approver) then
    raise exception 'You can only approve with your own wallet' using errcode = '42501';
  end if;
  if not public.is_pod_leader_current_user(v_proposal.pod_id) then
    raise exception 'Only pod leaders can approve deletion' using errcode = '42501';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'This proposal is no longer pending (status: %)', v_proposal.status;
  end if;
  if v_proposal.expires_at is not null and v_proposal.expires_at <= now() then
    raise exception 'This proposal has expired';
  end if;
  if v_approver = any (select lower(x) from unnest(v_proposal.current_approvals) x) then
    raise exception 'Address has already approved this proposal';
  end if;

  perform set_config('app.pod_deletion_approval', 'on', true);
  update public.pod_deletion_proposals
  set current_approvals = array_append(current_approvals, v_approver),
      updated_at = now()
  where id = proposal_id
  returning * into v_proposal;

  insert into public.pod_audit_log (pod_id, action, performed_by, details)
  values (
    v_proposal.pod_id, 'deletion_approved', v_approver,
    jsonb_build_object(
      'proposal_id', proposal_id,
      'approvals_count', cardinality(v_proposal.current_approvals),
      'required_approvals', v_proposal.required_approvals
    )
  );

  if public.pod_deletion_valid_approvals(proposal_id) >= greatest(v_proposal.required_approvals, 1) then
    update public.pod_deletion_proposals
    set status = 'approved'
    where id = proposal_id
    returning * into v_proposal;
  end if;
  perform set_config('app.pod_deletion_approval', 'off', true);

  return v_proposal;
end;
$$;
revoke execute on function public.add_pod_deletion_approval(uuid, text) from public, anon;
grant execute on function public.add_pod_deletion_approval(uuid, text) to authenticated;

commit;
