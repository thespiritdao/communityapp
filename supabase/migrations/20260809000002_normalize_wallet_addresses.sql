-- Normalize stored wallet/address values to lowercase.
--
-- Root cause of the case-sensitivity bug class (RLS_AUDIT_2026-08-08.md):
-- addresses were stored inconsistently (checksummed 0x6A2d… vs lowercase
-- 0x6a2d…). RLS and app comparisons assume lowercase. This one-time backfill
-- lowercases existing data; going forward the app normalizes on write (see the
-- app-layer change accompanying this migration).
--
-- Scope: only base tables (views like events_with_stats reflect their base
-- table automatically). Idempotent — re-running is a no-op.
-- Contract-address columns are included for consistency (harmless; prevents
-- future confusion), though the security-relevant ones are the user-identity
-- columns (pod_leads, created_by_address, changed_by_address, user_wallet,
-- sender_address, fulfillment_manager_address).

-- User-identity columns (security-relevant — these feed RLS/permission checks)
update public.pods
  set created_by_address = lower(created_by_address)
  where created_by_address is not null and created_by_address <> lower(created_by_address);

update public.pods
  set pod_leads = (select array_agg(lower(x)) from unnest(pod_leads) x)
  where pod_leads is not null
    and exists (select 1 from unnest(pod_leads) x where x <> lower(x));

update public.order_status_history
  set changed_by_address = lower(changed_by_address)
  where changed_by_address is not null and changed_by_address <> lower(changed_by_address);

update public.pending_donations
  set user_wallet = lower(user_wallet)
  where user_wallet is not null and user_wallet <> lower(user_wallet);

update public.marketplace_orders
  set fulfillment_manager_address = lower(fulfillment_manager_address)
  where fulfillment_manager_address is not null and fulfillment_manager_address <> lower(fulfillment_manager_address);

update public.treasury_transactions
  set sender_address = lower(sender_address)
  where sender_address is not null and sender_address <> lower(sender_address);

-- Contract-address columns (consistency; not security-critical)
update public.pods
  set creation_manager_address = lower(creation_manager_address)
  where creation_manager_address is not null and creation_manager_address <> lower(creation_manager_address);

update public.events set
    manager_address = lower(manager_address),
    registration_contract_address = lower(registration_contract_address),
    completion_contract_address = lower(completion_contract_address)
  where manager_address <> lower(manager_address)
     or registration_contract_address <> lower(registration_contract_address)
     or completion_contract_address <> lower(completion_contract_address);

update public.tokens
  set contract_address = lower(contract_address)
  where contract_address is not null and contract_address <> lower(contract_address);

update public.treasury_transactions set
    token_address = lower(token_address),
    treasury_address = lower(treasury_address)
  where token_address <> lower(token_address)
     or treasury_address <> lower(treasury_address);
