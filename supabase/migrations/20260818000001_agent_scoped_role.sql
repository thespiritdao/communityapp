-- 20260818000001_agent_scoped_role.sql
--
-- Congregant Phase 3: demote the AI agent's backend privilege.
--
-- Before: agent content was written through the service role (supabaseAdmin),
-- a superuser bypass with MORE power than any human member. After: agents
-- write through a dedicated `community_agent` Postgres role that can ONLY
-- insert forum/chat/event content attributed to their own registered wallet.
--
-- Also adds structural provenance: actor_type ('human' | 'agent') on every
-- content surface, set by the write path — not by the model's honesty.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Scoped role
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'community_agent') THEN
    CREATE ROLE community_agent NOLOGIN;
  END IF;
END $$;

GRANT community_agent TO authenticator;
GRANT USAGE ON SCHEMA public TO community_agent;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Provenance columns (default 'human'; agent write-path sets 'agent')
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE forum_threads   ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'human' CHECK (actor_type IN ('human','agent'));
ALTER TABLE forum_posts     ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'human' CHECK (actor_type IN ('human','agent'));
ALTER TABLE chat_messages   ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'human' CHECK (actor_type IN ('human','agent'));
ALTER TABLE explorer_events ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'human' CHECK (actor_type IN ('human','agent'));
ALTER TABLE events          ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'human' CHECK (actor_type IN ('human','agent'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill: mark existing agent-authored rows
--    (current + legacy wallets from configs, plus the 0xca10 derived prefix)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_agent_wallet(addr TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT addr IS NOT NULL AND (
    LOWER(addr) LIKE '0xca10%'
    OR EXISTS (
      SELECT 1 FROM pod_modules pm
      WHERE LOWER(COALESCE(pm.community_agent_config->>'agent_wallet','')) = LOWER(addr)
         OR LOWER(COALESCE(pm.community_agent_config->>'legacy_agent_wallet','')) = LOWER(addr)
    )
  );
$$;

UPDATE forum_threads   SET actor_type = 'agent' WHERE is_agent_wallet(author_address)   AND actor_type <> 'agent';
UPDATE forum_posts     SET actor_type = 'agent' WHERE is_agent_wallet(author_address)   AND actor_type <> 'agent';
UPDATE chat_messages   SET actor_type = 'agent' WHERE is_agent_wallet(sender_wallet_id) AND actor_type <> 'agent';
UPDATE explorer_events SET actor_type = 'agent' WHERE is_agent_wallet(actor)            AND actor_type <> 'agent';
UPDATE events          SET actor_type = 'agent' WHERE is_agent_wallet(creator_address)  AND actor_type <> 'agent';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants — the agent role can insert content and read back what it wrote.
--    No UPDATE/DELETE anywhere; no access to votes, treasuries, memberships,
--    permissions, or profiles.
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON forum_threads, forum_posts, chat_messages, community_agent_posts, events TO community_agent;
GRANT SELECT ON pod_modules, forum_categories, chat_groups TO community_agent;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO community_agent;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS policies for the agent role.
--    JWT claim wallet_address must match the row's author AND be the enabled
--    agent wallet of some pod. actor_type must be 'agent' — provenance is
--    enforced at the boundary, not left to application code.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jwt_agent_wallet()
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT LOWER(COALESCE(current_setting('request.jwt.claims', true)::json->>'wallet_address', ''));
$$;

CREATE OR REPLACE FUNCTION public.jwt_is_enabled_agent()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_modules pm
    WHERE pm.community_agent_enabled = true
      AND LOWER(COALESCE(pm.community_agent_config->>'agent_wallet','')) = jwt_agent_wallet()
  );
$$;

-- forum_threads
DROP POLICY IF EXISTS agent_insert_forum_threads ON forum_threads;
CREATE POLICY agent_insert_forum_threads ON forum_threads
  FOR INSERT TO community_agent
  WITH CHECK (
    actor_type = 'agent'
    AND LOWER(author_address) = jwt_agent_wallet()
    AND jwt_is_enabled_agent()
  );
DROP POLICY IF EXISTS agent_select_forum_threads ON forum_threads;
CREATE POLICY agent_select_forum_threads ON forum_threads
  FOR SELECT TO community_agent USING (true);

-- forum_posts
DROP POLICY IF EXISTS agent_insert_forum_posts ON forum_posts;
CREATE POLICY agent_insert_forum_posts ON forum_posts
  FOR INSERT TO community_agent
  WITH CHECK (
    actor_type = 'agent'
    AND LOWER(author_address) = jwt_agent_wallet()
    AND jwt_is_enabled_agent()
  );
DROP POLICY IF EXISTS agent_select_forum_posts ON forum_posts;
CREATE POLICY agent_select_forum_posts ON forum_posts
  FOR SELECT TO community_agent USING (true);

-- chat_messages
DROP POLICY IF EXISTS agent_insert_chat_messages ON chat_messages;
CREATE POLICY agent_insert_chat_messages ON chat_messages
  FOR INSERT TO community_agent
  WITH CHECK (
    actor_type = 'agent'
    AND LOWER(sender_wallet_id) = jwt_agent_wallet()
    AND jwt_is_enabled_agent()
  );
DROP POLICY IF EXISTS agent_select_chat_messages ON chat_messages;
CREATE POLICY agent_select_chat_messages ON chat_messages
  FOR SELECT TO community_agent USING (true);

-- community_agent_posts (keyed by pod, not wallet — the pod must be the
-- caller's own pod)
DROP POLICY IF EXISTS agent_insert_agent_posts ON community_agent_posts;
CREATE POLICY agent_insert_agent_posts ON community_agent_posts
  FOR INSERT TO community_agent
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pod_modules pm
      WHERE pm.pod_id = community_agent_posts.pod_id
        AND pm.community_agent_enabled = true
        AND LOWER(COALESCE(pm.community_agent_config->>'agent_wallet','')) = jwt_agent_wallet()
    )
  );
DROP POLICY IF EXISTS agent_select_agent_posts ON community_agent_posts;
CREATE POLICY agent_select_agent_posts ON community_agent_posts
  FOR SELECT TO community_agent USING (true);

-- events (weekly drafts)
DROP POLICY IF EXISTS agent_insert_events ON events;
CREATE POLICY agent_insert_events ON events
  FOR INSERT TO community_agent
  WITH CHECK (
    actor_type = 'agent'
    AND LOWER(creator_address) = jwt_agent_wallet()
    AND jwt_is_enabled_agent()
  );
DROP POLICY IF EXISTS agent_select_events ON events;
CREATE POLICY agent_select_events ON events
  FOR SELECT TO community_agent USING (true);

-- read-only supporting tables (config lookups the write path needs)
DROP POLICY IF EXISTS agent_select_pod_modules ON pod_modules;
CREATE POLICY agent_select_pod_modules ON pod_modules
  FOR SELECT TO community_agent USING (true);
DROP POLICY IF EXISTS agent_select_forum_categories ON forum_categories;
CREATE POLICY agent_select_forum_categories ON forum_categories
  FOR SELECT TO community_agent USING (true);
DROP POLICY IF EXISTS agent_select_chat_groups ON chat_groups;
CREATE POLICY agent_select_chat_groups ON chat_groups
  FOR SELECT TO community_agent USING (true);
