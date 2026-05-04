-- 010_community_agent_queue.sql
-- Creates the community_agent_queue table for forum mention processing
-- and a Postgres trigger on forum_posts to auto-queue agent mentions.
--
-- Run in Supabase SQL editor.

-- 1. Queue table for async forum mention processing
CREATE TABLE IF NOT EXISTS community_agent_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL,
  trigger_post_id UUID NOT NULL,
  trigger_wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caq_status_created ON community_agent_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_caq_pod_id ON community_agent_queue (pod_id);

-- Enable RLS
ALTER TABLE community_agent_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write the queue
CREATE POLICY "service_role_all" ON community_agent_queue
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Postgres function: checks if a new forum post mentions a community agent
--    and inserts a queue row if so. This avoids needing client-side detection for forums.
CREATE OR REPLACE FUNCTION fn_queue_agent_mention()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger to forum_posts
DROP TRIGGER IF EXISTS trg_queue_agent_mention ON forum_posts;
CREATE TRIGGER trg_queue_agent_mention
  AFTER INSERT ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION fn_queue_agent_mention();

-- 4. Also add RLS policies for community_agent_posts if missing
-- (user mentioned they ran migrations with RLS enabled but policies may be needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_agent_posts' AND policyname = 'service_role_all'
  ) THEN
    ALTER TABLE community_agent_posts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all" ON community_agent_posts
      FOR ALL USING (auth.role() = 'service_role');
    CREATE POLICY "authenticated_read" ON community_agent_posts
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 5. Add RLS for community_agent_subscriptions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'community_agent_subscriptions' AND policyname = 'service_role_all'
  ) THEN
    ALTER TABLE community_agent_subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all" ON community_agent_subscriptions
      FOR ALL USING (auth.role() = 'service_role');
    CREATE POLICY "authenticated_read" ON community_agent_subscriptions
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;
