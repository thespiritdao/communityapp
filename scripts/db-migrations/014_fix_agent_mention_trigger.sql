-- 014_fix_agent_mention_trigger.sql
-- Fixes fn_queue_agent_mention trigger to use correct column name.
-- The forum_posts table uses `author_address`, not `author_wallet`.
-- This mismatch caused: record "new" has no field "author_wallet"
--
-- Run in Supabase SQL editor.

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
