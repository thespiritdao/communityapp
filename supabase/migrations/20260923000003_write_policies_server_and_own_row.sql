-- Applied to production 2026-09-23.
-- Write-policy cleanup, part 1: tables the server writes, and tables where
-- members only touch their own rows.
--
-- Found 2026-09-23: 61 member-reachable RLS policies whose condition was
-- literally true. Ten of them were named "Service role full access to X"
-- but granted to role public, so every signed-in member could read, edit
-- and delete all of messages, notifications, tasks, activities and the
-- agent tables. The service role bypasses RLS, so those policies never did
-- anything for it; dropping them removes member access and nothing else.
--
-- Writers were mapped table by table (every .from(<table>) write in src/,
-- scripts/ and supabase/, plus DB functions: none write these tables).
--
-- Part 2 (money, approvals, votes: bounties, bids, bid_reviews, milestones,
-- bounty_approval_workflows, approval_signatures_audit,
-- treasury_transactions, marketplace_orders, pod_deletion_proposals,
-- pod_application_votes, proposal_eligibility_snapshots, event_registrations,
-- event_tokens) needs server routes and is a separate change. So do the
-- client-side notification inserts for other members (bounty_notifications,
-- governance_notifications), which stay open until those move server-side.

begin;

-- ── A. Server-only: the service role is the only writer ─────────────────

drop policy if exists "Service role full access to activities" on public.activities;
drop policy if exists "Service role full access to agent_context" on public.agent_context;
drop policy if exists "Service role full access to agent_conversations" on public.agent_conversations;
drop policy if exists "Service role full access to agent_memory" on public.agent_memory;
drop policy if exists "Service role full access to agent_proposals" on public.agent_proposals;
drop policy if exists "Service role full access to agent_runs" on public.agent_runs;
drop policy if exists "Service role full access to notifications" on public.notifications;
drop policy if exists "Service role full access to tasks" on public.tasks;
-- messages: only reader/writer is the /pods/demo-hats-modules demo page.
drop policy if exists "Service role full access to messages" on public.messages;
drop policy if exists "Service role can manage push subscriptions" on public.push_subscriptions;

-- event_escrow: no live writer at all; creators keep their SELECT.
drop policy if exists "System can manage escrow" on public.event_escrow;

