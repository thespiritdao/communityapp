-- Migration: Pulse forum triggers
--
-- Forum writes are 100% client-side (services/components call Supabase directly),
-- so we can't easily call recordExplorerEvent() from app code. Triggers are the
-- right tool here: they fire atomically with the source insert, can't be
-- bypassed, and centralize the throttling/dedupe logic.
--
-- One trigger per forum table:
--   forum_threads          → forum_thread_created
--   forum_posts            → forum_post_created       (throttled 1/user/thread/hour)
--   forum_polls            → forum_poll_created
--   forum_poll_votes       → forum_poll_voted
--   forum_post_reactions   → forum_post_reaction      (one per user/post/type via dedupe)
--   forum_moderator_actions → forum_moderator_action
--   forum_thread_summaries → forum_thread_summary_published
--
-- Each trigger inserts into explorer_events. Failures are silenced via EXCEPTION
-- blocks so a Pulse-write hiccup never breaks a user-facing forum action.

-- ── forum_thread_created ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_forum_thread_created()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_thread_created ON forum_threads;
CREATE TRIGGER trg_pulse_forum_thread_created
  AFTER INSERT ON forum_threads
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_thread_created();

-- ── forum_post_created (throttled: 1 per user/thread/hour) ────────────────────
-- The throttle key is the (author, thread) pair. We check explorer_events for
-- a row in the last 60 minutes with a matching throttle_key in metadata.
CREATE OR REPLACE FUNCTION pulse_log_forum_post_created()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_post_created ON forum_posts;
CREATE TRIGGER trg_pulse_forum_post_created
  AFTER INSERT ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_post_created();

-- ── forum_poll_created ────────────────────────────────────────────────────────
-- forum_polls schema:
--   id, thread_id, question, description, allow_multiple, expires_at,
--   created_by, created_at
CREATE OR REPLACE FUNCTION pulse_log_forum_poll_created()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_poll_created ON forum_polls;
CREATE TRIGGER trg_pulse_forum_poll_created
  AFTER INSERT ON forum_polls
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_poll_created();

-- ── forum_poll_voted ──────────────────────────────────────────────────────────
-- forum_poll_votes schema: poll_id, option_id, voter_address (+ id, created_at)
-- For polls allowing multiple options, a single vote action inserts multiple
-- rows. We dedupe on (voter, poll) so only the first row per vote action
-- produces a Pulse event.
CREATE OR REPLACE FUNCTION pulse_log_forum_poll_voted()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_poll_voted ON forum_poll_votes;
CREATE TRIGGER trg_pulse_forum_poll_voted
  AFTER INSERT ON forum_poll_votes
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_poll_voted();

-- ── forum_post_reaction (one row per (user, post, reaction_type) via dedupe) ──
CREATE OR REPLACE FUNCTION pulse_log_forum_post_reaction()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_post_reaction ON forum_post_reactions;
CREATE TRIGGER trg_pulse_forum_post_reaction
  AFTER INSERT ON forum_post_reactions
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_post_reaction();

-- ── forum_moderator_action ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_forum_moderator_action()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_moderator_action ON forum_moderator_actions;
CREATE TRIGGER trg_pulse_forum_moderator_action
  AFTER INSERT ON forum_moderator_actions
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_moderator_action();

-- ── forum_thread_summary_published ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pulse_log_forum_thread_summary()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pulse_forum_thread_summary ON forum_thread_summaries;
CREATE TRIGGER trg_pulse_forum_thread_summary
  AFTER INSERT ON forum_thread_summaries
  FOR EACH ROW EXECUTE FUNCTION pulse_log_forum_thread_summary();
