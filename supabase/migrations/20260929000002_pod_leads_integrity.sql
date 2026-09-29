-- Applied to production 2026-09-29 (dry-run 13/13 in a rolled-back transaction first).
-- Pod leadership: nobody can make themselves (or a second account) a leader.
--
-- Before (found 2026-09-24, fixed 2026-09-29):
--   * pods UPDATE ("Pod leaders can update pods") let any leader rewrite
--     pods.pod_leads and created_by_address. Both count as "leader" in
--     is_pod_leader_current_user, session_leads_pod, pod_deletion_valid_approvals
--     and 9 policies, so a leader could add sock-puppet leaders who then pass
--     every leader check and count as pod-deletion approvers.
--   * A leader application could be marked 'approved' by one leader regardless
--     of votes, and required_votes was whatever the applicant's browser sent.
--
-- After (browser writes only; the service role and pod creation are unchanged):
--   * A leader application can become 'approved' only when votes from current
--     leaders — voting_leaders plus the approving leader, whose click is the
--     final vote (the UI's model) — reach half the current leaders, rounded up
--     (the app's existing rule: apply page requiredVotes = ceil(leads / 2)).
--     The applicant-supplied required_votes is ignored for this check.
--   * pods.pod_leads: a wallet can be added only if it has an approved leader
--     application for that pod; a leader can remove only themselves (removing
--     someone else goes through PATCH /api/pods/[id]/members, which checks the
--     hat on-chain). created_by_address cannot be changed.
--
-- "Current leaders" = pods.pod_leads ∪ created_by_address, lowercased — the
-- same set is_pod_leader_current_user uses.

begin;

create or replace function public.pod_current_leaders(p_pod_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct w), '{}')
  from (
    select lower(x) as w from public.pods p, unnest(coalesce(p.pod_leads, '{}')) x
      where p.id = p_pod_id
    union
    select lower(p.created_by_address) from public.pods p
      where p.id = p_pod_id and p.created_by_address is not null
  ) s
  where w is not null and w <> '';
$$;

revoke all on function public.pod_current_leaders(uuid) from public, anon, authenticated;

-- ── Leader applications need the leaders' votes ─────────────────────────────
create or replace function public.enforce_leader_application_quorum()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_leaders text[];
  v_me text;
  v_votes int;
  v_needed int;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if new.status is distinct from 'approved'
     or old.status = 'approved'
     or coalesce(new.intended_role, 'member') <> 'leader' then
    return new;
  end if;

  v_leaders := public.pod_current_leaders(new.pod_id);
  select lower(up.wallet_address) into v_me
    from public.user_profiles up where up.user_id = auth.uid() limit 1;

  select count(distinct v) into v_votes
  from (
    select lower(x) as v from unnest(coalesce(new.voting_leaders, '{}')) x
    union
    select v_me
  ) s
  where v = any (v_leaders);

  v_needed := greatest(ceil(cardinality(v_leaders) / 2.0)::int, 1);

  if v_votes < v_needed then
    raise exception 'This leader application needs % leader vote(s); it has %', v_needed, v_votes
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_leader_application_quorum() from public, anon, authenticated;

drop trigger if exists trg_leader_application_quorum on public.pod_membership_applications;
create trigger trg_leader_application_quorum
  before update of status on public.pod_membership_applications
  for each row execute function public.enforce_leader_application_quorum();

-- ── pods.pod_leads / created_by_address from the browser ────────────────────
create or replace function public.enforce_pod_leads_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_added text[];
  v_removed text[];
  v_bad text;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if lower(coalesce(new.created_by_address, '')) is distinct from lower(coalesce(old.created_by_address, '')) then
    raise exception 'A pod''s creator cannot be changed' using errcode = '42501';
  end if;

  v_added := array(
    select distinct lower(x) from unnest(coalesce(new.pod_leads, '{}')) x
    except select lower(y) from unnest(coalesce(old.pod_leads, '{}')) y
  );
  v_removed := array(
    select distinct lower(y) from unnest(coalesce(old.pod_leads, '{}')) y
    except select lower(x) from unnest(coalesce(new.pod_leads, '{}')) x
  );

  select a into v_bad from unnest(v_added) a
  where not exists (
    select 1 from public.pod_membership_applications app
    where app.pod_id = new.id
      and lower(app.applicant_address) = a
      and app.intended_role = 'leader'
      and app.status = 'approved'
  )
  limit 1;
  if v_bad is not null then
    raise exception 'Leaders are added by an approved leader application (% has none)', v_bad
      using errcode = '42501';
  end if;

  select r into v_bad from unnest(v_removed) r where not public.is_my_wallet(r) limit 1;
  if v_bad is not null then
    raise exception 'You can only step down yourself; remove other leaders from the members panel'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pod_leads_authority() from public, anon, authenticated;

drop trigger if exists trg_pod_leads_authority on public.pods;
create trigger trg_pod_leads_authority
  before update of pod_leads, created_by_address on public.pods
  for each row execute function public.enforce_pod_leads_authority();

commit;