-- Forum bookkeeping written by /api/forum/* with the service role.
drop policy if exists "Users can insert their own bookmarks" on public.forum_bookmarks;
drop policy if exists "Users can delete their own bookmarks" on public.forum_bookmarks;
drop policy if exists "Users can view their own bookmarks" on public.forum_bookmarks;
drop policy if exists "Users can upsert their own read status" on public.forum_thread_reads;
drop policy if exists "Users can update their own read status" on public.forum_thread_reads;
drop policy if exists "Users can view their own read status" on public.forum_thread_reads;
drop policy if exists "Authenticated can insert tags" on public.forum_thread_tags;
drop policy if exists "Authenticated can delete tags" on public.forum_thread_tags;
drop policy if exists "Forum thread summaries can be inserted by service role" on public.forum_thread_summaries;
drop policy if exists "Forum thread summaries can be updated by service role" on public.forum_thread_summaries;
drop policy if exists "System can create summaries" on public.forum_thread_summaries;
drop policy if exists "Authenticated users can delete thread summaries" on public.forum_thread_summaries;
drop policy if exists "Anyone can create forum proposal links" on public.forum_proposal_links;
drop policy if exists "Authenticated users can delete proposal links" on public.forum_proposal_links;

-- No app writer; counts and history come from the server.
drop policy if exists "Anyone can insert pod approval signatures" on public.pod_approval_signatures;
drop policy if exists "Anyone can insert pod member counts" on public.pod_member_counts;
drop policy if exists "Anyone can update pod member counts" on public.pod_member_counts;
drop policy if exists "Authenticated users can insert history" on public.pod_role_permissions_history;
drop policy if exists "Users can create their own notification preferences" on public.user_notification_preferences;
drop policy if exists "Users can update their own notification preferences" on public.user_notification_preferences;
drop policy if exists "Users can read their own notification preferences" on public.user_notification_preferences;

-- Referrals: /api/invite/validate now records them with the service role.
-- Anyone could previously forge a referral (feeds referral stats/rewards)
-- and read who invited whom.
drop policy if exists "Allow insert for referral validations" on public.referral_validations;
drop policy if exists "Allow public read access to referral validations" on public.referral_validations;

-- event_notifications: the cron route writes them with the service role.
-- anon could read and rewrite every member's event notifications.
drop policy if exists "Authenticated users can create notifications" on public.event_notifications;
drop policy if exists "Anonymous can update event notifications" on public.event_notifications;
drop policy if exists "Anonymous can view event notifications" on public.event_notifications;

-- ── B. Own rows only ────────────────────────────────────────────────────

-- user_presence: members see who is online; each writes only their own row.
drop policy if exists "users can upsert own presence" on public.user_presence;
create policy "Members can see presence" on public.user_presence
  for select to authenticated using (true);
create policy "Users can insert own presence" on public.user_presence
  for insert to authenticated
  with check (lower(wallet_address) = lower(auth.jwt() ->> 'wallet_address'));
create policy "Users can update own presence" on public.user_presence
  for update to authenticated
  using (lower(wallet_address) = lower(auth.jwt() ->> 'wallet_address'))
  with check (lower(wallet_address) = lower(auth.jwt() ->> 'wallet_address'));

-- knowledge_item_views: the knowledge page records the viewer's progress.
drop policy if exists "Anyone can record views" on public.knowledge_item_views;
create policy "Users can record own views" on public.knowledge_item_views
  for insert to authenticated
  with check (lower(user_address) = lower(auth.jwt() ->> 'wallet_address'));
drop policy if exists "Users can update own views" on public.knowledge_item_views;
create policy "Users can update own views" on public.knowledge_item_views
  for update to authenticated
  using (lower(user_address) = lower(auth.jwt() ->> 'wallet_address'))
  with check (lower(user_address) = lower(auth.jwt() ->> 'wallet_address'));

-- notification_preferences: own row for insert and read (server reads others').
drop policy if exists "Authenticated users can insert preferences" on public.notification_preferences;
create policy "Users can insert own preferences" on public.notification_preferences
  for insert to authenticated
  with check (lower(user_address) = lower(auth.jwt() ->> 'wallet_address'));
drop policy if exists "Authenticated users can view all preferences" on public.notification_preferences;
create policy "Users can view own preferences" on public.notification_preferences
  for select to authenticated
  using (lower(user_address) = lower(auth.jwt() ->> 'wallet_address'));

-- forum_post_reports: reporter files as themselves. Reads stay with
-- post_reports_select (reporter or forumModeration holder); the blanket
-- read exposed who reported whom. Nobody deletes reports from the app.
drop policy if exists "post_reports_insert" on public.forum_post_reports;
drop policy if exists "Authenticated users can create reports" on public.forum_post_reports;
create policy "Users can file reports as themselves" on public.forum_post_reports
  for insert to authenticated
  with check (lower(reporter_address) = lower(auth.jwt() ->> 'wallet_address'));
drop policy if exists "Authenticated users can view reports" on public.forum_post_reports;
drop policy if exists "Authenticated users can delete post reports" on public.forum_post_reports;

-- forum_media_attachments: the uploader-bound insert policy already exists.
drop policy if exists "Authenticated users can insert media attachments" on public.forum_media_attachments;

-- products: owner_id = auth.uid() policies already cover insert/update/delete.
drop policy if exists "allow_all_update_products_debug" on public.products;
drop policy if exists "allow_authenticated_insert_products" on public.products;

-- bounty_notifications: recipients read and mark their own. INSERT stays
-- open until the bounty client's notifications move to /api/notifications/send.
drop policy if exists "Anyone can read notifications" on public.bounty_notifications;
create policy "Recipients can read own bounty notifications" on public.bounty_notifications
  for select to authenticated
  using (lower(recipient_address) = lower(auth.jwt() ->> 'wallet_address'));
drop policy if exists "Anyone can update notifications" on public.bounty_notifications;
create policy "Recipients can update own bounty notifications" on public.bounty_notifications
  for update to authenticated
  using (lower(recipient_address) = lower(auth.jwt() ->> 'wallet_address'))
  with check (lower(recipient_address) = lower(auth.jwt() ->> 'wallet_address'));

commit;
