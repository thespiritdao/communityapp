-- Enforce lowercase wallet/identity addresses at the DATABASE layer, so no app
-- write path (present or future) can reintroduce checksummed values — the root
-- cause of the case-sensitivity bug class (RLS_AUDIT_2026-08-08.md). Belt-and-
-- suspenders alongside app-side normalization: the DB is the last line and can't
-- be bypassed by a missed call site.
--
-- Only identity columns that feed RLS/permission comparisons are enforced.
-- Contract-address columns are left alone (checksums there are harmless and
-- some flows may rely on exact on-chain casing).

-- pods: pod_leads[] + created_by_address
create or replace function public.lc_pods_addresses()
returns trigger language plpgsql as $$
begin
  if new.created_by_address is not null then
    new.created_by_address := lower(new.created_by_address);
  end if;
  if new.pod_leads is not null then
    new.pod_leads := (select array_agg(lower(x)) from unnest(new.pod_leads) x);
  end if;
  return new;
end $$;
drop trigger if exists trg_lc_pods_addresses on public.pods;
create trigger trg_lc_pods_addresses
  before insert or update on public.pods
  for each row execute function public.lc_pods_addresses();

-- Generic single-column lowercaser, reused via trigger arguments.
create or replace function public.lc_address_column()
returns trigger language plpgsql as $$
declare
  col text := tg_argv[0];
  val text;
begin
  execute format('select ($1).%I', col) into val using new;
  if val is not null then
    new := new #= hstore(col, lower(val));
  end if;
  return new;
end $$;

-- hstore is needed by the generic helper above.
create extension if not exists hstore;

-- pod_role_permissions.created_by / updated_by
drop trigger if exists trg_lc_prp_created on public.pod_role_permissions;
create trigger trg_lc_prp_created
  before insert or update on public.pod_role_permissions
  for each row execute function public.lc_address_column('created_by');
drop trigger if exists trg_lc_prp_updated on public.pod_role_permissions;
create trigger trg_lc_prp_updated
  before insert or update on public.pod_role_permissions
  for each row execute function public.lc_address_column('updated_by');

-- order_status_history.changed_by_address
drop trigger if exists trg_lc_osh on public.order_status_history;
create trigger trg_lc_osh
  before insert or update on public.order_status_history
  for each row execute function public.lc_address_column('changed_by_address');

-- pending_donations.user_wallet
drop trigger if exists trg_lc_pd on public.pending_donations;
create trigger trg_lc_pd
  before insert or update on public.pending_donations
  for each row execute function public.lc_address_column('user_wallet');

-- proposal_metadata.proposer_address
drop trigger if exists trg_lc_pm on public.proposal_metadata;
create trigger trg_lc_pm
  before insert or update on public.proposal_metadata
  for each row execute function public.lc_address_column('proposer_address');

-- pod_members.wallet
drop trigger if exists trg_lc_pmem on public.pod_members;
create trigger trg_lc_pmem
  before insert or update on public.pod_members
  for each row execute function public.lc_address_column('wallet');

-- pod_audit_log.performed_by
drop trigger if exists trg_lc_pal on public.pod_audit_log;
create trigger trg_lc_pal
  before insert or update on public.pod_audit_log
  for each row execute function public.lc_address_column('performed_by');
