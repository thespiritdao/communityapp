-- Baseline step 1: the complete public schema (tables, views, functions,
-- triggers, Row Level Security policies, grants) of the reference deployment.
-- Structure only: no rows. Generated with pg_dump --schema-only --schema=public.
--
-- Apply once to an empty Supabase project after 00_prerequisites.sql. The
-- files in supabase/migrations/ are the history of how this schema was built
-- and are already reflected here; do not replay them on top of this file.
--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 16.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: accountability_signature_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accountability_signature_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  caller text := public.session_wallet();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF caller IS NULL OR lower(NEW.signer_address) <> caller THEN
    RAISE EXCEPTION 'pod_accountability_signatures: signer must be the signed-in wallet' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND lower(OLD.signer_address) <> caller THEN
    RAISE EXCEPTION 'pod_accountability_signatures: not your signature' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: pod_deletion_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_deletion_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    pod_name text NOT NULL,
    proposed_by text NOT NULL,
    required_approvals integer DEFAULT 2 NOT NULL,
    current_approvals text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    management_hat_id text,
    membership_hat_id text,
    hat_deactivation_tx text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    executed_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    executed_by text,
    execution_error text,
    approval_signatures jsonb DEFAULT '{}'::jsonb,
    approval_threshold_bps integer,
    CONSTRAINT pod_deletion_proposals_approval_range CHECK (((approval_threshold_bps IS NULL) OR ((approval_threshold_bps >= 5001) AND (approval_threshold_bps <= 10000)))),
    CONSTRAINT pod_deletion_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'executed'::text, 'rejected'::text, 'expired'::text, 'failed'::text])))
);


--
-- Name: add_pod_deletion_approval(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_pod_deletion_approval(proposal_id uuid, approver_address text) RETURNS public.pod_deletion_proposals
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: auto_generate_referral_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_generate_referral_key() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.referral_key IS NULL THEN
    NEW.referral_key := generate_referral_key();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: award_course_accreditation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_course_accreditation(p_category_id uuid, p_wallet text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c record;
  existing uuid;
  new_id uuid;
begin
  if p_wallet is null or p_wallet = '' then
    return null;
  end if;
  select id, pod_id, name, accreditation_name, accreditation_description, accreditation_image_url, is_course
    into c
  from knowledge_categories
  where id = p_category_id;
  if not found or not c.is_course or c.pod_id is null then
    return null;
  end if;
  if not public.course_is_complete(p_category_id, p_wallet) then
    return null;
  end if;
  select id into existing
  from accreditations
  where course_category_id = p_category_id and lower(wallet_address) = lower(p_wallet);
  if existing is not null then
    return existing;
  end if;
  insert into accreditations (pod_id, course_category_id, wallet_address, name, description, image_url, source)
  values (
    c.pod_id,
    c.id,
    lower(p_wallet),
    coalesce(nullif(trim(c.accreditation_name), ''), c.name),
    c.accreditation_description,
    c.accreditation_image_url,
    'course'
  )
  returning id into new_id;
  return new_id;
end;
$$;


--
-- Name: bids_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bids_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  changed text[];
  bad text[];
  manager boolean;
  bidder boolean;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.bounty_bid_allowed(new.bounty_id) then
      raise exception 'You are not eligible to bid on this bounty'
        using errcode = '42501';
    end if;
    new.status := 'pending';
    new.reviewer_address := null;
    new.final_approver_address := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    return new;
  end if;

  manager := public.is_bounty_manager(old.bounty_id);
  bidder := public.is_my_wallet(old.bidder_address);
  changed := public.changed_columns(to_jsonb(old), to_jsonb(new));

  bad := array(
    select unnest(changed)
    except select unnest(case when manager then
      array['status', 'reviewer_address', 'final_approver_address', 'reviewed_at', 'reviewed_by']
      else array[]::text[] end)
    except select unnest(case when bidder and old.status = 'pending' then
      array['experience', 'plan_of_action', 'deliverables', 'timeline', 'proposed_amount',
            'payment_option', 'payment_details', 'answers', 'additional_notes']
      else array[]::text[] end)
  );
  if cardinality(bad) > 0 then
    raise exception 'Not allowed to change bid fields: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: bounties_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bounties_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'payment_type', 'updated_at'])
    -- the counter moves only through increment_bids_accepted
    except select 'bids_accepted_count'
      where current_setting('app.increment_bids_accepted', true) = 'on'
  );
  if cardinality(bad) > 0 then
    raise exception 'Only the server can change bounty fields: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: bounty_approval_workflows_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bounty_approval_workflows_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  bad text[];
  added text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['current_approvals', 'approval_signatures', 'status',
                               'updated_at', 'executed_at', 'executed_by'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Approval terms cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  -- Approvals only grow, and only by the caller's own wallet.
  if not (coalesce(old.current_approvals, '{}') <@ coalesce(new.current_approvals, '{}')) then
    raise exception 'Approvals cannot be removed' using errcode = '42501';
  end if;
  added := array(select unnest(coalesce(new.current_approvals, '{}'))
                 except select unnest(coalesce(old.current_approvals, '{}')));
  if exists (select 1 from unnest(added) a where not public.is_my_wallet(a)) then
    raise exception 'You can only add your own approval' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('approved', 'executed')
     and cardinality(coalesce(new.current_approvals, '{}')) < coalesce(new.required_approvals, 1) then
    raise exception 'Not enough approvals' using errcode = '42501';
  end if;
  if new.executed_by is distinct from old.executed_by and not public.is_my_wallet(new.executed_by) then
    raise exception 'executed_by must be your own wallet' using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: bounty_bid_allowed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bounty_bid_allowed(p_bounty_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b record;
  g record;
  has_unverifiable boolean := false;
  v_wallet text := lower(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
    current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
    ''
  ));
begin
  select id, required_pod_id, restriction_level, creator_address
    into b
  from public.bounties
  where id = p_bounty_id;
  if not found then
    return false;
  end if;

  if b.restriction_level = 'pod_members' then
    if b.required_pod_id is null then
      return true;
    end if;
    return public.is_pod_member_current_user(b.required_pod_id)
        or public.is_pod_leader_current_user(b.required_pod_id);
  end if;

  if b.restriction_level = 'token_holders' then
    for g in
      select token_type, contract_address, hat_id
      from public.bounty_token_gates
      where bounty_id = p_bounty_id
    loop
      if g.token_type = 'pod' and g.contract_address is not null then
        begin
          if public.is_pod_member_current_user(g.contract_address::uuid)
             or public.is_pod_leader_current_user(g.contract_address::uuid) then
            return true;
          end if;
        exception when others then
          null;
        end;
      elsif g.token_type = 'event' and g.contract_address is not null then
        begin
          if exists (
            select 1
            from public.event_registrations er
            where er.event_id = g.contract_address::uuid
              and lower(er.user_address) = v_wallet
              and (
                er.checked_in_at is not null
                or er.completed_at is not null
                or er.registration_status in ('checked_in', 'completed')
              )
          ) then
            return true;
          end if;
        exception when others then
          null;
        end;
      elsif g.token_type = 'accreditation' and g.contract_address is not null then
        begin
          if exists (
            select 1
            from public.accreditations a
            where a.course_category_id = g.contract_address::uuid
              and lower(a.wallet_address) = v_wallet
              and a.revoked_at is null
          ) then
            return true;
          end if;
        exception when others then
          null;
        end;
      elsif g.token_type = 'hat' then
        if exists (
          select 1
          from public.pod_members pm
          where pm.is_active = true
            and lower(pm.wallet) = v_wallet
            and pm.hat_id is not null
            and public.hat_id_numeric(pm.hat_id)
                = public.hat_id_numeric(coalesce(g.contract_address, g.hat_id::text))
        ) then
          return true;
        end if;
        if g.contract_address is null then
          has_unverifiable := true;
        end if;
      else
        has_unverifiable := true;
      end if;
    end loop;
    return has_unverifiable;
  end if;

  return true;
end;
$$;


--
-- Name: can_fulfill_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_fulfill_order(p_order_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select exists (
    select 1
    from public.marketplace_orders o
    left join public.products p on p.id = o.product_id
    where o.id = p_order_id
      and (
        (p.owner_id is not null and p.owner_id = auth.uid()::text)
        or public.is_my_wallet(p.creator_wallet)
        or public.is_my_wallet(o.fulfillment_manager_address)
        or (p.pod_id is not null and p.pod_id ~* '^[0-9a-f-]{36}$'
            and public.has_pod_permission_current_user(p.pod_id::uuid, 'marketplaceManage'))
      )
  );
$_$;


--
-- Name: can_moderate_chat_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_moderate_chat_group(p_chat_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.chat_groups g
    where g.id = p_chat_group_id
      and g.pod_id is not null
      and (public.is_pod_leader_current_user(g.pod_id)
           or public.has_pod_permission_current_user(g.pod_id, 'chatModeration'))
  );
$$;


--
-- Name: can_post_in_category(uuid, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_post_in_category(category_id uuid, user_tokens text[], user_hats text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM forums_accessible_by_identity(user_tokens, user_hats)
    WHERE id = category_id
  ) AND EXISTS (
    SELECT 1 FROM pod_role_forum_access
    WHERE hat_id = ANY (user_hats) AND forum_access = TRUE
  );
$$;


--
-- Name: can_user_register_for_event(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_user_register_for_event(event_uuid uuid, user_wallet_address text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    event_record events%ROWTYPE;
    existing_registration INTEGER;
BEGIN
    -- Get event details
    SELECT * INTO event_record FROM events WHERE id = event_uuid;
    
    -- Check if event exists and is published
    IF NOT FOUND OR event_record.status != 'published' THEN
        RETURN FALSE;
    END IF;
    
    -- Check if event is in the future
    IF event_record.event_date <= NOW() THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user is already registered
    SELECT COUNT(*) INTO existing_registration 
    FROM event_registrations 
    WHERE event_id = event_uuid 
    AND user_address = user_wallet_address 
    AND registration_status != 'cancelled';
    
    IF existing_registration > 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Check max attendees
    IF event_record.max_attendees IS NOT NULL THEN
        SELECT COUNT(*) INTO existing_registration
        FROM event_registrations
        WHERE event_id = event_uuid
        AND registration_status IN ('registered', 'checked_in', 'completed');
        
        IF existing_registration >= event_record.max_attendees THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$;


--
-- Name: can_vote_on_pod_proposal(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_vote_on_pod_proposal(p_proposal_id uuid, p_wallet text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.pod_level_proposals pr
    where pr.id = p_proposal_id
      and pr.status in ('proposed', 'active')
      and (pr.voting_deadline is null or pr.voting_deadline > now())
      and public.is_eligible_pod_voter(pr.pod_id, pr.governance_tier, p_wallet)
      and (
        not exists (select 1 from public.proposal_eligibility_snapshots s where s.proposal_id = pr.id)
        or exists (
          select 1 from public.proposal_eligibility_snapshots s
          where s.proposal_id = pr.id and lower(s.wallet) = lower(p_wallet) and s.passed
        )
      )
  );
$$;


--
-- Name: changed_columns(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.changed_columns(o jsonb, n jsonb) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(array_agg(k), '{}')
  from jsonb_object_keys(n) k
  where n -> k is distinct from o -> k;
$$;


--
-- Name: check_bounty_access(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_bounty_access(p_bounty_id uuid, p_user_address text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_restriction_level TEXT;
    v_creator_address TEXT;
    v_required_pod_id UUID;
BEGIN
    -- Get bounty details
    SELECT restriction_level, creator_address, required_pod_id
    INTO v_restriction_level, v_creator_address, v_required_pod_id
    FROM bounties
    WHERE id = p_bounty_id;

    -- Creator always has access
    IF v_creator_address = p_user_address THEN
        RETURN TRUE;
    END IF;

    -- Public bounties are accessible to all
    IF v_restriction_level = 'public' THEN
        RETURN TRUE;
    END IF;

    -- For token-gated bounties, we'll need to check on-chain
    -- This returns true and lets the frontend do the actual token check
    IF v_restriction_level = 'token_holders' THEN
        RETURN TRUE; -- Frontend will verify token holdings
    END IF;

    -- Pod member check
    IF v_restriction_level = 'pod_members' AND v_required_pod_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM pod_members 
            WHERE pod_id = v_required_pod_id 
            AND member_address = p_user_address
            AND status = 'active'
        );
    END IF;

    -- Invite only - check if user has been invited
    IF v_restriction_level = 'invite_only' THEN
        RETURN EXISTS (
            SELECT 1 FROM bounty_invites
            WHERE bounty_id = p_bounty_id
            AND invitee_address = p_user_address
            AND status = 'accepted'
        );
    END IF;

    RETURN FALSE;
END;
$$;


--
-- Name: check_burn_approval_threshold(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_burn_approval_threshold(burn_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  approval_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO approval_count
  FROM burn_approvals
  WHERE burn_request_id = burn_uuid;

  RETURN approval_count >= 2;
END;
$$;


--
-- Name: check_donation_approval_threshold(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_donation_approval_threshold(donation_uuid uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  approval_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO approval_count
  FROM donation_approvals
  WHERE donation_id = donation_uuid;

  RETURN approval_count >= 2;
END;
$$;


--
-- Name: check_pod_permission(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_pod_permission(p_user_wallet text, p_pod_id uuid, p_permission_key text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  has_permission BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pod_members pm
    JOIN pod_role_permissions prp
      ON pm.hat_id = prp.token_address
     AND pm.pod_id::uuid = prp.pod_id
    WHERE lower(pm.wallet) = lower(p_user_wallet)
      AND pm.pod_id::uuid = p_pod_id
      AND pm.is_active = true
      AND prp.is_active = true
      AND prp.permissions ->> p_permission_key = 'true'
  ) INTO has_permission;

  RETURN has_permission;
END;
$$;


--
-- Name: claim_course_accreditation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_course_accreditation(p_category_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_wallet text := lower(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
    current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
    ''
  ));
begin
  if v_wallet = '' then
    return null;
  end if;
  return public.award_course_accreditation(p_category_id, v_wallet);
end;
$$;


--
-- Name: cleanup_conference_stale_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_conference_stale_data() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Purge old reactions
  DELETE FROM public.conference_reactions
  WHERE sent_at < NOW() - INTERVAL '10 minutes';

  -- Mark participants as inactive if their room ended >30 minutes ago
  -- and they never explicitly left (client crash / network drop safety net)
  UPDATE public.conference_participants
  SET is_active = FALSE, left_at = NOW()
  WHERE is_active = TRUE
    AND room_id IN (
      SELECT id FROM public.conference_rooms
      WHERE status = 'ended'
        AND ended_at < NOW() - INTERVAL '30 minutes'
    );
END;
$$;


--
-- Name: cleanup_old_drafts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_drafts() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM forum_thread_drafts
  WHERE updated_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_hat_images(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_hat_images() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Delete HAT images older than 30 days that aren't referenced
  -- Note: This is a basic cleanup - adjust logic based on your needs
  DELETE FROM storage.objects 
  WHERE bucket_id = 'hat-images' 
    AND created_at < NOW() - INTERVAL '30 days'
    AND name NOT IN (
      -- Add checks here for images still in use
      -- Example: SELECT image_url FROM pods WHERE image_url IS NOT NULL
      SELECT ''
    );
END;
$$;


--
-- Name: cleanup_stale_video_signals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_stale_video_signals() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM video_call_signaling
  WHERE session_id IN (
    SELECT id FROM video_call_sessions
    WHERE status IN ('ended', 'declined', 'missed')
      AND ended_at < NOW() - INTERVAL '1 hour'
  );
END;
$$;


--
-- Name: course_is_complete(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.course_is_complete(p_category_id uuid, p_wallet text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from knowledge_categories c where c.id = p_category_id and c.is_course)
     and exists (select 1 from knowledge_items i where i.category_id = p_category_id)
     and not exists (
       select 1
       from knowledge_items i
       where i.category_id = p_category_id
         and not exists (
           select 1 from knowledge_item_views v
           where v.item_id = i.id
             and lower(v.user_address) = lower(p_wallet)
             and v.completed = true
         )
     );
$$;


--
-- Name: create_pod_forum_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pod_forum_category() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pod_name TEXT;
  v_category_id UUID;
  v_leader_hat_id TEXT;
BEGIN
  IF NEW.forum_enabled = TRUE AND (OLD.forum_enabled = FALSE OR OLD.forum_enabled IS NULL) THEN
    SELECT name INTO v_pod_name FROM pods WHERE id = NEW.pod_id;

    SELECT id INTO v_category_id FROM forum_categories WHERE pod_id = NEW.pod_id;

    IF v_category_id IS NULL THEN
      INSERT INTO forum_categories (name, description, pod_id)
      VALUES (
        v_pod_name || ' Forum',
        'Discussion forum for ' || v_pod_name || ' members',
        NEW.pod_id
      )
      RETURNING id INTO v_category_id;

      SELECT token_address INTO v_leader_hat_id
      FROM pod_role_permissions
      WHERE pod_id = NEW.pod_id AND role_name = 'Leader' AND is_active = TRUE
      LIMIT 1;

      IF v_leader_hat_id IS NOT NULL THEN
        INSERT INTO forum_category_required_tokens (forum_category_id, token_or_hat, source)
        VALUES (v_category_id, v_leader_hat_id, 'auto_pod_forum')
        ON CONFLICT (forum_category_id, token_or_hat) DO NOTHING;
      END IF;

      RAISE NOTICE 'Created forum category % for pod %', v_category_id, NEW.pod_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: create_pod_role_permissions_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pod_role_permissions_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pod_role_permissions_history (
      permission_id, pod_id, token_address, role_name,
      new_permissions, new_eligibility_criteria,
      change_type, changed_by
    ) VALUES (
      NEW.id, NEW.pod_id, NEW.token_address, NEW.role_name,
      NEW.permissions, NEW.eligibility_criteria,
      'created', NEW.created_by
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO pod_role_permissions_history (
      permission_id, pod_id, token_address, role_name,
      old_permissions, new_permissions,
      old_eligibility_criteria, new_eligibility_criteria,
      change_type, changed_by
    ) VALUES (
      NEW.id, NEW.pod_id, NEW.token_address, NEW.role_name,
      OLD.permissions, NEW.permissions,
      OLD.eligibility_criteria, NEW.eligibility_criteria,
      CASE
        WHEN OLD.is_active <> NEW.is_active AND NEW.is_active THEN 'activated'
        WHEN OLD.is_active <> NEW.is_active AND NOT NEW.is_active THEN 'deactivated'
        ELSE 'updated'
      END,
      NEW.updated_by
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO pod_role_permissions_history (
      permission_id, pod_id, token_address, role_name,
      old_permissions, old_eligibility_criteria,
      change_type, changed_by
    ) VALUES (
      OLD.id, OLD.pod_id, OLD.token_address, OLD.role_name,
      OLD.permissions, OLD.eligibility_criteria,
      'deleted', OLD.updated_by
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: create_proposal_metadata(text, text, text, text, text, text, text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_proposal_metadata(p_onchain_proposal_id text, p_title text, p_description text, p_proposer_address text, p_forum_thread_id text DEFAULT NULL::text, p_category text DEFAULT 'general'::text, p_tags text[] DEFAULT '{}'::text[], p_mentions jsonb DEFAULT '[]'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    proposal_uuid UUID;
BEGIN
    INSERT INTO proposal_metadata (
        onchain_proposal_id,
        title,
        description,
        proposer_address,
        forum_thread_id,
        category,
        tags,
        mentions
    ) VALUES (
        p_onchain_proposal_id,
        p_title,
        p_description,
        p_proposer_address,
        p_forum_thread_id,
        p_category,
        p_tags,
        p_mentions
    ) RETURNING id INTO proposal_uuid;
    
    -- Create mention records
    IF p_mentions IS NOT NULL AND jsonb_array_length(p_mentions) > 0 THEN
        INSERT INTO proposal_mentions (proposal_id, mentioned_user_address, mentioned_by_address, mention_context)
        SELECT 
            proposal_uuid,
            mention->>'address',
            p_proposer_address,
            mention->>'context'
        FROM jsonb_array_elements(p_mentions) AS mention;
    END IF;
    
    -- Create notifications for mentioned users
    IF p_mentions IS NOT NULL AND jsonb_array_length(p_mentions) > 0 THEN
        INSERT INTO proposal_notifications (recipient_address, proposal_id, notification_type, title, message)
        SELECT 
            mention->>'address',
            proposal_uuid,
            'proposal_mentioned',
            'You were mentioned in a proposal',
            'You were mentioned in proposal: ' || p_title
        FROM jsonb_array_elements(p_mentions) AS mention;
    END IF;
    
    RETURN proposal_uuid;
END;
$$;


--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  claims       jsonb;
  uid          uuid;
  wallet       text;
  agent_wallet text;
  meta         jsonb;
begin
  claims := coalesce(event->'claims', '{}'::jsonb);

  begin
    uid := (event->>'user_id')::uuid;
  exception when others then
    return jsonb_build_object('claims', claims);
  end;

  -- Agent accounts: app_metadata is server-controlled, so this is trustworthy.
  agent_wallet := lower(nullif(claims->'app_metadata'->>'agent_wallet', ''));
  if agent_wallet is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb('community_agent'::text));
    claims := jsonb_set(claims, '{wallet_address}', to_jsonb(agent_wallet));
    return jsonb_build_object('claims', claims);
  end if;

  -- Members: the canonical linked wallet, else the profile wallet.
  select lower(w.wallet_address) into wallet
    from public.user_wallets w
   where w.user_id = uid and w.is_canonical
   limit 1;

  if wallet is null then
    select lower(p.wallet_address) into wallet
      from public.user_profiles p
     where p.user_id = uid and p.wallet_address is not null
     limit 1;
  end if;

  meta := coalesce(claims->'user_metadata', '{}'::jsonb);

  if wallet is not null then
    claims := jsonb_set(claims, '{wallet_address}', to_jsonb(wallet));
    claims := jsonb_set(claims, '{user_metadata}', meta || jsonb_build_object('wallet_address', wallet));
  else
    -- No wallet on record: make sure a user-supplied one cannot ride along.
    claims := claims - 'wallet_address';
    claims := jsonb_set(claims, '{user_metadata}', meta - 'wallet_address');
  end if;

  return jsonb_build_object('claims', claims);
exception when others then
  return jsonb_build_object('claims', coalesce(event->'claims', '{}'::jsonb));
end;
$$;


--
-- Name: enforce_leader_application_quorum(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_leader_application_quorum() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: enforce_leader_invitation_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_leader_invitation_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: enforce_notification_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_notification_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_sender text := lower(new.sender_address);
  v_recipient text := lower(new.recipient_address);
  v_since timestamptz := now() - interval '1 hour';
  v_total int;
  v_pair int;
begin
  if v_sender is null or v_sender = 'system' then
    return new;
  end if;

  select
    count(*),
    count(*) filter (where lower(recipient_address) = v_recipient)
  into v_total, v_pair
  from (
    select recipient_address from public.general_notifications
      where lower(sender_address) = v_sender and created_at > v_since
    union all
    select recipient_address from public.governance_notifications
      where lower(sender_address) = v_sender and created_at > v_since
  ) recent;

  if v_pair >= 20 then
    raise exception 'notification rate limit: at most 20 notifications per hour to the same member'
      using errcode = 'P0429';
  end if;
  if v_total >= 1000 then
    raise exception 'notification rate limit: at most 1000 notifications per hour'
      using errcode = 'P0429';
  end if;

  return new;
end;
$$;


--
-- Name: enforce_pod_creator_sole_leader(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_pod_creator_sole_leader() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: enforce_pod_governance_config_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_pod_governance_config_authority() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  caller_wallet TEXT;
  is_leader BOOLEAN;
  gov_changed BOOLEAN;
BEGIN
  -- Detect whether any of the gov_* columns actually changed.
  gov_changed := (
    OLD.gov_op_quorum_bps         IS DISTINCT FROM NEW.gov_op_quorum_bps
    OR OLD.gov_op_approval_bps    IS DISTINCT FROM NEW.gov_op_approval_bps
    OR OLD.gov_op_voting_hours    IS DISTINCT FROM NEW.gov_op_voting_hours
    OR OLD.gov_treasury_quorum_bps   IS DISTINCT FROM NEW.gov_treasury_quorum_bps
    OR OLD.gov_treasury_approval_bps IS DISTINCT FROM NEW.gov_treasury_approval_bps
    OR OLD.gov_treasury_voting_hours IS DISTINCT FROM NEW.gov_treasury_voting_hours
  );

  IF NOT gov_changed THEN
    RETURN NEW;
  END IF;

  -- Service role (server-side admin client) bypasses the leader check.
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  caller_wallet := lower(coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
    ''
  ));

  IF caller_wallet = '' THEN
    RAISE EXCEPTION 'Governance config can only be modified by a pod leader (no wallet on request)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM unnest(NEW.pod_leads) AS lead_addr
    WHERE lower(lead_addr) = caller_wallet
  ) INTO is_leader;

  IF NOT is_leader THEN
    RAISE EXCEPTION 'Only pod leaders may update governance config columns';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_pod_leads_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_pod_leads_authority() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: event_registrations_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_registrations_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  is_free boolean;
  organizer boolean;
  own boolean;
  caller text := lower(auth.jwt() ->> 'wallet_address');
begin
  -- Server routes (service role) and direct DB sessions are trusted.
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  select coalesce(nullif(trim(e.price_amount), ''), '0') ~ '^0*(\.0*)?$'
     and coalesce(nullif(trim(e.price_self_amount), ''), '0') ~ '^0*(\.0*)?$'
    into is_free
  from public.events e
  where e.id = coalesce(new.event_id, old.event_id);
  is_free := coalesce(is_free, false);

  if tg_op = 'INSERT' then
    if not is_free then
      raise exception 'Paid registrations are recorded by the server once the payment is confirmed on-chain'
        using errcode = '42501';
    end if;
    new.registration_status := 'registered';
    new.payment_status := 'completed';
    new.payment_amount := '0';
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.completed_at := null;
    new.completion_token_id := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- UPDATE
  organizer := public.is_event_organizer(old.event_id);
  own := public.is_my_wallet(old.user_address);

  if new.event_id is distinct from old.event_id
     or lower(new.user_address) is distinct from lower(old.user_address)
     or new.payment_amount is distinct from old.payment_amount
     or new.payment_token is distinct from old.payment_token
     or new.payment_tx_hash is distinct from old.payment_tx_hash then
    raise exception 'Event, attendee and payment details cannot be changed'
      using errcode = '42501';
  end if;

  if new.payment_status is distinct from old.payment_status
     and not (organizer and new.payment_status in ('refunded', 'refund_pending')) then
    raise exception 'Only the event organizer can record a refund'
      using errcode = '42501';
  end if;

  if (new.checked_in_at is distinct from old.checked_in_at
      or new.completed_at is distinct from old.completed_at
      or new.completion_token_id is distinct from old.completion_token_id)
     and not organizer then
    raise exception 'Only the event organizer can check attendees in or complete them'
      using errcode = '42501';
  end if;

  if new.registration_status is distinct from old.registration_status then
    if new.registration_status in ('checked_in', 'completed') and not organizer then
      raise exception 'Only the event organizer can check attendees in or complete them'
        using errcode = '42501';
    end if;
    if new.registration_status = 'registered' and not organizer and not (own and is_free) then
      raise exception 'Re-registering for a paid event goes through the server'
        using errcode = '42501';
    end if;
  end if;

  -- Who checked this attendee in is recorded, never supplied.
  if new.checked_in_at is distinct from old.checked_in_at then
    new.checked_in_by := case when new.checked_in_at is null then null else caller end;
  else
    new.checked_in_by := old.checked_in_by;
  end if;

  return new;
end;
$_$;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    event_date timestamp with time zone NOT NULL,
    event_end_date timestamp with time zone,
    location text,
    max_attendees integer,
    price_amount text DEFAULT '0'::text NOT NULL,
    price_token text DEFAULT 'free'::text NOT NULL,
    required_tokens text[] DEFAULT '{}'::text[],
    organizing_pod_id uuid,
    fund_recipient_pod_id uuid,
    fund_recipient_type text DEFAULT 'pod'::text NOT NULL,
    creator_address text NOT NULL,
    registration_contract_address text,
    completion_contract_address text,
    status text DEFAULT 'draft'::text NOT NULL,
    qr_code_data text,
    event_image_url text,
    event_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    price_self_amount text DEFAULT '0'::text,
    user_id uuid,
    manager_address text,
    blockchain_event_id text,
    actor_type text DEFAULT 'human'::text NOT NULL,
    CONSTRAINT events_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'agent'::text]))),
    CONSTRAINT events_fund_recipient_type_check CHECK ((fund_recipient_type = ANY (ARRAY['pod'::text, 'dao'::text]))),
    CONSTRAINT events_price_token_check CHECK ((price_token = ANY (ARRAY['free'::text, 'SELF'::text, 'SYSTEM'::text, 'dual'::text]))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: events_accessible_by_identity(text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.events_accessible_by_identity(user_tokens text[], user_hats text[]) RETURNS SETOF public.events
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH e_tokens AS (
    -- Events accessible via direct token ownership
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_tokens)
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  ),
  e_hats AS (
    -- Events accessible via direct hat ownership
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  ),
  e_roles AS (
    -- Events accessible via pod role permissions
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    JOIN event_required_tokens ert ON ert.event_id = e.id
    JOIN pod_role_forum_access prfa
      ON prfa.hat_id = ert.token_or_hat AND prfa.forum_access = TRUE
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE ert.token_or_hat = ANY (user_hats)
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  ),
  e_no_requirements AS (
    -- Events with no token requirements (public events)
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE NOT EXISTS (
      SELECT 1 FROM event_required_tokens ert
      WHERE ert.event_id = e.id
    )
    AND (e.required_tokens IS NULL OR array_length(e.required_tokens, 1) IS NULL)
    AND (
      e.organizing_pod_id IS NULL  -- Allow non-pod events
      OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
    )
  ),
  e_legacy_requirements AS (
    -- Handle legacy required_tokens column for backward compatibility
    -- 🔒 SECURITY: Now checks pod_modules.events_enabled
    SELECT DISTINCT e.*
    FROM events e
    CROSS JOIN unnest(e.required_tokens) AS token
    LEFT JOIN pod_modules pm ON pm.pod_id = e.organizing_pod_id
    WHERE e.required_tokens IS NOT NULL
      AND array_length(e.required_tokens, 1) > 0
      AND (
        LOWER(token) = ANY (user_tokens) OR
        LOWER(token) = ANY (user_hats)
      )
      AND (
        e.organizing_pod_id IS NULL  -- Allow non-pod events
        OR pm.events_enabled = TRUE  -- 🔒 Module toggle check
      )
  )

  SELECT * FROM e_tokens
  UNION
  SELECT * FROM e_hats
  UNION
  SELECT * FROM e_roles
  UNION
  SELECT * FROM e_no_requirements
  UNION
  SELECT * FROM e_legacy_requirements
  ORDER BY event_date ASC;
$$;


--
-- Name: expire_old_deletion_proposals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_deletion_proposals() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE pod_deletion_proposals
  SET status = 'expired', 
      updated_at = NOW()
  WHERE status = 'pending' 
  AND expires_at < NOW();
END;
$$;


--
-- Name: fn_queue_agent_mention(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_queue_agent_mention() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_thread_category_id UUID;
  v_pod_id UUID;
  v_agent_enabled BOOLEAN;
  v_agent_config JSONB;
  v_agent_name TEXT;
  v_agent_wallet TEXT;
  v_pseudo_wallet TEXT := '0x000000000000000000000000000000000000ca10';
BEGIN
  -- Skip deleted posts early
  IF COALESCE(NEW.is_deleted, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Resolve thread -> category -> pod
  SELECT category_id INTO v_thread_category_id
    FROM forum_threads WHERE id = NEW.thread_id;

  IF v_thread_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pod_id INTO v_pod_id
    FROM forum_categories WHERE id = v_thread_category_id;

  IF v_pod_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if community agent is enabled for this pod
  SELECT community_agent_enabled, community_agent_config
    INTO v_agent_enabled, v_agent_config
    FROM pod_modules WHERE pod_id = v_pod_id;

  IF NOT COALESCE(v_agent_enabled, FALSE) THEN
    RETURN NEW;
  END IF;

  -- Extract agent name and wallet from config
  v_agent_name := COALESCE(v_agent_config->>'agent_name', 'Community Agent');
  v_agent_wallet := COALESCE(v_agent_config->>'agent_wallet', v_pseudo_wallet);

  -- Don't process agent's own posts (check both per-pod wallet and legacy pseudo wallet)
  IF NEW.author_address = v_agent_wallet OR NEW.author_address = v_pseudo_wallet THEN
    RETURN NEW;
  END IF;

  -- Check if the post content mentions the agent
  -- Match patterns: @[AgentName](wallet), @AgentName, or the wallet address
  IF NEW.content ILIKE '%' || v_agent_wallet || '%'
     OR NEW.content ILIKE '%@' || v_agent_name || '%'
     OR NEW.content ILIKE '%@[' || v_agent_name || ']%' THEN

    INSERT INTO community_agent_queue (pod_id, thread_id, trigger_post_id, trigger_wallet)
    VALUES (v_pod_id, NEW.thread_id, NEW.id, NEW.author_address);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: forum_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    required_token text,
    pod_id uuid,
    is_active boolean DEFAULT true,
    access_level text DEFAULT 'both'::text,
    created_by_address text,
    display_mode text DEFAULT 'discussion'::text NOT NULL,
    CONSTRAINT forum_categories_access_level_check CHECK ((access_level = ANY (ARRAY['managers'::text, 'members'::text, 'both'::text]))),
    CONSTRAINT forum_categories_display_mode_check CHECK ((display_mode = ANY (ARRAY['discussion'::text, 'journal'::text])))
);


--
-- Name: forums_accessible_by_identity(text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forums_accessible_by_identity(user_tokens text[], user_hats text[]) RETURNS SETOF public.forum_categories
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH
  -- 🆕 Public forums: No token requirements, always accessible to logged-in users
  f_public AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE
      -- Forum must be marked as public OR have no required tokens
      (fc.required_token IS NULL OR fc.required_token = '')
      -- AND must not be a pod forum (pod forums require membership)
      AND fc.pod_id IS NULL
      -- Pod modules check not needed since pod_id IS NULL
  ),
  -- Token-gated forums
  f_tokens AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_tokens)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  -- HAT-gated forums
  f_hats AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt
      ON fcrt.forum_category_id = fc.id
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE fcrt.token_or_hat = ANY (user_hats)
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  ),
  -- Pod role-based forums
  f_roles AS (
    SELECT DISTINCT fc.*
    FROM forum_categories fc
    JOIN forum_category_required_tokens fcrt ON fcrt.forum_category_id = fc.id
    JOIN pod_role_forum_access prfa ON prfa.hat_id = fcrt.token_or_hat
    LEFT JOIN pod_modules pm ON pm.pod_id = fc.pod_id
    WHERE prfa.hat_id = ANY (user_hats)
      AND prfa.forum_access = TRUE
      AND (fc.pod_id IS NULL OR pm.forum_enabled = TRUE)
  )
  -- 🔄 UNION all accessible forums (including public)
  SELECT * FROM f_public
  UNION
  SELECT * FROM f_tokens
  UNION
  SELECT * FROM f_hats
  UNION
  SELECT * FROM f_roles;
$$;


--
-- Name: freeze_pod_deletion_proposal_threshold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.freeze_pod_deletion_proposal_threshold() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.approval_threshold_bps IS DISTINCT FROM NEW.approval_threshold_bps THEN
    RAISE EXCEPTION 'approval_threshold_bps is immutable after proposal creation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: freeze_pod_level_proposal_thresholds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.freeze_pod_level_proposal_thresholds() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.approval_threshold_bps IS DISTINCT FROM NEW.approval_threshold_bps THEN
    RAISE EXCEPTION 'approval_threshold_bps is immutable after proposal creation';
  END IF;
  IF OLD.quorum_threshold_bps IS DISTINCT FROM NEW.quorum_threshold_bps THEN
    RAISE EXCEPTION 'quorum_threshold_bps is immutable after proposal creation';
  END IF;
  IF OLD.eligible_voter_count IS DISTINCT FROM NEW.eligible_voter_count THEN
    RAISE EXCEPTION 'eligible_voter_count is immutable after proposal creation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_referral_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_referral_key() RETURNS character varying
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars (0,O,I,1)
  result VARCHAR(6) := '';
  i INT;
  key_exists BOOLEAN;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check if key already exists
    SELECT EXISTS(SELECT 1 FROM user_profiles WHERE referral_key = result) INTO key_exists;

    EXIT WHEN NOT key_exists;
  END LOOP;

  RETURN result;
END;
$$;


--
-- Name: get_accessible_bounties(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_accessible_bounties(p_user_address text) RETURNS TABLE(bounty_id uuid, title text, description text, value jsonb, status text, restriction_level text, has_access boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.title,
        b.description,
        b.value,
        b.status,
        b.restriction_level,
        check_bounty_access(b.id, p_user_address) AS has_access
    FROM bounties b
    WHERE b.status != 'draft'
    ORDER BY b.created_at DESC;
END;
$$;


--
-- Name: get_agent_by_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_agent_by_session(p_session_key text) RETURNS TABLE(id uuid, name text, role text, status text, current_task_id uuid)
    LANGUAGE sql STABLE
    AS $$
  SELECT id, name, role, status, current_task_id
  FROM agents
  WHERE session_key = p_session_key;
$$;


--
-- Name: get_agent_tasks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_agent_tasks(p_agent_id uuid) RETURNS TABLE(id uuid, title text, description text, status text, priority integer, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  SELECT id, title, description, status, priority, created_at
  FROM tasks
  WHERE p_agent_id = ANY(assignee_ids)
    AND status IN ('assigned', 'in_progress', 'review')
  ORDER BY priority DESC, created_at ASC;
$$;


--
-- Name: get_bid_with_reviews(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_bid_with_reviews(bid_uuid uuid) RETURNS TABLE(id uuid, bounty_id uuid, bidder_address text, experience text, plan_of_action text, deliverables jsonb, timeline text, proposed_amount text, payment_option text, payment_details jsonb, answers jsonb, additional_notes text, status text, reviewer_address text, final_approver_address text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, reviewed_by text, technical_review_status text, final_review_status text, milestone_count bigint, completed_milestones bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.*,
        COALESCE(tech_review.status, 'pending') as technical_review_status,
        COALESCE(final_review.status, 'pending') as final_review_status,
        COALESCE(milestone_stats.total_count, 0) as milestone_count,
        COALESCE(milestone_stats.completed_count, 0) as completed_milestones
    FROM bids b
    LEFT JOIN (
        SELECT bid_id, status
        FROM bid_reviews
        WHERE review_type = 'technical'
        ORDER BY created_at DESC
        LIMIT 1
    ) tech_review ON b.id = tech_review.bid_id
    LEFT JOIN (
        SELECT bid_id, status
        FROM bid_reviews
        WHERE review_type = 'final'
        ORDER BY created_at DESC
        LIMIT 1
    ) final_review ON b.id = final_review.bid_id
    LEFT JOIN (
        SELECT 
            bid_id,
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
        FROM milestones
        GROUP BY bid_id
    ) milestone_stats ON b.id = milestone_stats.bid_id
    WHERE b.id = bid_uuid;
END;
$$;


--
-- Name: get_bounty_with_bid_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_bounty_with_bid_count(bounty_uuid uuid) RETURNS TABLE(id uuid, title text, description text, category text, value_amount text, value_token text, requirements text[], questions text[], status text, creator_address text, created_at timestamp with time zone, updated_at timestamp with time zone, bid_count bigint, pending_bids bigint, approved_bids bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.*,
        COALESCE(bid_counts.total_count, 0) as bid_count,
        COALESCE(bid_counts.pending_count, 0) as pending_bids,
        COALESCE(bid_counts.approved_count, 0) as approved_bids
    FROM bounties b
    LEFT JOIN (
        SELECT 
            bounty_id,
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count
        FROM bids
        GROUP BY bounty_id
    ) bid_counts ON b.id = bid_counts.bounty_id
    WHERE b.id = bounty_uuid;
END;
$$;


--
-- Name: get_latest_agent_context(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_latest_agent_context(p_context_type text) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT data FROM agent_context
  WHERE context_type = p_context_type
  ORDER BY version DESC
  LIMIT 1;
$$;


--
-- Name: get_order_buyer_contact(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_buyer_contact(p_order_id uuid) RETURNS TABLE(first_name text, last_name text, address_1 text, address_2 text, city text, state text, zip text, phone text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with me as (
    select lower(up.wallet_address) as wallet
    from public.user_profiles up
    where up.user_id = auth.uid()
    limit 1
  ),
  o as (
    select mo.buyer_address, mo.fulfillment_manager_address, p.pod_id
    from public.marketplace_orders mo
    left join public.products p on p.id = mo.product_id
    where mo.id = p_order_id
  )
  select up.first_name::text, up.last_name::text,
         up.address_1::text, up.address_2::text,
         up.city::text, up.state::text, up.zip::text, up.phone::text
  from o
  cross join me
  join public.user_profiles up on lower(up.wallet_address) = lower(o.buyer_address)
  where me.wallet is not null
    and (
      me.wallet = lower(o.buyer_address)
      or me.wallet = lower(o.fulfillment_manager_address)
      or (o.pod_id is not null
          and public.has_pod_permission_current_user(o.pod_id::uuid, 'marketplaceManage'))
    )
  limit 1;
$$;


--
-- Name: get_pending_proposals(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pending_proposals(p_category text DEFAULT NULL::text) RETURNS TABLE(id uuid, category text, title text, rationale text, steps jsonb, deliverable text, created_at timestamp with time zone, priority integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    id, category, title, rationale, steps, deliverable, created_at, priority
  FROM agent_proposals
  WHERE status = 'pending'
    AND (p_category IS NULL OR category = p_category)
  ORDER BY priority DESC, created_at ASC;
$$;


--
-- Name: get_pod_role_permissions(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pod_role_permissions(p_pod_id uuid, p_hat_id text DEFAULT NULL::text) RETURNS TABLE(role_name text, hat_id text, permissions jsonb, is_active boolean, current_holders integer, max_holders integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF p_hat_id IS NULL THEN
    RETURN QUERY
    SELECT
      prp.role_name,
      prp.hat_id,
      prp.permissions,
      prp.is_active,
      prp.current_holders,
      prp.max_holders
    FROM pod_role_permissions prp
    WHERE prp.pod_id = p_pod_id
    ORDER BY prp.role_name;
  ELSE
    RETURN QUERY
    SELECT
      prp.role_name,
      prp.hat_id,
      prp.permissions,
      prp.is_active,
      prp.current_holders,
      prp.max_holders
    FROM pod_role_permissions prp
    WHERE prp.pod_id = p_pod_id AND prp.hat_id = p_hat_id;
  END IF;
END;
$$;


--
-- Name: get_recent_activity(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_recent_activity(p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, created_at timestamp with time zone, agent_name text, agent_role text, activity_type text, message text, metadata jsonb)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    a.id,
    a.created_at,
    ag.name AS agent_name,
    ag.role AS agent_role,
    a.activity_type,
    a.message,
    a.metadata
  FROM activities a
  LEFT JOIN agents ag ON a.agent_id = ag.id
  ORDER BY a.created_at DESC
  LIMIT p_limit;
$$;


--
-- Name: get_undelivered_notifications(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_undelivered_notifications(p_agent_id uuid) RETURNS TABLE(id uuid, content text, source_type text, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  SELECT id, content, source_type, created_at
  FROM notifications
  WHERE mentioned_agent_id = p_agent_id
    AND delivered = FALSE
  ORDER BY created_at ASC;
$$;


--
-- Name: get_unread_governance_notification_count(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_governance_notification_count(user_address character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM governance_notifications
        WHERE recipient_address = user_address
        AND is_read = FALSE
    );
END;
$$;


--
-- Name: get_unread_notification_count(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unread_notification_count(user_address text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM general_notifications
        WHERE recipient_address = user_address
        AND is_read = FALSE
    );
END;
$$;


--
-- Name: get_user_events(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_events(user_wallet_address text) RETURNS TABLE(event_id uuid, title text, event_date timestamp with time zone, registration_status text, registered_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.title,
        e.event_date,
        er.registration_status,
        er.registered_at
    FROM events e
    JOIN event_registrations er ON e.id = er.event_id
    WHERE er.user_address = user_wallet_address
    ORDER BY e.event_date DESC;
END;
$$;


--
-- Name: get_user_forum_permissions(text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_forum_permissions(user_tokens text[], user_hats text[]) RETURNS TABLE(can_moderate boolean, can_post boolean, can_participate_governance boolean, accessible_category_count integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    is_forum_moderator(user_hats) AS can_moderate,
    EXISTS (
      SELECT 1 FROM pod_role_forum_access
      WHERE hat_id = ANY (user_hats) AND forum_access = TRUE
    ) AS can_post,
    EXISTS (
      SELECT 1 FROM pod_role_forum_access
      WHERE hat_id = ANY (user_hats) AND governance_participation = TRUE
    ) AS can_participate_governance,
    (SELECT COUNT(*)::INTEGER FROM forums_accessible_by_identity(user_tokens, user_hats)) AS accessible_category_count;
$$;


--
-- Name: get_user_pod_forums(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_pod_forums(user_address text) RETURNS TABLE(category_id uuid, category_name text, category_description text, pod_id uuid, pod_name text, has_forum_access boolean, has_moderation boolean)
    LANGUAGE sql STABLE
    AS $$
  SELECT DISTINCT
    fc.id AS category_id,
    fc.name AS category_name,
    fc.description AS category_description,
    fc.pod_id,
    p.name AS pod_name,
    COALESCE((prp.permissions->>'forumAccess')::BOOLEAN, FALSE) AS has_forum_access,
    COALESCE((prp.permissions->>'forumModeration')::BOOLEAN, FALSE) AS has_moderation
  FROM forum_categories fc
  JOIN pods p ON p.id = fc.pod_id
  JOIN pod_modules pm ON pm.pod_id = fc.pod_id
  JOIN pod_role_permissions prp ON prp.pod_id = fc.pod_id
  JOIN active_pod_members apm ON apm.pod_id = fc.pod_id
  WHERE pm.forum_enabled = TRUE
    AND apm.wallet = LOWER(user_address)
    AND prp.token_address = apm.hat_id
    AND prp.is_active = TRUE
    AND (prp.permissions->>'forumAccess')::BOOLEAN = TRUE;
$$;


--
-- Name: get_user_registration(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_registration(p_event_id uuid, p_user_address text) RETURNS TABLE(id uuid, event_id uuid, user_address text, registration_status text, payment_status text, payment_amount text, payment_token text, payment_transaction_hash text, registered_at timestamp with time zone, checked_in_at timestamp with time zone, cancelled_at timestamp with time zone, completed_at timestamp with time zone, qr_code_data text, qr_generated_at timestamp with time zone, check_in_method text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  BEGIN
      IF auth.uid() IS NULL THEN
          RAISE EXCEPTION 'Authentication required';
      END IF;

      IF NOT EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_id = auth.uid()
          AND wallet_address = p_user_address
      ) THEN
          RAISE EXCEPTION 'Access denied: wallet address does not belong to authenticated user';
      END IF;

      RETURN QUERY
      SELECT er.id, er.event_id, er.user_address, er.registration_status, er.payment_status,
             er.payment_amount, er.payment_token, er.payment_transaction_hash,
             er.registered_at, er.checked_in_at, er.cancelled_at, er.completed_at,
             er.qr_code_data, er.qr_generated_at, er.check_in_method,
             er.created_at, er.updated_at
      FROM event_registrations er
      WHERE er.event_id = p_event_id
      AND er.user_address = p_user_address;
  END;
  $$;


--
-- Name: governance_votes_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.governance_votes_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.proposal_id is distinct from old.proposal_id
          or lower(new.voter_address) is distinct from lower(old.voter_address)) then
    raise exception 'A vote cannot be moved to another proposal or voter' using errcode = '42501';
  end if;
  new.voter_address := lower(new.voter_address);
  new.pod_id := (select pod_id from public.pod_level_proposals where id = new.proposal_id);
  new.timestamp := now();
  return new;
end;
$$;


--
-- Name: has_admin_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_admin_token(wallet_address text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  result BOOLEAN;
BEGIN
  -- This would call an external API or use a blockchain indexer integration
  -- Here's a simplified version assuming you have a way to sync token balances
  SELECT EXISTS (
    SELECT 1 
    FROM token_balances tb
    JOIN admin_token_definitions atd
      ON tb.contract_address = atd.contract_address 
      AND tb.token_id = atd.token_id
    WHERE tb.wallet_address = wallet_address
      AND tb.balance > 0
  ) INTO result;
  
  RETURN result;
END;
$$;


--
-- Name: has_pod_permission_current_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_pod_permission_current_user(target_pod_id uuid, permission_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    public.check_pod_permission(
      (
        SELECT lower(up.wallet_address)
        FROM public.user_profiles up
        WHERE up.user_id = auth.uid()
        LIMIT 1
      ),
      target_pod_id,
      permission_key
    ),
    false
  );
$$;


--
-- Name: hat_id_numeric(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hat_id_numeric(p text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $_$
declare
  s text := lower(trim(p));
  n numeric := 0;
  i int;
  d int;
begin
  if s = '' then
    return null;
  end if;
  if left(s, 2) = '0x' then
    s := substr(s, 3);
    for i in 1..length(s) loop
      d := position(substr(s, i, 1) in '0123456789abcdef') - 1;
      if d < 0 then
        return null;
      end if;
      n := n * 16 + d;
    end loop;
    return n;
  end if;
  if s ~ '^[0-9]+$' then
    return s::numeric;
  end if;
  return null;
end;
$_$;


--
-- Name: increment_bids_accepted(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_bids_accepted(bounty_id_param uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.role() = 'authenticated' and not public.is_bounty_manager(bounty_id_param) then
    raise exception 'Only the bounty''s managers can accept bids' using errcode = '42501';
  end if;
  perform set_config('app.increment_bids_accepted', 'on', true);
  update public.bounties
  set bids_accepted_count = coalesce(bids_accepted_count, 0) + 1
  where id = bounty_id_param;
  perform set_config('app.increment_bids_accepted', 'off', true);
end;
$$;


--
-- Name: increment_knowledge_view(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_knowledge_view(item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE knowledge_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$;


--
-- Name: increment_thread_view_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_thread_view_count(tid uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE forum_threads SET view_count = COALESCE(view_count, 0) + 1 WHERE id = tid;
$$;


--
-- Name: is_agent_wallet(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_agent_wallet(addr text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT addr IS NOT NULL AND (
    LOWER(addr) LIKE '0xca10%'
    OR EXISTS (
      SELECT 1 FROM pod_modules pm
      WHERE LOWER(COALESCE(pm.community_agent_config->>'agent_wallet','')) = LOWER(addr)
         OR LOWER(COALESCE(pm.community_agent_config->>'legacy_agent_wallet','')) = LOWER(addr)
    )
  );
$$;


--
-- Name: is_bounty_manager(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_bounty_manager(p_bounty_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.bounties b
    where b.id = p_bounty_id
      and (public.is_my_wallet(b.creator_address)
           or (b.pod_id is not null and public.is_pod_leader_current_user(b.pod_id)))
  );
$$;


--
-- Name: is_current_user_wallet(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_current_user_wallet(target_wallet text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid()
      and lower(up.wallet_address) = lower(target_wallet)
  );
$$;


--
-- Name: is_eligible_pod_voter(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_eligible_pod_voter(p_pod_id uuid, p_tier text, p_wallet text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(p_tier, 'POD_OPERATIONAL') <> 'DAO_CONSTITUTIONAL'
    and exists (
      select 1
      from public.active_pod_members m
      join public.pod_role_permissions r
        on r.pod_id = m.pod_id::uuid
       and r.is_active
       and r.token_address = m.hat_id
       and r.permissions ->> 'governanceParticipation' = 'true'
      where m.pod_id::uuid = p_pod_id
        and lower(m.wallet) = lower(p_wallet)
        and (public.pod_tier_setting(p_pod_id, p_tier, 'voter_base') <> 'leaders'
             or m.membership_type in ('leader', 'admin'))
    );
$$;


--
-- Name: is_event_organizer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_event_organizer(p_event_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (public.is_my_wallet(e.creator_address) or public.is_my_wallet(e.manager_address))
  );
$$;


--
-- Name: is_forum_moderator(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_forum_moderator(user_hat_ids text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_role_forum_access
    WHERE hat_id = ANY (user_hat_ids)
      AND forum_moderation = TRUE
  );
$$;


--
-- Name: is_my_wallet(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_my_wallet(target text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select target is not null and (
    exists (
      select 1 from public.user_wallets uw
      where uw.user_id = auth.uid() and lower(uw.wallet_address) = lower(target)
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = auth.uid() and lower(up.wallet_address) = lower(target)
    )
  );
$$;


--
-- Name: is_pod_leader_current_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_pod_leader_current_user(target_pod_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: is_pod_member_current_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_pod_member_current_user(p_pod_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pod_members pm
    WHERE pm.pod_id = p_pod_id
      AND pm.is_active = true
      AND lower(pm.wallet) = lower(COALESCE(
        current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
        current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
        ''
      ))
  )
  OR EXISTS (
    SELECT 1 FROM pods p
    WHERE p.id = p_pod_id
      AND lower(COALESCE(
        current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
        current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
        ''
      )) = ANY (SELECT lower(x) FROM unnest(COALESCE(p.pod_leads, '{}'::text[])) AS x)
  );
$$;


--
-- Name: is_safe_app_path(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_safe_app_path(p text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
  select p is null or (p ~ '^/([^/]|$)' and position(chr(92) in p) = 0);
$_$;


--
-- Name: is_user_muted_in_chat(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_muted_in_chat(p_chat_group_id uuid, p_user_wallet text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_muted_users
    WHERE chat_group_id = p_chat_group_id
      AND user_wallet = p_user_wallet
      AND (muted_until IS NULL OR muted_until > NOW())
  );
$$;


--
-- Name: jwt_agent_wallet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.jwt_agent_wallet() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT LOWER(COALESCE(current_setting('request.jwt.claims', true)::json->>'wallet_address', ''));
$$;


--
-- Name: jwt_is_enabled_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.jwt_is_enabled_agent() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_modules pm
    WHERE pm.community_agent_enabled = true
      AND LOWER(COALESCE(pm.community_agent_config->>'agent_wallet','')) = jwt_agent_wallet()
  );
$$;


--
-- Name: lc_address_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lc_address_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  col text := tg_argv[0];
  val text;
begin
  execute format('select ($1).%I', col) into val using new;
  if val is not null then
    new := new #= hstore(col, lower(val));
  end if;
  return new;
end $_$;


--
-- Name: lc_pods_addresses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lc_pods_addresses() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.created_by_address is not null then
    new.created_by_address := lower(new.created_by_address);
  end if;
  if new.pod_leads is not null then
    new.pod_leads := (select array_agg(lower(x)) from unnest(new.pod_leads) x);
  end if;
  return new;
end $$;


--
-- Name: log_governance_vote_jwt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_governance_vote_jwt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
  BEGIN
      INSERT INTO governance_votes_jwt_debug (
          jwt_sub,
          jwt_role,
          jwt_wallet_address,
          jwt_user_metadata,
          voter_address_attempted,
          rls_check_result
      ) VALUES (
          auth.jwt() ->> 'sub',
          auth.jwt() ->> 'role',
          auth.jwt() ->> 'wallet_address',
          auth.jwt() -> 'user_metadata',
          NEW.voter_address,
          LOWER(NEW.voter_address) = LOWER(auth.jwt() -> 'user_metadata' ->> 'wallet_address')
      );
      RETURN NEW;
  END;
  $$;


--
-- Name: log_moderation_action(uuid, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_moderation_action(p_chat_group_id uuid, p_action text, p_message_id uuid DEFAULT NULL::uuid, p_target_user_wallet text DEFAULT NULL::text, p_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_log_id UUID;
  v_moderator_wallet TEXT;
BEGIN
  -- Get moderator wallet from user_profiles
  SELECT wallet_address INTO v_moderator_wallet
  FROM user_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Insert log entry
  INSERT INTO chat_moderation_log (
    chat_group_id,
    action,
    message_id,
    target_user_wallet,
    moderator_id,
    moderator_wallet,
    reason
  ) VALUES (
    p_chat_group_id,
    p_action,
    p_message_id,
    p_target_user_wallet,
    auth.uid(),
    v_moderator_wallet,
    p_reason
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


--
-- Name: mark_all_governance_notifications_read(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_all_governance_notifications_read(user_address character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE governance_notifications
    SET is_read = TRUE, updated_at = NOW()
    WHERE recipient_address = user_address
    AND is_read = FALSE;
END;
$$;


--
-- Name: mark_notifications_as_read(text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications_as_read(user_address text, notification_ids uuid[] DEFAULT NULL::uuid[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF notification_ids IS NULL THEN
        -- Mark all notifications as read for the user
        UPDATE general_notifications
        SET is_read = TRUE
        WHERE recipient_address = user_address
        AND is_read = FALSE;
    ELSE
        -- Mark specific notifications as read
        UPDATE general_notifications
        SET is_read = TRUE
        WHERE recipient_address = user_address
        AND id = ANY(notification_ids);
    END IF;
END;
$$;


--
-- Name: mark_summary_stale(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_summary_stale() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE forum_thread_summaries
  SET is_stale = TRUE
  WHERE thread_id = NEW.thread_id;
  RETURN NEW;
END;
$$;


--
-- Name: mark_task_completed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_task_completed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: marketplace_orders_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketplace_orders_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'tracking_number', 'notes', 'updated_at',
                               'fulfillment_manager_address'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Order payment and item details cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  if new.fulfillment_manager_address is distinct from old.fulfillment_manager_address
     and not public.is_my_wallet(new.fulfillment_manager_address) then
    raise exception 'You can only assign an order to yourself' using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: milestones_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.milestones_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'completed_at', 'completed_by', 'review_comments'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Milestone amount, bid and description are fixed once created: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: normalize_chat_addresses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_chat_addresses() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.sender_wallet_id IS NOT NULL THEN
        NEW.sender_wallet_id := LOWER(NEW.sender_wallet_id);
    END IF;
    IF NEW.receiver_wallet_id IS NOT NULL THEN
        NEW.receiver_wallet_id := LOWER(NEW.receiver_wallet_id);
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: normalize_dm_block_addresses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_dm_block_addresses() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.blocker_id := LOWER(NEW.blocker_id);
    NEW.blocked_id := LOWER(NEW.blocked_id);
    RETURN NEW;
END;
$$;


--
-- Name: pod_current_leaders(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_current_leaders(p_pod_id uuid) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: pod_deletion_authorized(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_deletion_authorized(p_pod_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.pod_deletion_proposals pr
    where pr.pod_id = p_pod_id
      and pr.status = 'approved'
      and (pr.expires_at is null or pr.expires_at > now())
      and public.pod_deletion_valid_approvals(pr.id) >= greatest(pr.required_approvals, 1)
  );
$$;


--
-- Name: pod_deletion_proposals_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_deletion_proposals_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pod_deletion_valid_approvals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_deletion_valid_approvals(p_proposal_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(distinct lower(a))::integer
  from public.pod_deletion_proposals pr
  join public.pods p on p.id = pr.pod_id
  cross join lateral unnest(pr.current_approvals) a
  where pr.id = p_proposal_id
    and (lower(a) = any (select lower(x) from unnest(p.pod_leads) x)
         or lower(a) = lower(p.created_by_address));
$$;


--
-- Name: pod_level_proposals_insert_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_level_proposals_insert_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tier text := coalesce(new.governance_tier, 'POD_OPERATIONAL');
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if v_tier not in ('POD_OPERATIONAL', 'POD_TREASURY_BINDING') then
    raise exception 'Pod proposals are operational or treasury-binding' using errcode = '42501';
  end if;
  new.governance_tier := v_tier;
  new.created_by := lower(new.created_by);
  new.status := 'proposed';
  new.approval_threshold_bps := greatest(
    coalesce(new.approval_threshold_bps, 0),
    public.pod_tier_setting(new.pod_id, v_tier, 'approval_bps')::int);
  new.quorum_threshold_bps := greatest(
    coalesce(new.quorum_threshold_bps, 0),
    public.pod_tier_setting(new.pod_id, v_tier, 'quorum_bps')::int);
  new.voting_deadline := now()
    + make_interval(hours => public.pod_tier_setting(new.pod_id, v_tier, 'voting_hours')::int);
  new.eligible_voter_count := (
    select count(distinct lower(m.wallet))::int
    from public.active_pod_members m
    where m.pod_id::uuid = new.pod_id
      and public.is_eligible_pod_voter(new.pod_id, v_tier, m.wallet)
  );
  return new;
end;
$$;


--
-- Name: pod_members_authority_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_members_authority_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  caller text := public.session_wallet();
BEGIN
  -- Only sessions of ordinary users are constrained. Service role, cron and
  -- the scoped community_agent role are server code and keep their access.
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF caller IS NULL THEN
    RAISE EXCEPTION 'pod_members: session has no wallet' USING ERRCODE = '42501';
  END IF;

  -- Leads and the pod creator keep what they can do today (approve
  -- applications, remove members, claim the management hat at creation).
  IF public.session_leads_pod(NEW.pod_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF lower(NEW.wallet) <> caller THEN
      RAISE EXCEPTION 'pod_members: you can only add yourself' USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM 'member'
       OR NEW.membership_type IS DISTINCT FROM 'member' THEN
      RAISE EXCEPTION 'pod_members: only leads can assign a leader role' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: own row only, and nothing that confers authority may change.
  IF lower(OLD.wallet) <> caller THEN
    RAISE EXCEPTION 'pod_members: you can only edit your own membership' USING ERRCODE = '42501';
  END IF;
  IF NEW.wallet IS DISTINCT FROM OLD.wallet
     OR NEW.pod_id IS DISTINCT FROM OLD.pod_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.membership_type IS DISTINCT FROM OLD.membership_type
     OR NEW.hat_id IS DISTINCT FROM OLD.hat_id THEN
    RAISE EXCEPTION 'pod_members: role, hat and pod can only be changed by a lead' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pod_membership_applications_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_membership_applications_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  added text[];
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.current_votes := 0;
    new.voting_leaders := '{}';
    new.approved_at := null;
    new.rejected_at := null;
    new.required_votes := greatest(coalesce(new.required_votes, 1), 1);
    return new;
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'current_votes', 'voting_leaders', 'approved_at',
                               'rejected_at', 'rejection_reason', 'metadata'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Application details cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  if not (coalesce(old.voting_leaders, '{}') <@ coalesce(new.voting_leaders, '{}')) then
    raise exception 'Votes cannot be removed' using errcode = '42501';
  end if;
  added := array(select distinct lower(x) from unnest(coalesce(new.voting_leaders, '{}')) x
                 except select lower(y) from unnest(coalesce(old.voting_leaders, '{}')) y);
  if exists (select 1 from unnest(added) a where not public.is_my_wallet(a)) then
    raise exception 'You can only add your own vote' using errcode = '42501';
  end if;
  -- The count is derived, never supplied.
  new.current_votes := (select count(distinct lower(x)) from unnest(coalesce(new.voting_leaders, '{}')) x);
  return new;
end;
$$;


--
-- Name: pod_tier_setting(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_tier_setting(p_pod_id uuid, p_tier text, p_key text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when p_tier = 'POD_TREASURY_BINDING' then
      case p_key
        when 'quorum_bps' then coalesce(p.gov_treasury_quorum_bps, 5000)::text
        when 'approval_bps' then coalesce(p.gov_treasury_approval_bps, 6600)::text
        when 'voting_hours' then coalesce(p.gov_treasury_voting_hours, 72)::text
        when 'voter_base' then coalesce(p.gov_treasury_voter_base, 'all_members')
      end
    else
      case p_key
        when 'quorum_bps' then coalesce(p.gov_op_quorum_bps, 3000)::text
        when 'approval_bps' then coalesce(p.gov_op_approval_bps, 5001)::text
        when 'voting_hours' then coalesce(p.gov_op_voting_hours, 72)::text
        when 'voter_base' then coalesce(p.gov_op_voter_base, 'all_members')
      end
  end
  from public.pods p
  where p.id = p_pod_id;
$$;


--
-- Name: pulse_log_bid_placed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_bid_placed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'bid_placed',
      'bounties',
      'Bid placed on a bounty',
      LOWER(NEW.bidder_address),
      '/bounty/' || NEW.bounty_id::text,
      jsonb_build_object(
        'bid_id', NEW.id,
        'bounty_id', NEW.bounty_id,
        'proposed_amount', NEW.proposed_amount,
        'placement_tx_hash', NEW.placement_tx_hash
      ),
      'bid_placed:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_bid_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_bid_review() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, metadata, dedupe_key
    ) VALUES (
      'bid_review_submitted',
      'bounties',
      'Bid review submitted',
      LOWER(NEW.reviewer_address),
      jsonb_build_object(
        'bid_review_id', NEW.id,
        'bid_id', NEW.bid_id,
        'review_type', NEW.review_type,
        'status', NEW.status
      ),
      'bid_review_submitted:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_bid_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_bid_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  evt TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      evt := CASE
        WHEN NEW.status IN ('accepted', 'work_approved') THEN 'bid_accepted'
        WHEN NEW.status IN ('rejected', 'declined') THEN 'bid_rejected'
        ELSE NULL
      END;
      IF evt IS NOT NULL THEN
        INSERT INTO explorer_events (
          type, category, title, actor, url, metadata, dedupe_key
        ) VALUES (
          evt,
          'bounties',
          CASE WHEN evt = 'bid_accepted' THEN 'Bid accepted' ELSE 'Bid rejected' END,
          LOWER(COALESCE(NEW.reviewer_address, NEW.final_approver_address, NEW.bidder_address)),
          '/bounty/' || NEW.bounty_id::text,
          jsonb_build_object(
            'bid_id', NEW.id,
            'bounty_id', NEW.bounty_id,
            'bidder_address', LOWER(NEW.bidder_address),
            'new_status', NEW.status
          ),
          evt || ':' || NEW.id::text
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_bounty_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_bounty_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  begin
    if coalesce(new.status, 'open') <> 'draft' then
      insert into public.explorer_events (
        type, category, title, actor, url, pod_id, amount_value, amount_token, metadata, dedupe_key
      ) values (
        'bounty_created',
        'bounties',
        'New bounty: ' || coalesce(new.title, ''),
        lower(new.creator_address),
        '/bounty?bounty=' || new.id::text,
        new.pod_id,
        nullif(new.value_amount, '')::numeric,
        new.value_token,
        jsonb_build_object(
          'bounty_id', new.id,
          'category', new.category,
          'restriction_level', new.restriction_level,
          'required_pod_id', new.required_pod_id,
          'funding_source', new.funding_source
        ),
        'bounty_created:' || new.id::text
      );
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;


--
-- Name: pulse_log_chat_channel_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_chat_channel_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'chat_channel_created',
      'members',
      'New chat channel: ' || COALESCE(NEW.title, 'Untitled'),
      LOWER(COALESCE(NEW.created_by_address, '')),
      NEW.pod_id,
      '/chat/' || NEW.id::text,
      jsonb_build_object(
        'channel_id', NEW.id,
        'access_level', NEW.access_level,
        'required_token', NEW.required_token
      ),
      'chat_channel_created:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_dao_proposal_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_dao_proposal_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'proposal_created',
      'governance',
      'DAO proposal created: ' || NEW.title,
      LOWER(NEW.proposer_address),
      '/governance/' || NEW.onchain_proposal_id,
      jsonb_build_object(
        'onchain_proposal_id', NEW.onchain_proposal_id,
        'forum_thread_id', NEW.forum_thread_id,
        'source', 'dao_wide'
      ),
      'proposal_created:dao_wide:' || NEW.onchain_proposal_id
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_dispute_mediator_assigned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_dispute_mediator_assigned() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, recipient_address, metadata, dedupe_key
    ) VALUES (
      'dispute_mediator_assigned',
      'bounties',
      'Mediator assigned to dispute',
      LOWER(NEW.assigned_by),
      LOWER(NEW.mediator_address),
      jsonb_build_object(
        'dispute_id', NEW.dispute_id,
        'mediator_address', LOWER(NEW.mediator_address)
      ),
      'dispute_mediator_assigned:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_event_escrow_held(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_event_escrow_held() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  BEGIN
    SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
      FROM events WHERE id = NEW.event_id;

    INSERT INTO explorer_events (
      type, category, title, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'event_escrow_held',
      'events',
      'Escrow opened for ' || COALESCE(ev_title, 'an event'),
      ev_pod_id,
      '/events',
      jsonb_build_object(
        'event_id', NEW.event_id,
        'escrow_id', NEW.id,
        'total_self', NEW.total_self_amount,
        'total_system', NEW.total_system_amount,
        'escrow_address', NEW.escrow_account_address
      ),
      'event_escrow_held:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_event_escrow_released(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_event_escrow_released() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  IF OLD.distributed IS DISTINCT FROM NEW.distributed AND NEW.distributed = TRUE THEN
    BEGIN
      SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
        FROM events WHERE id = NEW.event_id;

      INSERT INTO explorer_events (
        type, category, title, pod_id, url, metadata, dedupe_key
      ) VALUES (
        'event_escrow_released',
        'events',
        'Escrow released for ' || COALESCE(ev_title, 'an event'),
        ev_pod_id,
        '/events',
        jsonb_build_object(
          'event_id', NEW.event_id,
          'escrow_id', NEW.id,
          'distribution_tx_hash', NEW.distribution_tx_hash
        ),
        'event_escrow_released:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_event_rsvp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_event_rsvp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  BEGIN
    SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
      FROM events WHERE id = NEW.event_id;

    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'event_rsvp',
      'events',
      'RSVPed to ' || COALESCE(ev_title, 'an event'),
      LOWER(NEW.user_address),
      ev_pod_id,
      '/events',
      jsonb_build_object(
        'event_id', NEW.event_id,
        'registration_id', NEW.id,
        'payment_token', NEW.payment_token,
        'payment_amount', NEW.payment_amount
      ),
      'event_rsvp:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_event_tokens_distributed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_event_tokens_distributed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  ev_title TEXT;
  ev_pod_id UUID;
BEGIN
  BEGIN
    SELECT title, organizing_pod_id INTO ev_title, ev_pod_id
      FROM events WHERE id = NEW.event_id;

    INSERT INTO explorer_events (
      type, category, title, recipient_address, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'event_tokens_distributed',
      'events',
      COALESCE(NEW.token_name, 'Event token') || ' distributed for ' || COALESCE(ev_title, 'an event'),
      LOWER(NEW.owner_address),
      ev_pod_id,
      '/events',
      jsonb_build_object(
        'event_id', NEW.event_id,
        'event_token_id', NEW.id,
        'token_type', NEW.token_type,
        'contract_address', NEW.contract_address
      ),
      'event_tokens_distributed:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_moderator_action(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_moderator_action() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, metadata, dedupe_key
    ) VALUES (
      'forum_moderator_action',
      'forum',
      'Moderator action: ' || NEW.action_type || ' on ' || NEW.target_type,
      LOWER(NEW.moderator_address),
      jsonb_build_object(
        'action_type', NEW.action_type,
        'target_type', NEW.target_type,
        'target_id', NEW.target_id,
        'reason', NEW.reason
      ),
      'forum_moderator_action:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_poll_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_poll_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'forum_poll_created',
      'forum',
      'New poll: ' || COALESCE(NEW.question, 'Untitled'),
      LOWER(NEW.created_by),
      '/forum/thread/' || NEW.thread_id::text,
      jsonb_build_object(
        'poll_id', NEW.id,
        'thread_id', NEW.thread_id,
        'allow_multiple', NEW.allow_multiple,
        'expires_at', NEW.expires_at
      ),
      'forum_poll_created:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_poll_voted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_poll_voted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, metadata, dedupe_key
    ) VALUES (
      'forum_poll_voted',
      'forum',
      'Voted in a forum poll',
      LOWER(NEW.voter_address),
      jsonb_build_object('poll_id', NEW.poll_id, 'option_id', NEW.option_id),
      'forum_poll_voted:' || LOWER(NEW.voter_address) || ':' || NEW.poll_id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_post_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_post_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  throttle_key TEXT;
  recent_count INT;
BEGIN
  BEGIN
    throttle_key := LOWER(NEW.author_address) || ':' || NEW.thread_id::text;
    SELECT COUNT(*) INTO recent_count
      FROM explorer_events
      WHERE type = 'forum_post_created'
        AND created_at > NOW() - INTERVAL '1 hour'
        AND metadata->>'throttle_key' = throttle_key;

    IF recent_count = 0 THEN
      INSERT INTO explorer_events (
        type, category, title, actor, url, metadata
      ) VALUES (
        'forum_post_created',
        'forum',
        'Replied in a forum thread',
        LOWER(NEW.author_address),
        '/forum/thread/' || NEW.thread_id::text,
        jsonb_build_object(
          'post_id', NEW.id,
          'thread_id', NEW.thread_id,
          'throttle_key', throttle_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_post_reaction(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_post_reaction() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'forum_post_reaction',
      'forum',
      'Reacted to a forum post',
      LOWER(NEW.reactor_address),
      CASE
        WHEN NEW.thread_id IS NOT NULL THEN '/forum/thread/' || NEW.thread_id::text
        ELSE NULL
      END,
      jsonb_build_object(
        'post_id', NEW.post_id,
        'thread_id', NEW.thread_id,
        'reaction_type', NEW.reaction_type
      ),
      'forum_post_reaction:' || LOWER(NEW.reactor_address) || ':' || NEW.post_id::text || ':' || NEW.reaction_type
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_thread_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_thread_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, url, metadata, dedupe_key
    ) VALUES (
      'forum_thread_created',
      'forum',
      'New thread: ' || COALESCE(NEW.title, 'Untitled'),
      LOWER(NEW.author_address),
      '/forum/thread/' || NEW.id::text,
      jsonb_build_object('thread_id', NEW.id, 'category_id', NEW.category_id),
      'forum_thread_created:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN
    -- Silently swallow so the forum write itself isn't impacted.
    NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_forum_thread_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_forum_thread_summary() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, url, metadata, dedupe_key
    ) VALUES (
      'forum_thread_summary_published',
      'forum',
      'AI summary published for a forum thread',
      '/forum/thread/' || NEW.thread_id::text,
      jsonb_build_object(
        'thread_id', NEW.thread_id,
        'sentiment', NEW.sentiment,
        'generated_by', NEW.generated_by
      ),
      'forum_thread_summary_published:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_knowledge_item_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_knowledge_item_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_public = TRUE THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, pod_id, url, metadata, dedupe_key
      ) VALUES (
        'knowledge_item_published',
        'knowledge',
        'Knowledge item published: ' || COALESCE(NEW.title, 'Untitled'),
        LOWER(COALESCE(NEW.created_by, '')),
        NEW.pod_id,
        '/knowledge',
        jsonb_build_object(
          'item_id', NEW.id,
          'category_id', NEW.category_id,
          'content_type', NEW.content_type
        ),
        'knowledge_item_published:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_knowledge_item_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_knowledge_item_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  meaningful BOOLEAN := FALSE;
BEGIN
  -- Draft → published
  IF OLD.is_public IS DISTINCT FROM NEW.is_public AND NEW.is_public = TRUE THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, pod_id, url, metadata, dedupe_key
      ) VALUES (
        'knowledge_item_published',
        'knowledge',
        'Knowledge item published: ' || COALESCE(NEW.title, 'Untitled'),
        LOWER(COALESCE(NEW.created_by, '')),
        NEW.pod_id,
        '/knowledge',
        jsonb_build_object('item_id', NEW.id, 'category_id', NEW.category_id),
        'knowledge_item_published:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
  END IF;

  -- Update of an already-published item with a meaningful change
  IF NEW.is_public = TRUE THEN
    IF (OLD.title IS DISTINCT FROM NEW.title) OR
       (OLD.description IS DISTINCT FROM NEW.description) OR
       (OLD.content_url IS DISTINCT FROM NEW.content_url) OR
       (OLD.content_text IS DISTINCT FROM NEW.content_text) OR
       (OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url) THEN
      meaningful := TRUE;
    END IF;
    IF meaningful THEN
      BEGIN
        INSERT INTO explorer_events (
          type, category, title, actor, pod_id, url, metadata
        ) VALUES (
          'knowledge_item_updated',
          'knowledge',
          'Knowledge item updated: ' || COALESCE(NEW.title, 'Untitled'),
          LOWER(COALESCE(NEW.created_by, '')),
          NEW.pod_id,
          '/knowledge',
          jsonb_build_object('item_id', NEW.id, 'category_id', NEW.category_id)
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_marketplace_listing_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_marketplace_listing_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  BEGIN
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'marketplace_listing_created',
      'marketplace',
      'New marketplace listing: ' || COALESCE(NEW.title, NEW.name, 'Untitled'),
      LOWER(COALESCE(NEW.creator_wallet, NEW.wallet_address, '')),
      NEW.pod_id,
      '/marketplace',
      jsonb_build_object(
        'product_id', NEW.id,
        'pod_id', NEW.pod_id,
        'gating_token', NEW.required_token,
        'price_system', NEW.price_system,
        'price_self', NEW.price_self
      ),
      'marketplace_listing_created:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_marketplace_listing_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_marketplace_listing_updated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  changed BOOLEAN := FALSE;
BEGIN
  IF (OLD.title IS DISTINCT FROM NEW.title) OR
     (OLD.name IS DISTINCT FROM NEW.name) OR
     (OLD.description IS DISTINCT FROM NEW.description) OR
     (OLD.price_system IS DISTINCT FROM NEW.price_system) OR
     (OLD.price_self IS DISTINCT FROM NEW.price_self) OR
     (OLD.image_url IS DISTINCT FROM NEW.image_url) OR
     (OLD.required_token IS DISTINCT FROM NEW.required_token) OR
     (OLD.units_available IS DISTINCT FROM NEW.units_available) THEN
    changed := TRUE;
  END IF;

  IF changed THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, pod_id, url, metadata
      ) VALUES (
        'marketplace_listing_updated',
        'marketplace',
        'Listing updated: ' || COALESCE(NEW.title, NEW.name, 'Untitled'),
        LOWER(COALESCE(NEW.creator_wallet, NEW.wallet_address, '')),
        NEW.pod_id,
        '/marketplace',
        jsonb_build_object('product_id', NEW.id, 'pod_id', NEW.pod_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_marketplace_order_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_marketplace_order_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  evt TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      evt := CASE NEW.status
        WHEN 'fulfilled' THEN 'marketplace_order_fulfilled'
        WHEN 'shipped' THEN 'marketplace_order_shipped'
        WHEN 'refunded' THEN 'marketplace_order_refunded'
        WHEN 'cancelled' THEN 'marketplace_order_cancelled'
        ELSE NULL
      END;
      IF evt IS NOT NULL THEN
        INSERT INTO explorer_events (
          type, category, title, actor, recipient_address, url, metadata, dedupe_key
        ) VALUES (
          evt,
          'marketplace',
          'Order ' || NEW.status || ': ' || COALESCE(NEW.product_name, ''),
          LOWER(COALESCE(NEW.fulfillment_manager_address, NEW.buyer_address)),
          LOWER(NEW.buyer_address),
          '/marketplace/orders/' || NEW.id::text,
          jsonb_build_object(
            'order_id', NEW.id,
            'product_id', NEW.product_id,
            'tracking_number', NEW.tracking_number,
            'new_status', NEW.status
          ),
          evt || ':' || NEW.id::text
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_milestone_reached(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_milestone_reached() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    BEGIN
      INSERT INTO explorer_events (
        type, category, title, actor, url, metadata, dedupe_key
      ) VALUES (
        'milestone_reached',
        'bounties',
        'Milestone reached: ' || COALESCE(NEW.deliverable_description, 'a milestone'),
        LOWER(COALESCE(NEW.completed_by, '')),
        '/bounty/' || NEW.bounty_id::text,
        jsonb_build_object(
          'milestone_id', NEW.id,
          'bid_id', NEW.bid_id,
          'bounty_id', NEW.bounty_id,
          'payment_amount', NEW.payment_amount
        ),
        'milestone_reached:' || NEW.id::text
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_pod_level_proposal_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_pod_level_proposal_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  proposal_url TEXT;
BEGIN
  BEGIN
    proposal_url := '/governance?proposal=' || NEW.id::text;
    INSERT INTO explorer_events (
      type, category, title, actor, pod_id, url, metadata, dedupe_key
    ) VALUES (
      'proposal_created',
      'governance',
      CASE
        WHEN NEW.governance_tier = 'POD_TREASURY_BINDING'
          THEN 'Pod treasury proposal created: ' || NEW.title
        ELSE 'Pod proposal created: ' || NEW.title
      END,
      LOWER(NEW.created_by),
      NEW.pod_id,
      proposal_url,
      jsonb_build_object(
        'proposal_id', NEW.id,
        'governance_tier', NEW.governance_tier,
        'voting_deadline', NEW.voting_deadline,
        'approval_threshold_bps', NEW.approval_threshold_bps,
        'quorum_threshold_bps', NEW.quorum_threshold_bps,
        'eligible_voter_count', NEW.eligible_voter_count,
        'onchain_proposal_id', NEW.onchain_proposal_id
      ),
      'proposal_created:pod_level:' || NEW.id::text
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_pod_member_applied(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_pod_member_applied() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: pulse_log_pod_member_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_pod_member_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  evt TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      evt := CASE
        WHEN NEW.status = 'approved' THEN 'pod_member_approved'
        WHEN NEW.status = 'rejected' THEN 'pod_member_rejected'
        ELSE NULL
      END;
      IF evt IS NOT NULL THEN
        INSERT INTO explorer_events (
          type, category, title, actor, recipient_address, pod_id, url, metadata, dedupe_key
        ) VALUES (
          evt,
          'members',
          CASE WHEN evt = 'pod_member_approved'
            THEN 'Pod application approved'
            ELSE 'Pod application rejected' END,
          NULL, -- approver identity isn't stored on the row directly
          LOWER(NEW.applicant_address),
          NEW.pod_id,
          '/pods/' || NEW.pod_id::text,
          jsonb_build_object(
            'application_id', NEW.id,
            'applicant_address', LOWER(NEW.applicant_address),
            'rejection_reason', NEW.rejection_reason
          ),
          evt || ':' || NEW.id::text
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: pulse_log_profile_updated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pulse_log_profile_updated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  meaningful BOOLEAN := FALSE;
  recent_count INT;
  wallet TEXT;
BEGIN
  IF (OLD.first_name IS DISTINCT FROM NEW.first_name) OR
     (OLD.last_name IS DISTINCT FROM NEW.last_name) OR
     (OLD.profile_picture IS DISTINCT FROM NEW.profile_picture) OR
     (OLD.bio IS DISTINCT FROM NEW.bio) OR
     (OLD.occupation IS DISTINCT FROM NEW.occupation) OR
     (OLD.skills_expertise IS DISTINCT FROM NEW.skills_expertise) THEN
    meaningful := TRUE;
  END IF;

  -- Skip the very first time a name is set — that's already covered by the
  -- existing /api/explorer/member-introduced flow.
  IF OLD.first_name IS NULL AND NEW.first_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF meaningful THEN
    BEGIN
      wallet := LOWER(NEW.wallet_address);
      SELECT COUNT(*) INTO recent_count
        FROM explorer_events
        WHERE type = 'profile_updated'
          AND actor = wallet
          AND created_at > NOW() - INTERVAL '24 hours';

      IF recent_count = 0 THEN
        INSERT INTO explorer_events (
          type, category, title, actor, url, metadata
        ) VALUES (
          'profile_updated',
          'members',
          'Profile updated',
          wallet,
          '/members',
          jsonb_build_object(
            'changed_first_name', OLD.first_name IS DISTINCT FROM NEW.first_name,
            'changed_last_name', OLD.last_name IS DISTINCT FROM NEW.last_name,
            'changed_picture', OLD.profile_picture IS DISTINCT FROM NEW.profile_picture,
            'changed_bio', OLD.bio IS DISTINCT FROM NEW.bio
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: rate_limit_hit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Floor "now" to the current fixed window so all hits in the same window
  -- share one row.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits as rl (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = rl.count + 1
  returning rl.count into v_count;

  -- Opportunistic cleanup: windows older than 2x the window size are dead.
  -- Cheap at this endpoint's volume; avoids needing pg_cron.
  delete from rate_limits
  where window_start < now() - make_interval(secs => p_window_seconds * 2);

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_window_start + make_interval(secs => p_window_seconds)
  );
end;
$$;


--
-- Name: search_forum_threads(text, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_forum_threads(search_query text, cat_id uuid DEFAULT NULL::uuid, result_limit integer DEFAULT 20, result_offset integer DEFAULT 0) RETURNS TABLE(id uuid, title text, content text, author_address text, category_id uuid, created_at timestamp with time zone, is_pinned boolean, is_locked boolean, is_resolved boolean, view_count integer, reply_count integer, last_reply_at timestamp with time zone, rank real)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.content,
    t.author_address,
    t.category_id,
    t.created_at,
    t.is_pinned,
    t.is_locked,
    t.is_resolved,
    COALESCE(t.view_count, 0)::INTEGER,
    COALESCE(t.reply_count, 0)::INTEGER,
    t.last_reply_at,
    ts_rank(t.search_vector, websearch_to_tsquery('english', search_query))::REAL AS rank
  FROM forum_threads t
  WHERE t.search_vector @@ websearch_to_tsquery('english', search_query)
    AND (cat_id IS NULL OR t.category_id = cat_id)
  ORDER BY rank DESC, t.created_at DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$;


--
-- Name: session_leads_pod(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_leads_pod(p_pod_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pods p
    WHERE p.id = p_pod_id
      AND (
        public.session_wallet() = ANY (SELECT lower(x) FROM unnest(COALESCE(p.pod_leads, '{}'::text[])) AS x)
        OR lower(COALESCE(p.created_by_address, '')) = public.session_wallet()
      )
  );
$$;


--
-- Name: session_wallet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.session_wallet() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT lower(NULLIF(auth.jwt() ->> 'wallet_address', ''));
$$;


--
-- Name: set_conference_room_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_conference_room_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_hand_raised_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_hand_raised_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.hand_raised = TRUE AND (OLD.hand_raised = FALSE OR OLD.hand_raised IS NULL) THEN
    NEW.hand_raised_at = NOW();
  ELSIF NEW.hand_raised = FALSE THEN
    NEW.hand_raised_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: shares_active_pod_with_current_user(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shares_active_pod_with_current_user(p_wallet text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH me AS (
    SELECT lower(COALESCE(
      current_setting('request.jwt.claims', true)::json ->> 'wallet_address',
      current_setting('request.jwt.claims', true)::json -> 'user_metadata' ->> 'wallet_address',
      ''
    )) AS w
  )
  SELECT EXISTS (
    SELECT 1
    FROM pod_members a
    JOIN pod_members b ON a.pod_id = b.pod_id
    CROSS JOIN me
    WHERE a.is_active = true AND b.is_active = true
      AND lower(a.wallet) = me.w
      AND lower(b.wallet) = lower(p_wallet)
  );
$$;


--
-- Name: stamp_explorer_actor_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_explorer_actor_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.actor_type := CASE WHEN is_agent_wallet(NEW.actor) THEN 'agent' ELSE 'human' END;
  RETURN NEW;
END;
$$;


--
-- Name: strip_html_tags(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.strip_html_tags(input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN regexp_replace(input, '<[^>]+>', ' ', 'g');
END;
$$;


--
-- Name: touch_member_locations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_member_locations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.wallet = lower(NEW.wallet);
  RETURN NEW;
END $$;


--
-- Name: touch_pod_places_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_pod_places_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


--
-- Name: treasury_transactions_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.treasury_transactions_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  bad text[];
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'A confirmed or failed treasury record is final' using errcode = '42501';
  end if;
  bad := array(
    select unnest(public.changed_columns(to_jsonb(old), to_jsonb(new)))
    except select unnest(array['status', 'tx_hash', 'block_number', 'block_timestamp',
                               'gas_used', 'updated_at'])
  );
  if cardinality(bad) > 0 then
    raise exception 'Treasury record details cannot be changed: %', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: trg_award_on_item_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_award_on_item_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cat uuid;
begin
  if new.completed is not true then
    return new;
  end if;
  select category_id into cat from knowledge_items where id = new.item_id;
  if cat is not null then
    perform public.award_course_accreditation(cat, new.user_address);
  end if;
  return new;
end;
$$;


--
-- Name: trigger_update_pod_member_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_update_pod_member_counts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update counts for the affected pod
    IF TG_OP = 'DELETE' THEN
        PERFORM update_pod_member_counts(OLD.pod_id);
        RETURN OLD;
    ELSE
        PERFORM update_pod_member_counts(NEW.pod_id);
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: update_dispute_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_dispute_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_governance_notifications_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_governance_notifications_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_governance_proposal_votes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_governance_proposal_votes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_hat_metadata_cache_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_hat_metadata_cache_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_notification_preferences_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notification_preferences_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_pod_member_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pod_member_counts(target_pod_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO pod_member_counts (pod_id, total_members, active_members, leaders_count)
    SELECT 
        target_pod_id,
        COUNT(*),
        COUNT(*) FILTER (WHERE is_active = true),
        COUNT(*) FILTER (WHERE is_active = true AND membership_type = 'leader')
    FROM pod_members 
    WHERE pod_id = target_pod_id
    ON CONFLICT (pod_id) 
    DO UPDATE SET
        total_members = EXCLUDED.total_members,
        active_members = EXCLUDED.active_members,
        leaders_count = EXCLUDED.leaders_count,
        last_updated = NOW();
END;
$$;


--
-- Name: update_pod_modules_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pod_modules_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_pod_role_permissions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pod_role_permissions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = COALESCE(OLD.version, 1) + 1;
  RETURN NEW;
END;
$$;


--
-- Name: update_system_supply(numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_system_supply(amount numeric, operation text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF operation = 'mint' THEN
    UPDATE system_supply_metadata
    SET
      total_supply = total_supply + amount,
      total_minted = total_minted + amount,
      total_donations_count = total_donations_count + 1,
      last_mint_at = NOW(),
      last_updated = NOW()
    WHERE id = 1;
  ELSIF operation = 'burn' THEN
    UPDATE system_supply_metadata
    SET
      total_supply = total_supply - amount,
      total_burned = total_burned + amount,
      total_burns_count = total_burns_count + 1,
      last_burn_at = NOW(),
      last_updated = NOW()
    WHERE id = 1;
  END IF;
END;
$$;


--
-- Name: update_task_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_task_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_thread_reply_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_thread_reply_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_threads SET
      reply_count = COALESCE(reply_count, 0) + 1,
      last_reply_at = NEW.created_at
    WHERE id = NEW.thread_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_threads SET
      reply_count = GREATEST(COALESCE(reply_count, 0) - 1, 0),
      last_reply_at = (
        SELECT MAX(created_at) FROM forum_posts
        WHERE thread_id = OLD.thread_id AND is_deleted IS NOT TRUE
      )
    WHERE id = OLD.thread_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle soft-delete toggle
    IF (OLD.is_deleted IS NOT TRUE) AND (NEW.is_deleted IS TRUE) THEN
      UPDATE forum_threads SET
        reply_count = GREATEST(COALESCE(reply_count, 0) - 1, 0),
        last_reply_at = (
          SELECT MAX(created_at) FROM forum_posts
          WHERE thread_id = NEW.thread_id AND is_deleted IS NOT TRUE AND id != NEW.id
        )
      WHERE id = NEW.thread_id;
    ELSIF (OLD.is_deleted IS TRUE) AND (NEW.is_deleted IS NOT TRUE) THEN
      UPDATE forum_threads SET
        reply_count = COALESCE(reply_count, 0) + 1,
        last_reply_at = GREATEST(COALESCE(last_reply_at, '1970-01-01'), NEW.created_at)
      WHERE id = NEW.thread_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_thread_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_thread_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english',
    coalesce(NEW.title, '') || ' ' || coalesce(strip_html_tags(NEW.content), '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_treasury_transactions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_treasury_transactions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_work_submissions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_work_submissions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: wallets_same_member(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wallets_same_member(a text, b text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(a) = lower(b)
    or exists (
      select 1
      from public.user_wallets x
      join public.user_wallets y on y.user_id = x.user_id
      where lower(x.wallet_address) = lower(a) and lower(y.wallet_address) = lower(b)
    )
    or exists (
      select 1
      from public.user_profiles up
      join public.user_wallets uw on uw.user_id = up.user_id
      where (lower(up.wallet_address) = lower(a) and lower(uw.wallet_address) = lower(b))
         or (lower(up.wallet_address) = lower(b) and lower(uw.wallet_address) = lower(a))
    );
$$;


--
-- Name: _postgrest_cache_breaker; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public._postgrest_cache_breaker AS
 SELECT CURRENT_TIMESTAMP AS last_refreshed,
    ('PostgREST schema cache cleared at '::text || (CURRENT_TIMESTAMP)::text) AS message;


--
-- Name: account_deletion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    email text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    notes text
);


--
-- Name: accreditations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accreditations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    course_category_id uuid,
    wallet_address text NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    source text DEFAULT 'course'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    issued_by text,
    revoked_at timestamp with time zone,
    revoked_by text,
    revoke_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accreditations_source_check CHECK ((source = ANY (ARRAY['course'::text, 'manual'::text])))
);


--
-- Name: governance_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_address character varying(42) NOT NULL,
    sender_address character varying(42) NOT NULL,
    notification_type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    context_url text,
    context_type character varying(50) DEFAULT 'governance'::character varying,
    context_id character varying(255),
    proposal_id character varying(255),
    transaction_hash character varying(66),
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sender_avatar_url text,
    sender_display_name text,
    notification_icon_url text,
    CONSTRAINT governance_notifications_notification_type_check CHECK (((notification_type)::text = ANY ((ARRAY['proposal_mentioned'::character varying, 'proposal_created'::character varying, 'proposal_voted'::character varying, 'proposal_executed'::character varying, 'proposal_cancelled'::character varying, 'token_holder_notification'::character varying, 'pod_approval_request'::character varying, 'pod_approved'::character varying, 'pod_rejected'::character varying])::text[]))),
    CONSTRAINT governance_notifications_safe_context_url CHECK (public.is_safe_app_path(context_url))
);


--
-- Name: proposal_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_metadata (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    onchain_proposal_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    proposer_address text NOT NULL,
    forum_thread_id text,
    category text DEFAULT 'general'::text,
    tags text[] DEFAULT '{}'::text[],
    mentions jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    token_id character varying(50),
    transaction_hash text,
    voting_start timestamp with time zone,
    voting_end timestamp with time zone,
    CONSTRAINT proposal_metadata_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text])))
);


--
-- Name: actionable_governance_notifications; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.actionable_governance_notifications AS
 SELECT n.id,
    n.recipient_address,
    n.sender_address,
    n.notification_type,
    n.title,
    n.message,
    n.context_url,
    n.context_type,
    n.context_id,
    n.proposal_id,
    n.transaction_hash,
    n.is_read,
    n.created_at,
    n.updated_at,
    m.status AS proposal_status
   FROM (public.governance_notifications n
     LEFT JOIN public.proposal_metadata m ON (((n.proposal_id)::text = m.onchain_proposal_id)))
  WHERE (m.status = 'active'::text);


--
-- Name: pod_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    wallet text NOT NULL,
    membership_type text NOT NULL,
    role text DEFAULT 'member'::text,
    hat_id text,
    is_active boolean DEFAULT true,
    joined_at timestamp with time zone DEFAULT now(),
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pod_members_membership_type_check CHECK ((membership_type = ANY (ARRAY['leader'::text, 'member'::text, 'admin'::text])))
);


--
-- Name: pods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    token_address text,
    status text DEFAULT 'draft'::text,
    parent_pod_id uuid,
    pod_leads text[] DEFAULT '{}'::text[],
    treasury_contract_address text,
    management_hat_id text,
    membership_hat_id text,
    governance_proposal_id text,
    created_by_address text,
    pod_image_url text,
    pod_metadata jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT false,
    treasury_deployed_at timestamp with time zone,
    factory_address text,
    leader_consensus_threshold integer DEFAULT 3,
    treasury_threshold_usd text DEFAULT '100'::text,
    bounty_threshold_usd text DEFAULT '500'::text,
    event_threshold_usd text DEFAULT '200'::text,
    proxy_contract_address text,
    proxy_admin_hat_id text,
    blockchain_pod_id text,
    parent_hat_id text,
    creation_manager_address text,
    gov_op_quorum_bps integer,
    gov_op_approval_bps integer,
    gov_op_voting_hours integer,
    gov_treasury_quorum_bps integer,
    gov_treasury_approval_bps integer,
    gov_treasury_voting_hours integer,
    gov_op_voter_base text,
    gov_treasury_voter_base text,
    gov_snapshot_enabled boolean DEFAULT false NOT NULL,
    gov_snapshot_token_id text,
    gov_snapshot_minimum numeric,
    treasury_threshold_bps integer,
    CONSTRAINT pods_gov_op_approval_range CHECK (((gov_op_approval_bps IS NULL) OR ((gov_op_approval_bps >= 5001) AND (gov_op_approval_bps <= 10000)))),
    CONSTRAINT pods_gov_op_hours_range CHECK (((gov_op_voting_hours IS NULL) OR ((gov_op_voting_hours >= 12) AND (gov_op_voting_hours <= 720)))),
    CONSTRAINT pods_gov_op_quorum_range CHECK (((gov_op_quorum_bps IS NULL) OR ((gov_op_quorum_bps >= 2000) AND (gov_op_quorum_bps <= 10000)))),
    CONSTRAINT pods_gov_op_voter_base_check CHECK (((gov_op_voter_base IS NULL) OR (gov_op_voter_base = ANY (ARRAY['leaders'::text, 'all_members'::text])))),
    CONSTRAINT pods_gov_treasury_approval_range CHECK (((gov_treasury_approval_bps IS NULL) OR ((gov_treasury_approval_bps >= 5001) AND (gov_treasury_approval_bps <= 10000)))),
    CONSTRAINT pods_gov_treasury_hours_range CHECK (((gov_treasury_voting_hours IS NULL) OR ((gov_treasury_voting_hours >= 12) AND (gov_treasury_voting_hours <= 720)))),
    CONSTRAINT pods_gov_treasury_quorum_range CHECK (((gov_treasury_quorum_bps IS NULL) OR ((gov_treasury_quorum_bps >= 2000) AND (gov_treasury_quorum_bps <= 10000)))),
    CONSTRAINT pods_gov_treasury_voter_base_check CHECK (((gov_treasury_voter_base IS NULL) OR (gov_treasury_voter_base = ANY (ARRAY['leaders'::text, 'all_members'::text])))),
    CONSTRAINT pods_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text, 'active'::text, 'inactive'::text, 'pending_review'::text, 'vetoed'::text]))),
    CONSTRAINT pods_treasury_threshold_bps_range CHECK (((treasury_threshold_bps IS NULL) OR ((treasury_threshold_bps >= 5001) AND (treasury_threshold_bps <= 10000))))
);


--
-- Name: active_pod_members; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_pod_members WITH (security_invoker='true') AS
 SELECT pm.id,
    pm.pod_id,
    pm.wallet,
    pm.hat_id,
    pm.membership_type,
    pm.role,
    pm.is_active,
    pm.joined_at,
    pm.removed_at,
    pm.created_at,
    pm.updated_at,
    p.name AS pod_name,
    p.management_hat_id,
    p.membership_hat_id,
    p.status AS pod_status
   FROM (public.pod_members pm
     LEFT JOIN public.pods p ON ((pm.pod_id = p.id)))
  WHERE (pm.is_active = true);


--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id uuid,
    activity_type text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: admin_token_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_token_definitions (
    id integer NOT NULL,
    contract_address text NOT NULL,
    token_id integer NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_token_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_token_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_token_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_token_definitions_id_seq OWNED BY public.admin_token_definitions.id;


--
-- Name: agent_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_context (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    context_type text NOT NULL,
    data jsonb NOT NULL,
    summary text,
    version integer DEFAULT 1,
    CONSTRAINT agent_context_context_type_check CHECK ((context_type = ANY (ARRAY['org_state'::text, 'app_metrics'::text, 'forum_health'::text, 'pod_health'::text, 'user_growth'::text, 'governance_status'::text])))
);


--
-- Name: agent_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    thread_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb,
    CONSTRAINT agent_conversations_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: agent_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id uuid,
    memory_type text NOT NULL,
    memory_date date,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT agent_memory_memory_type_check CHECK ((memory_type = ANY (ARRAY['working'::text, 'daily'::text, 'long_term'::text, 'session'::text])))
);


--
-- Name: agent_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    rationale text NOT NULL,
    steps jsonb NOT NULL,
    deliverable text,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_at timestamp with time zone,
    approved_by text,
    executed_at timestamp with time zone,
    execution_result jsonb,
    priority integer DEFAULT 0,
    CONSTRAINT agent_proposals_category_check CHECK ((category = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))),
    CONSTRAINT agent_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'executed'::text, 'failed'::text])))
);


--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text NOT NULL,
    input_context jsonb NOT NULL,
    output jsonb NOT NULL,
    duration_ms integer,
    tokens_used integer,
    CONSTRAINT agent_runs_mode_check CHECK ((mode = ANY (ARRAY['daily'::text, 'weekly'::text, 'query'::text, 'context_update'::text])))
);


--
-- Name: approval_signatures_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_signatures_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_type text NOT NULL,
    workflow_id uuid NOT NULL,
    approver_address text NOT NULL,
    signature text NOT NULL,
    signed_message text NOT NULL,
    signed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT approval_signatures_audit_workflow_type_check CHECK ((workflow_type = ANY (ARRAY['pod_deletion'::text, 'bounty'::text, 'event'::text, 'treasury'::text, 'role_permission'::text])))
);


--
-- Name: bid_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bid_reviews (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bid_id uuid NOT NULL,
    reviewer_address text NOT NULL,
    review_type text NOT NULL,
    status text NOT NULL,
    comments text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bid_reviews_review_type_check CHECK ((review_type = ANY (ARRAY['technical'::text, 'final'::text]))),
    CONSTRAINT bid_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: bid_state_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bid_state_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_hash text NOT NULL,
    bid_id uuid NOT NULL,
    bounty_id uuid NOT NULL,
    update_type text NOT NULL,
    onchain_bounty_id text,
    onchain_bid_index integer,
    new_status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT bid_state_updates_update_type_check CHECK ((update_type = ANY (ARRAY['approval'::text, 'completion'::text, 'cancellation'::text])))
);


--
-- Name: bids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bounty_id uuid,
    bidder_address text NOT NULL,
    experience text,
    plan_of_action text,
    deliverables text,
    timeline text,
    proposed_amount numeric(36,18) NOT NULL,
    answers jsonb,
    additional_notes text,
    submitted_at timestamp with time zone DEFAULT now(),
    status text,
    final_approver_address text,
    payment_details jsonb DEFAULT '{}'::jsonb,
    payment_option text DEFAULT 'completion'::text NOT NULL,
    reviewer_address text,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    onchain_bid_index integer,
    placement_tx_hash text,
    bid_ipfs_hash text,
    CONSTRAINT bids_payment_option_check CHECK ((payment_option = ANY (ARRAY['completion'::text, 'milestones'::text, 'split'::text]))),
    CONSTRAINT chk_onchain_bid_index_positive CHECK (((onchain_bid_index IS NULL) OR (onchain_bid_index >= 0)))
);


--
-- Name: bounties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    value_amount numeric(36,18) NOT NULL,
    value_token text NOT NULL,
    requirements text,
    questions jsonb,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    creator_address text NOT NULL,
    tech_reviewer text[],
    tech_reviewer_address text,
    final_reviewer text,
    final_reviewer_address text,
    onchain_id bigint,
    requires_multisig boolean DEFAULT false,
    approval_threshold integer DEFAULT 1,
    restriction_level text DEFAULT 'public'::text,
    required_pod_id uuid,
    ipfs_hash text,
    updated_at timestamp with time zone DEFAULT now(),
    blockchain_id text,
    transaction_hash text,
    pod_id uuid,
    funding_source text DEFAULT 'wallet'::text,
    payment_type text DEFAULT 'completion'::text,
    deadline timestamp with time zone,
    bid_acceptance_mode text DEFAULT 'single'::text,
    max_bids_accepted integer DEFAULT 1,
    bids_accepted_count integer DEFAULT 0,
    cancellation_reason text,
    cancelled_at timestamp with time zone,
    cancelled_by text,
    cancellation_tx_hash text,
    tasks jsonb DEFAULT '[]'::jsonb,
    estimated_hours numeric DEFAULT 0 NOT NULL,
    CONSTRAINT bounties_bid_acceptance_mode_check CHECK ((bid_acceptance_mode = ANY (ARRAY['single'::text, 'multiple'::text, 'unlimited'::text, 'date_limited'::text]))),
    CONSTRAINT bounties_estimated_hours_check CHECK ((estimated_hours >= (0)::numeric)),
    CONSTRAINT bounties_funding_source_check CHECK ((funding_source = ANY (ARRAY['wallet'::text, 'pod_treasury'::text]))),
    CONSTRAINT bounties_payment_type_check CHECK ((payment_type = ANY (ARRAY['completion'::text, 'milestones'::text, 'split'::text]))),
    CONSTRAINT bounties_restriction_level_check CHECK ((restriction_level = ANY (ARRAY['public'::text, 'token_holders'::text, 'pod_members'::text, 'invite_only'::text])))
);


--
-- Name: bounty_token_gates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounty_token_gates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bounty_id uuid NOT NULL,
    hat_id bigint,
    hat_name text NOT NULL,
    token_type text DEFAULT 'hat'::text NOT NULL,
    min_balance numeric DEFAULT 1,
    contract_address text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bounty_token_gates_token_type_check CHECK ((token_type = ANY (ARRAY['hat'::text, 'erc20'::text, 'erc721'::text, 'pod'::text, 'event'::text, 'accreditation'::text])))
);


--
-- Name: bounty_access_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bounty_access_view AS
 SELECT b.id AS bounty_id,
    b.title,
    b.restriction_level,
    b.creator_address,
    b.status,
    COALESCE(array_agg(DISTINCT jsonb_build_object('hat_id', btg.hat_id, 'hat_name', btg.hat_name, 'min_balance', btg.min_balance)) FILTER (WHERE (btg.hat_id IS NOT NULL)), ARRAY[]::jsonb[]) AS token_requirements
   FROM (public.bounties b
     LEFT JOIN public.bounty_token_gates btg ON ((b.id = btg.bounty_id)))
  GROUP BY b.id, b.title, b.restriction_level, b.creator_address, b.status;


--
-- Name: bounty_approval_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounty_approval_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bounty_id uuid NOT NULL,
    approval_type text NOT NULL,
    required_approvals integer DEFAULT 3 NOT NULL,
    current_approvals text[] DEFAULT '{}'::text[],
    approval_signatures jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    threshold_value text NOT NULL,
    operation_details jsonb NOT NULL,
    proposed_by text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    executed_at timestamp with time zone,
    executed_by text,
    CONSTRAINT bounty_approval_workflows_approval_type_check CHECK ((approval_type = ANY (ARRAY['creation'::text, 'milestone'::text, 'completion'::text, 'cancellation'::text]))),
    CONSTRAINT bounty_approval_workflows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'executed'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: bounty_disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounty_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bounty_id uuid NOT NULL,
    bid_id uuid,
    work_submission_id uuid,
    filed_by text NOT NULL,
    filed_against text NOT NULL,
    filer_role text NOT NULL,
    dispute_type text NOT NULL,
    dispute_title text NOT NULL,
    dispute_description text NOT NULL,
    desired_resolution text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    resolution_type text,
    resolution_notes text,
    resolved_by text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    is_escalated boolean DEFAULT false,
    escalated_at timestamp with time zone,
    escalated_by text,
    disputed_amount text,
    disputed_token text,
    CONSTRAINT bounty_disputes_dispute_type_check CHECK ((dispute_type = ANY (ARRAY['work_quality'::text, 'work_incomplete'::text, 'payment_not_released'::text, 'scope_changed'::text, 'deadline_missed'::text, 'communication_failed'::text, 'terms_violated'::text, 'other'::text]))),
    CONSTRAINT bounty_disputes_disputed_token_check CHECK ((disputed_token = ANY (ARRAY['SYSTEM'::text, 'SELF'::text]))),
    CONSTRAINT bounty_disputes_filer_role_check CHECK ((filer_role = ANY (ARRAY['creator'::text, 'bidder'::text]))),
    CONSTRAINT bounty_disputes_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT bounty_disputes_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['payment_released'::text, 'payment_refunded'::text, 'partial_payment'::text, 'work_revision_required'::text, 'bounty_cancelled'::text, 'no_action'::text, 'other'::text]))),
    CONSTRAINT bounty_disputes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'awaiting_evidence'::text, 'pending_resolution'::text, 'resolved_for_creator'::text, 'resolved_for_bidder'::text, 'resolved_compromise'::text, 'withdrawn'::text, 'closed'::text]))),
    CONSTRAINT valid_bounty_reference CHECK ((bounty_id IS NOT NULL)),
    CONSTRAINT valid_resolution_data CHECK ((((status = ANY (ARRAY['resolved_for_creator'::text, 'resolved_for_bidder'::text, 'resolved_compromise'::text])) AND (resolution_type IS NOT NULL) AND (resolved_by IS NOT NULL) AND (resolved_at IS NOT NULL)) OR (status <> ALL (ARRAY['resolved_for_creator'::text, 'resolved_for_bidder'::text, 'resolved_compromise'::text]))))
);


--
-- Name: bounty_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounty_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bounty_id uuid NOT NULL,
    inviter_address text NOT NULL,
    invitee_address text NOT NULL,
    status text DEFAULT 'pending'::text,
    invited_at timestamp with time zone DEFAULT now(),
    responded_at timestamp with time zone,
    CONSTRAINT bounty_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: bounty_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bounty_notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    recipient_address text NOT NULL,
    bounty_id uuid,
    bid_id uuid,
    notification_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bounty_notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['bid_submitted'::text, 'bid_approved'::text, 'bid_rejected'::text, 'review_requested'::text, 'deliverable_due'::text, 'milestone_completed'::text, 'bounty_completed'::text])))
);


--
-- Name: bounty_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.bounty_stats AS
 SELECT count(*) AS total_bounties,
    count(
        CASE
            WHEN (bounties.status = 'open'::text) THEN 1
            ELSE NULL::integer
        END) AS open_bounties,
    count(
        CASE
            WHEN (bounties.status = 'in-progress'::text) THEN 1
            ELSE NULL::integer
        END) AS in_progress_bounties,
    count(
        CASE
            WHEN (bounties.status = 'completed'::text) THEN 1
            ELSE NULL::integer
        END) AS completed_bounties,
    sum(
        CASE
            WHEN (bounties.status = 'completed'::text) THEN (bounties.value_amount)::numeric
            ELSE (0)::numeric
        END) AS total_paid_out
   FROM public.bounties;


--
-- Name: burn_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.burn_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    burn_request_id uuid,
    approver_wallet text NOT NULL,
    approver_hat_id text NOT NULL,
    approved_at timestamp with time zone DEFAULT now(),
    approval_signature text
);


--
-- Name: burn_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.burn_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_wallet text NOT NULL,
    system_amount numeric(18,8) NOT NULL,
    fiat_amount numeric(10,2) NOT NULL,
    recipient_bank_account_encrypted text,
    recipient_bank_routing_encrypted text,
    recipient_name text NOT NULL,
    status text DEFAULT 'pending_approval'::text NOT NULL,
    burn_tx_hash text,
    burn_confirmed_at timestamp with time zone,
    mercury_transaction_id text,
    mercury_payout_confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    completed_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    notes text,
    CONSTRAINT burn_requests_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'burning'::text, 'burned'::text, 'pending_payment'::text, 'completed'::text, 'rejected'::text]))),
    CONSTRAINT burn_requests_system_amount_check CHECK ((system_amount >= 50.00))
);


--
-- Name: chat_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    required_token text,
    created_at timestamp with time zone DEFAULT now(),
    pod_id uuid,
    is_active boolean DEFAULT true,
    access_level text DEFAULT 'both'::text,
    created_by_address text,
    CONSTRAINT chat_groups_access_level_check CHECK ((access_level = ANY (ARRAY['managers'::text, 'members'::text, 'both'::text])))
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    sender_wallet_id text,
    attachments jsonb,
    chat_group_id text,
    created_at timestamp without time zone DEFAULT now(),
    receiver_wallet_id text,
    is_read boolean,
    required_token text,
    sender_profile_picture text,
    is_pinned boolean DEFAULT false,
    is_direct_message boolean DEFAULT false,
    actor_type text DEFAULT 'human'::text NOT NULL,
    CONSTRAINT chat_messages_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'agent'::text])))
);


--
-- Name: chat_moderation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_moderation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_group_id uuid NOT NULL,
    action text NOT NULL,
    message_id uuid,
    target_user_wallet text,
    moderator_id uuid,
    moderator_wallet text,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chat_moderation_log_action_check CHECK ((action = ANY (ARRAY['delete'::text, 'mute'::text, 'unmute'::text, 'pin'::text, 'unpin'::text])))
);


--
-- Name: chat_muted_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_muted_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_group_id uuid NOT NULL,
    user_wallet text NOT NULL,
    muted_by uuid,
    muted_at timestamp with time zone DEFAULT now(),
    muted_until timestamp with time zone,
    reason text
);


--
-- Name: community_agent_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_agent_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    type text NOT NULL,
    thread_id uuid,
    post_id uuid,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'posted'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT community_agent_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'failed'::text]))),
    CONSTRAINT community_agent_posts_type_check CHECK ((type = ANY (ARRAY['daily_discussion'::text, 'event_creation'::text, 'mention_reply'::text, 'chat_reply'::text, 'ritual'::text, 'current_events'::text])))
);


--
-- Name: community_agent_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_agent_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    trigger_post_id uuid NOT NULL,
    trigger_wallet text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT community_agent_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: community_agent_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_agent_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    status text DEFAULT 'inactive'::text NOT NULL,
    activated_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_payment_tx text,
    amount_system numeric DEFAULT 15,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    remaining_days double precision,
    paused_at timestamp with time zone,
    CONSTRAINT community_agent_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text])))
);


--
-- Name: conference_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conference_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    wallet_address text NOT NULL,
    display_name text,
    avatar_url text,
    role text DEFAULT 'attendee'::text NOT NULL,
    can_publish boolean DEFAULT false,
    hand_raised boolean DEFAULT false,
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone,
    is_active boolean DEFAULT true
);


--
-- Name: conference_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conference_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    sender_wallet text NOT NULL,
    emoji text NOT NULL,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: conference_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conference_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    pod_id uuid,
    room_name text NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    host_wallet text NOT NULL,
    max_participants integer DEFAULT 200,
    settings jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dispute_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    author_address text NOT NULL,
    author_role text NOT NULL,
    comment_text text NOT NULL,
    comment_type text DEFAULT 'discussion'::text NOT NULL,
    is_private boolean DEFAULT false,
    reply_to_comment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_edited boolean DEFAULT false,
    edited_at timestamp with time zone,
    CONSTRAINT dispute_comments_author_role_check CHECK ((author_role = ANY (ARRAY['creator'::text, 'bidder'::text, 'pod_leader'::text, 'mediator'::text, 'system'::text]))),
    CONSTRAINT dispute_comments_comment_type_check CHECK ((comment_type = ANY (ARRAY['discussion'::text, 'status_update'::text, 'resolution_proposal'::text, 'evidence_submission'::text, 'system_message'::text, 'private_note'::text])))
);


--
-- Name: dispute_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    submitted_by text NOT NULL,
    submitter_role text NOT NULL,
    evidence_type text NOT NULL,
    evidence_title text NOT NULL,
    evidence_description text NOT NULL,
    file_urls text[] DEFAULT '{}'::text[],
    external_links text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_verified boolean DEFAULT false,
    verified_by text,
    verified_at timestamp with time zone,
    display_order integer DEFAULT 0,
    CONSTRAINT dispute_evidence_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['work_sample'::text, 'communication_log'::text, 'contract_document'::text, 'payment_proof'::text, 'timeline_proof'::text, 'requirement_proof'::text, 'screenshot'::text, 'video'::text, 'document'::text, 'link'::text, 'other'::text]))),
    CONSTRAINT dispute_evidence_submitter_role_check CHECK ((submitter_role = ANY (ARRAY['creator'::text, 'bidder'::text, 'mediator'::text, 'pod_leader'::text])))
);


--
-- Name: dispute_mediators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_mediators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    mediator_address text NOT NULL,
    assigned_by text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    recusal_reason text,
    recused_at timestamp with time zone,
    mediator_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dispute_mediators_status_check CHECK ((status = ANY (ARRAY['active'::text, 'recused'::text, 'removed'::text, 'completed'::text])))
);


--
-- Name: dispute_resolutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_resolutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    proposed_by text NOT NULL,
    proposer_role text NOT NULL,
    resolution_type text NOT NULL,
    resolution_description text NOT NULL,
    payment_amount text,
    payment_token text,
    payment_recipient text,
    revision_requirements text,
    revision_deadline timestamp with time zone,
    status text DEFAULT 'proposed'::text NOT NULL,
    creator_approved boolean DEFAULT false,
    bidder_approved boolean DEFAULT false,
    pod_leader_approved boolean DEFAULT false,
    approved_by text[],
    rejected_by text[],
    executed_at timestamp with time zone,
    executed_by text,
    execution_tx_hash text,
    execution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dispute_resolutions_payment_token_check CHECK ((payment_token = ANY (ARRAY['SYSTEM'::text, 'SELF'::text]))),
    CONSTRAINT dispute_resolutions_proposer_role_check CHECK ((proposer_role = ANY (ARRAY['creator'::text, 'bidder'::text, 'pod_leader'::text, 'mediator'::text]))),
    CONSTRAINT dispute_resolutions_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['payment_released'::text, 'payment_refunded'::text, 'partial_payment'::text, 'work_revision_required'::text, 'bounty_cancelled'::text, 'extend_deadline'::text, 'reduce_scope'::text, 'no_action'::text, 'other'::text]))),
    CONSTRAINT dispute_resolutions_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text, 'executed'::text, 'failed'::text])))
);


--
-- Name: dm_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_id text NOT NULL,
    blocked_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: donation_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.donation_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    donation_id uuid,
    approver_wallet text NOT NULL,
    approver_hat_id text NOT NULL,
    approved_at timestamp with time zone DEFAULT now(),
    approval_signature text
);


--
-- Name: email_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_wallet text NOT NULL,
    email text NOT NULL,
    pod_id uuid,
    invite_code text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    accepted_wallet text
);


--
-- Name: event_agendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_agendas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    agenda_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_approval_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_approval_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    approval_type text NOT NULL,
    required_approvals integer DEFAULT 2 NOT NULL,
    current_approvals text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text,
    threshold_value text,
    operation_details jsonb,
    proposed_by text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    executed_at timestamp with time zone,
    executed_by text,
    CONSTRAINT event_approval_workflows_approval_type_check CHECK ((approval_type = ANY (ARRAY['creation'::text, 'completion'::text, 'certificate_batch'::text, 'fund_distribution'::text]))),
    CONSTRAINT event_approval_workflows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'executed'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: event_escrow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_escrow (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    escrow_account_id text NOT NULL,
    escrow_account_address text,
    total_self_amount text DEFAULT '0'::text,
    total_system_amount text DEFAULT '0'::text,
    distributed boolean DEFAULT false,
    distributed_at timestamp with time zone,
    distribution_tx_hash text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    recipient_address text NOT NULL,
    event_id uuid,
    registration_id uuid,
    notification_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    context_url text,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    sender_avatar_url text,
    sender_display_name text,
    notification_icon_url text,
    event_image_url text,
    CONSTRAINT event_notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['event_created'::text, 'event_updated'::text, 'event_cancelled'::text, 'registration_confirmed'::text, 'registration_cancelled'::text, 'event_one_week_reminder'::text, 'event_day_reminder'::text, 'event_starting_soon'::text, 'event_completed'::text, 'check_in_required'::text, 'completion_nft_ready'::text]))),
    CONSTRAINT event_notifications_safe_context_url CHECK (public.is_safe_app_path(context_url))
);


--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_registrations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_address text NOT NULL,
    registration_status text DEFAULT 'registered'::text NOT NULL,
    registration_token_id text,
    completion_token_id text,
    payment_amount text DEFAULT '0'::text,
    payment_token text DEFAULT 'free'::text,
    payment_tx_hash text,
    payment_status text DEFAULT 'pending'::text,
    registered_at timestamp with time zone DEFAULT now(),
    checked_in_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    checked_in_by text,
    CONSTRAINT event_registrations_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'completed'::text, 'refunded'::text, 'refund_pending'::text]))),
    CONSTRAINT event_registrations_registration_status_check CHECK ((registration_status = ANY (ARRAY['registered'::text, 'cancelled'::text, 'checked_in'::text, 'completed'::text])))
);


--
-- Name: event_required_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_required_tokens (
    event_id uuid NOT NULL,
    token_or_hat text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.event_stats AS
 SELECT count(*) AS total_events,
    count(
        CASE
            WHEN (events.status = 'published'::text) THEN 1
            ELSE NULL::integer
        END) AS published_events,
    count(
        CASE
            WHEN (events.status = 'completed'::text) THEN 1
            ELSE NULL::integer
        END) AS completed_events,
    count(
        CASE
            WHEN (events.event_date > now()) THEN 1
            ELSE NULL::integer
        END) AS upcoming_events,
    count(
        CASE
            WHEN ((events.event_date < now()) AND (events.status = 'published'::text)) THEN 1
            ELSE NULL::integer
        END) AS past_events
   FROM public.events;


--
-- Name: event_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_tokens (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    token_type text NOT NULL,
    contract_address text NOT NULL,
    token_id text NOT NULL,
    token_name text,
    token_description text,
    token_image_url text,
    token_metadata jsonb DEFAULT '{}'::jsonb,
    owner_address text NOT NULL,
    minted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_tokens_token_type_check CHECK ((token_type = ANY (ARRAY['registration'::text, 'completion'::text])))
);


--
-- Name: events_with_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.events_with_stats WITH (security_invoker='true') AS
 SELECT e.id,
    e.title,
    e.description,
    e.event_date,
    e.event_end_date,
    e.location,
    e.max_attendees,
    e.price_amount,
    e.price_token,
    e.required_tokens,
    e.organizing_pod_id,
    e.fund_recipient_pod_id,
    e.fund_recipient_type,
    e.creator_address,
    e.registration_contract_address,
    e.completion_contract_address,
    e.status,
    e.qr_code_data,
    e.event_image_url,
    e.event_metadata,
    e.created_at,
    e.updated_at,
    COALESCE(reg_stats.registration_count, (0)::bigint) AS registration_count,
    COALESCE(reg_stats.checked_in_count, (0)::bigint) AS checked_in_count,
    COALESCE(reg_stats.completed_count, (0)::bigint) AS completed_count
   FROM (public.events e
     LEFT JOIN ( SELECT event_registrations.event_id,
            count(*) AS registration_count,
            count(
                CASE
                    WHEN (event_registrations.registration_status = 'checked_in'::text) THEN 1
                    ELSE NULL::integer
                END) AS checked_in_count,
            count(
                CASE
                    WHEN (event_registrations.registration_status = 'completed'::text) THEN 1
                    ELSE NULL::integer
                END) AS completed_count
           FROM public.event_registrations
          WHERE (event_registrations.registration_status <> 'cancelled'::text)
          GROUP BY event_registrations.event_id) reg_stats ON ((e.id = reg_stats.event_id)));


--
-- Name: explorer_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.explorer_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    actor text,
    title text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    category text,
    recipient_address text,
    pod_id uuid,
    amount_value numeric,
    amount_token text,
    url text,
    dedupe_key text,
    actor_type text DEFAULT 'human'::text NOT NULL,
    CONSTRAINT explorer_events_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'agent'::text])))
);


--
-- Name: forum_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_address text NOT NULL,
    thread_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_category_required_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_category_required_tokens (
    forum_category_id uuid NOT NULL,
    token_or_hat text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL
);


--
-- Name: forum_featured_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_featured_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    category_id uuid,
    featured_by text NOT NULL,
    feature_type text DEFAULT 'pinned'::text,
    display_order integer DEFAULT 0,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    CONSTRAINT forum_featured_content_feature_type_check CHECK ((feature_type = ANY (ARRAY['pinned'::text, 'featured'::text, 'announcement'::text])))
);


--
-- Name: forum_media_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_media_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    thread_id uuid,
    uploader_address text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size_bytes integer NOT NULL,
    storage_path text NOT NULL,
    public_url text,
    is_embedded boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_moderator_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_moderator_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    moderator_address text NOT NULL,
    moderator_hat_id text,
    action_type text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT forum_moderator_actions_action_type_check CHECK ((action_type = ANY (ARRAY['pin'::text, 'unpin'::text, 'lock'::text, 'unlock'::text, 'delete'::text, 'ban'::text, 'mute'::text, 'feature'::text, 'unfeature'::text]))),
    CONSTRAINT forum_moderator_actions_target_type_check CHECK ((target_type = ANY (ARRAY['thread'::text, 'post'::text, 'user'::text])))
);


--
-- Name: forum_poll_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_poll_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    option_text text NOT NULL,
    option_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_poll_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    option_id uuid NOT NULL,
    voter_address text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_poll_results; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.forum_poll_results AS
 SELECT po.poll_id,
    po.id AS option_id,
    po.option_text,
    count(pv.id) AS vote_count
   FROM (public.forum_poll_options po
     LEFT JOIN public.forum_poll_votes pv ON ((pv.option_id = po.id)))
  GROUP BY po.poll_id, po.id, po.option_text, po.option_order
  ORDER BY po.poll_id, po.option_order;


--
-- Name: forum_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    question text NOT NULL,
    description text,
    allow_multiple boolean DEFAULT false,
    expires_at timestamp with time zone,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_post_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_post_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    thread_id uuid,
    reactor_address text NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_post_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_post_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    thread_id uuid,
    reporter_address text NOT NULL,
    report_type text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT forum_post_reports_report_type_check CHECK ((report_type = ANY (ARRAY['spam'::text, 'abuse'::text, 'off-topic'::text, 'harassment'::text, 'other'::text]))),
    CONSTRAINT forum_post_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text, 'actioned'::text])))
);


--
-- Name: forum_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    content text NOT NULL,
    content_markdown text,
    content_html text,
    content_type text DEFAULT 'plain'::text,
    author_address text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    edit_history jsonb DEFAULT '[]'::jsonb,
    edited_at timestamp with time zone,
    edited_by text,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    deleted_by text,
    actor_type text DEFAULT 'human'::text NOT NULL,
    CONSTRAINT forum_posts_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'agent'::text])))
);


--
-- Name: forum_proposal_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_proposal_links (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    forum_thread_id text NOT NULL,
    proposal_id uuid NOT NULL,
    link_type text DEFAULT 'discussion'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT forum_proposal_links_link_type_check CHECK ((link_type = ANY (ARRAY['discussion'::text, 'formalization'::text, 'reference'::text])))
);


--
-- Name: forum_reaction_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.forum_reaction_counts AS
 SELECT COALESCE((forum_post_reactions.post_id)::text, (forum_post_reactions.thread_id)::text) AS target_id,
        CASE
            WHEN (forum_post_reactions.post_id IS NOT NULL) THEN 'post'::text
            ELSE 'thread'::text
        END AS target_type,
    forum_post_reactions.reaction_type,
    count(*) AS count
   FROM public.forum_post_reactions
  GROUP BY forum_post_reactions.post_id, forum_post_reactions.thread_id, forum_post_reactions.reaction_type;


--
-- Name: forum_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_templates (
    id text NOT NULL,
    name text NOT NULL,
    title_template text NOT NULL,
    content_template text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    placeholders jsonb
);


--
-- Name: forum_thread_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_thread_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_address text NOT NULL,
    category_id uuid,
    title text,
    content text,
    content_markdown text,
    draft_type text DEFAULT 'thread'::text,
    parent_thread_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT forum_thread_drafts_draft_type_check CHECK ((draft_type = ANY (ARRAY['thread'::text, 'post'::text])))
);


--
-- Name: forum_thread_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_thread_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_address text NOT NULL,
    thread_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_thread_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_thread_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid,
    summary_text text NOT NULL,
    key_points jsonb DEFAULT '[]'::jsonb,
    generated_by text DEFAULT 'sensemaker-ai'::text,
    generated_at timestamp with time zone DEFAULT now(),
    is_stale boolean DEFAULT false,
    last_post_count integer DEFAULT 0,
    sentiment character varying(20) DEFAULT 'neutral'::character varying
);


--
-- Name: forum_thread_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_thread_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    tag text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: forum_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    title text NOT NULL,
    content text,
    content_markdown text,
    content_html text,
    content_type text DEFAULT 'plain'::text,
    author_address text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_pinned boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    pinned_at timestamp with time zone,
    pinned_by text,
    edit_history jsonb DEFAULT '[]'::jsonb,
    edited_at timestamp with time zone,
    edited_by text,
    view_count integer DEFAULT 0,
    search_vector tsvector,
    is_resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by text,
    reply_count integer DEFAULT 0,
    last_reply_at timestamp with time zone,
    actor_type text DEFAULT 'human'::text NOT NULL,
    CONSTRAINT forum_threads_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'agent'::text])))
);


--
-- Name: forum_user_mutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_user_mutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_address text NOT NULL,
    muted_by text NOT NULL,
    reason text,
    mute_type text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    CONSTRAINT forum_user_mutes_mute_type_check CHECK ((mute_type = ANY (ARRAY['temporary'::text, 'permanent'::text, 'shadow'::text])))
);


--
-- Name: general_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    recipient_address text NOT NULL,
    sender_address text NOT NULL,
    notification_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    context_url text,
    context_type text,
    context_id text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    sender_avatar_url text,
    sender_display_name text,
    notification_icon_url text,
    custom_image_url text,
    priority text DEFAULT 'medium'::text NOT NULL,
    CONSTRAINT check_notification_type CHECK ((notification_type = ANY (ARRAY['user_mentioned'::text, 'forum_reply'::text, 'chat_message'::text, 'bounty_update'::text, 'proposal_executed'::text, 'purchase_completed'::text, 'order_status_updated'::text, 'pod_leadership_invitation'::text, 'pod_membership_invitation'::text, 'event_cancellation'::text, 'event_update'::text, 'event_reminder'::text, 'pod_member_removed'::text, 'pod_member_joined'::text, 'pod_application_status'::text, 'new_account_created'::text, 'event_registration'::text, 'event_checkin'::text, 'event_checkin_prompt'::text, 'completion_certificate'::text, 'video_call_requested'::text, 'video_call_missed'::text, 'video_call_declined'::text, 'system_alert'::text, 'survey_published'::text, 'pod_face_published'::text]))),
    CONSTRAINT general_notifications_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT general_notifications_safe_context_url CHECK (public.is_safe_app_path(context_url))
);


--
-- Name: gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id text NOT NULL,
    recipient_id text NOT NULL,
    token text NOT NULL,
    amount text NOT NULL,
    message text,
    transaction_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gifts_token_check CHECK ((token = ANY (ARRAY['SYSTEM'::text, 'SELF'::text])))
);


--
-- Name: governance_proposal_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_proposal_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id text NOT NULL,
    for_votes bigint DEFAULT 0,
    against_votes bigint DEFAULT 0,
    abstain_votes bigint DEFAULT 0,
    total_votes bigint DEFAULT 0,
    last_updated_block bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: governance_user_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_user_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id text NOT NULL,
    voter_address text NOT NULL,
    choice integer NOT NULL,
    voting_power bigint DEFAULT 1,
    tx_hash text,
    block_number bigint,
    voted_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: governance_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    voter_address text NOT NULL,
    vote text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    hat_id text,
    signature text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    onchain_recorded_at timestamp with time zone,
    pod_id uuid,
    CONSTRAINT governance_votes_vote_check CHECK ((vote = ANY (ARRAY['for'::text, 'against'::text, 'abstain'::text])))
);


--
-- Name: governance_votes_jwt_debug; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_votes_jwt_debug (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    jwt_sub text,
    jwt_role text,
    jwt_wallet_address text,
    jwt_user_metadata jsonb,
    voter_address_attempted text,
    rls_check_result boolean
);


--
-- Name: governance_votes_jwt_debug_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_votes_jwt_debug_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_votes_jwt_debug_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_votes_jwt_debug_id_seq OWNED BY public.governance_votes_jwt_debug.id;


--
-- Name: hat_metadata_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hat_metadata_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ipfs_hash text,
    metadata jsonb NOT NULL,
    pod_id uuid,
    role_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hats_module_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hats_module_deployments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    token_address text NOT NULL,
    module_address text NOT NULL,
    implementation_address text NOT NULL,
    criteria_hash text NOT NULL,
    deployment_tx text NOT NULL,
    deployment_block bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sync_status text DEFAULT 'pending'::text NOT NULL,
    last_synced_at timestamp with time zone,
    sync_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT hats_module_deployments_sync_status_check CHECK ((sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'error'::text])))
);


--
-- Name: knowledge_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    pod_id uuid,
    name text NOT NULL,
    description text,
    icon text,
    sort_order integer DEFAULT 0,
    is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    is_course boolean DEFAULT false NOT NULL,
    accreditation_name text,
    accreditation_description text,
    accreditation_image_url text
);


--
-- Name: knowledge_item_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_item_views (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    item_id uuid,
    user_address text NOT NULL,
    progress_seconds integer DEFAULT 0,
    completed boolean DEFAULT false,
    last_viewed_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    category_id uuid,
    pod_id uuid,
    title text NOT NULL,
    description text,
    content_type text NOT NULL,
    content_url text,
    content_text text,
    thumbnail_url text,
    duration_seconds integer,
    file_size_bytes bigint,
    is_public boolean DEFAULT true,
    view_count integer DEFAULT 0,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by text
);


--
-- Name: ledger_anchors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_anchors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    event_count integer NOT NULL,
    merkle_root text NOT NULL,
    leaf_formula text NOT NULL,
    onchain_index integer,
    tx_hash text,
    anchored_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_address text NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer DEFAULT 1,
    price_paid_self numeric,
    price_paid_system numeric,
    transaction_hash text,
    status text DEFAULT 'processing'::text,
    fulfillment_manager_address text,
    shipping_address jsonb,
    tracking_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT marketplace_orders_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'preparing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: member_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_locations (
    wallet text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    "precision" text DEFAULT 'approximate'::text NOT NULL,
    address text,
    share_with_pods boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_locations_lat_check CHECK (((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision))),
    CONSTRAINT member_locations_lng_check CHECK (((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision))),
    CONSTRAINT member_locations_precision_check CHECK (("precision" = ANY (ARRAY['exact'::text, 'approximate'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_id uuid,
    from_agent_id uuid,
    content text NOT NULL,
    mentions uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    is_everyone_tag boolean DEFAULT false
);


--
-- Name: milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milestones (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bid_id uuid NOT NULL,
    deliverable_description text NOT NULL,
    due_date date NOT NULL,
    payment_amount text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by text,
    review_comments text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT milestones_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'overdue'::text])))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_address text NOT NULL,
    enabled boolean DEFAULT true,
    desktop_enabled boolean DEFAULT true,
    sound_enabled boolean DEFAULT true,
    quiet_hours_enabled boolean DEFAULT false,
    quiet_hours_start time without time zone DEFAULT '22:00:00'::time without time zone,
    quiet_hours_end time without time zone DEFAULT '08:00:00'::time without time zone,
    category_pod boolean DEFAULT true,
    category_governance boolean DEFAULT true,
    category_bounty boolean DEFAULT true,
    category_chat boolean DEFAULT true,
    category_forum boolean DEFAULT true,
    category_event boolean DEFAULT true,
    category_marketplace boolean DEFAULT true,
    pod_membership_application boolean DEFAULT true,
    pod_application_status boolean DEFAULT true,
    pod_member_added boolean DEFAULT true,
    pod_member_removed boolean DEFAULT true,
    pod_approval_required boolean DEFAULT true,
    pod_leadership_invitation boolean DEFAULT true,
    governance_proposal_created boolean DEFAULT true,
    governance_proposal_mentioned boolean DEFAULT true,
    governance_voting_reminder_48h boolean DEFAULT true,
    governance_voting_reminder_24h boolean DEFAULT true,
    governance_voting_reminder_6h boolean DEFAULT true,
    governance_voting_reminder_1h boolean DEFAULT true,
    governance_proposal_executed boolean DEFAULT false,
    bounty_work_submitted boolean DEFAULT true,
    bounty_work_reviewed boolean DEFAULT true,
    bounty_dispute_filed boolean DEFAULT true,
    bounty_evidence_submitted boolean DEFAULT true,
    bounty_dispute_resolved boolean DEFAULT true,
    bounty_cancelled boolean DEFAULT true,
    chat_direct_message boolean DEFAULT true,
    forum_user_mentioned boolean DEFAULT true,
    forum_thread_reply boolean DEFAULT true,
    forum_participating_reply boolean DEFAULT false,
    event_registration_confirmation boolean DEFAULT true,
    event_reminder_7d boolean DEFAULT true,
    event_reminder_day_of boolean DEFAULT true,
    event_checkin_prompt boolean DEFAULT true,
    event_updated boolean DEFAULT true,
    event_cancelled boolean DEFAULT true,
    event_completion_nft boolean DEFAULT true,
    marketplace_purchase_fulfillment boolean DEFAULT true,
    marketplace_order_status boolean DEFAULT true,
    marketplace_review_mention boolean DEFAULT true,
    digest_daily_enabled boolean DEFAULT false,
    digest_weekly_enabled boolean DEFAULT false,
    digest_daily_time time without time zone DEFAULT '09:00:00'::time without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pod_membership_invitation boolean DEFAULT true
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mentioned_agent_id uuid,
    content text NOT NULL,
    source_type text,
    source_id uuid,
    delivered boolean DEFAULT false,
    delivered_at timestamp with time zone,
    read boolean DEFAULT false,
    read_at timestamp with time zone,
    CONSTRAINT notifications_source_type_check CHECK ((source_type = ANY (ARRAY['mention'::text, 'assignment'::text, 'task_update'::text, 'system'::text])))
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    old_status text,
    new_status text,
    changed_by_address text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pending_donations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_donations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_payment_id text NOT NULL,
    payment_method text NOT NULL,
    user_wallet text NOT NULL,
    donor_email text,
    fiat_amount numeric(10,2) NOT NULL,
    system_tokens_to_mint numeric(18,8) NOT NULL,
    org_fee numeric(10,2) NOT NULL,
    stripe_fee numeric(10,2) NOT NULL,
    settlement_days integer DEFAULT 5 NOT NULL,
    settlement_date timestamp with time zone,
    is_reversible boolean DEFAULT false,
    status text DEFAULT 'payment_pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    mercury_confirmed_at timestamp with time zone,
    minted_at timestamp with time zone,
    disputed_at timestamp with time zone,
    failure_reason text,
    dispute_reason text,
    mint_transaction_hash text,
    settled_at timestamp with time zone,
    stripe_confirmed_at timestamp with time zone,
    community_tokens_to_mint numeric(18,8) DEFAULT 0,
    CONSTRAINT pending_donations_fiat_amount_check CHECK ((fiat_amount >=
CASE
    WHEN (payment_method = 'direct'::text) THEN 1.00
    ELSE 10.00
END)),
    CONSTRAINT pending_donations_payment_method_check CHECK ((payment_method = ANY (ARRAY['ach'::text, 'card'::text, 'direct'::text]))),
    CONSTRAINT pending_donations_status_check CHECK ((status = ANY (ARRAY['payment_pending'::text, 'awaiting_settlement'::text, 'awaiting_executive_approval'::text, 'pending_mint'::text, 'minting'::text, 'minted'::text, 'failed'::text, 'disputed'::text, 'direct_donation_pending'::text, 'direct_donation_completed'::text])))
);


--
-- Name: pod_accountability_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_accountability_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid,
    signer_address text NOT NULL,
    signature_data text NOT NULL,
    signed_at timestamp with time zone DEFAULT now(),
    accountability_statement text NOT NULL,
    is_valid boolean DEFAULT true
);


--
-- Name: pod_application_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_application_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    voter_address text NOT NULL,
    vote_type text NOT NULL,
    transaction_hash text NOT NULL,
    block_number bigint,
    voted_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pod_application_votes_vote_type_check CHECK ((vote_type = ANY (ARRAY['approve'::text, 'reject'::text])))
);


--
-- Name: pod_approval_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_approval_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    leader_address text NOT NULL,
    signature_data text NOT NULL,
    signed_at timestamp with time zone DEFAULT now(),
    is_valid boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pod_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid,
    action text NOT NULL,
    performed_by text NOT NULL,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    details jsonb,
    transaction_hash text,
    block_number bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pod_audit_log_action_check CHECK ((action = ANY (ARRAY['pod_created'::text, 'pod_updated'::text, 'pod_deleted'::text, 'member_added'::text, 'member_removed'::text, 'leader_added'::text, 'leader_removed'::text, 'hat_assigned'::text, 'hat_revoked'::text, 'treasury_action'::text, 'permission_changed'::text, 'deletion_proposed'::text, 'deletion_approved'::text, 'deletion_rejected'::text, 'deletion_executed'::text, 'deletion_expired'::text])))
);


--
-- Name: pod_faces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_faces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    colors jsonb DEFAULT '{}'::jsonb NOT NULL,
    icon_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    label_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT pod_faces_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: pod_invite_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_invite_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    link_id uuid NOT NULL,
    pod_id uuid NOT NULL,
    wallet text NOT NULL,
    hat_id text,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    hat_minted_at timestamp with time zone,
    mint_tx_hash text
);


--
-- Name: pod_invite_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_invite_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    code text NOT NULL,
    role_id uuid,
    created_by text NOT NULL,
    expires_at timestamp with time zone,
    max_uses integer,
    use_count integer DEFAULT 0 NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pod_level_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_level_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    pod_id uuid NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'proposed'::text NOT NULL,
    voting_deadline timestamp with time zone,
    onchain_proposal_id text,
    transaction_hash text,
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    governance_tier text DEFAULT 'POD_OPERATIONAL'::text NOT NULL,
    approval_threshold_bps integer,
    quorum_threshold_bps integer,
    eligible_voter_count integer,
    CONSTRAINT pod_level_proposals_approval_range CHECK (((approval_threshold_bps IS NULL) OR ((approval_threshold_bps >= 5001) AND (approval_threshold_bps <= 10000)))),
    CONSTRAINT pod_level_proposals_governance_tier_check CHECK ((governance_tier = ANY (ARRAY['DAO_CONSTITUTIONAL'::text, 'POD_TREASURY_BINDING'::text, 'POD_OPERATIONAL'::text]))),
    CONSTRAINT pod_level_proposals_quorum_range CHECK (((quorum_threshold_bps IS NULL) OR ((quorum_threshold_bps >= 2000) AND (quorum_threshold_bps <= 10000)))),
    CONSTRAINT pod_level_proposals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text, 'active'::text, 'approved'::text, 'rejected'::text, 'executed'::text])))
);


--
-- Name: pod_member_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_member_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    total_members integer DEFAULT 0,
    active_members integer DEFAULT 0,
    leaders_count integer DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pod_membership_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_membership_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    applicant_address text NOT NULL,
    agreement_signature text NOT NULL,
    accountability_statement text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    required_votes integer DEFAULT 3 NOT NULL,
    current_votes integer DEFAULT 0 NOT NULL,
    voting_leaders text[] DEFAULT '{}'::text[],
    submitted_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    intended_role text DEFAULT 'member'::text,
    CONSTRAINT check_intended_role CHECK ((intended_role = ANY (ARRAY['member'::text, 'leader'::text]))),
    CONSTRAINT pod_membership_applications_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: pod_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid,
    chat_enabled boolean DEFAULT false,
    forum_enabled boolean DEFAULT false,
    treasury_enabled boolean DEFAULT true,
    events_enabled boolean DEFAULT false,
    bounties_enabled boolean DEFAULT false,
    chat_config jsonb DEFAULT '{}'::jsonb,
    forum_config jsonb DEFAULT '{}'::jsonb,
    treasury_config jsonb DEFAULT '{}'::jsonb,
    events_config jsonb DEFAULT '{}'::jsonb,
    bounties_config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    marketplace_enabled boolean DEFAULT false NOT NULL,
    knowledge_base_enabled boolean DEFAULT false,
    knowledge_base_config jsonb DEFAULT '{}'::jsonb,
    sub_pods_enabled boolean DEFAULT false NOT NULL,
    sub_pods_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    community_agent_enabled boolean DEFAULT false,
    community_agent_config jsonb DEFAULT '{}'::jsonb,
    surveys_enabled boolean DEFAULT false,
    surveys_config jsonb DEFAULT '{}'::jsonb,
    passwords_enabled boolean DEFAULT false NOT NULL,
    passwords_config jsonb DEFAULT '{}'::jsonb,
    external_wallet_linking_enabled boolean DEFAULT false,
    custom_appearance_enabled boolean DEFAULT false,
    places_enabled boolean DEFAULT false NOT NULL,
    places_config jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: pod_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    token_address text NOT NULL,
    role_name text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    eligibility_criteria jsonb DEFAULT '[]'::jsonb,
    max_holders integer DEFAULT 50,
    current_holders integer DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    hat_level integer,
    parent_hat_id text,
    template_name text,
    inherits_from text,
    version integer DEFAULT 1,
    is_governance_managed boolean DEFAULT false,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    contract_address text,
    last_synced_at timestamp with time zone,
    sync_status text DEFAULT 'synced'::text,
    sync_error text,
    metadata_hash text,
    CONSTRAINT pod_role_permissions_sync_status_check CHECK ((sync_status = ANY (ARRAY['synced'::text, 'pending'::text, 'error'::text])))
);


--
-- Name: pod_permission_lookup; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pod_permission_lookup WITH (security_invoker='true') AS
 SELECT pod_role_permissions.pod_id,
    pod_role_permissions.token_address,
    pod_role_permissions.token_address AS hat_id,
    pod_role_permissions.role_name,
    pod_role_permissions.permissions,
    pod_role_permissions.is_active,
    pod_role_permissions.current_holders,
    pod_role_permissions.max_holders,
    pod_role_permissions.last_synced_at
   FROM public.pod_role_permissions
  WHERE (pod_role_permissions.is_active = true);


--
-- Name: pod_place_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_place_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pod_place_links_target_type_check CHECK ((target_type = ANY (ARRAY['thread'::text, 'event'::text, 'knowledge_item'::text, 'member'::text, 'pod'::text, 'place'::text])))
);


--
-- Name: pod_places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    kind text DEFAULT 'site'::text NOT NULL,
    status text DEFAULT 'existing'::text NOT NULL,
    lat double precision,
    lng double precision,
    address text,
    "precision" text DEFAULT 'exact'::text NOT NULL,
    cover_image_path text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pod_places_kind_check CHECK ((kind = ANY (ARRAY['asset'::text, 'partner'::text, 'site'::text, 'resource'::text, 'vision'::text, 'other'::text]))),
    CONSTRAINT pod_places_lat_range CHECK (((lat IS NULL) OR ((lat >= ('-90'::integer)::double precision) AND (lat <= (90)::double precision)))),
    CONSTRAINT pod_places_latlng_pair CHECK (((lat IS NULL) = (lng IS NULL))),
    CONSTRAINT pod_places_lng_range CHECK (((lng IS NULL) OR ((lng >= ('-180'::integer)::double precision) AND (lng <= (180)::double precision)))),
    CONSTRAINT pod_places_precision_check CHECK (("precision" = ANY (ARRAY['exact'::text, 'approximate'::text]))),
    CONSTRAINT pod_places_status_check CHECK ((status = ANY (ARRAY['existing'::text, 'proposed'::text, 'retired'::text])))
);


--
-- Name: pod_role_forum_access; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pod_role_forum_access AS
 SELECT p.id AS pod_id,
    p.name AS pod_name,
    prp.token_address AS hat_id,
    prp.role_name,
    COALESCE(((prp.permissions ->> 'chatAccess'::text))::boolean, false) AS chat_access,
    COALESCE(((prp.permissions ->> 'forumAccess'::text))::boolean, false) AS forum_access,
    COALESCE(((prp.permissions ->> 'governanceParticipation'::text))::boolean, false) AS governance_participation,
    COALESCE(((prp.permissions ->> 'forumModeration'::text))::boolean, false) AS forum_moderation
   FROM (public.pod_role_permissions prp
     JOIN public.pods p ON ((p.id = prp.pod_id)))
  WHERE (prp.is_active = true);


--
-- Name: pod_role_permissions_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pod_role_permissions_active AS
 SELECT pod_role_permissions.id,
    pod_role_permissions.pod_id,
    pod_role_permissions.token_address,
    pod_role_permissions.role_name,
    pod_role_permissions.permissions,
    pod_role_permissions.eligibility_criteria,
    pod_role_permissions.max_holders,
    pod_role_permissions.current_holders,
    pod_role_permissions.hat_level,
    pod_role_permissions.parent_hat_id,
    pod_role_permissions.template_name,
    pod_role_permissions.inherits_from,
    pod_role_permissions.version,
    pod_role_permissions.created_by,
    pod_role_permissions.updated_by,
    pod_role_permissions.created_at,
    pod_role_permissions.updated_at,
    pod_role_permissions.last_synced_at,
    pod_role_permissions.sync_status
   FROM public.pod_role_permissions
  WHERE ((pod_role_permissions.is_active = true) AND (pod_role_permissions.sync_status = 'synced'::text));


--
-- Name: pod_role_permissions_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_role_permissions_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permission_id uuid NOT NULL,
    pod_id uuid NOT NULL,
    token_address text NOT NULL,
    role_name text NOT NULL,
    old_permissions jsonb,
    new_permissions jsonb,
    old_eligibility_criteria jsonb,
    new_eligibility_criteria jsonb,
    change_type text NOT NULL,
    change_reason text,
    changed_by text NOT NULL,
    changed_at timestamp with time zone DEFAULT now(),
    transaction_hash text,
    CONSTRAINT pod_role_permissions_history_change_type_check CHECK ((change_type = ANY (ARRAY['created'::text, 'updated'::text, 'deleted'::text, 'activated'::text, 'deactivated'::text])))
);


--
-- Name: pod_self_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_self_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    epoch integer NOT NULL,
    allocated_hours numeric(78,0) DEFAULT 0 NOT NULL,
    minted_hours numeric(78,0) DEFAULT 0 NOT NULL,
    source text DEFAULT 'algorithmic'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pod_self_budgets_source_check CHECK ((source = ANY (ARRAY['algorithmic'::text, 'exec_petition'::text, 'multiplier'::text])))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price_system numeric(15,6) NOT NULL,
    required_token text,
    is_free_shipping boolean DEFAULT false,
    image_url text,
    created_at timestamp without time zone DEFAULT now(),
    owner_id text,
    quantity numeric,
    price_self numeric(15,6),
    units_available numeric,
    description text,
    title text DEFAULT ''::text NOT NULL,
    available_sizes text[] DEFAULT '{}'::text[],
    style text DEFAULT 'default'::text,
    sku integer,
    wallet_address text,
    fund_destination_type character varying(20),
    destination_address character varying(42),
    creator_wallet character varying(42),
    pod_id character varying(255),
    revenue_split_percentage integer
);


--
-- Name: proposal_eligibility_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_eligibility_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    pod_id uuid NOT NULL,
    wallet text NOT NULL,
    token_id text NOT NULL,
    held_amount numeric DEFAULT 0 NOT NULL,
    staked_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    minimum_required numeric NOT NULL,
    passed boolean NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposal_onchain_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposal_onchain_status (
    proposal_id text NOT NULL,
    state integer,
    last_checked timestamp without time zone,
    user_votes jsonb
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    wallet_address text NOT NULL,
    first_name character varying,
    last_name character varying,
    profile_picture text,
    date_of_birth date,
    email character varying,
    phone character varying,
    bio text,
    interests text,
    seeking text,
    occupation character varying,
    skills_expertise text,
    workplace_organization character varying,
    projects_or_initiatives text,
    linkedin character varying,
    twitter character varying,
    instagram character varying,
    facebook character varying,
    tiktok character varying,
    discord character varying,
    github character varying,
    youtube character varying,
    twitch character varying,
    website character varying,
    desired_involvement text,
    open_to_connect text,
    user_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    membership_status text,
    address_1 text,
    address_2 text,
    city text,
    state text,
    zip text,
    referral_key character varying(6) NOT NULL,
    invited_by text,
    onboarded_at timestamp with time zone,
    tour_completed_at timestamp with time zone,
    tos_signed_at timestamp with time zone,
    tos_version text,
    tos_signature text,
    active_face_pod_id uuid,
    exclude_from_agent_corpus boolean DEFAULT false NOT NULL,
    onboarding_intent text,
    onboarding_visited jsonb DEFAULT '{}'::jsonb NOT NULL,
    onboarding_dismissed_at timestamp with time zone,
    CONSTRAINT user_profiles_onboarding_intent_check CHECK ((onboarding_intent = ANY (ARRAY['join'::text, 'found'::text, 'explore'::text])))
);


--
-- Name: public_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_profiles WITH (security_invoker='false') AS
 SELECT user_profiles.user_id,
    user_profiles.wallet_address,
    user_profiles.first_name,
    user_profiles.last_name,
    user_profiles.profile_picture,
    user_profiles.bio,
    user_profiles.interests,
    user_profiles.seeking,
    user_profiles.occupation,
    user_profiles.skills_expertise,
    user_profiles.workplace_organization,
    user_profiles.projects_or_initiatives,
    user_profiles.desired_involvement,
    user_profiles.open_to_connect,
    user_profiles.linkedin,
    user_profiles.twitter,
    user_profiles.instagram,
    user_profiles.facebook,
    user_profiles.tiktok,
    user_profiles.discord,
    user_profiles.github,
    user_profiles.youtube,
    user_profiles.twitch,
    user_profiles.website,
    user_profiles.membership_status,
    user_profiles.onboarded_at,
    user_profiles.tos_signed_at,
    user_profiles.tos_version,
    user_profiles.active_face_pod_id
   FROM public.user_profiles;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_address text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: referral_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_validations (
    id bigint NOT NULL,
    invite_code character varying(6) NOT NULL,
    used_by_wallet text NOT NULL,
    validated_at timestamp with time zone DEFAULT now(),
    referrer_wallet text
);


--
-- Name: referral_validations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.referral_validations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: referral_validations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.referral_validations_id_seq OWNED BY public.referral_validations.id;


--
-- Name: relay_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relay_tasks (
    id bigint NOT NULL,
    wallet_address text NOT NULL,
    task_id text NOT NULL,
    status text NOT NULL,
    transaction_hash text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: relay_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.relay_tasks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.relay_tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: role_permission_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permission_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id text NOT NULL,
    target_address text NOT NULL,
    current_roles text[],
    proposed_roles text[],
    permission_changes jsonb NOT NULL,
    required_approvals integer DEFAULT 3 NOT NULL,
    current_approvals text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text,
    justification text,
    proposed_by text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    executed_at timestamp with time zone,
    executed_by text,
    CONSTRAINT role_permission_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'executed'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: self_member_epoch_earned; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.self_member_epoch_earned (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet text NOT NULL,
    pod_id uuid NOT NULL,
    epoch integer NOT NULL,
    hours numeric(78,0) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: self_mint_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.self_mint_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet text NOT NULL,
    pod_id uuid NOT NULL,
    community_id numeric(78,0) NOT NULL,
    epoch integer NOT NULL,
    hours numeric(78,0) NOT NULL,
    raw_hours numeric(78,0) NOT NULL,
    source_type text NOT NULL,
    source_ref text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    anomaly_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    batch_id text,
    tx_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    minted_at timestamp with time zone,
    CONSTRAINT self_mint_queue_source_type_check CHECK ((source_type = ANY (ARRAY['event_attendance'::text, 'bounty_completion'::text, 'governance_vote'::text, 'verification'::text, 'role_service'::text]))),
    CONSTRAINT self_mint_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'exec_review'::text, 'rejected'::text, 'minted'::text, 'clawed_back'::text])))
);


--
-- Name: survey_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    response_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: survey_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    question_text text NOT NULL,
    question_type text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb,
    rating_max integer DEFAULT 5,
    sort_order integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT survey_questions_question_type_check CHECK ((question_type = ANY (ARRAY['multiple_choice'::text, 'single_select'::text, 'free_text'::text, 'rating_scale'::text]))),
    CONSTRAINT survey_questions_rating_max_check CHECK ((rating_max = ANY (ARRAY[5, 10])))
);


--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    respondent_wallet text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text NOT NULL,
    audience jsonb DEFAULT '[]'::jsonb NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT surveys_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])))
);


--
-- Name: system_supply_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_supply_metadata (
    id integer NOT NULL,
    total_supply numeric(18,8) DEFAULT 0 NOT NULL,
    total_minted numeric(18,8) DEFAULT 0 NOT NULL,
    total_burned numeric(18,8) DEFAULT 0 NOT NULL,
    total_donations_count integer DEFAULT 0 NOT NULL,
    total_burns_count integer DEFAULT 0 NOT NULL,
    last_mint_at timestamp with time zone,
    last_burn_at timestamp with time zone,
    last_updated timestamp with time zone DEFAULT now(),
    CONSTRAINT system_supply_metadata_id_check CHECK ((id = 1))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'inbox'::text,
    priority integer DEFAULT 5,
    assignee_ids uuid[] DEFAULT '{}'::uuid[],
    created_by_agent_id uuid,
    due_date timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT tasks_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['inbox'::text, 'assigned'::text, 'in_progress'::text, 'review'::text, 'done'::text, 'blocked'::text, 'cancelled'::text])))
);


--
-- Name: token_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_balances (
    wallet_address text NOT NULL,
    contract_address text NOT NULL,
    token_id integer NOT NULL,
    balance numeric DEFAULT 0 NOT NULL,
    last_updated timestamp with time zone DEFAULT now()
);


--
-- Name: token_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    system_tokens_to_burn numeric NOT NULL,
    estimated_payout_usd numeric NOT NULL,
    payout_email text NOT NULL,
    payout_note text,
    status text DEFAULT 'pending_burn'::text NOT NULL,
    burn_tx_hash text,
    burned_at timestamp with time zone,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    reviewer_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    id character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    contract_address character varying(42),
    token_type character varying(20) NOT NULL,
    hat_id character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    token_image text,
    decimals integer DEFAULT 18,
    minimum_balance text,
    gating_enabled boolean DEFAULT false,
    owner_pod_id uuid,
    category text DEFAULT 'membership'::text NOT NULL,
    CONSTRAINT tokens_category_check CHECK ((category = ANY (ARRAY['membership'::text, 'credential'::text, 'accreditation'::text]))),
    CONSTRAINT tokens_contract_address_required CHECK (((is_active = false) OR ((is_active = true) AND (contract_address IS NOT NULL) AND ((contract_address)::text <> ''::text))))
);


--
-- Name: treasury_approval_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treasury_approval_workflows (
    id uuid NOT NULL,
    pod_id text NOT NULL,
    operation_type text NOT NULL,
    amount_value text NOT NULL,
    recipient_address text NOT NULL,
    required_approvals integer NOT NULL,
    current_approvals text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: treasury_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treasury_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mercury_balance numeric(10,2) NOT NULL,
    system_total_supply numeric(18,8) NOT NULL,
    system_circulating_supply numeric(18,8) NOT NULL,
    discrepancy numeric(10,2) NOT NULL,
    discrepancy_percentage numeric(5,2),
    snapshot_at timestamp with time zone DEFAULT now(),
    is_anomaly boolean DEFAULT false,
    notes text
);


--
-- Name: treasury_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treasury_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tx_hash text,
    pod_id uuid NOT NULL,
    treasury_address text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    token_address text NOT NULL,
    token_symbol text NOT NULL,
    token_decimals integer DEFAULT 18 NOT NULL,
    amount_raw text NOT NULL,
    amount_formatted text NOT NULL,
    sender_address text,
    recipient_address text,
    sender_name text,
    recipient_name text,
    reason text,
    transaction_data jsonb,
    block_number bigint,
    block_timestamp timestamp with time zone,
    gas_used bigint,
    CONSTRAINT treasury_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT treasury_transactions_type_check CHECK ((type = ANY (ARRAY['deposit'::text, 'distribution'::text, 'withdrawal'::text])))
);


--
-- Name: user_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_preferences (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_address text NOT NULL,
    preferences jsonb DEFAULT '{"vote_cast": false, "proposal_created": true, "proposal_executed": true, "proposal_mentioned": true, "push_notifications": true, "email_notifications": false, "proposal_voting_ended": true, "proposal_voting_started": true}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_presence (
    wallet_address text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    token_type text NOT NULL,
    contract_address text NOT NULL,
    tx_hash text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_wallet_link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_wallet_link_codes (
    code text NOT NULL,
    user_id uuid NOT NULL,
    issued_by_wallet text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    consumed_by_wallet text
);


--
-- Name: user_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    wallet_address text NOT NULL,
    is_canonical boolean DEFAULT false NOT NULL,
    nickname text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_via_wallet text,
    last_seen_at timestamp with time zone,
    wallet_type text DEFAULT 'device'::text NOT NULL,
    CONSTRAINT user_wallets_wallet_type_check CHECK ((wallet_type = ANY (ARRAY['device'::text, 'external'::text])))
);


--
-- Name: vault_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    entry_id uuid,
    accessor_eoa text NOT NULL,
    action text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vault_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    label text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    notes_ciphertext text,
    notes_iv text,
    password_ciphertext text NOT NULL,
    password_iv text NOT NULL,
    sender_pubkey text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    allowed_role_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    login_ciphertext text,
    login_iv text
);


--
-- Name: vault_pending_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_pending_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    newcomer_eoa text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vault_rotation_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_rotation_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pod_id uuid NOT NULL,
    evicted_eoa text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: vault_user_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_user_keys (
    eoa_address text NOT NULL,
    public_key text NOT NULL,
    algorithm text DEFAULT 'x25519-v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vault_wrapped_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_wrapped_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    recipient_eoa text NOT NULL,
    sender_pubkey text NOT NULL,
    wrapped_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: video_call_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_call_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    initiator_wallet character varying NOT NULL,
    recipient_wallet character varying NOT NULL,
    status character varying DEFAULT 'ringing'::character varying NOT NULL,
    is_group boolean DEFAULT false NOT NULL,
    group_participants jsonb,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    room_id uuid,
    CONSTRAINT video_call_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['ringing'::character varying, 'accepted'::character varying, 'active'::character varying, 'declined'::character varying, 'ended'::character varying, 'missed'::character varying])::text[])))
);


--
-- Name: video_call_signaling; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_call_signaling (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    from_wallet character varying NOT NULL,
    to_wallet character varying NOT NULL,
    message_type character varying NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_call_signaling_message_type_check CHECK (((message_type)::text = ANY ((ARRAY['offer'::character varying, 'answer'::character varying, 'ice_candidate'::character varying])::text[])))
);


--
-- Name: wallet_link_nonces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_link_nonces (
    nonce text NOT NULL,
    user_id uuid NOT NULL,
    address text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone
);


--
-- Name: work_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bounty_id uuid NOT NULL,
    bid_id uuid NOT NULL,
    submitter_address text NOT NULL,
    submission_title text NOT NULL,
    submission_description text NOT NULL,
    deliverable_urls jsonb DEFAULT '[]'::jsonb,
    attachment_urls jsonb DEFAULT '[]'::jsonb,
    completed_deliverables jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewer_address text,
    review_comments text,
    reviewed_at timestamp with time zone,
    revision_number integer DEFAULT 1,
    previous_submission_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_submissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'revision_requested'::text])))
);


--
-- Name: admin_token_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_token_definitions ALTER COLUMN id SET DEFAULT nextval('public.admin_token_definitions_id_seq'::regclass);


--
-- Name: governance_votes_jwt_debug id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes_jwt_debug ALTER COLUMN id SET DEFAULT nextval('public.governance_votes_jwt_debug_id_seq'::regclass);


--
-- Name: referral_validations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_validations ALTER COLUMN id SET DEFAULT nextval('public.referral_validations_id_seq'::regclass);


--
-- Name: account_deletion_requests account_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: accreditations accreditations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accreditations
    ADD CONSTRAINT accreditations_pkey PRIMARY KEY (id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: admin_token_definitions admin_token_definitions_contract_address_token_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_token_definitions
    ADD CONSTRAINT admin_token_definitions_contract_address_token_id_key UNIQUE (contract_address, token_id);


--
-- Name: admin_token_definitions admin_token_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_token_definitions
    ADD CONSTRAINT admin_token_definitions_pkey PRIMARY KEY (id);


--
-- Name: agent_context agent_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_context
    ADD CONSTRAINT agent_context_pkey PRIMARY KEY (id);


--
-- Name: agent_conversations agent_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_conversations
    ADD CONSTRAINT agent_conversations_pkey PRIMARY KEY (id);


--
-- Name: agent_memory agent_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (id);


--
-- Name: agent_proposals agent_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_proposals
    ADD CONSTRAINT agent_proposals_pkey PRIMARY KEY (id);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: approval_signatures_audit approval_signatures_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_signatures_audit
    ADD CONSTRAINT approval_signatures_audit_pkey PRIMARY KEY (id);


--
-- Name: bid_reviews bid_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bid_reviews
    ADD CONSTRAINT bid_reviews_pkey PRIMARY KEY (id);


--
-- Name: bid_state_updates bid_state_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bid_state_updates
    ADD CONSTRAINT bid_state_updates_pkey PRIMARY KEY (id);


--
-- Name: bids bids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_pkey PRIMARY KEY (id);


--
-- Name: bounties bounties_blockchain_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounties
    ADD CONSTRAINT bounties_blockchain_id_key UNIQUE (blockchain_id);


--
-- Name: bounties bounties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounties
    ADD CONSTRAINT bounties_pkey PRIMARY KEY (id);


--
-- Name: bounty_approval_workflows bounty_approval_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_approval_workflows
    ADD CONSTRAINT bounty_approval_workflows_pkey PRIMARY KEY (id);


--
-- Name: bounty_disputes bounty_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_disputes
    ADD CONSTRAINT bounty_disputes_pkey PRIMARY KEY (id);


--
-- Name: bounty_invites bounty_invites_bounty_id_invitee_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_invites
    ADD CONSTRAINT bounty_invites_bounty_id_invitee_address_key UNIQUE (bounty_id, invitee_address);


--
-- Name: bounty_invites bounty_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_invites
    ADD CONSTRAINT bounty_invites_pkey PRIMARY KEY (id);


--
-- Name: bounty_notifications bounty_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_notifications
    ADD CONSTRAINT bounty_notifications_pkey PRIMARY KEY (id);


--
-- Name: bounty_token_gates bounty_token_gates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_token_gates
    ADD CONSTRAINT bounty_token_gates_pkey PRIMARY KEY (id);


--
-- Name: burn_approvals burn_approvals_burn_request_id_approver_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burn_approvals
    ADD CONSTRAINT burn_approvals_burn_request_id_approver_wallet_key UNIQUE (burn_request_id, approver_wallet);


--
-- Name: burn_approvals burn_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burn_approvals
    ADD CONSTRAINT burn_approvals_pkey PRIMARY KEY (id);


--
-- Name: burn_requests burn_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burn_requests
    ADD CONSTRAINT burn_requests_pkey PRIMARY KEY (id);


--
-- Name: chat_groups chat_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);


--
-- Name: chat_moderation_log chat_moderation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_moderation_log
    ADD CONSTRAINT chat_moderation_log_pkey PRIMARY KEY (id);


--
-- Name: chat_muted_users chat_muted_users_chat_group_id_user_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_muted_users
    ADD CONSTRAINT chat_muted_users_chat_group_id_user_wallet_key UNIQUE (chat_group_id, user_wallet);


--
-- Name: chat_muted_users chat_muted_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_muted_users
    ADD CONSTRAINT chat_muted_users_pkey PRIMARY KEY (id);


--
-- Name: community_agent_posts community_agent_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_posts
    ADD CONSTRAINT community_agent_posts_pkey PRIMARY KEY (id);


--
-- Name: community_agent_queue community_agent_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_queue
    ADD CONSTRAINT community_agent_queue_pkey PRIMARY KEY (id);


--
-- Name: community_agent_subscriptions community_agent_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_subscriptions
    ADD CONSTRAINT community_agent_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: community_agent_subscriptions community_agent_subscriptions_pod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_subscriptions
    ADD CONSTRAINT community_agent_subscriptions_pod_id_key UNIQUE (pod_id);


--
-- Name: conference_participants conference_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_participants
    ADD CONSTRAINT conference_participants_pkey PRIMARY KEY (id);


--
-- Name: conference_reactions conference_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_reactions
    ADD CONSTRAINT conference_reactions_pkey PRIMARY KEY (id);


--
-- Name: conference_rooms conference_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_rooms
    ADD CONSTRAINT conference_rooms_pkey PRIMARY KEY (id);


--
-- Name: conference_rooms conference_rooms_room_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_rooms
    ADD CONSTRAINT conference_rooms_room_name_key UNIQUE (room_name);


--
-- Name: dispute_comments dispute_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_comments
    ADD CONSTRAINT dispute_comments_pkey PRIMARY KEY (id);


--
-- Name: dispute_evidence dispute_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_pkey PRIMARY KEY (id);


--
-- Name: dispute_mediators dispute_mediators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_mediators
    ADD CONSTRAINT dispute_mediators_pkey PRIMARY KEY (id);


--
-- Name: dispute_resolutions dispute_resolutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_resolutions
    ADD CONSTRAINT dispute_resolutions_pkey PRIMARY KEY (id);


--
-- Name: dm_blocks dm_blocks_blocker_id_blocked_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_blocks
    ADD CONSTRAINT dm_blocks_blocker_id_blocked_id_key UNIQUE (blocker_id, blocked_id);


--
-- Name: dm_blocks dm_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_blocks
    ADD CONSTRAINT dm_blocks_pkey PRIMARY KEY (id);


--
-- Name: donation_approvals donation_approvals_donation_id_approver_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donation_approvals
    ADD CONSTRAINT donation_approvals_donation_id_approver_wallet_key UNIQUE (donation_id, approver_wallet);


--
-- Name: donation_approvals donation_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donation_approvals
    ADD CONSTRAINT donation_approvals_pkey PRIMARY KEY (id);


--
-- Name: email_invites email_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_invites
    ADD CONSTRAINT email_invites_pkey PRIMARY KEY (id);


--
-- Name: event_agendas event_agendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_agendas
    ADD CONSTRAINT event_agendas_pkey PRIMARY KEY (id);


--
-- Name: event_approval_workflows event_approval_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_approval_workflows
    ADD CONSTRAINT event_approval_workflows_pkey PRIMARY KEY (id);


--
-- Name: event_escrow event_escrow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_escrow
    ADD CONSTRAINT event_escrow_pkey PRIMARY KEY (id);


--
-- Name: event_notifications event_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_pkey PRIMARY KEY (id);


--
-- Name: event_registrations event_registrations_event_id_user_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_user_address_key UNIQUE (event_id, user_address);


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);


--
-- Name: event_required_tokens event_required_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_required_tokens
    ADD CONSTRAINT event_required_tokens_pkey PRIMARY KEY (event_id, token_or_hat);


--
-- Name: event_tokens event_tokens_contract_address_token_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_tokens
    ADD CONSTRAINT event_tokens_contract_address_token_id_key UNIQUE (contract_address, token_id);


--
-- Name: event_tokens event_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_tokens
    ADD CONSTRAINT event_tokens_pkey PRIMARY KEY (id);


--
-- Name: events events_blockchain_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_blockchain_event_id_key UNIQUE (blockchain_event_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: explorer_events explorer_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.explorer_events
    ADD CONSTRAINT explorer_events_pkey PRIMARY KEY (id);


--
-- Name: forum_bookmarks forum_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_bookmarks
    ADD CONSTRAINT forum_bookmarks_pkey PRIMARY KEY (id);


--
-- Name: forum_bookmarks forum_bookmarks_user_address_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_bookmarks
    ADD CONSTRAINT forum_bookmarks_user_address_thread_id_key UNIQUE (user_address, thread_id);


--
-- Name: forum_categories forum_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_categories
    ADD CONSTRAINT forum_categories_pkey PRIMARY KEY (id);


--
-- Name: forum_category_required_tokens forum_category_required_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_category_required_tokens
    ADD CONSTRAINT forum_category_required_tokens_pkey PRIMARY KEY (forum_category_id, token_or_hat);


--
-- Name: forum_featured_content forum_featured_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_featured_content
    ADD CONSTRAINT forum_featured_content_pkey PRIMARY KEY (id);


--
-- Name: forum_media_attachments forum_media_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_media_attachments
    ADD CONSTRAINT forum_media_attachments_pkey PRIMARY KEY (id);


--
-- Name: forum_moderator_actions forum_moderator_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_moderator_actions
    ADD CONSTRAINT forum_moderator_actions_pkey PRIMARY KEY (id);


--
-- Name: forum_poll_options forum_poll_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_options
    ADD CONSTRAINT forum_poll_options_pkey PRIMARY KEY (id);


--
-- Name: forum_poll_votes forum_poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_pkey PRIMARY KEY (id);


--
-- Name: forum_poll_votes forum_poll_votes_poll_id_option_id_voter_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_poll_id_option_id_voter_address_key UNIQUE (poll_id, option_id, voter_address);


--
-- Name: forum_polls forum_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_polls
    ADD CONSTRAINT forum_polls_pkey PRIMARY KEY (id);


--
-- Name: forum_polls forum_polls_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_polls
    ADD CONSTRAINT forum_polls_thread_id_key UNIQUE (thread_id);


--
-- Name: forum_post_reactions forum_post_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reactions
    ADD CONSTRAINT forum_post_reactions_pkey PRIMARY KEY (id);


--
-- Name: forum_post_reactions forum_post_reactions_post_id_thread_id_reactor_address_reac_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reactions
    ADD CONSTRAINT forum_post_reactions_post_id_thread_id_reactor_address_reac_key UNIQUE (post_id, thread_id, reactor_address, reaction_type);


--
-- Name: forum_post_reports forum_post_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reports
    ADD CONSTRAINT forum_post_reports_pkey PRIMARY KEY (id);


--
-- Name: forum_posts forum_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_pkey PRIMARY KEY (id);


--
-- Name: forum_proposal_links forum_proposal_links_forum_thread_id_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_proposal_links
    ADD CONSTRAINT forum_proposal_links_forum_thread_id_proposal_id_key UNIQUE (forum_thread_id, proposal_id);


--
-- Name: forum_proposal_links forum_proposal_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_proposal_links
    ADD CONSTRAINT forum_proposal_links_pkey PRIMARY KEY (id);


--
-- Name: forum_templates forum_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_templates
    ADD CONSTRAINT forum_templates_pkey PRIMARY KEY (id);


--
-- Name: forum_thread_drafts forum_thread_drafts_author_address_category_id_draft_type_p_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_drafts
    ADD CONSTRAINT forum_thread_drafts_author_address_category_id_draft_type_p_key UNIQUE (author_address, category_id, draft_type, parent_thread_id);


--
-- Name: forum_thread_drafts forum_thread_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_drafts
    ADD CONSTRAINT forum_thread_drafts_pkey PRIMARY KEY (id);


--
-- Name: forum_thread_reads forum_thread_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_reads
    ADD CONSTRAINT forum_thread_reads_pkey PRIMARY KEY (id);


--
-- Name: forum_thread_reads forum_thread_reads_user_address_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_reads
    ADD CONSTRAINT forum_thread_reads_user_address_thread_id_key UNIQUE (user_address, thread_id);


--
-- Name: forum_thread_summaries forum_thread_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_summaries
    ADD CONSTRAINT forum_thread_summaries_pkey PRIMARY KEY (id);


--
-- Name: forum_thread_summaries forum_thread_summaries_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_summaries
    ADD CONSTRAINT forum_thread_summaries_thread_id_key UNIQUE (thread_id);


--
-- Name: forum_thread_tags forum_thread_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_tags
    ADD CONSTRAINT forum_thread_tags_pkey PRIMARY KEY (id);


--
-- Name: forum_thread_tags forum_thread_tags_thread_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_tags
    ADD CONSTRAINT forum_thread_tags_thread_id_tag_key UNIQUE (thread_id, tag);


--
-- Name: forum_threads forum_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_pkey PRIMARY KEY (id);


--
-- Name: forum_user_mutes forum_user_mutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_user_mutes
    ADD CONSTRAINT forum_user_mutes_pkey PRIMARY KEY (id);


--
-- Name: forum_user_mutes forum_user_mutes_user_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_user_mutes
    ADD CONSTRAINT forum_user_mutes_user_address_key UNIQUE (user_address);


--
-- Name: general_notifications general_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_notifications
    ADD CONSTRAINT general_notifications_pkey PRIMARY KEY (id);


--
-- Name: gifts gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts
    ADD CONSTRAINT gifts_pkey PRIMARY KEY (id);


--
-- Name: governance_notifications governance_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_notifications
    ADD CONSTRAINT governance_notifications_pkey PRIMARY KEY (id);


--
-- Name: governance_proposal_votes governance_proposal_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_proposal_votes
    ADD CONSTRAINT governance_proposal_votes_pkey PRIMARY KEY (id);


--
-- Name: governance_proposal_votes governance_proposal_votes_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_proposal_votes
    ADD CONSTRAINT governance_proposal_votes_proposal_id_key UNIQUE (proposal_id);


--
-- Name: governance_user_votes governance_user_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_user_votes
    ADD CONSTRAINT governance_user_votes_pkey PRIMARY KEY (id);


--
-- Name: governance_user_votes governance_user_votes_proposal_id_voter_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_user_votes
    ADD CONSTRAINT governance_user_votes_proposal_id_voter_address_key UNIQUE (proposal_id, voter_address);


--
-- Name: governance_votes_jwt_debug governance_votes_jwt_debug_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes_jwt_debug
    ADD CONSTRAINT governance_votes_jwt_debug_pkey PRIMARY KEY (id);


--
-- Name: governance_votes governance_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes
    ADD CONSTRAINT governance_votes_pkey PRIMARY KEY (id);


--
-- Name: governance_votes governance_votes_proposal_voter_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes
    ADD CONSTRAINT governance_votes_proposal_voter_unique UNIQUE (proposal_id, voter_address);


--
-- Name: hat_metadata_cache hat_metadata_cache_ipfs_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hat_metadata_cache
    ADD CONSTRAINT hat_metadata_cache_ipfs_hash_key UNIQUE (ipfs_hash);


--
-- Name: hat_metadata_cache hat_metadata_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hat_metadata_cache
    ADD CONSTRAINT hat_metadata_cache_pkey PRIMARY KEY (id);


--
-- Name: hats_module_deployments hats_module_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hats_module_deployments
    ADD CONSTRAINT hats_module_deployments_pkey PRIMARY KEY (id);


--
-- Name: hats_module_deployments hats_module_deployments_pod_id_hat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hats_module_deployments
    ADD CONSTRAINT hats_module_deployments_pod_id_hat_id_key UNIQUE (pod_id, token_address);


--
-- Name: knowledge_categories knowledge_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_pkey PRIMARY KEY (id);


--
-- Name: knowledge_item_views knowledge_item_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_item_views
    ADD CONSTRAINT knowledge_item_views_pkey PRIMARY KEY (id);


--
-- Name: knowledge_items knowledge_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_items
    ADD CONSTRAINT knowledge_items_pkey PRIMARY KEY (id);


--
-- Name: ledger_anchors ledger_anchors_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_anchors
    ADD CONSTRAINT ledger_anchors_period_start_period_end_key UNIQUE (period_start, period_end);


--
-- Name: ledger_anchors ledger_anchors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_anchors
    ADD CONSTRAINT ledger_anchors_pkey PRIMARY KEY (id);


--
-- Name: marketplace_orders marketplace_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT marketplace_orders_pkey PRIMARY KEY (id);


--
-- Name: member_locations member_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_locations
    ADD CONSTRAINT member_locations_pkey PRIMARY KEY (wallet);


--
-- Name: chat_messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey1 PRIMARY KEY (id);


--
-- Name: milestones milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_address_key UNIQUE (user_address);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: pending_donations pending_donations_mercury_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_donations
    ADD CONSTRAINT pending_donations_mercury_payment_id_key UNIQUE (stripe_payment_id);


--
-- Name: pending_donations pending_donations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_donations
    ADD CONSTRAINT pending_donations_pkey PRIMARY KEY (id);


--
-- Name: pod_accountability_signatures pod_accountability_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_accountability_signatures
    ADD CONSTRAINT pod_accountability_signatures_pkey PRIMARY KEY (id);


--
-- Name: pod_accountability_signatures pod_accountability_signatures_pod_id_signer_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_accountability_signatures
    ADD CONSTRAINT pod_accountability_signatures_pod_id_signer_address_key UNIQUE (pod_id, signer_address);


--
-- Name: pod_application_votes pod_application_votes_application_id_voter_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_application_votes
    ADD CONSTRAINT pod_application_votes_application_id_voter_address_key UNIQUE (application_id, voter_address);


--
-- Name: pod_application_votes pod_application_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_application_votes
    ADD CONSTRAINT pod_application_votes_pkey PRIMARY KEY (id);


--
-- Name: pod_approval_signatures pod_approval_signatures_application_id_leader_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_approval_signatures
    ADD CONSTRAINT pod_approval_signatures_application_id_leader_address_key UNIQUE (application_id, leader_address);


--
-- Name: pod_approval_signatures pod_approval_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_approval_signatures
    ADD CONSTRAINT pod_approval_signatures_pkey PRIMARY KEY (id);


--
-- Name: pod_audit_log pod_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_audit_log
    ADD CONSTRAINT pod_audit_log_pkey PRIMARY KEY (id);


--
-- Name: pod_deletion_proposals pod_deletion_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_deletion_proposals
    ADD CONSTRAINT pod_deletion_proposals_pkey PRIMARY KEY (id);


--
-- Name: pod_faces pod_faces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_faces
    ADD CONSTRAINT pod_faces_pkey PRIMARY KEY (id);


--
-- Name: pod_faces pod_faces_pod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_faces
    ADD CONSTRAINT pod_faces_pod_id_key UNIQUE (pod_id);


--
-- Name: pod_invite_acceptances pod_invite_acceptances_link_id_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_invite_acceptances
    ADD CONSTRAINT pod_invite_acceptances_link_id_wallet_key UNIQUE (link_id, wallet);


--
-- Name: pod_invite_acceptances pod_invite_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_invite_acceptances
    ADD CONSTRAINT pod_invite_acceptances_pkey PRIMARY KEY (id);


--
-- Name: pod_invite_links pod_invite_links_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_invite_links
    ADD CONSTRAINT pod_invite_links_code_key UNIQUE (code);


--
-- Name: pod_invite_links pod_invite_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_invite_links
    ADD CONSTRAINT pod_invite_links_pkey PRIMARY KEY (id);


--
-- Name: pod_level_proposals pod_level_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_level_proposals
    ADD CONSTRAINT pod_level_proposals_pkey PRIMARY KEY (id);


--
-- Name: pod_member_counts pod_member_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_member_counts
    ADD CONSTRAINT pod_member_counts_pkey PRIMARY KEY (id);


--
-- Name: pod_member_counts pod_member_counts_pod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_member_counts
    ADD CONSTRAINT pod_member_counts_pod_id_key UNIQUE (pod_id);


--
-- Name: pod_members pod_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pkey PRIMARY KEY (id);


--
-- Name: pod_members pod_members_pod_id_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pod_id_wallet_key UNIQUE (pod_id, wallet);


--
-- Name: pod_membership_applications pod_membership_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_membership_applications
    ADD CONSTRAINT pod_membership_applications_pkey PRIMARY KEY (id);


--
-- Name: pod_membership_applications pod_membership_applications_pod_id_applicant_address_status_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_membership_applications
    ADD CONSTRAINT pod_membership_applications_pod_id_applicant_address_status_key UNIQUE (pod_id, applicant_address, status);


--
-- Name: pod_modules pod_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_modules
    ADD CONSTRAINT pod_modules_pkey PRIMARY KEY (id);


--
-- Name: pod_modules pod_modules_pod_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_modules
    ADD CONSTRAINT pod_modules_pod_id_key UNIQUE (pod_id);


--
-- Name: pod_place_links pod_place_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_place_links
    ADD CONSTRAINT pod_place_links_pkey PRIMARY KEY (id);


--
-- Name: pod_place_links pod_place_links_place_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_place_links
    ADD CONSTRAINT pod_place_links_place_id_target_type_target_id_key UNIQUE (place_id, target_type, target_id);


--
-- Name: pod_places pod_places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_places
    ADD CONSTRAINT pod_places_pkey PRIMARY KEY (id);


--
-- Name: pod_role_permissions_history pod_role_permissions_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_role_permissions_history
    ADD CONSTRAINT pod_role_permissions_history_pkey PRIMARY KEY (id);


--
-- Name: pod_role_permissions pod_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_role_permissions
    ADD CONSTRAINT pod_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: pod_role_permissions pod_role_permissions_pod_id_hat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_role_permissions
    ADD CONSTRAINT pod_role_permissions_pod_id_hat_id_key UNIQUE (pod_id, token_address);


--
-- Name: pod_self_budgets pod_self_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_self_budgets
    ADD CONSTRAINT pod_self_budgets_pkey PRIMARY KEY (id);


--
-- Name: pod_self_budgets pod_self_budgets_pod_id_epoch_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_self_budgets
    ADD CONSTRAINT pod_self_budgets_pod_id_epoch_key UNIQUE (pod_id, epoch);


--
-- Name: pods pods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: proposal_eligibility_snapshots proposal_eligibility_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_eligibility_snapshots
    ADD CONSTRAINT proposal_eligibility_snapshots_pkey PRIMARY KEY (id);


--
-- Name: proposal_eligibility_snapshots proposal_eligibility_snapshots_proposal_id_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_eligibility_snapshots
    ADD CONSTRAINT proposal_eligibility_snapshots_proposal_id_wallet_key UNIQUE (proposal_id, wallet);


--
-- Name: proposal_metadata proposal_metadata_onchain_proposal_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_metadata
    ADD CONSTRAINT proposal_metadata_onchain_proposal_id_key UNIQUE (onchain_proposal_id);


--
-- Name: proposal_metadata proposal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_metadata
    ADD CONSTRAINT proposal_metadata_pkey PRIMARY KEY (id);


--
-- Name: proposal_onchain_status proposal_onchain_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_onchain_status
    ADD CONSTRAINT proposal_onchain_status_pkey PRIMARY KEY (proposal_id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_start);


--
-- Name: referral_validations referral_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_validations
    ADD CONSTRAINT referral_validations_pkey PRIMARY KEY (id);


--
-- Name: relay_tasks relay_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relay_tasks
    ADD CONSTRAINT relay_tasks_pkey PRIMARY KEY (id);


--
-- Name: role_permission_approvals role_permission_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission_approvals
    ADD CONSTRAINT role_permission_approvals_pkey PRIMARY KEY (id);


--
-- Name: self_member_epoch_earned self_member_epoch_earned_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_member_epoch_earned
    ADD CONSTRAINT self_member_epoch_earned_pkey PRIMARY KEY (id);


--
-- Name: self_member_epoch_earned self_member_epoch_earned_wallet_pod_id_epoch_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_member_epoch_earned
    ADD CONSTRAINT self_member_epoch_earned_wallet_pod_id_epoch_key UNIQUE (wallet, pod_id, epoch);


--
-- Name: self_mint_queue self_mint_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_mint_queue
    ADD CONSTRAINT self_mint_queue_pkey PRIMARY KEY (id);


--
-- Name: self_mint_queue self_mint_queue_source_type_source_ref_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_mint_queue
    ADD CONSTRAINT self_mint_queue_source_type_source_ref_wallet_key UNIQUE (source_type, source_ref, wallet);


--
-- Name: survey_answers survey_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answers
    ADD CONSTRAINT survey_answers_pkey PRIMARY KEY (id);


--
-- Name: survey_questions survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_survey_id_respondent_wallet_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_respondent_wallet_key UNIQUE (survey_id, respondent_wallet);


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: system_supply_metadata system_supply_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_supply_metadata
    ADD CONSTRAINT system_supply_metadata_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: token_balances token_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_balances
    ADD CONSTRAINT token_balances_pkey PRIMARY KEY (wallet_address, contract_address, token_id);


--
-- Name: token_claims token_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_claims
    ADD CONSTRAINT token_claims_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (id);


--
-- Name: treasury_approval_workflows treasury_approval_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treasury_approval_workflows
    ADD CONSTRAINT treasury_approval_workflows_pkey PRIMARY KEY (id);


--
-- Name: treasury_snapshots treasury_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treasury_snapshots
    ADD CONSTRAINT treasury_snapshots_pkey PRIMARY KEY (id);


--
-- Name: treasury_transactions treasury_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treasury_transactions
    ADD CONSTRAINT treasury_transactions_pkey PRIMARY KEY (id);


--
-- Name: treasury_transactions treasury_transactions_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treasury_transactions
    ADD CONSTRAINT treasury_transactions_tx_hash_key UNIQUE (tx_hash);


--
-- Name: dispute_mediators unique_active_mediator; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_mediators
    ADD CONSTRAINT unique_active_mediator UNIQUE (dispute_id, mediator_address, status);


--
-- Name: bid_state_updates unique_bid_state_update; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bid_state_updates
    ADD CONSTRAINT unique_bid_state_update UNIQUE (transaction_hash, bid_id, update_type);


--
-- Name: pods unique_blockchain_pod_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT unique_blockchain_pod_id UNIQUE (blockchain_pod_id);


--
-- Name: user_profiles unique_wallet_address; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT unique_wallet_address UNIQUE (wallet_address);


--
-- Name: user_notification_preferences user_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_notification_preferences user_notification_preferences_user_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_preferences
    ADD CONSTRAINT user_notification_preferences_user_address_key UNIQUE (user_address);


--
-- Name: user_presence user_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (wallet_address);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_profiles user_profiles_referral_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_referral_key_key UNIQUE (referral_key);


--
-- Name: user_tokens user_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT user_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_tokens user_tokens_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tokens
    ADD CONSTRAINT user_tokens_wallet_address_key UNIQUE (wallet_address);


--
-- Name: user_wallet_link_codes user_wallet_link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallet_link_codes
    ADD CONSTRAINT user_wallet_link_codes_pkey PRIMARY KEY (code);


--
-- Name: user_wallets user_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallets
    ADD CONSTRAINT user_wallets_pkey PRIMARY KEY (id);


--
-- Name: user_wallets user_wallets_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallets
    ADD CONSTRAINT user_wallets_wallet_address_key UNIQUE (wallet_address);


--
-- Name: vault_access_log vault_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_access_log
    ADD CONSTRAINT vault_access_log_pkey PRIMARY KEY (id);


--
-- Name: vault_entries vault_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_entries
    ADD CONSTRAINT vault_entries_pkey PRIMARY KEY (id);


--
-- Name: vault_pending_grants vault_pending_grants_entry_id_newcomer_eoa_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_pending_grants
    ADD CONSTRAINT vault_pending_grants_entry_id_newcomer_eoa_key UNIQUE (entry_id, newcomer_eoa);


--
-- Name: vault_pending_grants vault_pending_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_pending_grants
    ADD CONSTRAINT vault_pending_grants_pkey PRIMARY KEY (id);


--
-- Name: vault_rotation_jobs vault_rotation_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_rotation_jobs
    ADD CONSTRAINT vault_rotation_jobs_pkey PRIMARY KEY (id);


--
-- Name: vault_user_keys vault_user_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_user_keys
    ADD CONSTRAINT vault_user_keys_pkey PRIMARY KEY (eoa_address);


--
-- Name: vault_wrapped_keys vault_wrapped_keys_entry_id_recipient_eoa_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_wrapped_keys
    ADD CONSTRAINT vault_wrapped_keys_entry_id_recipient_eoa_key UNIQUE (entry_id, recipient_eoa);


--
-- Name: vault_wrapped_keys vault_wrapped_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_wrapped_keys
    ADD CONSTRAINT vault_wrapped_keys_pkey PRIMARY KEY (id);


--
-- Name: video_call_sessions video_call_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_call_sessions
    ADD CONSTRAINT video_call_sessions_pkey PRIMARY KEY (id);


--
-- Name: video_call_signaling video_call_signaling_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_call_signaling
    ADD CONSTRAINT video_call_signaling_pkey PRIMARY KEY (id);


--
-- Name: wallet_link_nonces wallet_link_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_link_nonces
    ADD CONSTRAINT wallet_link_nonces_pkey PRIMARY KEY (nonce);


--
-- Name: work_submissions work_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_submissions
    ADD CONSTRAINT work_submissions_pkey PRIMARY KEY (id);


--
-- Name: account_deletion_requests_pending_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_deletion_requests_pending_uniq ON public.account_deletion_requests USING btree (wallet_address) WHERE (status = 'pending'::text);


--
-- Name: accreditations_course_wallet_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX accreditations_course_wallet_uniq ON public.accreditations USING btree (course_category_id, lower(wallet_address)) WHERE (course_category_id IS NOT NULL);


--
-- Name: accreditations_pod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accreditations_pod_idx ON public.accreditations USING btree (pod_id);


--
-- Name: accreditations_wallet_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accreditations_wallet_idx ON public.accreditations USING btree (lower(wallet_address));


--
-- Name: email_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_invites_email_idx ON public.email_invites USING btree (email);


--
-- Name: email_invites_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_invites_sender_idx ON public.email_invites USING btree (sender_wallet, sent_at);


--
-- Name: event_required_tokens_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_required_tokens_idx ON public.event_required_tokens USING btree (token_or_hat);


--
-- Name: forum_cat_required_tokens_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forum_cat_required_tokens_idx ON public.forum_category_required_tokens USING btree (token_or_hat);


--
-- Name: idx_activities_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_agent ON public.activities USING btree (agent_id);


--
-- Name: idx_activities_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_created ON public.activities USING btree (created_at DESC);


--
-- Name: idx_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_type ON public.activities USING btree (activity_type);


--
-- Name: idx_agendas_date_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendas_date_time ON public.event_agendas USING btree (agenda_date, start_time);


--
-- Name: idx_agendas_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendas_event_id ON public.event_agendas USING btree (event_id);


--
-- Name: idx_agendas_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agendas_sort_order ON public.event_agendas USING btree (event_id, sort_order);


--
-- Name: idx_agent_context_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_context_type ON public.agent_context USING btree (context_type);


--
-- Name: idx_agent_conversations_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_conversations_thread ON public.agent_conversations USING btree (thread_id);


--
-- Name: idx_agent_memory_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_agent ON public.agent_memory USING btree (agent_id);


--
-- Name: idx_agent_memory_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_date ON public.agent_memory USING btree (memory_date);


--
-- Name: idx_agent_memory_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_type ON public.agent_memory USING btree (memory_type);


--
-- Name: idx_agent_proposals_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_proposals_category ON public.agent_proposals USING btree (category);


--
-- Name: idx_agent_proposals_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_proposals_run ON public.agent_proposals USING btree (run_id);


--
-- Name: idx_agent_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_proposals_status ON public.agent_proposals USING btree (status);


--
-- Name: idx_agent_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_created ON public.agent_runs USING btree (created_at DESC);


--
-- Name: idx_agent_runs_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runs_mode ON public.agent_runs USING btree (mode);


--
-- Name: idx_application_votes_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_votes_application ON public.pod_application_votes USING btree (application_id);


--
-- Name: idx_application_votes_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_votes_tx ON public.pod_application_votes USING btree (transaction_hash);


--
-- Name: idx_application_votes_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_votes_voter ON public.pod_application_votes USING btree (voter_address);


--
-- Name: idx_approval_signatures_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_signatures_approver ON public.approval_signatures_audit USING btree (approver_address);


--
-- Name: idx_approval_signatures_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_signatures_workflow ON public.approval_signatures_audit USING btree (workflow_type, workflow_id);


--
-- Name: idx_bid_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_bounty_id ON public.bids USING btree (bounty_id);


--
-- Name: idx_bid_reviews_bid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_reviews_bid_id ON public.bid_reviews USING btree (bid_id);


--
-- Name: idx_bid_reviews_review_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_reviews_review_type ON public.bid_reviews USING btree (review_type);


--
-- Name: idx_bid_reviews_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_reviews_reviewer ON public.bid_reviews USING btree (reviewer_address);


--
-- Name: idx_bid_reviews_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_reviews_status ON public.bid_reviews USING btree (status);


--
-- Name: idx_bid_state_updates_bid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_state_updates_bid_id ON public.bid_state_updates USING btree (bid_id);


--
-- Name: idx_bid_state_updates_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_state_updates_bounty_id ON public.bid_state_updates USING btree (bounty_id);


--
-- Name: idx_bid_state_updates_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_state_updates_created_at ON public.bid_state_updates USING btree (created_at DESC);


--
-- Name: idx_bid_state_updates_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_state_updates_tx_hash ON public.bid_state_updates USING btree (transaction_hash);


--
-- Name: idx_bid_state_updates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bid_state_updates_type ON public.bid_state_updates USING btree (update_type);


--
-- Name: idx_bids_bidder_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bids_bidder_address ON public.bids USING btree (bidder_address);


--
-- Name: idx_bids_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bids_bounty_id ON public.bids USING btree (bounty_id);


--
-- Name: idx_bids_onchain_bid_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bids_onchain_bid_index ON public.bids USING btree (bounty_id, onchain_bid_index) WHERE (onchain_bid_index IS NOT NULL);


--
-- Name: idx_bids_placement_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bids_placement_tx_hash ON public.bids USING btree (placement_tx_hash) WHERE (placement_tx_hash IS NOT NULL);


--
-- Name: idx_bids_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bids_status ON public.bids USING btree (status);


--
-- Name: idx_bids_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bids_submitted_at ON public.bids USING btree (submitted_at DESC);


--
-- Name: idx_bounties_acceptance_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_acceptance_mode ON public.bounties USING btree (bid_acceptance_mode);


--
-- Name: idx_bounties_accepted_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_accepted_count ON public.bounties USING btree (bids_accepted_count);


--
-- Name: idx_bounties_blockchain_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_blockchain_id ON public.bounties USING btree (blockchain_id);


--
-- Name: idx_bounties_cancellation_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_cancellation_tx_hash ON public.bounties USING btree (cancellation_tx_hash) WHERE (cancellation_tx_hash IS NOT NULL);


--
-- Name: idx_bounties_cancelled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_cancelled_at ON public.bounties USING btree (cancelled_at) WHERE (cancelled_at IS NOT NULL);


--
-- Name: idx_bounties_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_created_at ON public.bounties USING btree (created_at DESC);


--
-- Name: idx_bounties_creator_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_creator_address ON public.bounties USING btree (creator_address);


--
-- Name: idx_bounties_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_pod_id ON public.bounties USING btree (pod_id);


--
-- Name: idx_bounties_pod_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_pod_status_created ON public.bounties USING btree (pod_id, status, created_at DESC);


--
-- Name: idx_bounties_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_status ON public.bounties USING btree (status);


--
-- Name: idx_bounties_transaction_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounties_transaction_hash ON public.bounties USING btree (transaction_hash);


--
-- Name: idx_bounty_approvals_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_approvals_bounty_id ON public.bounty_approval_workflows USING btree (bounty_id);


--
-- Name: idx_bounty_approvals_proposer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_approvals_proposer ON public.bounty_approval_workflows USING btree (proposed_by);


--
-- Name: idx_bounty_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_approvals_status ON public.bounty_approval_workflows USING btree (status);


--
-- Name: idx_bounty_approvals_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_approvals_type ON public.bounty_approval_workflows USING btree (approval_type);


--
-- Name: idx_bounty_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_category ON public.bounties USING btree (category);


--
-- Name: idx_bounty_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_status ON public.bounties USING btree (status);


--
-- Name: idx_bounty_token_gates_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_token_gates_bounty_id ON public.bounty_token_gates USING btree (bounty_id);


--
-- Name: idx_bounty_token_gates_hat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bounty_token_gates_hat_id ON public.bounty_token_gates USING btree (hat_id);


--
-- Name: idx_burn_approvals_burn_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_burn_approvals_burn_request_id ON public.burn_approvals USING btree (burn_request_id);


--
-- Name: idx_burn_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_burn_requests_created_at ON public.burn_requests USING btree (created_at DESC);


--
-- Name: idx_burn_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_burn_requests_status ON public.burn_requests USING btree (status);


--
-- Name: idx_burn_requests_user_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_burn_requests_user_wallet ON public.burn_requests USING btree (user_wallet);


--
-- Name: idx_caq_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caq_pod_id ON public.community_agent_queue USING btree (pod_id);


--
-- Name: idx_caq_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caq_status_created ON public.community_agent_queue USING btree (status, created_at);


--
-- Name: idx_chat_groups_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_groups_active ON public.chat_groups USING btree (is_active);


--
-- Name: idx_chat_groups_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_groups_pod_id ON public.chat_groups USING btree (pod_id);


--
-- Name: idx_chat_messages_direct; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_direct ON public.chat_messages USING btree (sender_wallet_id, receiver_wallet_id, is_direct_message) WHERE (is_direct_message = true);


--
-- Name: idx_chat_messages_group_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_group_created ON public.chat_messages USING btree (chat_group_id, created_at DESC);


--
-- Name: idx_chat_moderation_log_moderator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_moderation_log_moderator ON public.chat_moderation_log USING btree (moderator_id);


--
-- Name: idx_chat_moderation_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_moderation_log_target ON public.chat_moderation_log USING btree (target_user_wallet);


--
-- Name: idx_chat_muted_users_group_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_muted_users_group_wallet ON public.chat_muted_users USING btree (chat_group_id, user_wallet);


--
-- Name: idx_comments_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_author ON public.dispute_comments USING btree (author_address);


--
-- Name: idx_comments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_created_at ON public.dispute_comments USING btree (dispute_id, created_at DESC);


--
-- Name: idx_comments_dispute_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_dispute_id ON public.dispute_comments USING btree (dispute_id);


--
-- Name: idx_comments_private; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_private ON public.dispute_comments USING btree (is_private) WHERE (is_private = true);


--
-- Name: idx_comments_reply_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_reply_to ON public.dispute_comments USING btree (reply_to_comment_id) WHERE (reply_to_comment_id IS NOT NULL);


--
-- Name: idx_community_agent_posts_pod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_agent_posts_pod ON public.community_agent_posts USING btree (pod_id, created_at DESC);


--
-- Name: idx_community_agent_posts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_agent_posts_type ON public.community_agent_posts USING btree (pod_id, type, created_at DESC);


--
-- Name: idx_conf_participants_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_participants_room ON public.conference_participants USING btree (room_id, is_active);


--
-- Name: idx_conf_participants_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_participants_wallet ON public.conference_participants USING btree (wallet_address);


--
-- Name: idx_conf_reactions_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_reactions_cleanup ON public.conference_reactions USING btree (sent_at);


--
-- Name: idx_conf_reactions_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_reactions_room ON public.conference_reactions USING btree (room_id, sent_at DESC);


--
-- Name: idx_conference_rooms_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conference_rooms_event ON public.conference_rooms USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_conference_rooms_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conference_rooms_host ON public.conference_rooms USING btree (host_wallet);


--
-- Name: idx_conference_rooms_pod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conference_rooms_pod ON public.conference_rooms USING btree (pod_id) WHERE (pod_id IS NOT NULL);


--
-- Name: idx_conference_rooms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conference_rooms_status ON public.conference_rooms USING btree (status);


--
-- Name: idx_disputes_bid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_bid_id ON public.bounty_disputes USING btree (bid_id) WHERE (bid_id IS NOT NULL);


--
-- Name: idx_disputes_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_bounty_id ON public.bounty_disputes USING btree (bounty_id);


--
-- Name: idx_disputes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_created_at ON public.bounty_disputes USING btree (created_at DESC);


--
-- Name: idx_disputes_escalated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_escalated ON public.bounty_disputes USING btree (is_escalated) WHERE (is_escalated = true);


--
-- Name: idx_disputes_filed_against; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_filed_against ON public.bounty_disputes USING btree (filed_against);


--
-- Name: idx_disputes_filed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_filed_by ON public.bounty_disputes USING btree (filed_by);


--
-- Name: idx_disputes_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_priority ON public.bounty_disputes USING btree (priority);


--
-- Name: idx_disputes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_disputes_status ON public.bounty_disputes USING btree (status);


--
-- Name: idx_dm_blocks_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dm_blocks_blocker ON public.dm_blocks USING btree (blocker_id, blocked_id);


--
-- Name: idx_donation_approvals_donation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_donation_approvals_donation_id ON public.donation_approvals USING btree (donation_id);


--
-- Name: idx_drafts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drafts_author ON public.forum_thread_drafts USING btree (author_address);


--
-- Name: idx_event_approvals_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_approvals_event_id ON public.event_approval_workflows USING btree (event_id);


--
-- Name: idx_event_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_approvals_status ON public.event_approval_workflows USING btree (status);


--
-- Name: idx_event_escrow_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_escrow_event_id ON public.event_escrow USING btree (event_id);


--
-- Name: idx_event_notifications_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_event_id ON public.event_notifications USING btree (event_id);


--
-- Name: idx_event_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_recipient ON public.event_notifications USING btree (recipient_address);


--
-- Name: idx_event_notifications_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_scheduled ON public.event_notifications USING btree (scheduled_for);


--
-- Name: idx_event_notifications_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_sent ON public.event_notifications USING btree (sent_at);


--
-- Name: idx_event_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notifications_type ON public.event_notifications USING btree (notification_type);


--
-- Name: idx_event_tokens_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_tokens_contract ON public.event_tokens USING btree (contract_address);


--
-- Name: idx_event_tokens_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_tokens_event_id ON public.event_tokens USING btree (event_id);


--
-- Name: idx_event_tokens_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_tokens_owner ON public.event_tokens USING btree (owner_address);


--
-- Name: idx_events_blockchain_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_blockchain_event_id ON public.events USING btree (blockchain_event_id);


--
-- Name: idx_events_creator_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_creator_address ON public.events USING btree (creator_address);


--
-- Name: idx_events_date_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_date_status ON public.events USING btree (event_date, status) WHERE (status = 'published'::text);


--
-- Name: idx_events_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_event_date ON public.events USING btree (event_date);


--
-- Name: idx_events_organizing_pod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_organizing_pod ON public.events USING btree (organizing_pod_id);


--
-- Name: idx_events_required_tokens; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_required_tokens ON public.events USING gin (required_tokens);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_user_id ON public.events USING btree (user_id);


--
-- Name: idx_evidence_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidence_created_at ON public.dispute_evidence USING btree (created_at DESC);


--
-- Name: idx_evidence_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidence_display_order ON public.dispute_evidence USING btree (dispute_id, display_order);


--
-- Name: idx_evidence_dispute_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidence_dispute_id ON public.dispute_evidence USING btree (dispute_id);


--
-- Name: idx_evidence_submitted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evidence_submitted_by ON public.dispute_evidence USING btree (submitted_by);


--
-- Name: idx_explorer_events_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_explorer_events_actor ON public.explorer_events USING btree (actor);


--
-- Name: idx_explorer_events_actor_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_explorer_events_actor_created_at ON public.explorer_events USING btree (actor, created_at DESC) WHERE (actor IS NOT NULL);


--
-- Name: idx_explorer_events_category_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_explorer_events_category_created_at ON public.explorer_events USING btree (category, created_at DESC);


--
-- Name: idx_explorer_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_explorer_events_created_at ON public.explorer_events USING btree (created_at DESC);


--
-- Name: idx_explorer_events_dedupe_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_explorer_events_dedupe_key ON public.explorer_events USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: idx_explorer_events_pod_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_explorer_events_pod_created_at ON public.explorer_events USING btree (pod_id, created_at DESC) WHERE (pod_id IS NOT NULL);


--
-- Name: idx_explorer_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_explorer_events_type ON public.explorer_events USING btree (type);


--
-- Name: idx_featured_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_featured_category ON public.forum_featured_content USING btree (category_id, is_active, display_order);


--
-- Name: idx_forum_bookmarks_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_bookmarks_thread ON public.forum_bookmarks USING btree (thread_id);


--
-- Name: idx_forum_bookmarks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_bookmarks_user ON public.forum_bookmarks USING btree (user_address);


--
-- Name: idx_forum_categories_pod; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_categories_pod ON public.forum_categories USING btree (pod_id);


--
-- Name: idx_forum_media_attachments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_media_attachments_post ON public.forum_media_attachments USING btree (post_id) WHERE (post_id IS NOT NULL);


--
-- Name: idx_forum_media_attachments_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_media_attachments_thread ON public.forum_media_attachments USING btree (thread_id) WHERE (post_id IS NULL);


--
-- Name: idx_forum_posts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_posts_author ON public.forum_posts USING btree (author_address);


--
-- Name: idx_forum_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_posts_created_at ON public.forum_posts USING btree (created_at);


--
-- Name: idx_forum_posts_thread_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_posts_thread_created ON public.forum_posts USING btree (thread_id, created_at DESC);


--
-- Name: idx_forum_posts_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_posts_thread_id ON public.forum_posts USING btree (thread_id);


--
-- Name: idx_forum_proposal_links_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_proposal_links_proposal ON public.forum_proposal_links USING btree (proposal_id);


--
-- Name: idx_forum_proposal_links_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_proposal_links_thread ON public.forum_proposal_links USING btree (forum_thread_id);


--
-- Name: idx_forum_thread_reads_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_thread_reads_thread ON public.forum_thread_reads USING btree (thread_id);


--
-- Name: idx_forum_thread_reads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_thread_reads_user ON public.forum_thread_reads USING btree (user_address);


--
-- Name: idx_forum_thread_summaries_generated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_thread_summaries_generated_at ON public.forum_thread_summaries USING btree (generated_at DESC);


--
-- Name: idx_forum_thread_summaries_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_thread_summaries_thread_id ON public.forum_thread_summaries USING btree (thread_id);


--
-- Name: idx_forum_thread_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_thread_tags_tag ON public.forum_thread_tags USING btree (tag);


--
-- Name: idx_forum_thread_tags_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_thread_tags_thread ON public.forum_thread_tags USING btree (thread_id);


--
-- Name: idx_forum_threads_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_author ON public.forum_threads USING btree (author_address);


--
-- Name: idx_forum_threads_category_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_category_created ON public.forum_threads USING btree (category_id, created_at DESC);


--
-- Name: idx_forum_threads_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_category_id ON public.forum_threads USING btree (category_id);


--
-- Name: idx_forum_threads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_created_at ON public.forum_threads USING btree (created_at DESC);


--
-- Name: idx_forum_threads_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_threads_search ON public.forum_threads USING gin (search_vector);


--
-- Name: idx_general_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_created_at ON public.general_notifications USING btree (created_at DESC);


--
-- Name: idx_general_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_is_read ON public.general_notifications USING btree (is_read);


--
-- Name: idx_general_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_read ON public.general_notifications USING btree (is_read);


--
-- Name: idx_general_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_recipient ON public.general_notifications USING btree (recipient_address);


--
-- Name: idx_general_notifications_recipient_read_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_recipient_read_created ON public.general_notifications USING btree (recipient_address, is_read, created_at DESC);


--
-- Name: idx_general_notifications_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_sender ON public.general_notifications USING btree (sender_address);


--
-- Name: idx_general_notifications_sender_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_sender_created ON public.general_notifications USING btree (lower(sender_address), created_at DESC);


--
-- Name: idx_general_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_general_notifications_type ON public.general_notifications USING btree (notification_type);


--
-- Name: idx_gifts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gifts_created_at ON public.gifts USING btree (created_at DESC);


--
-- Name: idx_gifts_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gifts_recipient ON public.gifts USING btree (recipient_id);


--
-- Name: idx_gifts_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gifts_sender ON public.gifts USING btree (sender_id);


--
-- Name: idx_gifts_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gifts_transaction ON public.gifts USING btree (transaction_hash);


--
-- Name: idx_governance_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_created_at ON public.governance_notifications USING btree (created_at DESC);


--
-- Name: idx_governance_notifications_proposal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_proposal_id ON public.governance_notifications USING btree (proposal_id);


--
-- Name: idx_governance_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_read ON public.governance_notifications USING btree (is_read);


--
-- Name: idx_governance_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_recipient ON public.governance_notifications USING btree (recipient_address);


--
-- Name: idx_governance_notifications_recipient_read_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_recipient_read_created ON public.governance_notifications USING btree (recipient_address, is_read, created_at DESC);


--
-- Name: idx_governance_notifications_sender_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_sender_created ON public.governance_notifications USING btree (lower((sender_address)::text), created_at DESC);


--
-- Name: idx_governance_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_notifications_type ON public.governance_notifications USING btree (notification_type);


--
-- Name: idx_governance_proposal_votes_proposal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_proposal_votes_proposal_id ON public.governance_proposal_votes USING btree (proposal_id);


--
-- Name: idx_governance_user_votes_proposal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_user_votes_proposal_id ON public.governance_user_votes USING btree (proposal_id);


--
-- Name: idx_governance_user_votes_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_user_votes_voter ON public.governance_user_votes USING btree (voter_address);


--
-- Name: idx_governance_votes_hat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_hat_id ON public.governance_votes USING btree (hat_id);


--
-- Name: idx_governance_votes_onchain_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_onchain_recorded ON public.governance_votes USING btree (onchain_recorded_at) WHERE (onchain_recorded_at IS NULL);


--
-- Name: idx_governance_votes_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_pod_id ON public.governance_votes USING btree (pod_id);


--
-- Name: idx_governance_votes_proposal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_proposal_id ON public.governance_votes USING btree (proposal_id);


--
-- Name: idx_governance_votes_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_timestamp ON public.governance_votes USING btree ("timestamp");


--
-- Name: idx_governance_votes_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_voter ON public.governance_votes USING btree (voter_address);


--
-- Name: idx_governance_votes_voter_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_votes_voter_address ON public.governance_votes USING btree (voter_address);


--
-- Name: idx_hat_metadata_cache_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hat_metadata_cache_created_at ON public.hat_metadata_cache USING btree (created_at);


--
-- Name: idx_hat_metadata_cache_ipfs_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hat_metadata_cache_ipfs_hash ON public.hat_metadata_cache USING btree (ipfs_hash);


--
-- Name: idx_hat_metadata_cache_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hat_metadata_cache_pod_id ON public.hat_metadata_cache USING btree (pod_id);


--
-- Name: idx_hat_metadata_cache_role_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hat_metadata_cache_role_name ON public.hat_metadata_cache USING btree (role_name);


--
-- Name: idx_hats_module_deployments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hats_module_deployments_active ON public.hats_module_deployments USING btree (is_active);


--
-- Name: idx_hats_module_deployments_hat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hats_module_deployments_hat_id ON public.hats_module_deployments USING btree (token_address);


--
-- Name: idx_hats_module_deployments_module_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hats_module_deployments_module_address ON public.hats_module_deployments USING btree (module_address);


--
-- Name: idx_hats_module_deployments_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hats_module_deployments_pod_id ON public.hats_module_deployments USING btree (pod_id);


--
-- Name: idx_hats_module_deployments_sync_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hats_module_deployments_sync_status ON public.hats_module_deployments USING btree (sync_status);


--
-- Name: idx_ledger_anchors_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_anchors_period ON public.ledger_anchors USING btree (period_end DESC);


--
-- Name: idx_marketplace_orders_buyer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_orders_buyer ON public.marketplace_orders USING btree (buyer_address);


--
-- Name: idx_marketplace_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_orders_created ON public.marketplace_orders USING btree (created_at DESC);


--
-- Name: idx_marketplace_orders_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_orders_product ON public.marketplace_orders USING btree (product_id);


--
-- Name: idx_marketplace_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_orders_status ON public.marketplace_orders USING btree (status);


--
-- Name: idx_media_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_post ON public.forum_media_attachments USING btree (post_id);


--
-- Name: idx_media_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_thread ON public.forum_media_attachments USING btree (thread_id);


--
-- Name: idx_mediators_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mediators_address ON public.dispute_mediators USING btree (mediator_address);


--
-- Name: idx_mediators_dispute_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mediators_dispute_id ON public.dispute_mediators USING btree (dispute_id);


--
-- Name: idx_mediators_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mediators_status ON public.dispute_mediators USING btree (status);


--
-- Name: idx_messages_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_agent ON public.messages USING btree (from_agent_id);


--
-- Name: idx_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_everyone_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_everyone_tag ON public.messages USING btree (is_everyone_tag) WHERE (is_everyone_tag = true);


--
-- Name: idx_messages_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_task ON public.messages USING btree (task_id);


--
-- Name: idx_milestones_bid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestones_bid_id ON public.milestones USING btree (bid_id);


--
-- Name: idx_milestones_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_milestones_due_date ON public.milestones USING btree (due_date);


--
-- Name: idx_mod_actions_moderator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_actions_moderator ON public.forum_moderator_actions USING btree (moderator_address);


--
-- Name: idx_mod_actions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mod_actions_target ON public.forum_moderator_actions USING btree (target_type, target_id);


--
-- Name: idx_notification_preferences_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_preferences_user ON public.notification_preferences USING btree (user_address);


--
-- Name: idx_notifications_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_agent ON public.notifications USING btree (mentioned_agent_id);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_delivered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_delivered ON public.notifications USING btree (delivered);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.bounty_notifications USING btree (is_read);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient ON public.bounty_notifications USING btree (recipient_address);


--
-- Name: idx_order_status_history_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_changed_by ON public.order_status_history USING btree (changed_by_address);


--
-- Name: idx_order_status_history_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_created ON public.order_status_history USING btree (created_at DESC);


--
-- Name: idx_order_status_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_created_at ON public.order_status_history USING btree (created_at DESC);


--
-- Name: idx_order_status_history_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_order_id ON public.order_status_history USING btree (order_id);


--
-- Name: idx_pending_donations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_donations_created_at ON public.pending_donations USING btree (created_at DESC);


--
-- Name: idx_pending_donations_settlement_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_donations_settlement_date ON public.pending_donations USING btree (settlement_date);


--
-- Name: idx_pending_donations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_donations_status ON public.pending_donations USING btree (status);


--
-- Name: idx_pending_donations_user_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_donations_user_wallet ON public.pending_donations USING btree (user_wallet);


--
-- Name: idx_pod_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_audit_log_action ON public.pod_audit_log USING btree (action);


--
-- Name: idx_pod_audit_log_performed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_audit_log_performed_at ON public.pod_audit_log USING btree (performed_at DESC);


--
-- Name: idx_pod_audit_log_performed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_audit_log_performed_by ON public.pod_audit_log USING btree (performed_by);


--
-- Name: idx_pod_audit_log_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_audit_log_pod_id ON public.pod_audit_log USING btree (pod_id);


--
-- Name: idx_pod_deletion_proposals_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_deletion_proposals_created_at ON public.pod_deletion_proposals USING btree (created_at);


--
-- Name: idx_pod_deletion_proposals_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_deletion_proposals_expires_at ON public.pod_deletion_proposals USING btree (expires_at);


--
-- Name: idx_pod_deletion_proposals_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_deletion_proposals_pod_id ON public.pod_deletion_proposals USING btree (pod_id);


--
-- Name: idx_pod_deletion_proposals_proposed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_deletion_proposals_proposed_by ON public.pod_deletion_proposals USING btree (proposed_by);


--
-- Name: idx_pod_deletion_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_deletion_proposals_status ON public.pod_deletion_proposals USING btree (status);


--
-- Name: idx_pod_faces_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_faces_status ON public.pod_faces USING btree (status);


--
-- Name: idx_pod_level_proposals_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_level_proposals_created_by ON public.pod_level_proposals USING btree (created_by);


--
-- Name: idx_pod_level_proposals_onchain_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_level_proposals_onchain_id ON public.pod_level_proposals USING btree (onchain_proposal_id);


--
-- Name: idx_pod_level_proposals_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_level_proposals_pod_id ON public.pod_level_proposals USING btree (pod_id);


--
-- Name: idx_pod_level_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_level_proposals_status ON public.pod_level_proposals USING btree (status);


--
-- Name: idx_pod_level_proposals_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_level_proposals_tier ON public.pod_level_proposals USING btree (governance_tier);


--
-- Name: idx_pod_membership_applications_applicant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_membership_applications_applicant ON public.pod_membership_applications USING btree (applicant_address);


--
-- Name: idx_pod_membership_applications_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_membership_applications_pod_id ON public.pod_membership_applications USING btree (pod_id);


--
-- Name: idx_pod_membership_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_membership_applications_status ON public.pod_membership_applications USING btree (status);


--
-- Name: idx_pod_membership_applications_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_membership_applications_submitted ON public.pod_membership_applications USING btree (submitted_at DESC);


--
-- Name: idx_pod_modules_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_modules_pod_id ON public.pod_modules USING btree (pod_id);


--
-- Name: idx_pod_place_links_place; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_place_links_place ON public.pod_place_links USING btree (place_id);


--
-- Name: idx_pod_place_links_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_place_links_target ON public.pod_place_links USING btree (target_type, target_id);


--
-- Name: idx_pod_places_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_places_pod_id ON public.pod_places USING btree (pod_id);


--
-- Name: idx_pod_places_pod_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_places_pod_kind ON public.pod_places USING btree (pod_id, kind);


--
-- Name: idx_pod_places_pod_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_places_pod_status ON public.pod_places USING btree (pod_id, status);


--
-- Name: idx_pod_role_permissions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_active ON public.pod_role_permissions USING btree (is_active);


--
-- Name: idx_pod_role_permissions_criteria_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_criteria_gin ON public.pod_role_permissions USING gin (eligibility_criteria);


--
-- Name: idx_pod_role_permissions_hat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_hat_id ON public.pod_role_permissions USING btree (token_address);


--
-- Name: idx_pod_role_permissions_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_history_changed_at ON public.pod_role_permissions_history USING btree (changed_at);


--
-- Name: idx_pod_role_permissions_history_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_history_changed_by ON public.pod_role_permissions_history USING btree (changed_by);


--
-- Name: idx_pod_role_permissions_history_hat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_history_hat ON public.pod_role_permissions_history USING btree (token_address);


--
-- Name: idx_pod_role_permissions_history_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_history_permission ON public.pod_role_permissions_history USING btree (permission_id);


--
-- Name: idx_pod_role_permissions_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_lookup ON public.pod_role_permissions USING btree (pod_id, token_address, is_active);


--
-- Name: idx_pod_role_permissions_metadata_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_metadata_hash ON public.pod_role_permissions USING btree (metadata_hash);


--
-- Name: idx_pod_role_permissions_permissions_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_permissions_gin ON public.pod_role_permissions USING gin (permissions);


--
-- Name: idx_pod_role_permissions_pod_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_pod_active ON public.pod_role_permissions USING btree (pod_id, is_active);


--
-- Name: idx_pod_role_permissions_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_pod_id ON public.pod_role_permissions USING btree (pod_id);


--
-- Name: idx_pod_role_permissions_pod_token_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_pod_token_active ON public.pod_role_permissions USING btree (pod_id, token_address, is_active) WHERE (is_active = true);


--
-- Name: idx_pod_role_permissions_sync; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_sync ON public.pod_role_permissions USING btree (last_synced_at);


--
-- Name: idx_pod_role_permissions_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_role_permissions_updated ON public.pod_role_permissions USING btree (updated_at);


--
-- Name: idx_pod_self_budgets_pod_epoch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_self_budgets_pod_epoch ON public.pod_self_budgets USING btree (pod_id, epoch);


--
-- Name: idx_pods_blockchain_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pods_blockchain_pod_id ON public.pods USING btree (blockchain_pod_id);


--
-- Name: idx_pods_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pods_is_active ON public.pods USING btree (is_active);


--
-- Name: idx_pods_parent_hat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pods_parent_hat_id ON public.pods USING btree (parent_hat_id);


--
-- Name: idx_pods_proxy_admin_hat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pods_proxy_admin_hat_id ON public.pods USING btree (proxy_admin_hat_id);


--
-- Name: idx_pods_proxy_contract_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pods_proxy_contract_address ON public.pods USING btree (proxy_contract_address);


--
-- Name: idx_poll_options_poll; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poll_options_poll ON public.forum_poll_options USING btree (poll_id, option_order);


--
-- Name: idx_poll_votes_voter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_poll_votes_voter ON public.forum_poll_votes USING btree (voter_address);


--
-- Name: idx_posts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author ON public.forum_posts USING btree (author_address);


--
-- Name: idx_posts_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_thread ON public.forum_posts USING btree (thread_id, created_at);


--
-- Name: idx_products_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_created_at ON public.products USING btree (created_at DESC);


--
-- Name: idx_products_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_owner_id ON public.products USING btree (owner_id);


--
-- Name: idx_products_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_pod_id ON public.products USING btree (pod_id);


--
-- Name: idx_products_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sku ON public.products USING btree (sku);


--
-- Name: idx_products_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_title ON public.products USING gin (to_tsvector('english'::regconfig, title));


--
-- Name: idx_proposal_eligibility_snapshots_proposal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_eligibility_snapshots_proposal ON public.proposal_eligibility_snapshots USING btree (proposal_id);


--
-- Name: idx_proposal_metadata_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_metadata_created_at ON public.proposal_metadata USING btree (created_at DESC);


--
-- Name: idx_proposal_metadata_onchain_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_metadata_onchain_id ON public.proposal_metadata USING btree (onchain_proposal_id);


--
-- Name: idx_proposal_metadata_proposer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_metadata_proposer ON public.proposal_metadata USING btree (proposer_address);


--
-- Name: idx_proposal_metadata_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_metadata_status ON public.proposal_metadata USING btree (status);


--
-- Name: idx_proposal_metadata_token_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proposal_metadata_token_id ON public.proposal_metadata USING btree (token_id);


--
-- Name: idx_prph_permission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prph_permission_id ON public.pod_role_permissions_history USING btree (permission_id);


--
-- Name: idx_push_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions USING btree (user_address);


--
-- Name: idx_reactions_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reactions_post ON public.forum_post_reactions USING btree (post_id);


--
-- Name: idx_reactions_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reactions_thread ON public.forum_post_reactions USING btree (thread_id);


--
-- Name: idx_referral_validations_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_validations_code ON public.referral_validations USING btree (invite_code);


--
-- Name: idx_referral_validations_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_validations_wallet ON public.referral_validations USING btree (used_by_wallet);


--
-- Name: idx_registrations_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_event_id ON public.event_registrations USING btree (event_id);


--
-- Name: idx_registrations_registered_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_registered_at ON public.event_registrations USING btree (registered_at DESC);


--
-- Name: idx_registrations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_status ON public.event_registrations USING btree (registration_status);


--
-- Name: idx_registrations_user_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_user_address ON public.event_registrations USING btree (user_address);


--
-- Name: idx_reports_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_post ON public.forum_post_reports USING btree (post_id);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.forum_post_reports USING btree (status);


--
-- Name: idx_resolutions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolutions_created_at ON public.dispute_resolutions USING btree (created_at DESC);


--
-- Name: idx_resolutions_dispute_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolutions_dispute_id ON public.dispute_resolutions USING btree (dispute_id);


--
-- Name: idx_resolutions_proposed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolutions_proposed_by ON public.dispute_resolutions USING btree (proposed_by);


--
-- Name: idx_resolutions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resolutions_status ON public.dispute_resolutions USING btree (status);


--
-- Name: idx_role_approvals_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_approvals_pod_id ON public.role_permission_approvals USING btree (pod_id);


--
-- Name: idx_role_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_approvals_status ON public.role_permission_approvals USING btree (status);


--
-- Name: idx_self_member_epoch_earned_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_self_member_epoch_earned_lookup ON public.self_member_epoch_earned USING btree (wallet, pod_id, epoch);


--
-- Name: idx_self_mint_queue_pod_epoch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_self_mint_queue_pod_epoch ON public.self_mint_queue USING btree (pod_id, epoch);


--
-- Name: idx_self_mint_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_self_mint_queue_status ON public.self_mint_queue USING btree (status);


--
-- Name: idx_self_mint_queue_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_self_mint_queue_wallet ON public.self_mint_queue USING btree (wallet);


--
-- Name: idx_survey_answers_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_survey_answers_question_id ON public.survey_answers USING btree (question_id);


--
-- Name: idx_survey_answers_response_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_survey_answers_response_id ON public.survey_answers USING btree (response_id);


--
-- Name: idx_survey_questions_survey_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_survey_questions_survey_id ON public.survey_questions USING btree (survey_id);


--
-- Name: idx_survey_responses_respondent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_survey_responses_respondent ON public.survey_responses USING btree (respondent_wallet);


--
-- Name: idx_survey_responses_survey_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_survey_responses_survey_id ON public.survey_responses USING btree (survey_id);


--
-- Name: idx_surveys_pod_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_surveys_pod_id ON public.surveys USING btree (pod_id);


--
-- Name: idx_surveys_pod_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_surveys_pod_status ON public.surveys USING btree (pod_id, status);


--
-- Name: idx_surveys_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_surveys_status ON public.surveys USING btree (status);


--
-- Name: idx_tasks_assignees; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assignees ON public.tasks USING gin (assignee_ids);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at DESC);


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority DESC);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_threads_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threads_author ON public.forum_threads USING btree (author_address);


--
-- Name: idx_threads_category_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threads_category_pinned ON public.forum_threads USING btree (category_id, is_pinned DESC, created_at DESC);


--
-- Name: idx_token_balances_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_balances_lookup ON public.token_balances USING btree (contract_address, token_id, wallet_address);


--
-- Name: idx_token_claims_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_claims_status ON public.token_claims USING btree (status);


--
-- Name: idx_token_claims_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_claims_wallet ON public.token_claims USING btree (wallet_address);


--
-- Name: idx_treasury_snapshots_is_anomaly; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treasury_snapshots_is_anomaly ON public.treasury_snapshots USING btree (is_anomaly);


--
-- Name: idx_treasury_snapshots_snapshot_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_treasury_snapshots_snapshot_at ON public.treasury_snapshots USING btree (snapshot_at DESC);


--
-- Name: idx_user_mutes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_mutes_active ON public.forum_user_mutes USING btree (user_address, is_active);


--
-- Name: idx_user_presence_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_presence_last_seen ON public.user_presence USING btree (last_seen_at DESC);


--
-- Name: idx_user_profiles_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_invited_by ON public.user_profiles USING btree (invited_by);


--
-- Name: idx_user_profiles_referral_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_referral_key ON public.user_profiles USING btree (referral_key);


--
-- Name: idx_user_profiles_user_id_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_user_id_wallet ON public.user_profiles USING btree (user_id, wallet_address);


--
-- Name: idx_user_profiles_wallet_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_wallet_address ON public.user_profiles USING btree (wallet_address);


--
-- Name: idx_user_profiles_wallet_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_wallet_lower ON public.user_profiles USING btree (lower(wallet_address));


--
-- Name: idx_vcs_initiator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vcs_initiator ON public.video_call_sessions USING btree (initiator_wallet, created_at DESC);


--
-- Name: idx_vcs_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vcs_recipient ON public.video_call_sessions USING btree (recipient_wallet, status);


--
-- Name: idx_vcsi_session_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vcsi_session_to ON public.video_call_signaling USING btree (session_id, to_wallet, created_at);


--
-- Name: idx_work_submissions_bid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_submissions_bid_id ON public.work_submissions USING btree (bid_id);


--
-- Name: idx_work_submissions_bounty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_submissions_bounty_id ON public.work_submissions USING btree (bounty_id);


--
-- Name: idx_work_submissions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_submissions_created_at ON public.work_submissions USING btree (created_at DESC);


--
-- Name: idx_work_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_submissions_status ON public.work_submissions USING btree (status);


--
-- Name: idx_work_submissions_submitter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_submissions_submitter ON public.work_submissions USING btree (submitter_address);


--
-- Name: pod_invite_acceptances_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pod_invite_acceptances_pending_idx ON public.pod_invite_acceptances USING btree (pod_id) WHERE (hat_minted_at IS NULL);


--
-- Name: pod_invite_links_pod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pod_invite_links_pod_idx ON public.pod_invite_links USING btree (pod_id);


--
-- Name: treasury_transactions_pod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treasury_transactions_pod_id_idx ON public.treasury_transactions USING btree (pod_id, created_at DESC);


--
-- Name: treasury_transactions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treasury_transactions_status_idx ON public.treasury_transactions USING btree (status);


--
-- Name: treasury_transactions_treasury_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treasury_transactions_treasury_address_idx ON public.treasury_transactions USING btree (treasury_address);


--
-- Name: treasury_transactions_tx_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treasury_transactions_tx_hash_idx ON public.treasury_transactions USING btree (tx_hash);


--
-- Name: treasury_transactions_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treasury_transactions_type_idx ON public.treasury_transactions USING btree (type);


--
-- Name: user_wallet_link_codes_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_wallet_link_codes_expires_at_idx ON public.user_wallet_link_codes USING btree (expires_at) WHERE (consumed_at IS NULL);


--
-- Name: user_wallet_link_codes_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_wallet_link_codes_user_id_idx ON public.user_wallet_link_codes USING btree (user_id) WHERE (consumed_at IS NULL);


--
-- Name: user_wallets_one_canonical_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_wallets_one_canonical_per_user ON public.user_wallets USING btree (user_id) WHERE (is_canonical = true);


--
-- Name: user_wallets_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_wallets_user_id_idx ON public.user_wallets USING btree (user_id);


--
-- Name: user_wallets_wallet_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_wallets_wallet_address_idx ON public.user_wallets USING btree (wallet_address);


--
-- Name: vault_access_log_pod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_access_log_pod_idx ON public.vault_access_log USING btree (pod_id, occurred_at DESC);


--
-- Name: vault_entries_allowed_role_ids_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_entries_allowed_role_ids_idx ON public.vault_entries USING gin (allowed_role_ids);


--
-- Name: vault_entries_pod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_entries_pod_id_idx ON public.vault_entries USING btree (pod_id);


--
-- Name: vault_pending_grants_pod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_pending_grants_pod_idx ON public.vault_pending_grants USING btree (pod_id);


--
-- Name: vault_rotation_jobs_pod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_rotation_jobs_pod_idx ON public.vault_rotation_jobs USING btree (pod_id);


--
-- Name: vault_wrapped_keys_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_wrapped_keys_entry_idx ON public.vault_wrapped_keys USING btree (entry_id);


--
-- Name: vault_wrapped_keys_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vault_wrapped_keys_recipient_idx ON public.vault_wrapped_keys USING btree (recipient_eoa);


--
-- Name: wallet_link_nonces_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_link_nonces_expires_at_idx ON public.wallet_link_nonces USING btree (expires_at) WHERE (consumed_at IS NULL);


--
-- Name: wallet_link_nonces_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wallet_link_nonces_user_id_idx ON public.wallet_link_nonces USING btree (user_id) WHERE (consumed_at IS NULL);


--
-- Name: pod_accountability_signatures accountability_signature_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accountability_signature_guard BEFORE INSERT OR UPDATE ON public.pod_accountability_signatures FOR EACH ROW EXECUTE FUNCTION public.accountability_signature_guard();


--
-- Name: knowledge_item_views award_on_item_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER award_on_item_completion AFTER INSERT OR UPDATE OF completed ON public.knowledge_item_views FOR EACH ROW EXECUTE FUNCTION public.trg_award_on_item_completion();


--
-- Name: pod_role_permissions create_pod_role_permissions_history_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER create_pod_role_permissions_history_trigger AFTER INSERT OR DELETE OR UPDATE ON public.pod_role_permissions FOR EACH ROW EXECUTE FUNCTION public.create_pod_role_permissions_history();


--
-- Name: governance_votes governance_votes_jwt_logger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER governance_votes_jwt_logger BEFORE INSERT ON public.governance_votes FOR EACH ROW EXECUTE FUNCTION public.log_governance_vote_jwt();


--
-- Name: chat_messages normalize_chat_addresses_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_chat_addresses_trigger BEFORE INSERT OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.normalize_chat_addresses();


--
-- Name: dm_blocks normalize_dm_block_addresses_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER normalize_dm_block_addresses_trigger BEFORE INSERT OR UPDATE ON public.dm_blocks FOR EACH ROW EXECUTE FUNCTION public.normalize_dm_block_addresses();


--
-- Name: notification_preferences notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();


--
-- Name: general_notifications notification_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_rate_limit BEFORE INSERT ON public.general_notifications FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_rate_limit();


--
-- Name: governance_notifications notification_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_rate_limit BEFORE INSERT ON public.governance_notifications FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_rate_limit();


--
-- Name: pod_deletion_proposals pod_deletion_proposals_freeze_threshold; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pod_deletion_proposals_freeze_threshold BEFORE UPDATE OF approval_threshold_bps ON public.pod_deletion_proposals FOR EACH ROW EXECUTE FUNCTION public.freeze_pod_deletion_proposal_threshold();


--
-- Name: pod_level_proposals pod_level_proposals_freeze_thresholds; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pod_level_proposals_freeze_thresholds BEFORE UPDATE OF approval_threshold_bps, quorum_threshold_bps, eligible_voter_count ON public.pod_level_proposals FOR EACH ROW EXECUTE FUNCTION public.freeze_pod_level_proposal_thresholds();


--
-- Name: pod_members pod_members_authority_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pod_members_authority_guard BEFORE INSERT OR UPDATE ON public.pod_members FOR EACH ROW EXECUTE FUNCTION public.pod_members_authority_guard();


--
-- Name: pod_members pod_members_count_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pod_members_count_trigger AFTER INSERT OR DELETE OR UPDATE ON public.pod_members FOR EACH ROW EXECUTE FUNCTION public.trigger_update_pod_member_counts();


--
-- Name: pods pods_governance_config_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pods_governance_config_authority BEFORE UPDATE OF gov_op_quorum_bps, gov_op_approval_bps, gov_op_voting_hours, gov_treasury_quorum_bps, gov_treasury_approval_bps, gov_treasury_voting_hours ON public.pods FOR EACH ROW EXECUTE FUNCTION public.enforce_pod_governance_config_authority();


--
-- Name: tasks task_completed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_completed BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.mark_task_completed();


--
-- Name: tasks task_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_task_timestamp();


--
-- Name: bids trg_bids_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bids_guard BEFORE INSERT OR UPDATE ON public.bids FOR EACH ROW EXECUTE FUNCTION public.bids_guard();


--
-- Name: bounties trg_bounties_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bounties_guard BEFORE UPDATE ON public.bounties FOR EACH ROW EXECUTE FUNCTION public.bounties_guard();


--
-- Name: bounty_approval_workflows trg_bounty_approval_workflows_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bounty_approval_workflows_guard BEFORE UPDATE ON public.bounty_approval_workflows FOR EACH ROW EXECUTE FUNCTION public.bounty_approval_workflows_guard();


--
-- Name: conference_rooms trg_conference_rooms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_conference_rooms_updated_at BEFORE UPDATE ON public.conference_rooms FOR EACH ROW EXECUTE FUNCTION public.set_conference_room_updated_at();


--
-- Name: event_registrations trg_event_registrations_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_registrations_guard BEFORE INSERT OR UPDATE ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION public.event_registrations_guard();


--
-- Name: governance_votes trg_governance_votes_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_governance_votes_guard BEFORE INSERT OR UPDATE ON public.governance_votes FOR EACH ROW EXECUTE FUNCTION public.governance_votes_guard();


--
-- Name: conference_participants trg_hand_raised_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hand_raised_at BEFORE UPDATE ON public.conference_participants FOR EACH ROW EXECUTE FUNCTION public.set_hand_raised_at();


--
-- Name: order_status_history trg_lc_osh; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_osh BEFORE INSERT OR UPDATE ON public.order_status_history FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('changed_by_address');


--
-- Name: pod_audit_log trg_lc_pal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_pal BEFORE INSERT OR UPDATE ON public.pod_audit_log FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('performed_by');


--
-- Name: pending_donations trg_lc_pd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_pd BEFORE INSERT OR UPDATE ON public.pending_donations FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('user_wallet');


--
-- Name: proposal_metadata trg_lc_pm; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_pm BEFORE INSERT OR UPDATE ON public.proposal_metadata FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('proposer_address');


--
-- Name: pod_members trg_lc_pmem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_pmem BEFORE INSERT OR UPDATE ON public.pod_members FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('wallet');


--
-- Name: pods trg_lc_pods_addresses; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_pods_addresses BEFORE INSERT OR UPDATE ON public.pods FOR EACH ROW EXECUTE FUNCTION public.lc_pods_addresses();


--
-- Name: pod_role_permissions trg_lc_prp_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_prp_created BEFORE INSERT OR UPDATE ON public.pod_role_permissions FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('created_by');


--
-- Name: pod_role_permissions trg_lc_prp_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lc_prp_updated BEFORE INSERT OR UPDATE ON public.pod_role_permissions FOR EACH ROW EXECUTE FUNCTION public.lc_address_column('updated_by');


--
-- Name: pod_membership_applications trg_leader_application_quorum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leader_application_quorum BEFORE UPDATE OF status ON public.pod_membership_applications FOR EACH ROW EXECUTE FUNCTION public.enforce_leader_application_quorum();


--
-- Name: pod_membership_applications trg_leader_invitation_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leader_invitation_status BEFORE UPDATE OF status ON public.pod_membership_applications FOR EACH ROW EXECUTE FUNCTION public.enforce_leader_invitation_status();


--
-- Name: marketplace_orders trg_marketplace_orders_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_marketplace_orders_guard BEFORE UPDATE ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION public.marketplace_orders_guard();


--
-- Name: member_locations trg_member_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_member_locations_updated_at BEFORE INSERT OR UPDATE ON public.member_locations FOR EACH ROW EXECUTE FUNCTION public.touch_member_locations_updated_at();


--
-- Name: milestones trg_milestones_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_milestones_guard BEFORE UPDATE ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.milestones_guard();


--
-- Name: pods trg_pod_creator_sole_leader; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_creator_sole_leader BEFORE INSERT ON public.pods FOR EACH ROW EXECUTE FUNCTION public.enforce_pod_creator_sole_leader();


--
-- Name: pod_deletion_proposals trg_pod_deletion_proposals_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_deletion_proposals_guard BEFORE UPDATE ON public.pod_deletion_proposals FOR EACH ROW EXECUTE FUNCTION public.pod_deletion_proposals_guard();


--
-- Name: pods trg_pod_leads_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_leads_authority BEFORE UPDATE OF pod_leads, created_by_address ON public.pods FOR EACH ROW EXECUTE FUNCTION public.enforce_pod_leads_authority();


--
-- Name: pod_level_proposals trg_pod_level_proposals_insert_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_level_proposals_insert_guard BEFORE INSERT ON public.pod_level_proposals FOR EACH ROW EXECUTE FUNCTION public.pod_level_proposals_insert_guard();


--
-- Name: pod_membership_applications trg_pod_membership_applications_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_membership_applications_guard BEFORE INSERT OR UPDATE ON public.pod_membership_applications FOR EACH ROW EXECUTE FUNCTION public.pod_membership_applications_guard();


--
-- Name: pod_places trg_pod_places_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_places_updated_at BEFORE UPDATE ON public.pod_places FOR EACH ROW EXECUTE FUNCTION public.touch_pod_places_updated_at();


--
-- Name: pod_role_permissions trg_pod_role_permissions_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pod_role_permissions_history BEFORE DELETE OR UPDATE ON public.pod_role_permissions FOR EACH ROW EXECUTE FUNCTION public.create_pod_role_permissions_history();


--
-- Name: bids trg_pulse_bid_placed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_bid_placed AFTER INSERT ON public.bids FOR EACH ROW EXECUTE FUNCTION public.pulse_log_bid_placed();


--
-- Name: bid_reviews trg_pulse_bid_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_bid_review AFTER INSERT ON public.bid_reviews FOR EACH ROW EXECUTE FUNCTION public.pulse_log_bid_review();


--
-- Name: bids trg_pulse_bid_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_bid_status_change AFTER UPDATE OF status ON public.bids FOR EACH ROW EXECUTE FUNCTION public.pulse_log_bid_status_change();


--
-- Name: bounties trg_pulse_bounty_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_bounty_created AFTER INSERT ON public.bounties FOR EACH ROW EXECUTE FUNCTION public.pulse_log_bounty_created();


--
-- Name: chat_groups trg_pulse_chat_channel_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_chat_channel_created AFTER INSERT ON public.chat_groups FOR EACH ROW EXECUTE FUNCTION public.pulse_log_chat_channel_created();


--
-- Name: proposal_metadata trg_pulse_dao_proposal_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_dao_proposal_created AFTER INSERT ON public.proposal_metadata FOR EACH ROW EXECUTE FUNCTION public.pulse_log_dao_proposal_created();


--
-- Name: dispute_mediators trg_pulse_dispute_mediator_assigned; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_dispute_mediator_assigned AFTER INSERT ON public.dispute_mediators FOR EACH ROW EXECUTE FUNCTION public.pulse_log_dispute_mediator_assigned();


--
-- Name: event_escrow trg_pulse_event_escrow_held; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_event_escrow_held AFTER INSERT ON public.event_escrow FOR EACH ROW EXECUTE FUNCTION public.pulse_log_event_escrow_held();


--
-- Name: event_escrow trg_pulse_event_escrow_released; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_event_escrow_released AFTER UPDATE ON public.event_escrow FOR EACH ROW EXECUTE FUNCTION public.pulse_log_event_escrow_released();


--
-- Name: event_registrations trg_pulse_event_rsvp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_event_rsvp AFTER INSERT ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION public.pulse_log_event_rsvp();


--
-- Name: event_tokens trg_pulse_event_tokens_distributed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_event_tokens_distributed AFTER INSERT ON public.event_tokens FOR EACH ROW EXECUTE FUNCTION public.pulse_log_event_tokens_distributed();


--
-- Name: forum_moderator_actions trg_pulse_forum_moderator_action; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_moderator_action AFTER INSERT ON public.forum_moderator_actions FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_moderator_action();


--
-- Name: forum_polls trg_pulse_forum_poll_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_poll_created AFTER INSERT ON public.forum_polls FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_poll_created();


--
-- Name: forum_poll_votes trg_pulse_forum_poll_voted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_poll_voted AFTER INSERT ON public.forum_poll_votes FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_poll_voted();


--
-- Name: forum_posts trg_pulse_forum_post_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_post_created AFTER INSERT ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_post_created();


--
-- Name: forum_post_reactions trg_pulse_forum_post_reaction; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_post_reaction AFTER INSERT ON public.forum_post_reactions FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_post_reaction();


--
-- Name: forum_threads trg_pulse_forum_thread_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_thread_created AFTER INSERT ON public.forum_threads FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_thread_created();


--
-- Name: forum_thread_summaries trg_pulse_forum_thread_summary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_forum_thread_summary AFTER INSERT ON public.forum_thread_summaries FOR EACH ROW EXECUTE FUNCTION public.pulse_log_forum_thread_summary();


--
-- Name: knowledge_items trg_pulse_knowledge_item_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_knowledge_item_insert AFTER INSERT ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.pulse_log_knowledge_item_insert();


--
-- Name: knowledge_items trg_pulse_knowledge_item_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_knowledge_item_update AFTER UPDATE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.pulse_log_knowledge_item_update();


--
-- Name: products trg_pulse_marketplace_listing_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_marketplace_listing_created AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.pulse_log_marketplace_listing_created();


--
-- Name: products trg_pulse_marketplace_listing_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_marketplace_listing_updated AFTER UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.pulse_log_marketplace_listing_updated();


--
-- Name: marketplace_orders trg_pulse_marketplace_order_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_marketplace_order_status_change AFTER UPDATE OF status ON public.marketplace_orders FOR EACH ROW EXECUTE FUNCTION public.pulse_log_marketplace_order_status_change();


--
-- Name: milestones trg_pulse_milestone_reached; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_milestone_reached AFTER UPDATE OF status ON public.milestones FOR EACH ROW EXECUTE FUNCTION public.pulse_log_milestone_reached();


--
-- Name: pod_level_proposals trg_pulse_pod_level_proposal_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_pod_level_proposal_created AFTER INSERT ON public.pod_level_proposals FOR EACH ROW EXECUTE FUNCTION public.pulse_log_pod_level_proposal_created();


--
-- Name: pod_membership_applications trg_pulse_pod_member_applied; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_pod_member_applied AFTER INSERT ON public.pod_membership_applications FOR EACH ROW EXECUTE FUNCTION public.pulse_log_pod_member_applied();


--
-- Name: pod_membership_applications trg_pulse_pod_member_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_pod_member_status_change AFTER UPDATE OF status ON public.pod_membership_applications FOR EACH ROW EXECUTE FUNCTION public.pulse_log_pod_member_status_change();


--
-- Name: user_profiles trg_pulse_profile_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pulse_profile_updated AFTER UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.pulse_log_profile_updated();


--
-- Name: forum_posts trg_queue_agent_mention; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_queue_agent_mention AFTER INSERT ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.fn_queue_agent_mention();


--
-- Name: explorer_events trg_stamp_explorer_actor_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stamp_explorer_actor_type BEFORE INSERT ON public.explorer_events FOR EACH ROW EXECUTE FUNCTION public.stamp_explorer_actor_type();


--
-- Name: treasury_transactions trg_treasury_transactions_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_treasury_transactions_guard BEFORE INSERT OR UPDATE ON public.treasury_transactions FOR EACH ROW EXECUTE FUNCTION public.treasury_transactions_guard();


--
-- Name: user_profiles trigger_auto_generate_referral_key; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_generate_referral_key BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.auto_generate_referral_key();


--
-- Name: pod_modules trigger_create_pod_forum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_pod_forum AFTER UPDATE ON public.pod_modules FOR EACH ROW EXECUTE FUNCTION public.create_pod_forum_category();


--
-- Name: forum_posts trigger_mark_summary_stale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_mark_summary_stale AFTER INSERT ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.mark_summary_stale();


--
-- Name: treasury_transactions trigger_treasury_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_treasury_transactions_updated_at BEFORE UPDATE ON public.treasury_transactions FOR EACH ROW EXECUTE FUNCTION public.update_treasury_transactions_updated_at();


--
-- Name: dispute_comments trigger_update_comment_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_comment_timestamp BEFORE UPDATE ON public.dispute_comments FOR EACH ROW EXECUTE FUNCTION public.update_dispute_updated_at();


--
-- Name: bounty_disputes trigger_update_dispute_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_dispute_timestamp BEFORE UPDATE ON public.bounty_disputes FOR EACH ROW EXECUTE FUNCTION public.update_dispute_updated_at();


--
-- Name: dispute_resolutions trigger_update_resolution_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_resolution_timestamp BEFORE UPDATE ON public.dispute_resolutions FOR EACH ROW EXECUTE FUNCTION public.update_dispute_updated_at();


--
-- Name: forum_posts trigger_update_thread_reply_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_thread_reply_stats AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.update_thread_reply_stats();


--
-- Name: forum_threads trigger_update_thread_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_thread_search_vector BEFORE INSERT OR UPDATE OF title, content ON public.forum_threads FOR EACH ROW EXECUTE FUNCTION public.update_thread_search_vector();


--
-- Name: bid_reviews update_bid_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bid_reviews_updated_at BEFORE UPDATE ON public.bid_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bounties update_bounties_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bounties_updated_at BEFORE UPDATE ON public.bounties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bounty_token_gates update_bounty_token_gates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bounty_token_gates_updated_at BEFORE UPDATE ON public.bounty_token_gates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: event_agendas update_event_agendas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_event_agendas_updated_at BEFORE UPDATE ON public.event_agendas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: governance_notifications update_governance_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_governance_notifications_updated_at BEFORE UPDATE ON public.governance_notifications FOR EACH ROW EXECUTE FUNCTION public.update_governance_notifications_updated_at();


--
-- Name: governance_proposal_votes update_governance_proposal_votes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_governance_proposal_votes_updated_at BEFORE UPDATE ON public.governance_proposal_votes FOR EACH ROW EXECUTE FUNCTION public.update_governance_proposal_votes_updated_at();


--
-- Name: governance_votes update_governance_votes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_governance_votes_updated_at BEFORE UPDATE ON public.governance_votes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hat_metadata_cache update_hat_metadata_cache_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_hat_metadata_cache_updated_at BEFORE UPDATE ON public.hat_metadata_cache FOR EACH ROW EXECUTE FUNCTION public.update_hat_metadata_cache_updated_at();


--
-- Name: hats_module_deployments update_hats_module_deployments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_hats_module_deployments_updated_at BEFORE UPDATE ON public.hats_module_deployments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pod_audit_log update_pod_audit_log_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pod_audit_log_updated_at BEFORE UPDATE ON public.pod_audit_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pod_modules update_pod_modules_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pod_modules_timestamp BEFORE UPDATE ON public.pod_modules FOR EACH ROW EXECUTE FUNCTION public.update_pod_modules_timestamp();


--
-- Name: pod_role_permissions update_pod_role_permissions_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pod_role_permissions_updated_at_trigger BEFORE UPDATE ON public.pod_role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_pod_role_permissions_updated_at();


--
-- Name: proposal_metadata update_proposal_metadata_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_proposal_metadata_updated_at BEFORE UPDATE ON public.proposal_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: treasury_transactions update_treasury_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_treasury_transactions_updated_at BEFORE UPDATE ON public.treasury_transactions FOR EACH ROW EXECUTE FUNCTION public.update_treasury_transactions_updated_at();


--
-- Name: user_notification_preferences update_user_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_notification_preferences_updated_at BEFORE UPDATE ON public.user_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: work_submissions work_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_submissions_updated_at BEFORE UPDATE ON public.work_submissions FOR EACH ROW EXECUTE FUNCTION public.update_work_submissions_updated_at();


--
-- Name: accreditations accreditations_course_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accreditations
    ADD CONSTRAINT accreditations_course_category_id_fkey FOREIGN KEY (course_category_id) REFERENCES public.knowledge_categories(id) ON DELETE SET NULL;


--
-- Name: accreditations accreditations_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accreditations
    ADD CONSTRAINT accreditations_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: agent_proposals agent_proposals_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_proposals
    ADD CONSTRAINT agent_proposals_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.agent_runs(id) ON DELETE CASCADE;


--
-- Name: bid_reviews bid_reviews_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bid_reviews
    ADD CONSTRAINT bid_reviews_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON DELETE CASCADE;


--
-- Name: bid_state_updates bid_state_updates_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bid_state_updates
    ADD CONSTRAINT bid_state_updates_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON DELETE CASCADE;


--
-- Name: bid_state_updates bid_state_updates_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bid_state_updates
    ADD CONSTRAINT bid_state_updates_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: bids bids_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: bounties bounties_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounties
    ADD CONSTRAINT bounties_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: bounties bounties_required_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounties
    ADD CONSTRAINT bounties_required_pod_id_fkey FOREIGN KEY (required_pod_id) REFERENCES public.pods(id) ON DELETE SET NULL;


--
-- Name: bounty_disputes bounty_disputes_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_disputes
    ADD CONSTRAINT bounty_disputes_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON DELETE SET NULL;


--
-- Name: bounty_disputes bounty_disputes_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_disputes
    ADD CONSTRAINT bounty_disputes_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: bounty_invites bounty_invites_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_invites
    ADD CONSTRAINT bounty_invites_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: bounty_notifications bounty_notifications_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_notifications
    ADD CONSTRAINT bounty_notifications_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON DELETE CASCADE;


--
-- Name: bounty_notifications bounty_notifications_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_notifications
    ADD CONSTRAINT bounty_notifications_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: bounty_token_gates bounty_token_gates_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bounty_token_gates
    ADD CONSTRAINT bounty_token_gates_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: burn_approvals burn_approvals_burn_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burn_approvals
    ADD CONSTRAINT burn_approvals_burn_request_id_fkey FOREIGN KEY (burn_request_id) REFERENCES public.burn_requests(id) ON DELETE CASCADE;


--
-- Name: chat_moderation_log chat_moderation_log_chat_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_moderation_log
    ADD CONSTRAINT chat_moderation_log_chat_group_id_fkey FOREIGN KEY (chat_group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_moderation_log chat_moderation_log_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_moderation_log
    ADD CONSTRAINT chat_moderation_log_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: chat_moderation_log chat_moderation_log_moderator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_moderation_log
    ADD CONSTRAINT chat_moderation_log_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES auth.users(id);


--
-- Name: chat_muted_users chat_muted_users_chat_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_muted_users
    ADD CONSTRAINT chat_muted_users_chat_group_id_fkey FOREIGN KEY (chat_group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_muted_users chat_muted_users_muted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_muted_users
    ADD CONSTRAINT chat_muted_users_muted_by_fkey FOREIGN KEY (muted_by) REFERENCES auth.users(id);


--
-- Name: community_agent_posts community_agent_posts_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_posts
    ADD CONSTRAINT community_agent_posts_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: community_agent_posts community_agent_posts_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_posts
    ADD CONSTRAINT community_agent_posts_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id);


--
-- Name: community_agent_queue community_agent_queue_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_queue
    ADD CONSTRAINT community_agent_queue_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: community_agent_subscriptions community_agent_subscriptions_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_agent_subscriptions
    ADD CONSTRAINT community_agent_subscriptions_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: conference_participants conference_participants_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_participants
    ADD CONSTRAINT conference_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.conference_rooms(id) ON DELETE CASCADE;


--
-- Name: conference_reactions conference_reactions_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_reactions
    ADD CONSTRAINT conference_reactions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.conference_rooms(id) ON DELETE CASCADE;


--
-- Name: conference_rooms conference_rooms_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_rooms
    ADD CONSTRAINT conference_rooms_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: conference_rooms conference_rooms_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conference_rooms
    ADD CONSTRAINT conference_rooms_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id);


--
-- Name: dispute_comments dispute_comments_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_comments
    ADD CONSTRAINT dispute_comments_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.bounty_disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_comments dispute_comments_reply_to_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_comments
    ADD CONSTRAINT dispute_comments_reply_to_comment_id_fkey FOREIGN KEY (reply_to_comment_id) REFERENCES public.dispute_comments(id) ON DELETE SET NULL;


--
-- Name: dispute_evidence dispute_evidence_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.bounty_disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_mediators dispute_mediators_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_mediators
    ADD CONSTRAINT dispute_mediators_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.bounty_disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_resolutions dispute_resolutions_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_resolutions
    ADD CONSTRAINT dispute_resolutions_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.bounty_disputes(id) ON DELETE CASCADE;


--
-- Name: donation_approvals donation_approvals_donation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donation_approvals
    ADD CONSTRAINT donation_approvals_donation_id_fkey FOREIGN KEY (donation_id) REFERENCES public.pending_donations(id) ON DELETE CASCADE;


--
-- Name: email_invites email_invites_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_invites
    ADD CONSTRAINT email_invites_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE SET NULL;


--
-- Name: event_agendas event_agendas_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_agendas
    ADD CONSTRAINT event_agendas_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_escrow event_escrow_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_escrow
    ADD CONSTRAINT event_escrow_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_notifications event_notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_notifications event_notifications_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notifications
    ADD CONSTRAINT event_notifications_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_required_tokens event_required_tokens_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_required_tokens
    ADD CONSTRAINT event_required_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_tokens event_tokens_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_tokens
    ADD CONSTRAINT event_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_fund_recipient_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_fund_recipient_pod_id_fkey FOREIGN KEY (fund_recipient_pod_id) REFERENCES public.pods(id) ON DELETE SET NULL;


--
-- Name: events events_organizing_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizing_pod_id_fkey FOREIGN KEY (organizing_pod_id) REFERENCES public.pods(id) ON DELETE SET NULL;


--
-- Name: events events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: bids fk_bidder_address; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT fk_bidder_address FOREIGN KEY (bidder_address) REFERENCES public.user_profiles(wallet_address);


--
-- Name: video_call_sessions fk_initiator; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_call_sessions
    ADD CONSTRAINT fk_initiator FOREIGN KEY (initiator_wallet) REFERENCES public.user_profiles(wallet_address) ON DELETE CASCADE;


--
-- Name: pod_role_permissions fk_pod_role_permissions_pod; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_role_permissions
    ADD CONSTRAINT fk_pod_role_permissions_pod FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: video_call_sessions fk_recipient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_call_sessions
    ADD CONSTRAINT fk_recipient FOREIGN KEY (recipient_wallet) REFERENCES public.user_profiles(wallet_address) ON DELETE CASCADE;


--
-- Name: referral_validations fk_referrer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_validations
    ADD CONSTRAINT fk_referrer FOREIGN KEY (referrer_wallet) REFERENCES public.user_profiles(wallet_address);


--
-- Name: forum_bookmarks forum_bookmarks_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_bookmarks
    ADD CONSTRAINT forum_bookmarks_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_categories forum_categories_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_categories
    ADD CONSTRAINT forum_categories_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: forum_category_required_tokens forum_category_required_tokens_forum_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_category_required_tokens
    ADD CONSTRAINT forum_category_required_tokens_forum_category_id_fkey FOREIGN KEY (forum_category_id) REFERENCES public.forum_categories(id) ON DELETE CASCADE;


--
-- Name: forum_featured_content forum_featured_content_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_featured_content
    ADD CONSTRAINT forum_featured_content_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.forum_categories(id) ON DELETE CASCADE;


--
-- Name: forum_featured_content forum_featured_content_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_featured_content
    ADD CONSTRAINT forum_featured_content_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_media_attachments forum_media_attachments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_media_attachments
    ADD CONSTRAINT forum_media_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id) ON DELETE CASCADE;


--
-- Name: forum_media_attachments forum_media_attachments_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_media_attachments
    ADD CONSTRAINT forum_media_attachments_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_poll_options forum_poll_options_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_options
    ADD CONSTRAINT forum_poll_options_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.forum_polls(id) ON DELETE CASCADE;


--
-- Name: forum_poll_votes forum_poll_votes_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.forum_poll_options(id) ON DELETE CASCADE;


--
-- Name: forum_poll_votes forum_poll_votes_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.forum_polls(id) ON DELETE CASCADE;


--
-- Name: forum_polls forum_polls_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_polls
    ADD CONSTRAINT forum_polls_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_post_reactions forum_post_reactions_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reactions
    ADD CONSTRAINT forum_post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id) ON DELETE CASCADE;


--
-- Name: forum_post_reactions forum_post_reactions_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reactions
    ADD CONSTRAINT forum_post_reactions_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_post_reports forum_post_reports_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reports
    ADD CONSTRAINT forum_post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id) ON DELETE CASCADE;


--
-- Name: forum_post_reports forum_post_reports_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_reports
    ADD CONSTRAINT forum_post_reports_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_posts forum_posts_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_proposal_links forum_proposal_links_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_proposal_links
    ADD CONSTRAINT forum_proposal_links_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposal_metadata(id) ON DELETE CASCADE;


--
-- Name: forum_thread_drafts forum_thread_drafts_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_drafts
    ADD CONSTRAINT forum_thread_drafts_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.forum_categories(id) ON DELETE CASCADE;


--
-- Name: forum_thread_drafts forum_thread_drafts_parent_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_drafts
    ADD CONSTRAINT forum_thread_drafts_parent_thread_id_fkey FOREIGN KEY (parent_thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_thread_reads forum_thread_reads_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_reads
    ADD CONSTRAINT forum_thread_reads_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_thread_summaries forum_thread_summaries_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_summaries
    ADD CONSTRAINT forum_thread_summaries_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_thread_tags forum_thread_tags_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_thread_tags
    ADD CONSTRAINT forum_thread_tags_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_threads forum_threads_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.forum_categories(id) ON DELETE CASCADE;


--
-- Name: governance_votes governance_votes_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes
    ADD CONSTRAINT governance_votes_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id);


--
-- Name: hats_module_deployments hats_module_deployments_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hats_module_deployments
    ADD CONSTRAINT hats_module_deployments_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: knowledge_categories knowledge_categories_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_categories
    ADD CONSTRAINT knowledge_categories_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id);


--
-- Name: knowledge_item_views knowledge_item_views_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_item_views
    ADD CONSTRAINT knowledge_item_views_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.knowledge_items(id) ON DELETE CASCADE;


--
-- Name: knowledge_items knowledge_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_items
    ADD CONSTRAINT knowledge_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.knowledge_categories(id) ON DELETE CASCADE;


--
-- Name: knowledge_items knowledge_items_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_items
    ADD CONSTRAINT knowledge_items_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id);


--
-- Name: marketplace_orders marketplace_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT marketplace_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: messages messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: milestones milestones_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milestones
    ADD CONSTRAINT milestones_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.marketplace_orders(id);


--
-- Name: pod_accountability_signatures pod_accountability_signatures_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_accountability_signatures
    ADD CONSTRAINT pod_accountability_signatures_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_application_votes pod_application_votes_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_application_votes
    ADD CONSTRAINT pod_application_votes_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.pod_membership_applications(id) ON DELETE CASCADE;


--
-- Name: pod_approval_signatures pod_approval_signatures_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_approval_signatures
    ADD CONSTRAINT pod_approval_signatures_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.pod_membership_applications(id) ON DELETE CASCADE;


--
-- Name: pod_deletion_proposals pod_deletion_proposals_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_deletion_proposals
    ADD CONSTRAINT pod_deletion_proposals_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_faces pod_faces_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_faces
    ADD CONSTRAINT pod_faces_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_invite_acceptances pod_invite_acceptances_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_invite_acceptances
    ADD CONSTRAINT pod_invite_acceptances_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.pod_invite_links(id) ON DELETE CASCADE;


--
-- Name: pod_invite_links pod_invite_links_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_invite_links
    ADD CONSTRAINT pod_invite_links_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_level_proposals pod_level_proposals_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_level_proposals
    ADD CONSTRAINT pod_level_proposals_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_member_counts pod_member_counts_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_member_counts
    ADD CONSTRAINT pod_member_counts_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_members pod_members_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_membership_applications pod_membership_applications_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_membership_applications
    ADD CONSTRAINT pod_membership_applications_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_modules pod_modules_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_modules
    ADD CONSTRAINT pod_modules_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_place_links pod_place_links_place_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_place_links
    ADD CONSTRAINT pod_place_links_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.pod_places(id) ON DELETE CASCADE;


--
-- Name: pod_places pod_places_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_places
    ADD CONSTRAINT pod_places_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pod_self_budgets pod_self_budgets_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_self_budgets
    ADD CONSTRAINT pod_self_budgets_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: pods pods_parent_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_parent_pod_id_fkey FOREIGN KEY (parent_pod_id) REFERENCES public.pods(id);


--
-- Name: proposal_eligibility_snapshots proposal_eligibility_snapshots_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_eligibility_snapshots
    ADD CONSTRAINT proposal_eligibility_snapshots_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: proposal_eligibility_snapshots proposal_eligibility_snapshots_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposal_eligibility_snapshots
    ADD CONSTRAINT proposal_eligibility_snapshots_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.pod_level_proposals(id) ON DELETE CASCADE;


--
-- Name: self_member_epoch_earned self_member_epoch_earned_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_member_epoch_earned
    ADD CONSTRAINT self_member_epoch_earned_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: self_mint_queue self_mint_queue_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_mint_queue
    ADD CONSTRAINT self_mint_queue_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: survey_answers survey_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answers
    ADD CONSTRAINT survey_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_questions(id) ON DELETE CASCADE;


--
-- Name: survey_answers survey_answers_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answers
    ADD CONSTRAINT survey_answers_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.survey_responses(id) ON DELETE CASCADE;


--
-- Name: survey_questions survey_questions_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;


--
-- Name: surveys surveys_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: tokens tokens_owner_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_owner_pod_id_fkey FOREIGN KEY (owner_pod_id) REFERENCES public.pods(id);


--
-- Name: user_profiles user_profiles_active_face_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_active_face_pod_id_fkey FOREIGN KEY (active_face_pod_id) REFERENCES public.pods(id) ON DELETE SET NULL;


--
-- Name: user_wallet_link_codes user_wallet_link_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallet_link_codes
    ADD CONSTRAINT user_wallet_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_wallets user_wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_wallets
    ADD CONSTRAINT user_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vault_entries vault_entries_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_entries
    ADD CONSTRAINT vault_entries_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: vault_pending_grants vault_pending_grants_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_pending_grants
    ADD CONSTRAINT vault_pending_grants_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.vault_entries(id) ON DELETE CASCADE;


--
-- Name: vault_pending_grants vault_pending_grants_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_pending_grants
    ADD CONSTRAINT vault_pending_grants_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: vault_rotation_jobs vault_rotation_jobs_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_rotation_jobs
    ADD CONSTRAINT vault_rotation_jobs_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON DELETE CASCADE;


--
-- Name: vault_wrapped_keys vault_wrapped_keys_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_wrapped_keys
    ADD CONSTRAINT vault_wrapped_keys_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.vault_entries(id) ON DELETE CASCADE;


--
-- Name: video_call_sessions video_call_sessions_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_call_sessions
    ADD CONSTRAINT video_call_sessions_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.conference_rooms(id);


--
-- Name: video_call_signaling video_call_signaling_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_call_signaling
    ADD CONSTRAINT video_call_signaling_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.video_call_sessions(id) ON DELETE CASCADE;


--
-- Name: wallet_link_nonces wallet_link_nonces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_link_nonces
    ADD CONSTRAINT wallet_link_nonces_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: work_submissions work_submissions_bid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_submissions
    ADD CONSTRAINT work_submissions_bid_id_fkey FOREIGN KEY (bid_id) REFERENCES public.bids(id) ON DELETE CASCADE;


--
-- Name: work_submissions work_submissions_bounty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_submissions
    ADD CONSTRAINT work_submissions_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES public.bounties(id) ON DELETE CASCADE;


--
-- Name: work_submissions work_submissions_previous_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_submissions
    ADD CONSTRAINT work_submissions_previous_submission_id_fkey FOREIGN KEY (previous_submission_id) REFERENCES public.work_submissions(id);


--
-- Name: admin_token_definitions Admin tokens are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin tokens are viewable by everyone" ON public.admin_token_definitions FOR SELECT USING (true);


--
-- Name: pods Allow authenticated users to read all pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read all pods" ON public.pods FOR SELECT TO authenticated USING (true);


--
-- Name: pod_role_permissions Allow authenticated users to read pod_role_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read pod_role_permissions" ON public.pod_role_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: bid_state_updates Allow public read access to bid_state_updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to bid_state_updates" ON public.bid_state_updates FOR SELECT USING (true);


--
-- Name: pod_role_permissions Allow public read access to pod_role_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to pod_role_permissions" ON public.pod_role_permissions FOR SELECT TO anon USING (true);


--
-- Name: products Allow public read access to products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to products" ON public.products FOR SELECT USING (true);


--
-- Name: forum_templates Allow token holders to manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow token holders to manage templates" ON public.forum_templates USING (public.has_admin_token((auth.uid())::text));


--
-- Name: products Allow users to delete their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to delete their own products" ON public.products FOR DELETE TO authenticated USING (((auth.uid())::text = owner_id));


--
-- Name: products Allow users to insert their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to insert their own products" ON public.products FOR INSERT TO authenticated WITH CHECK (((auth.uid())::text = owner_id));


--
-- Name: products Allow users to update their own products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to update their own products" ON public.products FOR UPDATE TO authenticated USING (((auth.uid())::text = owner_id)) WITH CHECK (((auth.uid())::text = owner_id));


--
-- Name: bid_state_updates Allow users to view their own bid_state_updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow users to view their own bid_state_updates" ON public.bid_state_updates FOR SELECT USING ((created_by = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)));


--
-- Name: pod_level_proposals Anyone can read active pod proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active pod proposals" ON public.pod_level_proposals FOR SELECT TO authenticated, anon USING ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'approved'::text, 'rejected'::text, 'executed'::text])));


--
-- Name: bid_reviews Anyone can read bid reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read bid reviews" ON public.bid_reviews FOR SELECT USING (true);


--
-- Name: bids Anyone can read bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read bids" ON public.bids FOR SELECT USING (true);


--
-- Name: bounties Anyone can read bounties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read bounties" ON public.bounties FOR SELECT USING (true);


--
-- Name: event_agendas Anyone can read event agendas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read event agendas" ON public.event_agendas FOR SELECT USING (true);


--
-- Name: event_tokens Anyone can read event tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read event tokens" ON public.event_tokens FOR SELECT USING (true);


--
-- Name: forum_proposal_links Anyone can read forum proposal links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read forum proposal links" ON public.forum_proposal_links FOR SELECT USING (true);


--
-- Name: forum_post_reactions Anyone can read forum reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read forum reactions" ON public.forum_post_reactions FOR SELECT USING (true);


--
-- Name: governance_proposal_votes Anyone can read governance proposal votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read governance proposal votes" ON public.governance_proposal_votes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: governance_user_votes Anyone can read governance user votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read governance user votes" ON public.governance_user_votes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: ledger_anchors Anyone can read ledger anchors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read ledger anchors" ON public.ledger_anchors FOR SELECT TO authenticated, anon USING (true);


--
-- Name: milestones Anyone can read milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read milestones" ON public.milestones FOR SELECT USING (true);


--
-- Name: proposal_metadata Anyone can read proposal metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read proposal metadata" ON public.proposal_metadata FOR SELECT USING (true);


--
-- Name: events Anyone can read published events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read published events" ON public.events FOR SELECT USING ((status = 'published'::text));


--
-- Name: pod_application_votes Anyone can read votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read votes" ON public.pod_application_votes FOR SELECT USING (true);


--
-- Name: pod_accountability_signatures Anyone can view accountability signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view accountability signatures" ON public.pod_accountability_signatures FOR SELECT TO authenticated, anon USING (true);


--
-- Name: forum_media_attachments Anyone can view attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view attachments" ON public.forum_media_attachments FOR SELECT USING (true);


--
-- Name: forum_featured_content Anyone can view featured content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view featured content" ON public.forum_featured_content FOR SELECT USING (true);


--
-- Name: forum_categories Anyone can view forum categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view forum categories" ON public.forum_categories FOR SELECT TO authenticated USING (true);


--
-- Name: forum_media_attachments Anyone can view media attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view media attachments" ON public.forum_media_attachments FOR SELECT USING (true);


--
-- Name: chat_moderation_log Anyone can view moderation log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view moderation log" ON public.chat_moderation_log FOR SELECT USING (true);


--
-- Name: chat_muted_users Anyone can view muted users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view muted users" ON public.chat_muted_users FOR SELECT USING (true);


--
-- Name: pod_approval_signatures Anyone can view pod approval signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view pod approval signatures" ON public.pod_approval_signatures FOR SELECT USING (true);


--
-- Name: pod_member_counts Anyone can view pod member counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view pod member counts" ON public.pod_member_counts FOR SELECT USING (true);


--
-- Name: pod_members Anyone can view pod members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view pod members" ON public.pod_members FOR SELECT USING (true);


--
-- Name: pod_modules Anyone can view pod modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view pod modules" ON public.pod_modules FOR SELECT TO authenticated USING (true);


--
-- Name: forum_poll_options Anyone can view poll options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view poll options" ON public.forum_poll_options FOR SELECT USING (true);


--
-- Name: forum_poll_votes Anyone can view poll votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view poll votes" ON public.forum_poll_votes FOR SELECT USING (true);


--
-- Name: forum_polls Anyone can view polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view polls" ON public.forum_polls FOR SELECT USING (true);


--
-- Name: forum_posts Anyone can view posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view posts" ON public.forum_posts FOR SELECT USING (true);


--
-- Name: forum_proposal_links Anyone can view proposal links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view proposal links" ON public.forum_proposal_links FOR SELECT USING (true);


--
-- Name: forum_post_reactions Anyone can view reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view reactions" ON public.forum_post_reactions FOR SELECT USING (true);


--
-- Name: forum_thread_summaries Anyone can view summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view summaries" ON public.forum_thread_summaries FOR SELECT USING (true);


--
-- Name: forum_thread_tags Anyone can view tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view tags" ON public.forum_thread_tags FOR SELECT USING (true);


--
-- Name: forum_thread_summaries Anyone can view thread summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view thread summaries" ON public.forum_thread_summaries FOR SELECT USING (true);


--
-- Name: forum_threads Anyone can view threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view threads" ON public.forum_threads FOR SELECT USING (true);


--
-- Name: work_submissions Approved bidders can submit work; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved bidders can submit work" ON public.work_submissions FOR INSERT WITH CHECK (((submitter_address = ((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)) AND (bid_id IN ( SELECT bids.id
   FROM public.bids
  WHERE ((bids.bidder_address = ((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)) AND (bids.status = 'approved'::text))))));


--
-- Name: forum_media_attachments Attachment creators can delete their attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Attachment creators can delete their attachments" ON public.forum_media_attachments FOR DELETE TO authenticated USING ((uploader_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: hat_metadata_cache Authenticated delete access for hat metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated delete access for hat metadata" ON public.hat_metadata_cache FOR DELETE USING (((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text)));


--
-- Name: hat_metadata_cache Authenticated insert access for hat metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated insert access for hat metadata" ON public.hat_metadata_cache FOR INSERT TO authenticated WITH CHECK (((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text)));


--
-- Name: hat_metadata_cache Authenticated update access for hat metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated update access for hat metadata" ON public.hat_metadata_cache FOR UPDATE USING (((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text)));


--
-- Name: forum_post_reactions Authenticated users can add reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can add reactions" ON public.forum_post_reactions FOR INSERT TO authenticated WITH CHECK (((auth.jwt() IS NOT NULL) AND (reactor_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: events Authenticated users can create events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (auth.uid() IS NOT NULL)));


--
-- Name: forum_posts Authenticated users can create posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create posts" ON public.forum_posts FOR INSERT TO authenticated WITH CHECK (((auth.jwt() IS NOT NULL) AND ((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (author_address = lower((((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text))))));


--
-- Name: forum_threads Authenticated users can create threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create threads" ON public.forum_threads FOR INSERT TO authenticated WITH CHECK (((auth.jwt() IS NOT NULL) AND ((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (author_address = lower((((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text))))));


--
-- Name: chat_messages Authenticated users can insert chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert chat messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_profiles
  WHERE ((user_profiles.user_id = auth.uid()) AND (lower(user_profiles.wallet_address) = lower(chat_messages.sender_wallet_id))))));


--
-- Name: vault_user_keys Authenticated users can read any vault user key; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read any vault user key" ON public.vault_user_keys FOR SELECT TO authenticated USING (true);


--
-- Name: bounty_approval_workflows Authenticated users can read bounty approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read bounty approvals" ON public.bounty_approval_workflows FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: event_registrations Authenticated users can read event registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read event registrations" ON public.event_registrations FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: pod_role_permissions_history Authenticated users can read history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read history" ON public.pod_role_permissions_history FOR SELECT TO authenticated USING (true);


--
-- Name: pod_deletion_proposals Authenticated users can read pod deletion proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read pod deletion proposals" ON public.pod_deletion_proposals FOR SELECT TO authenticated USING (true);


--
-- Name: pod_role_permissions Authenticated users can read role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read role permissions" ON public.pod_role_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: events Authenticated users can read their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read their own events" ON public.events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: forum_media_attachments Authenticated users can upload attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can upload attachments" ON public.forum_media_attachments FOR INSERT TO authenticated WITH CHECK (((auth.jwt() IS NOT NULL) AND (uploader_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: pod_role_permissions Authenticated users can view all pod role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all pod role permissions" ON public.pod_role_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: pods Authenticated users can view all pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all pods" ON public.pods FOR SELECT TO authenticated USING (true);


--
-- Name: pod_members Authenticated users can view pod members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view pod members" ON public.pod_members FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: forum_poll_votes Authenticated users can vote on polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can vote on polls" ON public.forum_poll_votes FOR INSERT TO authenticated WITH CHECK (((auth.jwt() IS NOT NULL) AND (voter_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: pods Authenticated users create pods as themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users create pods as themselves" ON public.pods FOR INSERT TO authenticated WITH CHECK (public.is_current_user_wallet(created_by_address));


--
-- Name: bids Bidders and managers update bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bidders and managers update bids" ON public.bids FOR UPDATE TO authenticated USING ((public.is_my_wallet(bidder_address) OR public.is_bounty_manager(bounty_id))) WITH CHECK ((public.is_my_wallet(bidder_address) OR public.is_bounty_manager(bounty_id)));


--
-- Name: bids Bidders place their own bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bidders place their own bids" ON public.bids FOR INSERT TO authenticated WITH CHECK (public.is_my_wallet(bidder_address));


--
-- Name: bounty_approval_workflows Bounty managers create approval workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bounty managers create approval workflows" ON public.bounty_approval_workflows FOR INSERT TO authenticated WITH CHECK ((public.is_bounty_manager(bounty_id) AND public.is_my_wallet(proposed_by)));


--
-- Name: bid_state_updates Bounty managers record bid state updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bounty managers record bid state updates" ON public.bid_state_updates FOR INSERT TO authenticated WITH CHECK (public.is_bounty_manager(bounty_id));


--
-- Name: bid_reviews Bounty managers review bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bounty managers review bids" ON public.bid_reviews FOR INSERT TO authenticated WITH CHECK ((public.is_my_wallet(reviewer_address) AND (EXISTS ( SELECT 1
   FROM public.bids b
  WHERE ((b.id = bid_reviews.bid_id) AND public.is_bounty_manager(b.bounty_id))))));


--
-- Name: bounty_approval_workflows Bounty managers update approval workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bounty managers update approval workflows" ON public.bounty_approval_workflows FOR UPDATE TO authenticated USING (public.is_bounty_manager(bounty_id)) WITH CHECK (public.is_bounty_manager(bounty_id));


--
-- Name: marketplace_orders Buyers and fulfillers read orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers and fulfillers read orders" ON public.marketplace_orders FOR SELECT TO authenticated USING ((public.is_my_wallet(buyer_address) OR public.can_fulfill_order(id)));


--
-- Name: order_status_history Buyers and fulfillers read status history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers and fulfillers read status history" ON public.order_status_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.marketplace_orders o
  WHERE ((o.id = order_status_history.order_id) AND (public.is_my_wallet(o.buyer_address) OR public.can_fulfill_order(o.id))))));


--
-- Name: chat_moderation_log Chat moderators log actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chat moderators log actions" ON public.chat_moderation_log FOR INSERT TO authenticated WITH CHECK ((public.can_moderate_chat_group(chat_group_id) AND ((moderator_id IS NULL) OR (moderator_id = auth.uid())) AND ((moderator_wallet IS NULL) OR public.is_my_wallet(moderator_wallet))));


--
-- Name: chat_muted_users Chat moderators mute; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chat moderators mute" ON public.chat_muted_users FOR INSERT TO authenticated WITH CHECK (((muted_by = auth.uid()) AND public.can_moderate_chat_group(chat_group_id)));


--
-- Name: work_submissions Creators and pod leaders can review submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators and pod leaders can review submissions" ON public.work_submissions FOR UPDATE USING (((bounty_id IN ( SELECT bounties.id
   FROM public.bounties
  WHERE (bounties.creator_address = ((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)))) OR (bounty_id IN ( SELECT b.id
   FROM (public.bounties b
     JOIN public.pods p ON ((b.pod_id = p.id)))
  WHERE (p.pod_leads @> ARRAY[((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)])))));


--
-- Name: pod_level_proposals Creators can update draft proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creators can update draft proposals" ON public.pod_level_proposals FOR UPDATE TO authenticated USING (((created_by = (auth.jwt() ->> 'wallet_address'::text)) AND (status = 'draft'::text))) WITH CHECK (((created_by = (auth.jwt() ->> 'wallet_address'::text)) AND (status = 'draft'::text)));


--
-- Name: event_agendas Event creators can delete agenda items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event creators can delete agenda items" ON public.event_agendas FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_agendas.event_id) AND ((e.user_id = auth.uid()) OR (e.creator_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))))));


--
-- Name: event_agendas Event creators can insert agenda items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event creators can insert agenda items" ON public.event_agendas FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_agendas.event_id) AND ((e.user_id = auth.uid()) OR (e.creator_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))))));


--
-- Name: event_agendas Event creators can manage agendas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event creators can manage agendas" ON public.event_agendas USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_agendas.event_id) AND (events.creator_address = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))))));


--
-- Name: event_escrow Event creators can read escrow for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event creators can read escrow for their events" ON public.event_escrow FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_escrow.event_id) AND (events.creator_address = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))))));


--
-- Name: event_registrations Event creators can read their event registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event creators can read their event registrations" ON public.event_registrations FOR SELECT TO authenticated USING ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.creator_address = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))))));


--
-- Name: event_agendas Event creators can update agenda items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event creators can update agenda items" ON public.event_agendas FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_agendas.event_id) AND ((e.user_id = auth.uid()) OR (e.creator_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_agendas.event_id) AND ((e.user_id = auth.uid()) OR (e.creator_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))))));


--
-- Name: event_registrations Event managers can read registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Event managers can read registrations" ON public.event_registrations FOR SELECT TO authenticated USING ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.manager_address = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))))));


--
-- Name: forum_featured_content Featured by user can unfeature content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Featured by user can unfeature content" ON public.forum_featured_content FOR DELETE TO authenticated USING ((featured_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: forum_featured_content Featured content is viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Featured content is viewable by everyone" ON public.forum_featured_content FOR SELECT USING (true);


--
-- Name: forum_thread_summaries Forum thread summaries are viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Forum thread summaries are viewable by authenticated users" ON public.forum_thread_summaries FOR SELECT TO authenticated USING (true);


--
-- Name: order_status_history Fulfillers record status history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Fulfillers record status history" ON public.order_status_history FOR INSERT TO authenticated WITH CHECK ((public.is_my_wallet(changed_by_address) AND public.can_fulfill_order(order_id)));


--
-- Name: marketplace_orders Fulfillers update orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Fulfillers update orders" ON public.marketplace_orders FOR UPDATE TO authenticated USING (public.can_fulfill_order(id)) WITH CHECK (public.can_fulfill_order(id));


--
-- Name: pod_role_permissions_history History is viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "History is viewable by authenticated users" ON public.pod_role_permissions_history FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: bounty_invites Invites creatable by bounty creators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invites creatable by bounty creators" ON public.bounty_invites FOR INSERT WITH CHECK ((bounty_id IN ( SELECT bounties.id
   FROM public.bounties
  WHERE (bounties.creator_address = current_setting('app.current_user'::text, true)))));


--
-- Name: bounty_invites Invites viewable by involved parties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invites viewable by involved parties" ON public.bounty_invites FOR SELECT USING (((inviter_address = current_setting('app.current_user'::text, true)) OR (invitee_address = current_setting('app.current_user'::text, true))));


--
-- Name: vault_pending_grants Managers and pending newcomers can read pending grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers and pending newcomers can read pending grants" ON public.vault_pending_grants FOR SELECT TO authenticated USING (((newcomer_eoa = lower((auth.jwt() ->> 'wallet_address'::text))) OR (EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_pending_grants.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true))))));


--
-- Name: vault_pending_grants Managers can create pending grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can create pending grants" ON public.vault_pending_grants FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_pending_grants.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_entries Managers can create vault entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can create vault entries" ON public.vault_entries FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_entries.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_pending_grants Managers can delete pending grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete pending grants" ON public.vault_pending_grants FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_pending_grants.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_entries Managers can delete vault entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete vault entries" ON public.vault_entries FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_entries.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_wrapped_keys Managers can delete wrapped keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can delete wrapped keys" ON public.vault_wrapped_keys FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.vault_entries ve
     JOIN public.active_pod_members apm ON ((apm.pod_id = ve.pod_id)))
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((ve.id = vault_wrapped_keys.entry_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_rotation_jobs Managers can insert rotation jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can insert rotation jobs" ON public.vault_rotation_jobs FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_rotation_jobs.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_wrapped_keys Managers can insert wrapped keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can insert wrapped keys" ON public.vault_wrapped_keys FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.vault_entries ve
     JOIN public.active_pod_members apm ON ((apm.pod_id = ve.pod_id)))
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((ve.id = vault_wrapped_keys.entry_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: vault_entries Managers can update vault entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers can update vault entries" ON public.vault_entries FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_entries.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_entries.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))));


--
-- Name: milestones Managers create milestones for approved bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers create milestones for approved bids" ON public.milestones FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bids b
  WHERE ((b.id = milestones.bid_id) AND (b.status = 'approved'::text) AND public.is_bounty_manager(b.bounty_id)))));


--
-- Name: milestones Managers update milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update milestones" ON public.milestones FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bids b
  WHERE ((b.id = milestones.bid_id) AND public.is_bounty_manager(b.bounty_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bids b
  WHERE ((b.id = milestones.bid_id) AND public.is_bounty_manager(b.bounty_id)))));


--
-- Name: bounties Managers update their bounties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Managers update their bounties" ON public.bounties FOR UPDATE TO authenticated USING (public.is_bounty_manager(id)) WITH CHECK (public.is_bounty_manager(id));


--
-- Name: accreditations Members can read accreditations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can read accreditations" ON public.accreditations FOR SELECT TO authenticated USING (true);


--
-- Name: user_presence Members can see presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can see presence" ON public.user_presence FOR SELECT TO authenticated USING (true);


--
-- Name: chat_messages Members can view group chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view group chat messages" ON public.chat_messages FOR SELECT TO authenticated USING (((is_direct_message = false) AND (chat_group_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.chat_groups g
  WHERE (((g.id)::text = chat_messages.chat_group_id) AND (g.is_active = true) AND ((g.pod_id IS NULL) OR public.is_pod_member_current_user(g.pod_id)))))));


--
-- Name: knowledge_categories Members can view pod categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view pod categories" ON public.knowledge_categories FOR SELECT TO authenticated USING (((pod_id IS NOT NULL) AND ((is_public = true) OR (EXISTS ( SELECT 1
   FROM public.pod_members pm
  WHERE ((pm.pod_id = knowledge_categories.pod_id) AND (lower(pm.wallet) = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))) AND (pm.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.id = knowledge_categories.pod_id) AND ((( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())) = ANY (pods.pod_leads)) OR (pods.created_by_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))))))));


--
-- Name: knowledge_items Members can view pod items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view pod items" ON public.knowledge_items FOR SELECT TO authenticated USING (((pod_id IS NOT NULL) AND ((is_public = true) OR (EXISTS ( SELECT 1
   FROM public.pod_members pm
  WHERE ((pm.pod_id = knowledge_items.pod_id) AND (lower(pm.wallet) = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))) AND (pm.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.id = knowledge_items.pod_id) AND ((( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())) = ANY (pods.pod_leads)) OR (pods.created_by_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))))))));


--
-- Name: forum_polls Members create polls as themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members create polls as themselves" ON public.forum_polls FOR INSERT TO authenticated WITH CHECK (public.is_my_wallet(created_by));


--
-- Name: pod_level_proposals Members create proposals in their pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members create proposals in their pods" ON public.pod_level_proposals FOR INSERT TO authenticated WITH CHECK ((public.is_my_wallet(created_by) AND (pod_id IS NOT NULL) AND (public.is_pod_leader_current_user(pod_id) OR public.is_eligible_pod_voter(pod_id, governance_tier, created_by))));


--
-- Name: pod_membership_applications Members file their own applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members file their own applications" ON public.pod_membership_applications FOR INSERT TO authenticated WITH CHECK (public.is_my_wallet(applicant_address));


--
-- Name: event_registrations Members register themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members register themselves" ON public.event_registrations FOR INSERT TO authenticated WITH CHECK (public.is_my_wallet(user_address));


--
-- Name: event_registrations Members update own registration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members update own registration" ON public.event_registrations FOR UPDATE TO authenticated USING (public.is_my_wallet(user_address)) WITH CHECK (public.is_my_wallet(user_address));


--
-- Name: vault_entries Members with a wrapped key or passwordsManage can read entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members with a wrapped key or passwordsManage can read entries" ON public.vault_entries FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.vault_wrapped_keys vwk
  WHERE ((vwk.entry_id = vault_entries.id) AND (vwk.recipient_eoa = lower((auth.jwt() ->> 'wallet_address'::text)))))) OR (EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_entries.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true)))) OR (EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_entries.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsAccess'::text))::boolean = true) AND ((cardinality(vault_entries.allowed_role_ids) = 0) OR (prp.id = ANY (vault_entries.allowed_role_ids))))))));


--
-- Name: chat_muted_users Moderators can unmute their own mutes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can unmute their own mutes" ON public.chat_muted_users FOR DELETE USING ((muted_by = auth.uid()));


--
-- Name: hats_module_deployments Module deployments are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Module deployments are viewable by everyone" ON public.hats_module_deployments FOR SELECT USING (true);


--
-- Name: pod_audit_log No deletes allowed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No deletes allowed" ON public.pod_audit_log FOR DELETE TO authenticated USING (false);


--
-- Name: pod_audit_log No updates allowed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No updates allowed" ON public.pod_audit_log FOR UPDATE TO authenticated USING (false);


--
-- Name: admin_token_definitions Only service role can manage admin tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only service role can manage admin tokens" ON public.admin_token_definitions USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: event_tokens Organizers record event tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers record event tokens" ON public.event_tokens FOR INSERT TO authenticated WITH CHECK (public.is_event_organizer(event_id));


--
-- Name: event_registrations Organizers update their event registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers update their event registrations" ON public.event_registrations FOR UPDATE TO authenticated USING (public.is_event_organizer(event_id)) WITH CHECK (public.is_event_organizer(event_id));


--
-- Name: forum_categories Pod leaders can create forum categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can create forum categories" ON public.forum_categories FOR INSERT TO authenticated WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: knowledge_categories Pod leaders can create knowledge categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can create knowledge categories" ON public.knowledge_categories FOR INSERT TO authenticated WITH CHECK (((pod_id IS NOT NULL) AND public.is_pod_leader_current_user(pod_id)));


--
-- Name: knowledge_items Pod leaders can create knowledge items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can create knowledge items" ON public.knowledge_items FOR INSERT TO authenticated WITH CHECK (((pod_id IS NOT NULL) AND public.is_pod_leader_current_user(pod_id)));


--
-- Name: hats_module_deployments Pod leaders can create module deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can create module deployments" ON public.hats_module_deployments FOR INSERT TO authenticated WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: pod_modules Pod leaders can create modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can create modules" ON public.pod_modules FOR INSERT TO authenticated WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: chat_groups Pod leaders can delete chat groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete chat groups" ON public.chat_groups FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.id = chat_groups.pod_id) AND ((lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))) IN ( SELECT lower(addr.addr) AS lower
           FROM unnest(pods.pod_leads) addr(addr))) OR (lower(pods.created_by_address) = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))))))));


--
-- Name: forum_categories Pod leaders can delete forum categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete forum categories" ON public.forum_categories FOR DELETE TO authenticated USING (public.is_pod_leader_current_user(pod_id));


--
-- Name: knowledge_categories Pod leaders can delete knowledge categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete knowledge categories" ON public.knowledge_categories FOR DELETE TO authenticated USING (public.is_pod_leader_current_user(pod_id));


--
-- Name: knowledge_items Pod leaders can delete knowledge items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete knowledge items" ON public.knowledge_items FOR DELETE TO authenticated USING (public.is_pod_leader_current_user(pod_id));


--
-- Name: hats_module_deployments Pod leaders can delete module deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete module deployments" ON public.hats_module_deployments FOR DELETE TO authenticated USING (public.is_pod_leader_current_user(pod_id));


--
-- Name: pod_modules Pod leaders can delete modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete modules" ON public.pod_modules FOR DELETE TO authenticated USING (public.is_pod_leader_current_user(pod_id));


--
-- Name: pods Pod leaders can delete pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete pods" ON public.pods FOR DELETE TO authenticated USING ((public.is_pod_leader_current_user(id) AND public.pod_deletion_authorized(id)));


--
-- Name: pod_role_permissions Pod leaders can delete role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can delete role permissions" ON public.pod_role_permissions FOR DELETE TO authenticated USING (public.is_pod_leader_current_user(pod_id));


--
-- Name: chat_groups Pod leaders can insert chat groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can insert chat groups" ON public.chat_groups FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.id = chat_groups.pod_id) AND ((lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))) IN ( SELECT lower(addr.addr) AS lower
           FROM unnest(pods.pod_leads) addr(addr))) OR (lower(pods.created_by_address) = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))))))));


--
-- Name: pod_role_permissions Pod leaders can insert role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can insert role permissions" ON public.pod_role_permissions FOR INSERT TO authenticated WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: chat_groups Pod leaders can update chat groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update chat groups" ON public.chat_groups FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.id = chat_groups.pod_id) AND ((lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))) IN ( SELECT lower(addr.addr) AS lower
           FROM unnest(pods.pod_leads) addr(addr))) OR (lower(pods.created_by_address) = lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())))))))));


--
-- Name: forum_categories Pod leaders can update forum categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update forum categories" ON public.forum_categories FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: knowledge_categories Pod leaders can update knowledge categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update knowledge categories" ON public.knowledge_categories FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: knowledge_items Pod leaders can update knowledge items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update knowledge items" ON public.knowledge_items FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: hats_module_deployments Pod leaders can update module deployments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update module deployments" ON public.hats_module_deployments FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: pod_modules Pod leaders can update modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update modules" ON public.pod_modules FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: pods Pod leaders can update pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update pods" ON public.pods FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(id)) WITH CHECK (public.is_pod_leader_current_user(id));


--
-- Name: pod_role_permissions Pod leaders can update role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders can update role permissions" ON public.pod_role_permissions FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: treasury_transactions Pod leaders confirm treasury transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders confirm treasury transactions" ON public.treasury_transactions FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: accreditations Pod leaders issue accreditations manually; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders issue accreditations manually" ON public.accreditations FOR INSERT TO authenticated WITH CHECK (((source = 'manual'::text) AND public.is_pod_leader_current_user(pod_id)));


--
-- Name: pod_deletion_proposals Pod leaders record deletion outcome; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders record deletion outcome" ON public.pod_deletion_proposals FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: pod_application_votes Pod leaders record their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders record their own votes" ON public.pod_application_votes FOR INSERT TO authenticated WITH CHECK ((public.is_my_wallet(voter_address) AND (EXISTS ( SELECT 1
   FROM public.pod_membership_applications a
  WHERE ((a.id = pod_application_votes.application_id) AND public.is_pod_leader_current_user(a.pod_id))))));


--
-- Name: treasury_transactions Pod leaders record treasury transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders record treasury transactions" ON public.treasury_transactions FOR INSERT TO authenticated WITH CHECK ((public.is_my_wallet(sender_address) AND public.is_pod_leader_current_user(pod_id)));


--
-- Name: accreditations Pod leaders revoke accreditations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod leaders revoke accreditations" ON public.accreditations FOR UPDATE TO authenticated USING (public.is_pod_leader_current_user(pod_id)) WITH CHECK (public.is_pod_leader_current_user(pod_id));


--
-- Name: vault_rotation_jobs Pod readers can read rotation jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod readers can read rotation jobs" ON public.vault_rotation_jobs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_rotation_jobs.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsAccess'::text))::boolean = true)))));


--
-- Name: vault_rotation_jobs Pod readers can update rotation jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pod readers can update rotation jobs" ON public.vault_rotation_jobs FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.active_pod_members apm
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((apm.pod_id = vault_rotation_jobs.pod_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsAccess'::text))::boolean = true)))));


--
-- Name: forum_poll_options Poll creators can create poll options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Poll creators can create poll options" ON public.forum_poll_options FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.forum_polls p
  WHERE ((p.id = forum_poll_options.poll_id) AND public.is_my_wallet(p.created_by)))));


--
-- Name: forum_poll_options Poll creators can delete poll options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Poll creators can delete poll options" ON public.forum_poll_options FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.forum_polls
  WHERE ((forum_polls.id = forum_poll_options.poll_id) AND (forum_polls.created_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))))));


--
-- Name: forum_polls Poll creators can delete their polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Poll creators can delete their polls" ON public.forum_polls FOR DELETE TO authenticated USING ((created_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: forum_poll_options Poll creators can update poll options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Poll creators can update poll options" ON public.forum_poll_options FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.forum_polls
  WHERE ((forum_polls.id = forum_poll_options.poll_id) AND (forum_polls.created_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))))));


--
-- Name: forum_polls Poll creators can update their polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Poll creators can update their polls" ON public.forum_polls FOR UPDATE TO authenticated USING ((created_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: forum_poll_options Poll options are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Poll options are viewable by everyone" ON public.forum_poll_options FOR SELECT USING (true);


--
-- Name: forum_posts Post creators can delete their posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post creators can delete their posts" ON public.forum_posts FOR DELETE TO authenticated USING (((lower(author_address) = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (lower(author_address) = lower((((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text)))));


--
-- Name: forum_posts Post creators can update their posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post creators can update their posts" ON public.forum_posts FOR UPDATE TO authenticated USING (((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (author_address = lower((((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text)))));


--
-- Name: proposal_onchain_status Proposal status is viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Proposal status is viewable by everyone" ON public.proposal_onchain_status FOR SELECT USING (true);


--
-- Name: proposal_metadata Proposer can create proposal metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Proposer can create proposal metadata" ON public.proposal_metadata FOR INSERT TO authenticated WITH CHECK (public.is_current_user_wallet(proposer_address));


--
-- Name: proposal_metadata Proposer can update proposal metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Proposer can update proposal metadata" ON public.proposal_metadata FOR UPDATE TO authenticated USING (public.is_current_user_wallet(proposer_address)) WITH CHECK (public.is_current_user_wallet(proposer_address));


--
-- Name: pod_role_permissions Public can view active pod role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active pod role permissions" ON public.pod_role_permissions FOR SELECT TO anon USING ((is_active = true));


--
-- Name: pods Public can view active pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active pods" ON public.pods FOR SELECT TO anon USING ((is_active = true));


--
-- Name: knowledge_categories Public can view global public categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view global public categories" ON public.knowledge_categories FOR SELECT USING (((pod_id IS NULL) AND (is_public = true)));


--
-- Name: knowledge_items Public can view global public items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view global public items" ON public.knowledge_items FOR SELECT USING (((pod_id IS NULL) AND (is_public = true)));


--
-- Name: system_supply_metadata Public can view system supply; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view system supply" ON public.system_supply_metadata FOR SELECT USING (true);


--
-- Name: treasury_snapshots Public can view treasury snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view treasury snapshots" ON public.treasury_snapshots FOR SELECT USING (true);


--
-- Name: pod_membership_applications Public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access" ON public.pod_membership_applications FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hat_metadata_cache Public read access for hat metadata; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access for hat metadata" ON public.hat_metadata_cache FOR SELECT USING (true);


--
-- Name: vault_wrapped_keys Recipients and managers can read wrapped keys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Recipients and managers can read wrapped keys" ON public.vault_wrapped_keys FOR SELECT TO authenticated USING (((recipient_eoa = lower((auth.jwt() ->> 'wallet_address'::text))) OR (EXISTS ( SELECT 1
   FROM ((public.vault_entries ve
     JOIN public.active_pod_members apm ON ((apm.pod_id = ve.pod_id)))
     JOIN public.pod_role_permissions prp ON (((prp.pod_id = apm.pod_id) AND (prp.token_address = apm.hat_id))))
  WHERE ((ve.id = vault_wrapped_keys.entry_id) AND (apm.wallet = lower((auth.jwt() ->> 'wallet_address'::text))) AND (apm.is_active = true) AND (((prp.permissions ->> 'passwordsManage'::text))::boolean = true))))));


--
-- Name: bounty_notifications Recipients can read own bounty notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Recipients can read own bounty notifications" ON public.bounty_notifications FOR SELECT TO authenticated USING ((lower(recipient_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: bounty_notifications Recipients can update own bounty notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Recipients can update own bounty notifications" ON public.bounty_notifications FOR UPDATE TO authenticated USING ((lower(recipient_address) = lower((auth.jwt() ->> 'wallet_address'::text)))) WITH CHECK ((lower(recipient_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: relay_tasks Relay tasks are viewable by creators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Relay tasks are viewable by creators" ON public.relay_tasks FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: bid_reviews Reviewers update their reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reviewers update their reviews" ON public.bid_reviews FOR UPDATE TO authenticated USING (public.is_my_wallet(reviewer_address)) WITH CHECK ((public.is_my_wallet(reviewer_address) AND (EXISTS ( SELECT 1
   FROM public.bids b
  WHERE ((b.id = bid_reviews.bid_id) AND public.is_bounty_manager(b.bounty_id))))));


--
-- Name: dispute_comments Service role can insert comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert comments" ON public.dispute_comments FOR INSERT WITH CHECK ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: bounty_disputes Service role can insert disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert disputes" ON public.bounty_disputes FOR INSERT WITH CHECK ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: pending_donations Service role can insert donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert donations" ON public.pending_donations FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: dispute_evidence Service role can insert evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert evidence" ON public.dispute_evidence FOR INSERT WITH CHECK ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: event_notifications Service role can manage all event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all event notifications" ON public.event_notifications TO service_role USING (true) WITH CHECK (true);


--
-- Name: token_balances Service role can manage balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage balances" ON public.token_balances USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: governance_proposal_votes Service role can manage governance proposal votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage governance proposal votes" ON public.governance_proposal_votes TO service_role USING (true) WITH CHECK (true);


--
-- Name: governance_user_votes Service role can manage governance user votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage governance user votes" ON public.governance_user_votes TO service_role USING (true) WITH CHECK (true);


--
-- Name: dispute_mediators Service role can manage mediators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage mediators" ON public.dispute_mediators USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: relay_tasks Service role can manage relay tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage relay tasks" ON public.relay_tasks USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: dispute_resolutions Service role can manage resolutions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage resolutions" ON public.dispute_resolutions USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: treasury_snapshots Service role can manage treasury snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage treasury snapshots" ON public.treasury_snapshots USING ((auth.role() = 'service_role'::text));


--
-- Name: user_tokens Service role can manage user tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage user tokens" ON public.user_tokens USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: burn_requests Service role can update burn requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update burn requests" ON public.burn_requests FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: bounty_disputes Service role can update disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update disputes" ON public.bounty_disputes FOR UPDATE USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: pending_donations Service role can update donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update donations" ON public.pending_donations FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: proposal_onchain_status Service role can update status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update status" ON public.proposal_onchain_status USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: system_supply_metadata Service role can update system supply; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update system supply" ON public.system_supply_metadata FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: dispute_comments Service role can view all comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all comments" ON public.dispute_comments FOR SELECT USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: bounty_disputes Service role can view all disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all disputes" ON public.bounty_disputes FOR SELECT USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: dispute_evidence Service role can view all evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all evidence" ON public.dispute_evidence FOR SELECT USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: dispute_resolutions Service role can view all resolutions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can view all resolutions" ON public.dispute_resolutions FOR SELECT USING ((current_setting('role'::text) = 'service_role'::text));


--
-- Name: pod_role_permissions_history Service role can write history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can write history" ON public.pod_role_permissions_history FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: pod_role_permissions_history Service role full access to history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to history" ON public.pod_role_permissions_history TO service_role USING (true) WITH CHECK (true);


--
-- Name: pod_level_proposals Service role full access to pod proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to pod proposals" ON public.pod_level_proposals TO service_role USING (true) WITH CHECK (true);


--
-- Name: pod_role_permissions Service role full access to role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to role permissions" ON public.pod_role_permissions TO service_role USING (true) WITH CHECK (true);


--
-- Name: notification_preferences Service role has full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role has full access" ON public.notification_preferences TO service_role USING (true) WITH CHECK (true);


--
-- Name: burn_approvals Service role manages burn approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages burn approvals" ON public.burn_approvals USING ((auth.role() = 'service_role'::text));


--
-- Name: donation_approvals Service role manages donation approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages donation approvals" ON public.donation_approvals USING ((auth.role() = 'service_role'::text));


--
-- Name: work_submissions Submitters can update pending submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Submitters can update pending submissions" ON public.work_submissions FOR UPDATE USING (((submitter_address = ((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)) AND (status = 'pending'::text)));


--
-- Name: forum_threads Thread authors can delete their threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Thread authors can delete their threads" ON public.forum_threads FOR DELETE TO authenticated USING (((lower(author_address) = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (lower(author_address) = lower((((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text)))));


--
-- Name: forum_threads Thread creators can update their threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Thread creators can update their threads" ON public.forum_threads FOR UPDATE TO authenticated USING (((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (author_address = lower((((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text)))));


--
-- Name: bounty_token_gates Token gates are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Token gates are viewable by everyone" ON public.bounty_token_gates FOR SELECT USING (true);


--
-- Name: forum_category_required_tokens Token requirements are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Token requirements are viewable by everyone" ON public.forum_category_required_tokens FOR SELECT USING (true);


--
-- Name: tokens Tokens are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tokens are viewable by everyone" ON public.tokens FOR SELECT USING (true);


--
-- Name: treasury_transactions Treasury transactions are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Treasury transactions are viewable by everyone" ON public.treasury_transactions FOR SELECT USING (true);


--
-- Name: forum_media_attachments Uploaders can delete their attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Uploaders can delete their attachments" ON public.forum_media_attachments FOR DELETE TO authenticated USING ((uploader_address = ((current_setting('request.jwt.claims'::text))::json ->> 'wallet_address'::text)));


--
-- Name: forum_media_attachments Uploaders can update their attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Uploaders can update their attachments" ON public.forum_media_attachments FOR UPDATE TO authenticated USING ((uploader_address = ((current_setting('request.jwt.claims'::text))::json ->> 'wallet_address'::text))) WITH CHECK ((uploader_address = ((current_setting('request.jwt.claims'::text))::json ->> 'wallet_address'::text)));


--
-- Name: dm_blocks Users can create blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create blocks" ON public.dm_blocks FOR INSERT WITH CHECK ((blocker_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)));


--
-- Name: burn_requests Users can create burn requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create burn requests" ON public.burn_requests FOR INSERT WITH CHECK ((user_wallet = (auth.jwt() ->> 'wallet_address'::text)));


--
-- Name: event_approval_workflows Users can create event approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create event approvals" ON public.event_approval_workflows FOR INSERT WITH CHECK ((proposed_by = (auth.jwt() ->> 'sub'::text)));


--
-- Name: events Users can create events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create events" ON public.events FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: role_permission_approvals Users can create role approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create role approvals" ON public.role_permission_approvals FOR INSERT WITH CHECK ((proposed_by = (auth.jwt() ->> 'sub'::text)));


--
-- Name: forum_thread_drafts Users can create their own drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own drafts" ON public.forum_thread_drafts FOR INSERT TO authenticated WITH CHECK (((auth.jwt() IS NOT NULL) AND (author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: forum_post_reactions Users can create their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own reactions" ON public.forum_post_reactions FOR INSERT TO authenticated WITH CHECK ((lower(reactor_address) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: events Users can delete own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own events" ON public.events FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: governance_notifications Users can delete own governance notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own governance notifications" ON public.governance_notifications FOR DELETE USING ((lower((recipient_address)::text) = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: notification_preferences Users can delete own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own preferences" ON public.notification_preferences FOR DELETE TO authenticated USING ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: dm_blocks Users can delete their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own blocks" ON public.dm_blocks FOR DELETE USING ((blocker_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)));


--
-- Name: chat_messages Users can delete their own direct messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own direct messages" ON public.chat_messages FOR DELETE USING (((is_direct_message = true) AND (receiver_wallet_id = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: forum_thread_drafts Users can delete their own drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own drafts" ON public.forum_thread_drafts FOR DELETE TO authenticated USING ((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: events Users can delete their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own events" ON public.events FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: forum_post_reactions Users can delete their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own reactions" ON public.forum_post_reactions FOR DELETE TO authenticated USING ((lower(reactor_address) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: forum_poll_votes Users can delete their own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own votes" ON public.forum_poll_votes FOR DELETE TO authenticated USING ((voter_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: bounty_disputes Users can file disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can file disputes" ON public.bounty_disputes FOR INSERT WITH CHECK ((filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))));


--
-- Name: forum_post_reports Users can file reports as themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can file reports as themselves" ON public.forum_post_reports FOR INSERT TO authenticated WITH CHECK ((lower(reporter_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: pod_audit_log Users can insert audit logs as themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert audit logs as themselves" ON public.pod_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_current_user_wallet(performed_by));


--
-- Name: notification_preferences Users can insert own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own preferences" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: user_presence Users can insert own presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own presence" ON public.user_presence FOR INSERT TO authenticated WITH CHECK ((lower(wallet_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: user_profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: approval_signatures_audit Users can insert own signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own signatures" ON public.approval_signatures_audit FOR INSERT TO authenticated WITH CHECK (public.is_my_wallet(approver_address));


--
-- Name: dispute_comments Users can post comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can post comments" ON public.dispute_comments FOR INSERT WITH CHECK (((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) AND (EXISTS ( SELECT 1
   FROM public.bounty_disputes d
  WHERE ((d.id = dispute_comments.dispute_id) AND ((d.filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (d.filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)))))))));


--
-- Name: vault_user_keys Users can publish their own vault user key; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can publish their own vault user key" ON public.vault_user_keys FOR INSERT TO authenticated WITH CHECK ((lower((auth.jwt() ->> 'wallet_address'::text)) = eoa_address));


--
-- Name: pod_audit_log Users can read audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read audit logs" ON public.pod_audit_log FOR SELECT TO authenticated USING (true);


--
-- Name: event_agendas Users can read event agendas for accessible events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read event agendas for accessible events" ON public.event_agendas FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_agendas.event_id) AND ((e.status = 'published'::text) OR (e.user_id = auth.uid()) OR (e.creator_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))))));


--
-- Name: event_approval_workflows Users can read event approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read event approvals" ON public.event_approval_workflows FOR SELECT USING (true);


--
-- Name: event_notifications Users can read notifications for their wallet; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read notifications for their wallet" ON public.event_notifications FOR SELECT TO authenticated USING ((recipient_address = lower(( SELECT user_profiles.wallet_address
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())))));


--
-- Name: events Users can read own and published events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own and published events" ON public.events FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (status = 'published'::text)));


--
-- Name: user_profiles Users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own profile" ON public.user_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: role_permission_approvals Users can read role approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read role approvals" ON public.role_permission_approvals FOR SELECT USING (true);


--
-- Name: approval_signatures_audit Users can read signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read signatures" ON public.approval_signatures_audit FOR SELECT USING (true);


--
-- Name: event_registrations Users can read their own registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own registrations" ON public.event_registrations FOR SELECT TO authenticated USING ((user_address = lower(( SELECT user_profiles.wallet_address
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())))));


--
-- Name: user_wallets Users can read their own wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own wallets" ON public.user_wallets FOR SELECT TO authenticated USING ((user_id = ((auth.jwt() ->> 'sub'::text))::uuid));


--
-- Name: knowledge_item_views Users can record own views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can record own views" ON public.knowledge_item_views FOR INSERT TO authenticated WITH CHECK ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: forum_post_reactions Users can remove their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove their own reactions" ON public.forum_post_reactions FOR DELETE TO authenticated USING ((reactor_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: chat_messages Users can send direct messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send direct messages" ON public.chat_messages FOR INSERT WITH CHECK (((is_direct_message = true) AND (sender_wallet_id = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: gifts Users can send gifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send gifts" ON public.gifts FOR INSERT WITH CHECK ((sender_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)));


--
-- Name: chat_messages Users can send pod chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send pod chat messages" ON public.chat_messages FOR INSERT WITH CHECK (((is_direct_message = false) AND (chat_group_id IS NOT NULL) AND (sender_wallet_id = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))));


--
-- Name: dispute_evidence Users can submit evidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can submit evidence" ON public.dispute_evidence FOR INSERT WITH CHECK (((submitted_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) AND (EXISTS ( SELECT 1
   FROM public.bounty_disputes d
  WHERE ((d.id = dispute_evidence.dispute_id) AND ((d.filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (d.filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)))))))));


--
-- Name: event_approval_workflows Users can update event approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update event approvals" ON public.event_approval_workflows FOR UPDATE USING (((proposed_by = (auth.jwt() ->> 'sub'::text)) OR ((auth.jwt() ->> 'sub'::text) = ANY (current_approvals))));


--
-- Name: events Users can update own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own events" ON public.events FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: governance_notifications Users can update own governance notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own governance notifications" ON public.governance_notifications FOR UPDATE USING ((lower((recipient_address)::text) = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)))) WITH CHECK ((lower((recipient_address)::text) = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: notification_preferences Users can update own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own preferences" ON public.notification_preferences FOR UPDATE TO authenticated USING ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text)))) WITH CHECK ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: user_presence Users can update own presence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own presence" ON public.user_presence FOR UPDATE TO authenticated USING ((lower(wallet_address) = lower((auth.jwt() ->> 'wallet_address'::text)))) WITH CHECK ((lower(wallet_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: user_profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: knowledge_item_views Users can update own views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own views" ON public.knowledge_item_views FOR UPDATE TO authenticated USING ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text)))) WITH CHECK ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: role_permission_approvals Users can update role approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update role approvals" ON public.role_permission_approvals FOR UPDATE USING (((proposed_by = (auth.jwt() ->> 'sub'::text)) OR ((auth.jwt() ->> 'sub'::text) = ANY (current_approvals))));


--
-- Name: bounty_disputes Users can update their disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their disputes" ON public.bounty_disputes FOR UPDATE USING ((filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))));


--
-- Name: forum_thread_drafts Users can update their own drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own drafts" ON public.forum_thread_drafts FOR UPDATE TO authenticated USING ((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: event_notifications Users can update their own event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own event notifications" ON public.event_notifications FOR UPDATE USING ((recipient_address = lower((auth.jwt() ->> 'wallet_address'::text)))) WITH CHECK ((recipient_address = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: events Users can update their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own events" ON public.events FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: governance_notifications Users can update their own governance notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own governance notifications" ON public.governance_notifications FOR UPDATE USING (((recipient_address)::text = lower((auth.jwt() ->> 'wallet_address'::text)))) WITH CHECK (((recipient_address)::text = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: event_notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.event_notifications FOR UPDATE TO authenticated USING ((recipient_address = lower(( SELECT user_profiles.wallet_address
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())))));


--
-- Name: vault_user_keys Users can update their own vault user key; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own vault user key" ON public.vault_user_keys FOR UPDATE TO authenticated USING ((lower((auth.jwt() ->> 'wallet_address'::text)) = eoa_address)) WITH CHECK ((lower((auth.jwt() ->> 'wallet_address'::text)) = eoa_address));


--
-- Name: chat_groups Users can view active chat groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view active chat groups" ON public.chat_groups FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: forum_categories Users can view active forum categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view active forum categories" ON public.forum_categories FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: dispute_comments Users can view dispute comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view dispute comments" ON public.dispute_comments FOR SELECT USING ((((is_private = false) OR (current_setting('role'::text) = 'service_role'::text)) AND (EXISTS ( SELECT 1
   FROM public.bounty_disputes d
  WHERE ((d.id = dispute_comments.dispute_id) AND ((d.filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (d.filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (EXISTS ( SELECT 1
           FROM public.dispute_mediators dm
          WHERE ((dm.dispute_id = d.id) AND (dm.mediator_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) AND (dm.status = 'active'::text))))))))));


--
-- Name: bounty_disputes Users can view disputes they're involved in; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view disputes they're involved in" ON public.bounty_disputes FOR SELECT USING (((filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (EXISTS ( SELECT 1
   FROM public.dispute_mediators dm
  WHERE ((dm.dispute_id = bounty_disputes.id) AND (dm.mediator_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) AND (dm.status = 'active'::text))))));


--
-- Name: dispute_evidence Users can view evidence for their disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view evidence for their disputes" ON public.dispute_evidence FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.bounty_disputes d
  WHERE ((d.id = dispute_evidence.dispute_id) AND ((d.filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (d.filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (EXISTS ( SELECT 1
           FROM public.dispute_mediators dm
          WHERE ((dm.dispute_id = d.id) AND (dm.mediator_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) AND (dm.status = 'active'::text)))))))));


--
-- Name: dispute_mediators Users can view mediators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view mediators" ON public.dispute_mediators FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.bounty_disputes d
  WHERE ((d.id = dispute_mediators.dispute_id) AND ((d.filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (d.filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (dispute_mediators.mediator_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))))))));


--
-- Name: burn_requests Users can view own burn requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own burn requests" ON public.burn_requests FOR SELECT USING (((user_wallet = (auth.jwt() ->> 'wallet_address'::text)) OR (auth.role() = 'service_role'::text)));


--
-- Name: pending_donations Users can view own donations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own donations" ON public.pending_donations FOR SELECT USING (((user_wallet = (auth.jwt() ->> 'wallet_address'::text)) OR (auth.role() = 'service_role'::text)));


--
-- Name: governance_notifications Users can view own governance notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own governance notifications" ON public.governance_notifications FOR SELECT USING ((lower((recipient_address)::text) = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: notification_preferences Users can view own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own preferences" ON public.notification_preferences FOR SELECT TO authenticated USING ((lower(user_address) = lower((auth.jwt() ->> 'wallet_address'::text))));


--
-- Name: pod_accountability_signatures Users can view pod accountability signatures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view pod accountability signatures" ON public.pod_accountability_signatures FOR SELECT TO authenticated USING (true);


--
-- Name: dispute_resolutions Users can view resolutions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view resolutions" ON public.dispute_resolutions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.bounty_disputes d
  WHERE ((d.id = dispute_resolutions.dispute_id) AND ((d.filed_by = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (d.filed_against = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) OR (EXISTS ( SELECT 1
           FROM public.dispute_mediators dm
          WHERE ((dm.dispute_id = d.id) AND (dm.mediator_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))) AND (dm.status = 'active'::text)))))))));


--
-- Name: pod_accountability_signatures Users can view signatures for pods they have access to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view signatures for pods they have access to" ON public.pod_accountability_signatures FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.pods
  WHERE ((pods.id = pod_accountability_signatures.pod_id) AND (pods.status = ANY (ARRAY['proposed'::text, 'active'::text]))))));


--
-- Name: token_balances Users can view their own balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own balances" ON public.token_balances FOR SELECT USING (((auth.uid() IS NOT NULL) AND (wallet_address = (auth.uid())::text)));


--
-- Name: dm_blocks Users can view their own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own blocks" ON public.dm_blocks FOR SELECT USING ((blocker_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)));


--
-- Name: chat_messages Users can view their own direct messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own direct messages" ON public.chat_messages FOR SELECT USING (((is_direct_message = true) AND ((sender_wallet_id = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))) OR (receiver_wallet_id = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))))));


--
-- Name: forum_thread_drafts Users can view their own drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own drafts" ON public.forum_thread_drafts FOR SELECT TO authenticated USING ((author_address = lower(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: event_notifications Users can view their own event notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own event notifications" ON public.event_notifications FOR SELECT TO authenticated USING (((lower(recipient_address) = lower((auth.jwt() ->> 'address'::text))) OR (lower(recipient_address) = lower((auth.jwt() ->> 'wallet_address'::text)))));


--
-- Name: gifts Users can view their own gifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own gifts" ON public.gifts FOR SELECT USING (((sender_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text)) OR (recipient_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text))));


--
-- Name: user_tokens Users can view their own tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own tokens" ON public.user_tokens FOR SELECT USING (((auth.uid() IS NOT NULL) AND (wallet_address = (auth.uid())::text)));


--
-- Name: knowledge_item_views Users can view their own view history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own view history" ON public.knowledge_item_views FOR SELECT TO authenticated USING (((user_address IS NULL) OR (lower(user_address) = lower(( SELECT user_profiles.wallet_address
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid()))))));


--
-- Name: treasury_transactions Users can view treasury transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view treasury transactions" ON public.treasury_transactions FOR SELECT TO authenticated USING (true);


--
-- Name: work_submissions Users can view work submissions for their bounties or bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view work submissions for their bounties or bids" ON public.work_submissions FOR SELECT USING (((submitter_address = ((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)) OR (bounty_id IN ( SELECT bounties.id
   FROM public.bounties
  WHERE (bounties.creator_address = ((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)))) OR (bounty_id IN ( SELECT b.id
   FROM (public.bounties b
     JOIN public.pods p ON ((b.pod_id = p.id)))
  WHERE (p.pod_leads @> ARRAY[((current_setting('request.jwt.claims'::text))::json ->> 'address'::text)])))));


--
-- Name: treasury_approval_workflows Users can view workflows for their pods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view workflows for their pods" ON public.treasury_approval_workflows FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: account_deletion_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: accreditations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accreditations ENABLE ROW LEVEL SECURITY;

--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_token_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_token_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_context; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_context ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: community_agent_posts agent_insert_agent_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_insert_agent_posts ON public.community_agent_posts FOR INSERT TO community_agent WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pod_modules pm
  WHERE ((pm.pod_id = community_agent_posts.pod_id) AND (pm.community_agent_enabled = true) AND (lower(COALESCE((pm.community_agent_config ->> 'agent_wallet'::text), ''::text)) = public.jwt_agent_wallet())))));


--
-- Name: chat_messages agent_insert_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_insert_chat_messages ON public.chat_messages FOR INSERT TO community_agent WITH CHECK (((actor_type = 'agent'::text) AND (lower(sender_wallet_id) = public.jwt_agent_wallet()) AND public.jwt_is_enabled_agent()));


--
-- Name: events agent_insert_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_insert_events ON public.events FOR INSERT TO community_agent WITH CHECK (((actor_type = 'agent'::text) AND (lower(creator_address) = public.jwt_agent_wallet()) AND public.jwt_is_enabled_agent()));


--
-- Name: forum_posts agent_insert_forum_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_insert_forum_posts ON public.forum_posts FOR INSERT TO community_agent WITH CHECK (((actor_type = 'agent'::text) AND (lower(author_address) = public.jwt_agent_wallet()) AND public.jwt_is_enabled_agent()));


--
-- Name: forum_threads agent_insert_forum_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_insert_forum_threads ON public.forum_threads FOR INSERT TO community_agent WITH CHECK (((actor_type = 'agent'::text) AND (lower(author_address) = public.jwt_agent_wallet()) AND public.jwt_is_enabled_agent()));


--
-- Name: agent_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: community_agent_posts agent_select_agent_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_agent_posts ON public.community_agent_posts FOR SELECT TO community_agent USING (true);


--
-- Name: chat_groups agent_select_chat_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_chat_groups ON public.chat_groups FOR SELECT TO community_agent USING (true);


--
-- Name: chat_messages agent_select_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_chat_messages ON public.chat_messages FOR SELECT TO community_agent USING (((is_direct_message = false) OR (lower(sender_wallet_id) = public.jwt_agent_wallet()) OR (lower(receiver_wallet_id) = public.jwt_agent_wallet())));


--
-- Name: events agent_select_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_events ON public.events FOR SELECT TO community_agent USING (true);


--
-- Name: forum_categories agent_select_forum_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_forum_categories ON public.forum_categories FOR SELECT TO community_agent USING (true);


--
-- Name: forum_posts agent_select_forum_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_forum_posts ON public.forum_posts FOR SELECT TO community_agent USING (true);


--
-- Name: forum_threads agent_select_forum_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_forum_threads ON public.forum_threads FOR SELECT TO community_agent USING (true);


--
-- Name: pod_modules agent_select_pod_modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agent_select_pod_modules ON public.pod_modules FOR SELECT TO community_agent USING (true);


--
-- Name: event_required_tokens allow_creator_manage_event_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_creator_manage_event_tokens ON public.event_required_tokens USING ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.creator_address = ( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))))));


--
-- Name: events allow_creator_manage_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_creator_manage_events ON public.events USING ((creator_address = ( SELECT user_profiles.wallet_address
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid()))));


--
-- Name: products allow_public_select_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_select_products ON public.products FOR SELECT USING (true);


--
-- Name: event_required_tokens allow_read_event_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read_event_tokens ON public.event_required_tokens FOR SELECT USING (true);


--
-- Name: events allow_read_published_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_read_published_events ON public.events FOR SELECT USING (((status = 'published'::text) OR (status = 'completed'::text)));


--
-- Name: approval_signatures_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_signatures_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: community_agent_posts authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.community_agent_posts FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: community_agent_subscriptions authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read ON public.community_agent_subscriptions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: bid_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bid_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: bid_state_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bid_state_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: bids; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

--
-- Name: bounties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;

--
-- Name: bounty_approval_workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bounty_approval_workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: bounty_disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bounty_disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: bounty_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bounty_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: bounty_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bounty_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: bounty_token_gates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bounty_token_gates ENABLE ROW LEVEL SECURITY;

--
-- Name: burn_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.burn_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: burn_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.burn_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_moderation_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_moderation_log ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_muted_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_muted_users ENABLE ROW LEVEL SECURITY;

--
-- Name: community_agent_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_agent_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: community_agent_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_agent_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: community_agent_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_agent_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: conference_participants conf_participants_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_participants_insert_self ON public.conference_participants FOR INSERT TO authenticated WITH CHECK ((lower(wallet_address) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: conference_participants conf_participants_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_participants_select_auth ON public.conference_participants FOR SELECT TO authenticated USING (true);


--
-- Name: conference_participants conf_participants_update_self_or_host; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_participants_update_self_or_host ON public.conference_participants FOR UPDATE TO authenticated USING (((lower(wallet_address) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)) OR (EXISTS ( SELECT 1
   FROM public.conference_rooms cr
  WHERE ((cr.id = conference_participants.room_id) AND (lower(cr.host_wallet) = ( SELECT lower(user_profiles.wallet_address) AS lower
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())
         LIMIT 1))))) OR (EXISTS ( SELECT 1
   FROM public.conference_participants cp
  WHERE ((cp.room_id = conference_participants.room_id) AND (lower(cp.wallet_address) = ( SELECT lower(user_profiles.wallet_address) AS lower
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())
         LIMIT 1)) AND (cp.role = 'co_host'::text) AND (cp.is_active = true))))));


--
-- Name: conference_reactions conf_reactions_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_reactions_insert_self ON public.conference_reactions FOR INSERT TO authenticated WITH CHECK ((lower(sender_wallet) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: conference_reactions conf_reactions_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_reactions_select_auth ON public.conference_reactions FOR SELECT TO authenticated USING (true);


--
-- Name: conference_rooms conf_rooms_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_rooms_insert_auth ON public.conference_rooms FOR INSERT TO authenticated WITH CHECK ((lower(host_wallet) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: conference_rooms conf_rooms_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_rooms_select_public ON public.conference_rooms FOR SELECT USING (true);


--
-- Name: conference_rooms conf_rooms_update_host; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_rooms_update_host ON public.conference_rooms FOR UPDATE TO authenticated USING ((lower(host_wallet) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: conference_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conference_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conference_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conference_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: conference_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conference_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_mediators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_mediators ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_resolutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_resolutions ENABLE ROW LEVEL SECURITY;

--
-- Name: dm_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dm_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: donation_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.donation_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: email_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_agendas ENABLE ROW LEVEL SECURITY;

--
-- Name: event_approval_workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_approval_workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: event_escrow; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_escrow ENABLE ROW LEVEL SECURITY;

--
-- Name: event_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: event_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_required_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_required_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: event_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: explorer_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.explorer_events ENABLE ROW LEVEL SECURITY;

--
-- Name: explorer_events explorer_events_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY explorer_events_public_read ON public.explorer_events FOR SELECT USING (true);


--
-- Name: explorer_events explorer_events_service_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY explorer_events_service_insert ON public.explorer_events FOR INSERT WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: forum_bookmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_bookmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_category_required_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_category_required_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_featured_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_featured_content ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_media_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_media_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_moderator_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_moderator_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_poll_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_poll_options ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_poll_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_poll_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_polls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_polls ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_post_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_post_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_post_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_post_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_proposal_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_proposal_links ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_templates forum_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY forum_templates_select ON public.forum_templates FOR SELECT USING (true);


--
-- Name: forum_thread_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_thread_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_thread_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_thread_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_thread_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_thread_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_thread_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_thread_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_user_mutes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.forum_user_mutes ENABLE ROW LEVEL SECURITY;

--
-- Name: general_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.general_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: gifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

--
-- Name: governance_notifications governance notifications: sender inserts as self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "governance notifications: sender inserts as self" ON public.governance_notifications FOR INSERT TO authenticated WITH CHECK (public.is_my_wallet((sender_address)::text));


--
-- Name: governance_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: governance_proposal_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_proposal_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: governance_user_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_user_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: governance_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: governance_votes governance_votes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY governance_votes_insert_own ON public.governance_votes FOR INSERT TO authenticated WITH CHECK ((public.is_my_wallet(voter_address) AND public.can_vote_on_pod_proposal(proposal_id, voter_address)));


--
-- Name: governance_votes_jwt_debug; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_votes_jwt_debug ENABLE ROW LEVEL SECURITY;

--
-- Name: governance_votes governance_votes_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY governance_votes_select_all ON public.governance_votes FOR SELECT USING (true);


--
-- Name: governance_votes governance_votes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY governance_votes_update_own ON public.governance_votes FOR UPDATE TO authenticated USING (public.is_my_wallet(voter_address)) WITH CHECK ((public.is_my_wallet(voter_address) AND public.can_vote_on_pod_proposal(proposal_id, voter_address)));


--
-- Name: hat_metadata_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hat_metadata_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: hats_module_deployments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hats_module_deployments ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_item_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_item_views ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;

--
-- Name: ledger_anchors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ledger_anchors ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: member_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: member_locations member_locations_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_locations_select_own ON public.member_locations FOR SELECT TO authenticated USING ((lower(wallet) = lower(COALESCE(((current_setting('request.jwt.claims'::text, true))::json ->> 'wallet_address'::text), (((current_setting('request.jwt.claims'::text, true))::json -> 'user_metadata'::text) ->> 'wallet_address'::text), ''::text))));


--
-- Name: member_locations member_locations_select_shared; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_locations_select_shared ON public.member_locations FOR SELECT TO authenticated USING (((share_with_pods = true) AND public.shares_active_pod_with_current_user(wallet)));


--
-- Name: member_locations member_locations_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_locations_service_all ON public.member_locations TO service_role USING (true) WITH CHECK (true);


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_moderator_actions moderator_actions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moderator_actions_insert ON public.forum_moderator_actions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pod_role_permissions prp
  WHERE ((((prp.permissions ->> 'forumModeration'::text))::boolean = true) AND (prp.is_active = true)))));


--
-- Name: forum_moderator_actions moderator_actions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moderator_actions_select ON public.forum_moderator_actions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pod_role_permissions prp
  WHERE ((((prp.permissions ->> 'forumModeration'::text))::boolean = true) AND (prp.is_active = true)))));


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: general_notifications notifications: recipient reads own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: recipient reads own" ON public.general_notifications FOR SELECT TO authenticated USING ((lower(recipient_address) = public.session_wallet()));


--
-- Name: general_notifications notifications: recipient updates own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: recipient updates own" ON public.general_notifications FOR UPDATE TO authenticated USING ((lower(recipient_address) = public.session_wallet())) WITH CHECK ((lower(recipient_address) = public.session_wallet()));


--
-- Name: general_notifications notifications: sender inserts as self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: sender inserts as self" ON public.general_notifications FOR INSERT TO authenticated WITH CHECK ((lower(sender_address) = public.session_wallet()));


--
-- Name: general_notifications notifications: sender reads own sent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: sender reads own sent" ON public.general_notifications FOR SELECT TO authenticated USING ((lower(sender_address) = public.session_wallet()));


--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_donations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_donations ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_accountability_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_accountability_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_application_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_application_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_approval_signatures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_approval_signatures ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_deletion_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_deletion_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_faces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_faces ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_faces pod_faces_delete_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_faces_delete_managers ON public.pod_faces FOR DELETE TO authenticated USING ((public.is_pod_leader_current_user(pod_id) OR public.has_pod_permission_current_user(pod_id, 'appearanceManage'::text)));


--
-- Name: pod_faces pod_faces_insert_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_faces_insert_managers ON public.pod_faces FOR INSERT TO authenticated WITH CHECK ((public.is_pod_leader_current_user(pod_id) OR public.has_pod_permission_current_user(pod_id, 'appearanceManage'::text)));


--
-- Name: pod_faces pod_faces_select_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_faces_select_managers ON public.pod_faces FOR SELECT TO authenticated USING ((public.is_pod_leader_current_user(pod_id) OR public.has_pod_permission_current_user(pod_id, 'appearanceManage'::text)));


--
-- Name: pod_faces pod_faces_select_published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_faces_select_published ON public.pod_faces FOR SELECT USING ((status = 'published'::text));


--
-- Name: pod_faces pod_faces_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_faces_service_role ON public.pod_faces TO service_role USING (true) WITH CHECK (true);


--
-- Name: pod_faces pod_faces_update_managers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_faces_update_managers ON public.pod_faces FOR UPDATE TO authenticated USING ((public.is_pod_leader_current_user(pod_id) OR public.has_pod_permission_current_user(pod_id, 'appearanceManage'::text))) WITH CHECK ((public.is_pod_leader_current_user(pod_id) OR public.has_pod_permission_current_user(pod_id, 'appearanceManage'::text)));


--
-- Name: pod_invite_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_invite_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_invite_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_invite_links ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_membership_applications pod_leaders_can_read_applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_leaders_can_read_applications ON public.pod_membership_applications FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pods p
  WHERE ((p.id = pod_membership_applications.pod_id) AND ((( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())) = ANY (p.pod_leads)) OR (lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))) IN ( SELECT lower(unnest(p.pod_leads)) AS lower)))))) OR (lower(applicant_address) = lower(( SELECT user_profiles.wallet_address
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid()))))));


--
-- Name: pod_membership_applications pod_leaders_can_update_applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_leaders_can_update_applications ON public.pod_membership_applications FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pods p
  WHERE ((p.id = pod_membership_applications.pod_id) AND ((( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())) = ANY (p.pod_leads)) OR (lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))) IN ( SELECT lower(unnest(p.pod_leads)) AS lower))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pods p
  WHERE ((p.id = pod_membership_applications.pod_id) AND ((( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid())) = ANY (p.pod_leads)) OR (lower(( SELECT user_profiles.wallet_address
           FROM public.user_profiles
          WHERE (user_profiles.user_id = auth.uid()))) IN ( SELECT lower(unnest(p.pod_leads)) AS lower)))))));


--
-- Name: pod_level_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_level_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_member_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_member_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_members ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_membership_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_membership_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_place_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_place_links ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_place_links pod_place_links_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_place_links_member_select ON public.pod_place_links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pod_places pp
  WHERE ((pp.id = pod_place_links.place_id) AND public.is_pod_member_current_user(pp.pod_id)))));


--
-- Name: pod_place_links pod_place_links_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_place_links_service_all ON public.pod_place_links TO service_role USING (true) WITH CHECK (true);


--
-- Name: pod_places; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_places ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_places pod_places_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_places_member_select ON public.pod_places FOR SELECT TO authenticated USING (public.is_pod_member_current_user(pod_id));


--
-- Name: pod_places pod_places_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_places_service_all ON public.pod_places TO service_role USING (true) WITH CHECK (true);


--
-- Name: pod_role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_role_permissions_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_role_permissions_history ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_self_budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_self_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_self_budgets pod_self_budgets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_self_budgets_select ON public.pod_self_budgets FOR SELECT TO authenticated USING (true);


--
-- Name: pods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pods ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_post_reports post_reports_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_reports_select ON public.forum_post_reports FOR SELECT TO authenticated USING (((reporter_address = ( SELECT (auth.uid())::text AS uid)) OR (EXISTS ( SELECT 1
   FROM public.pod_role_permissions prp
  WHERE ((((prp.permissions ->> 'forumModeration'::text))::boolean = true) AND (prp.is_active = true))))));


--
-- Name: forum_post_reports post_reports_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY post_reports_update ON public.forum_post_reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pod_role_permissions prp
  WHERE ((((prp.permissions ->> 'forumModeration'::text))::boolean = true) AND (prp.is_active = true)))));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_eligibility_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_eligibility_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_eligibility_snapshots proposal_eligibility_snapshots_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposal_eligibility_snapshots_insert ON public.proposal_eligibility_snapshots FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pod_level_proposals pr
  WHERE ((pr.id = proposal_eligibility_snapshots.proposal_id) AND public.is_my_wallet(pr.created_by) AND (pr.created_at > (now() - '00:10:00'::interval)) AND (NOT (EXISTS ( SELECT 1
           FROM public.governance_votes v
          WHERE (v.proposal_id = pr.id))))))));


--
-- Name: proposal_eligibility_snapshots proposal_eligibility_snapshots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY proposal_eligibility_snapshots_select ON public.proposal_eligibility_snapshots FOR SELECT TO authenticated USING (true);


--
-- Name: proposal_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_onchain_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposal_onchain_status ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_validations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_validations ENABLE ROW LEVEL SECURITY;

--
-- Name: relay_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relay_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permission_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permission_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: self_member_epoch_earned; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.self_member_epoch_earned ENABLE ROW LEVEL SECURITY;

--
-- Name: self_member_epoch_earned self_member_epoch_earned_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_member_epoch_earned_select ON public.self_member_epoch_earned FOR SELECT TO authenticated USING (true);


--
-- Name: self_mint_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.self_mint_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: self_mint_queue self_mint_queue_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY self_mint_queue_select ON public.self_mint_queue FOR SELECT TO authenticated USING (true);


--
-- Name: community_agent_posts service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.community_agent_posts USING ((auth.role() = 'service_role'::text));


--
-- Name: community_agent_queue service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.community_agent_queue USING ((auth.role() = 'service_role'::text));


--
-- Name: community_agent_subscriptions service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.community_agent_subscriptions USING ((auth.role() = 'service_role'::text));


--
-- Name: survey_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: system_supply_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_supply_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: token_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: token_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: treasury_approval_workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treasury_approval_workflows ENABLE ROW LEVEL SECURITY;

--
-- Name: treasury_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treasury_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: treasury_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.treasury_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: forum_user_mutes user_mutes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_mutes_insert ON public.forum_user_mutes FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pod_role_permissions prp
  WHERE ((((prp.permissions ->> 'forumModeration'::text))::boolean = true) AND (prp.is_active = true)))));


--
-- Name: forum_user_mutes user_mutes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_mutes_select ON public.forum_user_mutes FOR SELECT USING (true);


--
-- Name: user_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: user_wallet_link_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_wallet_link_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: user_wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_access_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_pending_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_pending_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_rotation_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_rotation_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_user_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_user_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: vault_wrapped_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vault_wrapped_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: video_call_sessions vcs_insert_initiator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vcs_insert_initiator ON public.video_call_sessions FOR INSERT TO authenticated WITH CHECK ((lower((initiator_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: video_call_sessions vcs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vcs_select_own ON public.video_call_sessions FOR SELECT TO authenticated USING (((lower((initiator_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)) OR (lower((recipient_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: video_call_sessions vcs_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vcs_update_participant ON public.video_call_sessions FOR UPDATE TO authenticated USING (((lower((initiator_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)) OR (lower((recipient_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: video_call_signaling vcsi_insert_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vcsi_insert_participant ON public.video_call_signaling FOR INSERT TO authenticated WITH CHECK ((lower((from_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)));


--
-- Name: video_call_signaling vcsi_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vcsi_select_own ON public.video_call_signaling FOR SELECT TO authenticated USING (((lower((to_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1)) OR (lower((from_wallet)::text) = ( SELECT lower(user_profiles.wallet_address) AS lower
   FROM public.user_profiles
  WHERE (user_profiles.user_id = auth.uid())
 LIMIT 1))));


--
-- Name: video_call_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_call_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: video_call_signaling; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_call_signaling ENABLE ROW LEVEL SECURITY;

--
-- Name: wallet_link_nonces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_link_nonces ENABLE ROW LEVEL SECURITY;

--
-- Name: work_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO community_agent;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;


--
-- Name: FUNCTION accountability_signature_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accountability_signature_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.accountability_signature_guard() TO service_role;


--
-- Name: TABLE pod_deletion_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_deletion_proposals TO authenticated;
GRANT ALL ON TABLE public.pod_deletion_proposals TO service_role;


--
-- Name: FUNCTION add_pod_deletion_approval(proposal_id uuid, approver_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.add_pod_deletion_approval(proposal_id uuid, approver_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_pod_deletion_approval(proposal_id uuid, approver_address text) TO service_role;
GRANT ALL ON FUNCTION public.add_pod_deletion_approval(proposal_id uuid, approver_address text) TO authenticated;


--
-- Name: FUNCTION auto_generate_referral_key(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auto_generate_referral_key() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auto_generate_referral_key() TO service_role;


--
-- Name: FUNCTION award_course_accreditation(p_category_id uuid, p_wallet text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.award_course_accreditation(p_category_id uuid, p_wallet text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_course_accreditation(p_category_id uuid, p_wallet text) TO service_role;


--
-- Name: FUNCTION bids_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bids_guard() TO service_role;


--
-- Name: FUNCTION bounties_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bounties_guard() TO service_role;


--
-- Name: FUNCTION bounty_approval_workflows_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bounty_approval_workflows_guard() TO service_role;


--
-- Name: FUNCTION bounty_bid_allowed(p_bounty_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bounty_bid_allowed(p_bounty_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bounty_bid_allowed(p_bounty_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.bounty_bid_allowed(p_bounty_id uuid) TO authenticated;


--
-- Name: FUNCTION can_fulfill_order(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_fulfill_order(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_fulfill_order(p_order_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_fulfill_order(p_order_id uuid) TO authenticated;


--
-- Name: FUNCTION can_moderate_chat_group(p_chat_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_moderate_chat_group(p_chat_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_moderate_chat_group(p_chat_group_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_moderate_chat_group(p_chat_group_id uuid) TO authenticated;


--
-- Name: FUNCTION can_post_in_category(category_id uuid, user_tokens text[], user_hats text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_post_in_category(category_id uuid, user_tokens text[], user_hats text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_post_in_category(category_id uuid, user_tokens text[], user_hats text[]) TO service_role;


--
-- Name: FUNCTION can_user_register_for_event(event_uuid uuid, user_wallet_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_user_register_for_event(event_uuid uuid, user_wallet_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_user_register_for_event(event_uuid uuid, user_wallet_address text) TO service_role;
GRANT ALL ON FUNCTION public.can_user_register_for_event(event_uuid uuid, user_wallet_address text) TO authenticated;


--
-- Name: FUNCTION can_vote_on_pod_proposal(p_proposal_id uuid, p_wallet text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_vote_on_pod_proposal(p_proposal_id uuid, p_wallet text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_vote_on_pod_proposal(p_proposal_id uuid, p_wallet text) TO service_role;
GRANT ALL ON FUNCTION public.can_vote_on_pod_proposal(p_proposal_id uuid, p_wallet text) TO authenticated;


--
-- Name: FUNCTION changed_columns(o jsonb, n jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.changed_columns(o jsonb, n jsonb) TO service_role;


--
-- Name: FUNCTION check_bounty_access(p_bounty_id uuid, p_user_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_bounty_access(p_bounty_id uuid, p_user_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_bounty_access(p_bounty_id uuid, p_user_address text) TO service_role;


--
-- Name: FUNCTION check_burn_approval_threshold(burn_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_burn_approval_threshold(burn_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_burn_approval_threshold(burn_uuid uuid) TO service_role;


--
-- Name: FUNCTION check_donation_approval_threshold(donation_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_donation_approval_threshold(donation_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_donation_approval_threshold(donation_uuid uuid) TO service_role;


--
-- Name: FUNCTION check_pod_permission(p_user_wallet text, p_pod_id uuid, p_permission_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_pod_permission(p_user_wallet text, p_pod_id uuid, p_permission_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_pod_permission(p_user_wallet text, p_pod_id uuid, p_permission_key text) TO service_role;
GRANT ALL ON FUNCTION public.check_pod_permission(p_user_wallet text, p_pod_id uuid, p_permission_key text) TO authenticated;


--
-- Name: FUNCTION claim_course_accreditation(p_category_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_course_accreditation(p_category_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_course_accreditation(p_category_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.claim_course_accreditation(p_category_id uuid) TO authenticated;


--
-- Name: FUNCTION cleanup_conference_stale_data(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_conference_stale_data() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_conference_stale_data() TO service_role;


--
-- Name: FUNCTION cleanup_old_drafts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_old_drafts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_old_drafts() TO service_role;


--
-- Name: FUNCTION cleanup_old_hat_images(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_old_hat_images() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_old_hat_images() TO service_role;


--
-- Name: FUNCTION cleanup_stale_video_signals(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_stale_video_signals() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_stale_video_signals() TO service_role;


--
-- Name: FUNCTION course_is_complete(p_category_id uuid, p_wallet text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.course_is_complete(p_category_id uuid, p_wallet text) TO service_role;


--
-- Name: FUNCTION create_pod_forum_category(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_pod_forum_category() FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_pod_forum_category() TO service_role;


--
-- Name: FUNCTION create_pod_role_permissions_history(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_pod_role_permissions_history() FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_pod_role_permissions_history() TO service_role;


--
-- Name: FUNCTION create_proposal_metadata(p_onchain_proposal_id text, p_title text, p_description text, p_proposer_address text, p_forum_thread_id text, p_category text, p_tags text[], p_mentions jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_proposal_metadata(p_onchain_proposal_id text, p_title text, p_description text, p_proposer_address text, p_forum_thread_id text, p_category text, p_tags text[], p_mentions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_proposal_metadata(p_onchain_proposal_id text, p_title text, p_description text, p_proposer_address text, p_forum_thread_id text, p_category text, p_tags text[], p_mentions jsonb) TO service_role;


--
-- Name: FUNCTION custom_access_token_hook(event jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.custom_access_token_hook(event jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.custom_access_token_hook(event jsonb) TO service_role;
GRANT ALL ON FUNCTION public.custom_access_token_hook(event jsonb) TO supabase_auth_admin;


--
-- Name: FUNCTION enforce_leader_application_quorum(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_leader_application_quorum() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_leader_application_quorum() TO service_role;


--
-- Name: FUNCTION enforce_leader_invitation_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_leader_invitation_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_leader_invitation_status() TO service_role;


--
-- Name: FUNCTION enforce_notification_rate_limit(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_notification_rate_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_notification_rate_limit() TO service_role;


--
-- Name: FUNCTION enforce_pod_creator_sole_leader(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_pod_creator_sole_leader() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_pod_creator_sole_leader() TO service_role;


--
-- Name: FUNCTION enforce_pod_governance_config_authority(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_pod_governance_config_authority() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_pod_governance_config_authority() TO service_role;


--
-- Name: FUNCTION enforce_pod_leads_authority(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_pod_leads_authority() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_pod_leads_authority() TO service_role;


--
-- Name: FUNCTION event_registrations_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.event_registrations_guard() TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;
GRANT SELECT,INSERT ON TABLE public.events TO community_agent;


--
-- Name: FUNCTION events_accessible_by_identity(user_tokens text[], user_hats text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.events_accessible_by_identity(user_tokens text[], user_hats text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.events_accessible_by_identity(user_tokens text[], user_hats text[]) TO service_role;
GRANT ALL ON FUNCTION public.events_accessible_by_identity(user_tokens text[], user_hats text[]) TO authenticated;


--
-- Name: FUNCTION expire_old_deletion_proposals(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.expire_old_deletion_proposals() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_old_deletion_proposals() TO service_role;


--
-- Name: FUNCTION fn_queue_agent_mention(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_queue_agent_mention() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_queue_agent_mention() TO service_role;


--
-- Name: TABLE forum_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_categories TO authenticated;
GRANT ALL ON TABLE public.forum_categories TO service_role;
GRANT SELECT ON TABLE public.forum_categories TO community_agent;


--
-- Name: FUNCTION forums_accessible_by_identity(user_tokens text[], user_hats text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.forums_accessible_by_identity(user_tokens text[], user_hats text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.forums_accessible_by_identity(user_tokens text[], user_hats text[]) TO service_role;
GRANT ALL ON FUNCTION public.forums_accessible_by_identity(user_tokens text[], user_hats text[]) TO authenticated;


--
-- Name: FUNCTION freeze_pod_deletion_proposal_threshold(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.freeze_pod_deletion_proposal_threshold() FROM PUBLIC;
GRANT ALL ON FUNCTION public.freeze_pod_deletion_proposal_threshold() TO service_role;


--
-- Name: FUNCTION freeze_pod_level_proposal_thresholds(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.freeze_pod_level_proposal_thresholds() FROM PUBLIC;
GRANT ALL ON FUNCTION public.freeze_pod_level_proposal_thresholds() TO service_role;


--
-- Name: FUNCTION generate_referral_key(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generate_referral_key() FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_referral_key() TO service_role;


--
-- Name: FUNCTION get_accessible_bounties(p_user_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_accessible_bounties(p_user_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_accessible_bounties(p_user_address text) TO service_role;


--
-- Name: FUNCTION get_agent_by_session(p_session_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_agent_by_session(p_session_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_agent_by_session(p_session_key text) TO service_role;


--
-- Name: FUNCTION get_agent_tasks(p_agent_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_agent_tasks(p_agent_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_agent_tasks(p_agent_id uuid) TO service_role;


--
-- Name: FUNCTION get_bid_with_reviews(bid_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_bid_with_reviews(bid_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_bid_with_reviews(bid_uuid uuid) TO service_role;


--
-- Name: FUNCTION get_bounty_with_bid_count(bounty_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_bounty_with_bid_count(bounty_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_bounty_with_bid_count(bounty_uuid uuid) TO service_role;


--
-- Name: FUNCTION get_latest_agent_context(p_context_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_latest_agent_context(p_context_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_latest_agent_context(p_context_type text) TO service_role;


--
-- Name: FUNCTION get_order_buyer_contact(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_order_buyer_contact(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_order_buyer_contact(p_order_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.get_order_buyer_contact(p_order_id uuid) TO authenticated;


--
-- Name: FUNCTION get_pending_proposals(p_category text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_pending_proposals(p_category text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_pending_proposals(p_category text) TO service_role;


--
-- Name: FUNCTION get_pod_role_permissions(p_pod_id uuid, p_hat_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_pod_role_permissions(p_pod_id uuid, p_hat_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_pod_role_permissions(p_pod_id uuid, p_hat_id text) TO service_role;


--
-- Name: FUNCTION get_recent_activity(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_recent_activity(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_recent_activity(p_limit integer) TO service_role;


--
-- Name: FUNCTION get_undelivered_notifications(p_agent_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_undelivered_notifications(p_agent_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_undelivered_notifications(p_agent_id uuid) TO service_role;


--
-- Name: FUNCTION get_unread_governance_notification_count(user_address character varying); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_unread_governance_notification_count(user_address character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_unread_governance_notification_count(user_address character varying) TO service_role;


--
-- Name: FUNCTION get_unread_notification_count(user_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_unread_notification_count(user_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_unread_notification_count(user_address text) TO service_role;


--
-- Name: FUNCTION get_user_events(user_wallet_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_events(user_wallet_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_events(user_wallet_address text) TO service_role;
GRANT ALL ON FUNCTION public.get_user_events(user_wallet_address text) TO authenticated;


--
-- Name: FUNCTION get_user_forum_permissions(user_tokens text[], user_hats text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_forum_permissions(user_tokens text[], user_hats text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_forum_permissions(user_tokens text[], user_hats text[]) TO service_role;


--
-- Name: FUNCTION get_user_pod_forums(user_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_pod_forums(user_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_pod_forums(user_address text) TO service_role;


--
-- Name: FUNCTION get_user_registration(p_event_id uuid, p_user_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_registration(p_event_id uuid, p_user_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_registration(p_event_id uuid, p_user_address text) TO service_role;


--
-- Name: FUNCTION governance_votes_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.governance_votes_guard() TO service_role;


--
-- Name: FUNCTION has_admin_token(wallet_address text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_admin_token(wallet_address text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_admin_token(wallet_address text) TO service_role;
GRANT ALL ON FUNCTION public.has_admin_token(wallet_address text) TO authenticated;


--
-- Name: FUNCTION has_pod_permission_current_user(target_pod_id uuid, permission_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_pod_permission_current_user(target_pod_id uuid, permission_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_pod_permission_current_user(target_pod_id uuid, permission_key text) TO service_role;
GRANT ALL ON FUNCTION public.has_pod_permission_current_user(target_pod_id uuid, permission_key text) TO authenticated;


--
-- Name: FUNCTION hat_id_numeric(p text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.hat_id_numeric(p text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hat_id_numeric(p text) TO service_role;
GRANT ALL ON FUNCTION public.hat_id_numeric(p text) TO authenticated;


--
-- Name: FUNCTION increment_bids_accepted(bounty_id_param uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_bids_accepted(bounty_id_param uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_bids_accepted(bounty_id_param uuid) TO service_role;
GRANT ALL ON FUNCTION public.increment_bids_accepted(bounty_id_param uuid) TO authenticated;


--
-- Name: FUNCTION increment_knowledge_view(item_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_knowledge_view(item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_knowledge_view(item_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.increment_knowledge_view(item_id uuid) TO authenticated;


--
-- Name: FUNCTION increment_thread_view_count(tid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_thread_view_count(tid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_thread_view_count(tid uuid) TO service_role;


--
-- Name: FUNCTION is_agent_wallet(addr text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_agent_wallet(addr text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_agent_wallet(addr text) TO service_role;


--
-- Name: FUNCTION is_bounty_manager(p_bounty_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_bounty_manager(p_bounty_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_bounty_manager(p_bounty_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_bounty_manager(p_bounty_id uuid) TO authenticated;


--
-- Name: FUNCTION is_current_user_wallet(target_wallet text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_current_user_wallet(target_wallet text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_current_user_wallet(target_wallet text) TO service_role;
GRANT ALL ON FUNCTION public.is_current_user_wallet(target_wallet text) TO authenticated;


--
-- Name: FUNCTION is_eligible_pod_voter(p_pod_id uuid, p_tier text, p_wallet text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_eligible_pod_voter(p_pod_id uuid, p_tier text, p_wallet text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_eligible_pod_voter(p_pod_id uuid, p_tier text, p_wallet text) TO service_role;
GRANT ALL ON FUNCTION public.is_eligible_pod_voter(p_pod_id uuid, p_tier text, p_wallet text) TO authenticated;


--
-- Name: FUNCTION is_event_organizer(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_event_organizer(p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_event_organizer(p_event_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_event_organizer(p_event_id uuid) TO authenticated;


--
-- Name: FUNCTION is_forum_moderator(user_hat_ids text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_forum_moderator(user_hat_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_forum_moderator(user_hat_ids text[]) TO service_role;


--
-- Name: FUNCTION is_my_wallet(target text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_my_wallet(target text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_my_wallet(target text) TO service_role;
GRANT ALL ON FUNCTION public.is_my_wallet(target text) TO authenticated;


--
-- Name: FUNCTION is_pod_leader_current_user(target_pod_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_pod_leader_current_user(target_pod_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_pod_leader_current_user(target_pod_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_pod_leader_current_user(target_pod_id uuid) TO authenticated;


--
-- Name: FUNCTION is_pod_member_current_user(p_pod_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_pod_member_current_user(p_pod_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_pod_member_current_user(p_pod_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.is_pod_member_current_user(p_pod_id uuid) TO authenticated;


--
-- Name: FUNCTION is_safe_app_path(p text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_safe_app_path(p text) TO service_role;


--
-- Name: FUNCTION is_user_muted_in_chat(p_chat_group_id uuid, p_user_wallet text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_user_muted_in_chat(p_chat_group_id uuid, p_user_wallet text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_user_muted_in_chat(p_chat_group_id uuid, p_user_wallet text) TO service_role;


--
-- Name: FUNCTION jwt_agent_wallet(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.jwt_agent_wallet() FROM PUBLIC;
GRANT ALL ON FUNCTION public.jwt_agent_wallet() TO service_role;
GRANT ALL ON FUNCTION public.jwt_agent_wallet() TO authenticated;
GRANT ALL ON FUNCTION public.jwt_agent_wallet() TO community_agent;


--
-- Name: FUNCTION jwt_is_enabled_agent(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.jwt_is_enabled_agent() FROM PUBLIC;
GRANT ALL ON FUNCTION public.jwt_is_enabled_agent() TO service_role;
GRANT ALL ON FUNCTION public.jwt_is_enabled_agent() TO authenticated;
GRANT ALL ON FUNCTION public.jwt_is_enabled_agent() TO community_agent;


--
-- Name: FUNCTION lc_address_column(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lc_address_column() FROM PUBLIC;
GRANT ALL ON FUNCTION public.lc_address_column() TO service_role;


--
-- Name: FUNCTION lc_pods_addresses(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.lc_pods_addresses() FROM PUBLIC;
GRANT ALL ON FUNCTION public.lc_pods_addresses() TO service_role;


--
-- Name: FUNCTION log_governance_vote_jwt(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_governance_vote_jwt() FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_governance_vote_jwt() TO service_role;


--
-- Name: FUNCTION log_moderation_action(p_chat_group_id uuid, p_action text, p_message_id uuid, p_target_user_wallet text, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_moderation_action(p_chat_group_id uuid, p_action text, p_message_id uuid, p_target_user_wallet text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_moderation_action(p_chat_group_id uuid, p_action text, p_message_id uuid, p_target_user_wallet text, p_reason text) TO service_role;


--
-- Name: FUNCTION mark_all_governance_notifications_read(user_address character varying); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_all_governance_notifications_read(user_address character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_all_governance_notifications_read(user_address character varying) TO service_role;


--
-- Name: FUNCTION mark_notifications_as_read(user_address text, notification_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_notifications_as_read(user_address text, notification_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_notifications_as_read(user_address text, notification_ids uuid[]) TO service_role;


--
-- Name: FUNCTION mark_summary_stale(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_summary_stale() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_summary_stale() TO service_role;


--
-- Name: FUNCTION mark_task_completed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_task_completed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_task_completed() TO service_role;


--
-- Name: FUNCTION marketplace_orders_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marketplace_orders_guard() TO service_role;


--
-- Name: FUNCTION milestones_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.milestones_guard() TO service_role;


--
-- Name: FUNCTION normalize_chat_addresses(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.normalize_chat_addresses() FROM PUBLIC;
GRANT ALL ON FUNCTION public.normalize_chat_addresses() TO service_role;


--
-- Name: FUNCTION normalize_dm_block_addresses(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.normalize_dm_block_addresses() FROM PUBLIC;
GRANT ALL ON FUNCTION public.normalize_dm_block_addresses() TO service_role;


--
-- Name: FUNCTION pod_current_leaders(p_pod_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pod_current_leaders(p_pod_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pod_current_leaders(p_pod_id uuid) TO service_role;


--
-- Name: FUNCTION pod_deletion_authorized(p_pod_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pod_deletion_authorized(p_pod_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pod_deletion_authorized(p_pod_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.pod_deletion_authorized(p_pod_id uuid) TO authenticated;


--
-- Name: FUNCTION pod_deletion_proposals_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pod_deletion_proposals_guard() TO service_role;


--
-- Name: FUNCTION pod_deletion_valid_approvals(p_proposal_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pod_deletion_valid_approvals(p_proposal_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pod_deletion_valid_approvals(p_proposal_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.pod_deletion_valid_approvals(p_proposal_id uuid) TO authenticated;


--
-- Name: FUNCTION pod_level_proposals_insert_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pod_level_proposals_insert_guard() TO service_role;


--
-- Name: FUNCTION pod_members_authority_guard(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pod_members_authority_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pod_members_authority_guard() TO service_role;


--
-- Name: FUNCTION pod_membership_applications_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pod_membership_applications_guard() TO service_role;


--
-- Name: FUNCTION pod_tier_setting(p_pod_id uuid, p_tier text, p_key text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pod_tier_setting(p_pod_id uuid, p_tier text, p_key text) TO service_role;


--
-- Name: FUNCTION pulse_log_bid_placed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_bid_placed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_bid_placed() TO service_role;


--
-- Name: FUNCTION pulse_log_bid_review(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_bid_review() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_bid_review() TO service_role;


--
-- Name: FUNCTION pulse_log_bid_status_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_bid_status_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_bid_status_change() TO service_role;


--
-- Name: FUNCTION pulse_log_bounty_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_bounty_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_bounty_created() TO service_role;


--
-- Name: FUNCTION pulse_log_chat_channel_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_chat_channel_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_chat_channel_created() TO service_role;


--
-- Name: FUNCTION pulse_log_dao_proposal_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_dao_proposal_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_dao_proposal_created() TO service_role;


--
-- Name: FUNCTION pulse_log_dispute_mediator_assigned(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_dispute_mediator_assigned() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_dispute_mediator_assigned() TO service_role;


--
-- Name: FUNCTION pulse_log_event_escrow_held(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_event_escrow_held() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_event_escrow_held() TO service_role;


--
-- Name: FUNCTION pulse_log_event_escrow_released(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_event_escrow_released() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_event_escrow_released() TO service_role;


--
-- Name: FUNCTION pulse_log_event_rsvp(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_event_rsvp() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_event_rsvp() TO service_role;


--
-- Name: FUNCTION pulse_log_event_tokens_distributed(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_event_tokens_distributed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_event_tokens_distributed() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_moderator_action(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_moderator_action() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_moderator_action() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_poll_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_poll_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_poll_created() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_poll_voted(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_poll_voted() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_poll_voted() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_post_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_post_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_post_created() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_post_reaction(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_post_reaction() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_post_reaction() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_thread_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_thread_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_thread_created() TO service_role;


--
-- Name: FUNCTION pulse_log_forum_thread_summary(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_forum_thread_summary() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_forum_thread_summary() TO service_role;


--
-- Name: FUNCTION pulse_log_knowledge_item_insert(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_knowledge_item_insert() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_knowledge_item_insert() TO service_role;


--
-- Name: FUNCTION pulse_log_knowledge_item_update(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_knowledge_item_update() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_knowledge_item_update() TO service_role;


--
-- Name: FUNCTION pulse_log_marketplace_listing_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_marketplace_listing_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_marketplace_listing_created() TO service_role;


--
-- Name: FUNCTION pulse_log_marketplace_listing_updated(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_marketplace_listing_updated() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_marketplace_listing_updated() TO service_role;


--
-- Name: FUNCTION pulse_log_marketplace_order_status_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_marketplace_order_status_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_marketplace_order_status_change() TO service_role;


--
-- Name: FUNCTION pulse_log_milestone_reached(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_milestone_reached() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_milestone_reached() TO service_role;


--
-- Name: FUNCTION pulse_log_pod_level_proposal_created(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_pod_level_proposal_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_pod_level_proposal_created() TO service_role;


--
-- Name: FUNCTION pulse_log_pod_member_applied(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_pod_member_applied() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_pod_member_applied() TO service_role;


--
-- Name: FUNCTION pulse_log_pod_member_status_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_pod_member_status_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_pod_member_status_change() TO service_role;


--
-- Name: FUNCTION pulse_log_profile_updated(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pulse_log_profile_updated() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pulse_log_profile_updated() TO service_role;


--
-- Name: FUNCTION rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) TO service_role;


--
-- Name: FUNCTION search_forum_threads(search_query text, cat_id uuid, result_limit integer, result_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_forum_threads(search_query text, cat_id uuid, result_limit integer, result_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_forum_threads(search_query text, cat_id uuid, result_limit integer, result_offset integer) TO service_role;


--
-- Name: FUNCTION session_leads_pod(p_pod_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.session_leads_pod(p_pod_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_leads_pod(p_pod_id uuid) TO service_role;


--
-- Name: FUNCTION session_wallet(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.session_wallet() FROM PUBLIC;
GRANT ALL ON FUNCTION public.session_wallet() TO service_role;
GRANT ALL ON FUNCTION public.session_wallet() TO authenticated;


--
-- Name: FUNCTION set_conference_room_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_conference_room_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_conference_room_updated_at() TO service_role;


--
-- Name: FUNCTION set_hand_raised_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_hand_raised_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_hand_raised_at() TO service_role;


--
-- Name: FUNCTION shares_active_pod_with_current_user(p_wallet text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.shares_active_pod_with_current_user(p_wallet text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.shares_active_pod_with_current_user(p_wallet text) TO service_role;
GRANT ALL ON FUNCTION public.shares_active_pod_with_current_user(p_wallet text) TO authenticated;


--
-- Name: FUNCTION stamp_explorer_actor_type(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stamp_explorer_actor_type() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_explorer_actor_type() TO service_role;


--
-- Name: FUNCTION strip_html_tags(input text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.strip_html_tags(input text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.strip_html_tags(input text) TO service_role;
GRANT ALL ON FUNCTION public.strip_html_tags(input text) TO community_agent;


--
-- Name: FUNCTION touch_member_locations_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_member_locations_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_member_locations_updated_at() TO service_role;


--
-- Name: FUNCTION touch_pod_places_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_pod_places_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_pod_places_updated_at() TO service_role;


--
-- Name: FUNCTION treasury_transactions_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.treasury_transactions_guard() TO service_role;


--
-- Name: FUNCTION trg_award_on_item_completion(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_award_on_item_completion() TO service_role;


--
-- Name: FUNCTION trigger_update_pod_member_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trigger_update_pod_member_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trigger_update_pod_member_counts() TO service_role;


--
-- Name: FUNCTION update_dispute_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_dispute_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_dispute_updated_at() TO service_role;


--
-- Name: FUNCTION update_governance_notifications_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_governance_notifications_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_governance_notifications_updated_at() TO service_role;


--
-- Name: FUNCTION update_governance_proposal_votes_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_governance_proposal_votes_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_governance_proposal_votes_updated_at() TO service_role;


--
-- Name: FUNCTION update_hat_metadata_cache_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_hat_metadata_cache_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_hat_metadata_cache_updated_at() TO service_role;


--
-- Name: FUNCTION update_notification_preferences_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_notification_preferences_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_notification_preferences_updated_at() TO service_role;


--
-- Name: FUNCTION update_pod_member_counts(target_pod_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_pod_member_counts(target_pod_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_pod_member_counts(target_pod_id uuid) TO service_role;


--
-- Name: FUNCTION update_pod_modules_timestamp(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_pod_modules_timestamp() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_pod_modules_timestamp() TO service_role;


--
-- Name: FUNCTION update_pod_role_permissions_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_pod_role_permissions_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_pod_role_permissions_updated_at() TO service_role;


--
-- Name: FUNCTION update_system_supply(amount numeric, operation text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_system_supply(amount numeric, operation text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_system_supply(amount numeric, operation text) TO service_role;


--
-- Name: FUNCTION update_task_timestamp(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_task_timestamp() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_task_timestamp() TO service_role;


--
-- Name: FUNCTION update_thread_reply_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_thread_reply_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_thread_reply_stats() TO service_role;


--
-- Name: FUNCTION update_thread_search_vector(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_thread_search_vector() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_thread_search_vector() TO service_role;


--
-- Name: FUNCTION update_treasury_transactions_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_treasury_transactions_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_treasury_transactions_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_work_submissions_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_work_submissions_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_work_submissions_updated_at() TO service_role;


--
-- Name: FUNCTION wallets_same_member(a text, b text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wallets_same_member(a text, b text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wallets_same_member(a text, b text) TO service_role;
GRANT ALL ON FUNCTION public.wallets_same_member(a text, b text) TO authenticated;


--
-- Name: TABLE _postgrest_cache_breaker; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._postgrest_cache_breaker TO service_role;


--
-- Name: TABLE account_deletion_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_deletion_requests TO authenticated;
GRANT ALL ON TABLE public.account_deletion_requests TO service_role;


--
-- Name: TABLE accreditations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accreditations TO authenticated;
GRANT ALL ON TABLE public.accreditations TO service_role;


--
-- Name: TABLE governance_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.governance_notifications TO authenticated;
GRANT ALL ON TABLE public.governance_notifications TO service_role;


--
-- Name: TABLE proposal_metadata; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposal_metadata TO authenticated;
GRANT ALL ON TABLE public.proposal_metadata TO service_role;


--
-- Name: TABLE actionable_governance_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.actionable_governance_notifications TO service_role;


--
-- Name: TABLE pod_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_members TO authenticated;
GRANT ALL ON TABLE public.pod_members TO service_role;


--
-- Name: TABLE pods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pods TO authenticated;
GRANT ALL ON TABLE public.pods TO service_role;


--
-- Name: TABLE active_pod_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.active_pod_members TO service_role;
GRANT SELECT ON TABLE public.active_pod_members TO authenticated;


--
-- Name: TABLE activities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activities TO authenticated;
GRANT ALL ON TABLE public.activities TO service_role;


--
-- Name: TABLE admin_token_definitions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_token_definitions TO authenticated;
GRANT ALL ON TABLE public.admin_token_definitions TO service_role;


--
-- Name: SEQUENCE admin_token_definitions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.admin_token_definitions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.admin_token_definitions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.admin_token_definitions_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.admin_token_definitions_id_seq TO community_agent;


--
-- Name: TABLE agent_context; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_context TO authenticated;
GRANT ALL ON TABLE public.agent_context TO service_role;


--
-- Name: TABLE agent_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_conversations TO authenticated;
GRANT ALL ON TABLE public.agent_conversations TO service_role;


--
-- Name: TABLE agent_memory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_memory TO authenticated;
GRANT ALL ON TABLE public.agent_memory TO service_role;


--
-- Name: TABLE agent_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_proposals TO authenticated;
GRANT ALL ON TABLE public.agent_proposals TO service_role;


--
-- Name: TABLE agent_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_runs TO authenticated;
GRANT ALL ON TABLE public.agent_runs TO service_role;


--
-- Name: TABLE approval_signatures_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.approval_signatures_audit TO authenticated;
GRANT ALL ON TABLE public.approval_signatures_audit TO service_role;


--
-- Name: TABLE bid_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bid_reviews TO authenticated;
GRANT ALL ON TABLE public.bid_reviews TO service_role;


--
-- Name: TABLE bid_state_updates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bid_state_updates TO authenticated;
GRANT ALL ON TABLE public.bid_state_updates TO service_role;


--
-- Name: TABLE bids; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bids TO authenticated;
GRANT ALL ON TABLE public.bids TO service_role;


--
-- Name: TABLE bounties; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounties TO authenticated;
GRANT ALL ON TABLE public.bounties TO service_role;


--
-- Name: TABLE bounty_token_gates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_token_gates TO authenticated;
GRANT ALL ON TABLE public.bounty_token_gates TO service_role;


--
-- Name: TABLE bounty_access_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_access_view TO service_role;


--
-- Name: TABLE bounty_approval_workflows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_approval_workflows TO authenticated;
GRANT ALL ON TABLE public.bounty_approval_workflows TO service_role;


--
-- Name: TABLE bounty_disputes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_disputes TO authenticated;
GRANT ALL ON TABLE public.bounty_disputes TO service_role;


--
-- Name: TABLE bounty_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_invites TO authenticated;
GRANT ALL ON TABLE public.bounty_invites TO service_role;


--
-- Name: TABLE bounty_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_notifications TO authenticated;
GRANT ALL ON TABLE public.bounty_notifications TO service_role;


--
-- Name: TABLE bounty_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bounty_stats TO service_role;


--
-- Name: TABLE burn_approvals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.burn_approvals TO authenticated;
GRANT ALL ON TABLE public.burn_approvals TO service_role;


--
-- Name: TABLE burn_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.burn_requests TO authenticated;
GRANT ALL ON TABLE public.burn_requests TO service_role;


--
-- Name: TABLE chat_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_groups TO authenticated;
GRANT ALL ON TABLE public.chat_groups TO service_role;
GRANT SELECT ON TABLE public.chat_groups TO community_agent;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;
GRANT SELECT,INSERT ON TABLE public.chat_messages TO community_agent;


--
-- Name: TABLE chat_moderation_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_moderation_log TO authenticated;
GRANT ALL ON TABLE public.chat_moderation_log TO service_role;


--
-- Name: TABLE chat_muted_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_muted_users TO authenticated;
GRANT ALL ON TABLE public.chat_muted_users TO service_role;


--
-- Name: TABLE community_agent_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_agent_posts TO authenticated;
GRANT ALL ON TABLE public.community_agent_posts TO service_role;
GRANT SELECT,INSERT ON TABLE public.community_agent_posts TO community_agent;


--
-- Name: TABLE community_agent_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_agent_queue TO authenticated;
GRANT ALL ON TABLE public.community_agent_queue TO service_role;


--
-- Name: TABLE community_agent_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_agent_subscriptions TO authenticated;
GRANT ALL ON TABLE public.community_agent_subscriptions TO service_role;


--
-- Name: TABLE conference_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conference_participants TO authenticated;
GRANT ALL ON TABLE public.conference_participants TO service_role;


--
-- Name: TABLE conference_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conference_reactions TO authenticated;
GRANT ALL ON TABLE public.conference_reactions TO service_role;


--
-- Name: TABLE conference_rooms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conference_rooms TO authenticated;
GRANT ALL ON TABLE public.conference_rooms TO service_role;


--
-- Name: TABLE dispute_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispute_comments TO authenticated;
GRANT ALL ON TABLE public.dispute_comments TO service_role;


--
-- Name: TABLE dispute_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispute_evidence TO authenticated;
GRANT ALL ON TABLE public.dispute_evidence TO service_role;


--
-- Name: TABLE dispute_mediators; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispute_mediators TO authenticated;
GRANT ALL ON TABLE public.dispute_mediators TO service_role;


--
-- Name: TABLE dispute_resolutions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispute_resolutions TO authenticated;
GRANT ALL ON TABLE public.dispute_resolutions TO service_role;


--
-- Name: TABLE dm_blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dm_blocks TO authenticated;
GRANT ALL ON TABLE public.dm_blocks TO service_role;


--
-- Name: TABLE donation_approvals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.donation_approvals TO authenticated;
GRANT ALL ON TABLE public.donation_approvals TO service_role;


--
-- Name: TABLE email_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_invites TO authenticated;
GRANT ALL ON TABLE public.email_invites TO service_role;


--
-- Name: TABLE event_agendas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_agendas TO authenticated;
GRANT ALL ON TABLE public.event_agendas TO service_role;


--
-- Name: TABLE event_approval_workflows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_approval_workflows TO authenticated;
GRANT ALL ON TABLE public.event_approval_workflows TO service_role;


--
-- Name: TABLE event_escrow; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_escrow TO authenticated;
GRANT ALL ON TABLE public.event_escrow TO service_role;


--
-- Name: TABLE event_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_notifications TO authenticated;
GRANT ALL ON TABLE public.event_notifications TO service_role;


--
-- Name: TABLE event_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_registrations TO authenticated;
GRANT ALL ON TABLE public.event_registrations TO service_role;


--
-- Name: TABLE event_required_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_required_tokens TO authenticated;
GRANT ALL ON TABLE public.event_required_tokens TO service_role;


--
-- Name: TABLE event_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_stats TO service_role;


--
-- Name: TABLE event_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_tokens TO authenticated;
GRANT ALL ON TABLE public.event_tokens TO service_role;


--
-- Name: TABLE events_with_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events_with_stats TO service_role;
GRANT SELECT ON TABLE public.events_with_stats TO authenticated;


--
-- Name: TABLE explorer_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.explorer_events TO authenticated;
GRANT ALL ON TABLE public.explorer_events TO service_role;


--
-- Name: TABLE forum_bookmarks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_bookmarks TO authenticated;
GRANT ALL ON TABLE public.forum_bookmarks TO service_role;


--
-- Name: TABLE forum_category_required_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_category_required_tokens TO authenticated;
GRANT ALL ON TABLE public.forum_category_required_tokens TO service_role;


--
-- Name: TABLE forum_featured_content; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_featured_content TO authenticated;
GRANT ALL ON TABLE public.forum_featured_content TO service_role;


--
-- Name: TABLE forum_media_attachments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_media_attachments TO authenticated;
GRANT ALL ON TABLE public.forum_media_attachments TO service_role;


--
-- Name: TABLE forum_moderator_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_moderator_actions TO authenticated;
GRANT ALL ON TABLE public.forum_moderator_actions TO service_role;


--
-- Name: TABLE forum_poll_options; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_poll_options TO authenticated;
GRANT ALL ON TABLE public.forum_poll_options TO service_role;


--
-- Name: TABLE forum_poll_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_poll_votes TO authenticated;
GRANT ALL ON TABLE public.forum_poll_votes TO service_role;


--
-- Name: TABLE forum_poll_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_poll_results TO service_role;


--
-- Name: TABLE forum_polls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_polls TO authenticated;
GRANT ALL ON TABLE public.forum_polls TO service_role;


--
-- Name: TABLE forum_post_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_post_reactions TO authenticated;
GRANT ALL ON TABLE public.forum_post_reactions TO service_role;


--
-- Name: TABLE forum_post_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_post_reports TO authenticated;
GRANT ALL ON TABLE public.forum_post_reports TO service_role;


--
-- Name: TABLE forum_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_posts TO authenticated;
GRANT ALL ON TABLE public.forum_posts TO service_role;
GRANT SELECT,INSERT ON TABLE public.forum_posts TO community_agent;


--
-- Name: TABLE forum_proposal_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_proposal_links TO authenticated;
GRANT ALL ON TABLE public.forum_proposal_links TO service_role;


--
-- Name: TABLE forum_reaction_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_reaction_counts TO service_role;


--
-- Name: TABLE forum_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_templates TO authenticated;
GRANT ALL ON TABLE public.forum_templates TO service_role;


--
-- Name: TABLE forum_thread_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_thread_drafts TO authenticated;
GRANT ALL ON TABLE public.forum_thread_drafts TO service_role;


--
-- Name: TABLE forum_thread_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_thread_reads TO authenticated;
GRANT ALL ON TABLE public.forum_thread_reads TO service_role;


--
-- Name: TABLE forum_thread_summaries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_thread_summaries TO authenticated;
GRANT ALL ON TABLE public.forum_thread_summaries TO service_role;


--
-- Name: TABLE forum_thread_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_thread_tags TO authenticated;
GRANT ALL ON TABLE public.forum_thread_tags TO service_role;


--
-- Name: TABLE forum_threads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_threads TO authenticated;
GRANT ALL ON TABLE public.forum_threads TO service_role;
GRANT SELECT,INSERT ON TABLE public.forum_threads TO community_agent;


--
-- Name: TABLE forum_user_mutes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.forum_user_mutes TO authenticated;
GRANT ALL ON TABLE public.forum_user_mutes TO service_role;


--
-- Name: TABLE general_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.general_notifications TO authenticated;
GRANT ALL ON TABLE public.general_notifications TO service_role;


--
-- Name: TABLE gifts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gifts TO authenticated;
GRANT ALL ON TABLE public.gifts TO service_role;


--
-- Name: TABLE governance_proposal_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.governance_proposal_votes TO authenticated;
GRANT ALL ON TABLE public.governance_proposal_votes TO service_role;


--
-- Name: TABLE governance_user_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.governance_user_votes TO authenticated;
GRANT ALL ON TABLE public.governance_user_votes TO service_role;


--
-- Name: TABLE governance_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.governance_votes TO authenticated;
GRANT ALL ON TABLE public.governance_votes TO service_role;


--
-- Name: TABLE governance_votes_jwt_debug; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.governance_votes_jwt_debug TO authenticated;
GRANT ALL ON TABLE public.governance_votes_jwt_debug TO service_role;


--
-- Name: SEQUENCE governance_votes_jwt_debug_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.governance_votes_jwt_debug_id_seq TO anon;
GRANT ALL ON SEQUENCE public.governance_votes_jwt_debug_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.governance_votes_jwt_debug_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.governance_votes_jwt_debug_id_seq TO community_agent;


--
-- Name: TABLE hat_metadata_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hat_metadata_cache TO authenticated;
GRANT ALL ON TABLE public.hat_metadata_cache TO service_role;


--
-- Name: TABLE hats_module_deployments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hats_module_deployments TO authenticated;
GRANT ALL ON TABLE public.hats_module_deployments TO service_role;


--
-- Name: TABLE knowledge_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_categories TO authenticated;
GRANT ALL ON TABLE public.knowledge_categories TO service_role;


--
-- Name: TABLE knowledge_item_views; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_item_views TO authenticated;
GRANT ALL ON TABLE public.knowledge_item_views TO service_role;


--
-- Name: TABLE knowledge_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_items TO authenticated;
GRANT ALL ON TABLE public.knowledge_items TO service_role;


--
-- Name: TABLE ledger_anchors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ledger_anchors TO authenticated;
GRANT ALL ON TABLE public.ledger_anchors TO service_role;


--
-- Name: TABLE marketplace_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketplace_orders TO authenticated;
GRANT ALL ON TABLE public.marketplace_orders TO service_role;


--
-- Name: TABLE member_locations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.member_locations TO authenticated;
GRANT ALL ON TABLE public.member_locations TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE milestones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.milestones TO authenticated;
GRANT ALL ON TABLE public.milestones TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE order_status_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_status_history TO authenticated;
GRANT ALL ON TABLE public.order_status_history TO service_role;


--
-- Name: TABLE pending_donations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pending_donations TO authenticated;
GRANT ALL ON TABLE public.pending_donations TO service_role;


--
-- Name: TABLE pod_accountability_signatures; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_accountability_signatures TO authenticated;
GRANT ALL ON TABLE public.pod_accountability_signatures TO service_role;


--
-- Name: TABLE pod_application_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_application_votes TO authenticated;
GRANT ALL ON TABLE public.pod_application_votes TO service_role;


--
-- Name: TABLE pod_approval_signatures; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_approval_signatures TO authenticated;
GRANT ALL ON TABLE public.pod_approval_signatures TO service_role;


--
-- Name: TABLE pod_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_audit_log TO authenticated;
GRANT ALL ON TABLE public.pod_audit_log TO service_role;


--
-- Name: TABLE pod_faces; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_faces TO authenticated;
GRANT ALL ON TABLE public.pod_faces TO service_role;


--
-- Name: TABLE pod_invite_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_invite_acceptances TO authenticated;
GRANT ALL ON TABLE public.pod_invite_acceptances TO service_role;


--
-- Name: TABLE pod_invite_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_invite_links TO authenticated;
GRANT ALL ON TABLE public.pod_invite_links TO service_role;


--
-- Name: TABLE pod_level_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_level_proposals TO authenticated;
GRANT ALL ON TABLE public.pod_level_proposals TO service_role;


--
-- Name: TABLE pod_member_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_member_counts TO authenticated;
GRANT ALL ON TABLE public.pod_member_counts TO service_role;


--
-- Name: TABLE pod_membership_applications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_membership_applications TO authenticated;
GRANT ALL ON TABLE public.pod_membership_applications TO service_role;


--
-- Name: TABLE pod_modules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_modules TO authenticated;
GRANT ALL ON TABLE public.pod_modules TO service_role;
GRANT SELECT ON TABLE public.pod_modules TO community_agent;


--
-- Name: TABLE pod_role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_role_permissions TO authenticated;
GRANT ALL ON TABLE public.pod_role_permissions TO service_role;


--
-- Name: TABLE pod_permission_lookup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_permission_lookup TO service_role;
GRANT SELECT ON TABLE public.pod_permission_lookup TO authenticated;


--
-- Name: TABLE pod_place_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_place_links TO authenticated;
GRANT ALL ON TABLE public.pod_place_links TO service_role;


--
-- Name: TABLE pod_places; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_places TO authenticated;
GRANT ALL ON TABLE public.pod_places TO service_role;


--
-- Name: TABLE pod_role_forum_access; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_role_forum_access TO service_role;


--
-- Name: TABLE pod_role_permissions_active; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_role_permissions_active TO service_role;


--
-- Name: TABLE pod_role_permissions_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_role_permissions_history TO authenticated;
GRANT ALL ON TABLE public.pod_role_permissions_history TO service_role;


--
-- Name: TABLE pod_self_budgets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_self_budgets TO authenticated;
GRANT ALL ON TABLE public.pod_self_budgets TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE proposal_eligibility_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposal_eligibility_snapshots TO authenticated;
GRANT ALL ON TABLE public.proposal_eligibility_snapshots TO service_role;


--
-- Name: TABLE proposal_onchain_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposal_onchain_status TO authenticated;
GRANT ALL ON TABLE public.proposal_onchain_status TO service_role;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;
GRANT SELECT ON TABLE public.user_profiles TO supabase_auth_admin;


--
-- Name: COLUMN user_profiles.wallet_address; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wallet_address) ON TABLE public.user_profiles TO community_agent;


--
-- Name: COLUMN user_profiles.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.user_profiles TO community_agent;


--
-- Name: TABLE public_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.public_profiles TO service_role;
GRANT SELECT ON TABLE public.public_profiles TO authenticated;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limits TO authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;


--
-- Name: TABLE referral_validations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referral_validations TO authenticated;
GRANT ALL ON TABLE public.referral_validations TO service_role;


--
-- Name: SEQUENCE referral_validations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.referral_validations_id_seq TO anon;
GRANT ALL ON SEQUENCE public.referral_validations_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.referral_validations_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.referral_validations_id_seq TO community_agent;


--
-- Name: TABLE relay_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relay_tasks TO authenticated;
GRANT ALL ON TABLE public.relay_tasks TO service_role;


--
-- Name: SEQUENCE relay_tasks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.relay_tasks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.relay_tasks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.relay_tasks_id_seq TO service_role;
GRANT SELECT,USAGE ON SEQUENCE public.relay_tasks_id_seq TO community_agent;


--
-- Name: TABLE role_permission_approvals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_permission_approvals TO authenticated;
GRANT ALL ON TABLE public.role_permission_approvals TO service_role;


--
-- Name: TABLE self_member_epoch_earned; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.self_member_epoch_earned TO authenticated;
GRANT ALL ON TABLE public.self_member_epoch_earned TO service_role;


--
-- Name: TABLE self_mint_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.self_mint_queue TO authenticated;
GRANT ALL ON TABLE public.self_mint_queue TO service_role;


--
-- Name: TABLE survey_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_answers TO authenticated;
GRANT ALL ON TABLE public.survey_answers TO service_role;


--
-- Name: TABLE survey_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_questions TO authenticated;
GRANT ALL ON TABLE public.survey_questions TO service_role;


--
-- Name: TABLE survey_responses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_responses TO authenticated;
GRANT ALL ON TABLE public.survey_responses TO service_role;


--
-- Name: TABLE surveys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.surveys TO authenticated;
GRANT ALL ON TABLE public.surveys TO service_role;


--
-- Name: TABLE system_supply_metadata; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_supply_metadata TO authenticated;
GRANT ALL ON TABLE public.system_supply_metadata TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE token_balances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.token_balances TO authenticated;
GRANT ALL ON TABLE public.token_balances TO service_role;


--
-- Name: TABLE token_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.token_claims TO authenticated;
GRANT ALL ON TABLE public.token_claims TO service_role;


--
-- Name: TABLE tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tokens TO authenticated;
GRANT ALL ON TABLE public.tokens TO service_role;


--
-- Name: TABLE treasury_approval_workflows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.treasury_approval_workflows TO authenticated;
GRANT ALL ON TABLE public.treasury_approval_workflows TO service_role;


--
-- Name: TABLE treasury_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.treasury_snapshots TO authenticated;
GRANT ALL ON TABLE public.treasury_snapshots TO service_role;


--
-- Name: TABLE treasury_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.treasury_transactions TO authenticated;
GRANT ALL ON TABLE public.treasury_transactions TO service_role;


--
-- Name: TABLE user_notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.user_notification_preferences TO service_role;


--
-- Name: TABLE user_presence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_presence TO authenticated;
GRANT ALL ON TABLE public.user_presence TO service_role;


--
-- Name: TABLE user_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_tokens TO authenticated;
GRANT ALL ON TABLE public.user_tokens TO service_role;


--
-- Name: TABLE user_wallet_link_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_wallet_link_codes TO authenticated;
GRANT ALL ON TABLE public.user_wallet_link_codes TO service_role;


--
-- Name: TABLE user_wallets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_wallets TO authenticated;
GRANT ALL ON TABLE public.user_wallets TO service_role;
GRANT SELECT ON TABLE public.user_wallets TO supabase_auth_admin;


--
-- Name: TABLE vault_access_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vault_access_log TO authenticated;
GRANT ALL ON TABLE public.vault_access_log TO service_role;


--
-- Name: TABLE vault_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vault_entries TO authenticated;
GRANT ALL ON TABLE public.vault_entries TO service_role;


--
-- Name: TABLE vault_pending_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vault_pending_grants TO authenticated;
GRANT ALL ON TABLE public.vault_pending_grants TO service_role;


--
-- Name: TABLE vault_rotation_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vault_rotation_jobs TO authenticated;
GRANT ALL ON TABLE public.vault_rotation_jobs TO service_role;


--
-- Name: TABLE vault_user_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vault_user_keys TO authenticated;
GRANT ALL ON TABLE public.vault_user_keys TO service_role;


--
-- Name: TABLE vault_wrapped_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vault_wrapped_keys TO authenticated;
GRANT ALL ON TABLE public.vault_wrapped_keys TO service_role;


--
-- Name: TABLE video_call_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.video_call_sessions TO authenticated;
GRANT ALL ON TABLE public.video_call_sessions TO service_role;


--
-- Name: TABLE video_call_signaling; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.video_call_signaling TO authenticated;
GRANT ALL ON TABLE public.video_call_signaling TO service_role;


--
-- Name: TABLE wallet_link_nonces; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wallet_link_nonces TO authenticated;
GRANT ALL ON TABLE public.wallet_link_nonces TO service_role;


--
-- Name: TABLE work_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_submissions TO authenticated;
GRANT ALL ON TABLE public.work_submissions TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

