-- Applied to production 2026-09-25.
-- The last member-writable policies with no real condition. These used
-- `auth.uid() IS NOT NULL` / `auth.role() = 'authenticated'` / `auth.jwt()
-- IS NOT NULL` rather than a literal `true`, so the 2026-09-23 count missed
-- them; for a member they mean the same thing.
--
--   forum_category_required_tokens  any member could change which tokens
--       gate a forum category (access control). No browser code writes it:
--       server only.
--   chat_muted_users / chat_moderation_log  any member could mute anyone in
--       any chat. Now: chatModeration in the chat's pod (or a pod leader),
--       recorded as themselves.
--   tokens  any member could add to the gating token registry. Only
--       /api/admin/tokens writes it: server only.
--   forum_featured_content  any member could feature anything. No browser
--       writer: server only (own un-feature stays).
--   forum_poll_options  an ALL policy let anyone edit any poll's options.
--       Now only the poll's creator (existing update/delete policies stay).
--   bid_state_updates  the bounty's managers only.
--   treasury_approval_workflows  unused; no member writes.
--   surveys, survey_questions, survey_responses, survey_answers  only the
--       /api/pods/[id]/surveys routes read or write these (service role).
--       Members could also read every response and who gave it; all member
--       access is removed.

begin;

create or replace function public.can_moderate_chat_group(p_chat_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_groups g
    where g.id = p_chat_group_id
      and g.pod_id is not null
      and (public.is_pod_leader_current_user(g.pod_id)
           or public.has_pod_permission_current_user(g.pod_id, 'chatModeration'))
  );
$$;
revoke execute on function public.can_moderate_chat_group(uuid) from public, anon;
grant execute on function public.can_moderate_chat_group(uuid) to authenticated;

-- forum_category_required_tokens
drop policy if exists "Pod managers can manage token requirements" on public.forum_category_required_tokens;

-- chat moderation
drop policy if exists "Authenticated users can mute" on public.chat_muted_users;
drop policy if exists "Chat moderators mute" on public.chat_muted_users;
create policy "Chat moderators mute" on public.chat_muted_users
  for insert to authenticated
  with check (muted_by = auth.uid() and public.can_moderate_chat_group(chat_group_id));

drop policy if exists "Authenticated users can log actions" on public.chat_moderation_log;
drop policy if exists "Chat moderators log actions" on public.chat_moderation_log;
create policy "Chat moderators log actions" on public.chat_moderation_log
  for insert to authenticated
  with check (public.can_moderate_chat_group(chat_group_id)
              and (moderator_id is null or moderator_id = auth.uid())
              and (moderator_wallet is null or public.is_my_wallet(moderator_wallet)));

-- tokens
drop policy if exists "Authenticated users can add tokens" on public.tokens;

-- forum_featured_content
drop policy if exists "Authenticated users can feature content" on public.forum_featured_content;
drop policy if exists "Moderators can manage featured content" on public.forum_featured_content;

-- forum_poll_options
drop policy if exists "Authenticated users can create poll options" on public.forum_poll_options;
drop policy if exists "Poll creators can manage options" on public.forum_poll_options;
drop policy if exists "Poll creators can create poll options" on public.forum_poll_options;
create policy "Poll creators can create poll options" on public.forum_poll_options
  for insert to authenticated
  with check (exists (
    select 1 from public.forum_polls p
    where p.id = poll_id and public.is_my_wallet(p.created_by)
  ));

-- bid_state_updates
drop policy if exists "Allow authenticated users to insert bid_state_updates" on public.bid_state_updates;
drop policy if exists "Bounty managers record bid state updates" on public.bid_state_updates;
create policy "Bounty managers record bid state updates" on public.bid_state_updates
  for insert to authenticated
  with check (public.is_bounty_manager(bounty_id));

-- treasury_approval_workflows
drop policy if exists "Pod managers can create workflows" on public.treasury_approval_workflows;

-- surveys (server routes only)
drop policy if exists "surveys_delete" on public.surveys;
drop policy if exists "surveys_insert" on public.surveys;
drop policy if exists "surveys_select" on public.surveys;
drop policy if exists "surveys_update" on public.surveys;
drop policy if exists "survey_questions_delete" on public.survey_questions;
drop policy if exists "survey_questions_insert" on public.survey_questions;
drop policy if exists "survey_questions_select" on public.survey_questions;
drop policy if exists "survey_questions_update" on public.survey_questions;
drop policy if exists "survey_responses_insert" on public.survey_responses;
drop policy if exists "survey_responses_select" on public.survey_responses;
drop policy if exists "survey_answers_insert" on public.survey_answers;
drop policy if exists "survey_answers_select" on public.survey_answers;

commit;
