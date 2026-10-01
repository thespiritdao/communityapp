-- Applied to production 2026-10-01 (dry-run 10/10 in a rolled-back transaction first).
-- Leader invitations: nobody becomes a pod leader without accepting.
--
-- Before: whoever created a pod typed in its leaders, and every address went
-- straight into pods.pod_leads (and the on-chain pod proposal). Named people
-- never agreed; spare wallets could pose as co-leaders.
--
-- After:
--   * A pod created from the browser lists only its creator as leader
--     (BEFORE INSERT trigger; coerced rather than refused, because the
--     on-chain proposal has already been sent when the row is written).
--   * Anyone else is invited: a pod_membership_applications row with
--     intended_role 'leader' and the new status 'invited', written by the
--     server (POST /api/pods/[id]/leader-invites) with the inviting leader's
--     vote already in voting_leaders.
--   * Only the invitee can move an invitation on, through the server
--     (POST /api/pods/[id]/leader-invites/respond). Accepting approves it if
--     the leaders' votes already reach the majority rule from 20260929000002
--     (half the current leaders, rounded up — immediate in a one-leader pod);
--     otherwise it becomes 'pending' and the other leaders vote as for any
--     leader application. Declining deletes the invitation.
--   * From the browser, an invitation's status cannot be changed (leaders
--     cannot approve someone who has not accepted). Leaders may still add
--     their own vote while it waits.

begin;

alter table public.pod_membership_applications
  drop constraint if exists pod_membership_applications_status_check;
alter table public.pod_membership_applications
  add constraint pod_membership_applications_status_check
  check (status = any (array['invited', 'pending', 'approved', 'rejected']));

-- ── A new pod's only leader is its creator ──────────────────────────────────
create or replace function public.enforce_pod_creator_sole_leader()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  new.pod_leads := case
    when new.created_by_address is null then '{}'
    else array[lower(new.created_by_address)]
  end;
  return new;
end;
$$;

revoke all on function public.enforce_pod_creator_sole_leader() from public, anon, authenticated;

drop trigger if exists trg_pod_creator_sole_leader on public.pods;
create trigger trg_pod_creator_sole_leader
  before insert on public.pods
  for each row execute function public.enforce_pod_creator_sole_leader();

-- ── Invitations move only through the invitee (server) ──────────────────────
create or replace function public.enforce_leader_invitation_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if old.status = 'invited' and new.status is distinct from 'invited' then
    raise exception 'An invitation is accepted or declined by the person invited'
      using errcode = '42501';
  end if;
  if new.status = 'invited' and old.status is distinct from 'invited' then
    raise exception 'Invitations are created by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_leader_invitation_status() from public, anon, authenticated;

drop trigger if exists trg_leader_invitation_status on public.pod_membership_applications;
create trigger trg_leader_invitation_status
  before update of status on public.pod_membership_applications
  for each row execute function public.enforce_leader_invitation_status();

-- ── Public ledger: an invitation is not an application ──────────────────────
-- Same function as before, but an invitation (status 'invited') no longer
-- logs "Applied to join a pod" for someone who did not apply.
create or replace function public.pulse_log_pod_member_applied()
returns trigger
language plpgsql
security definer
as $function$
BEGIN
  IF NEW.status = 'invited' THEN
    RETURN NEW;
  END IF;
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'pod_member_applied',
      'members',
      'Applied to join a pod',
      LOWER(NEW.applicant_address),
      NEW.pod_id,
      '/pods/' || NEW.pod_id::text,
      jsonb_build_object(
        'application_id', NEW.id,
        'intended_role', NEW.intended_role
      ),
      'pod_member_applied:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

commit;
