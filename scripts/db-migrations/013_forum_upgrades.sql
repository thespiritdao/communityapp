-- 013_forum_upgrades.sql
-- Forum system upgrade: activity columns, full-text search, bookmarks, read tracking, tags, view count.
-- Run in Supabase SQL editor.

BEGIN;

-- ============================================================
-- 1a. Thread activity columns
-- ============================================================
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT false;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS resolved_by TEXT;

-- Backfill existing threads
UPDATE forum_threads t SET
  reply_count = sub.cnt,
  last_reply_at = sub.latest
FROM (
  SELECT
    p.thread_id,
    COUNT(*) AS cnt,
    MAX(p.created_at) AS latest
  FROM forum_posts p
  WHERE p.is_deleted IS NOT TRUE
  GROUP BY p.thread_id
) sub
WHERE t.id = sub.thread_id;

-- ============================================================
-- 1b. Auto-update trigger for reply_count / last_reply_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_thread_reply_stats()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_thread_reply_stats ON forum_posts;
CREATE TRIGGER trigger_update_thread_reply_stats
  AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_reply_stats();

-- ============================================================
-- 1c. Full-text search
-- ============================================================
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Strip HTML tags helper (for content stored as HTML)
CREATE OR REPLACE FUNCTION strip_html_tags(input TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN regexp_replace(input, '<[^>]+>', ' ', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill search vectors
UPDATE forum_threads SET search_vector = to_tsvector(
  'english',
  coalesce(title, '') || ' ' || coalesce(strip_html_tags(content), '')
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_search ON forum_threads USING GIN(search_vector);

-- Auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_thread_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english',
    coalesce(NEW.title, '') || ' ' || coalesce(strip_html_tags(NEW.content), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_search_vector ON forum_threads;
CREATE TRIGGER trigger_update_thread_search_vector
  BEFORE INSERT OR UPDATE OF title, content ON forum_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_search_vector();

-- RPC function for search
CREATE OR REPLACE FUNCTION search_forum_threads(
  search_query TEXT,
  cat_id UUID DEFAULT NULL,
  result_limit INTEGER DEFAULT 20,
  result_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  content TEXT,
  author_address TEXT,
  category_id UUID,
  created_at TIMESTAMPTZ,
  is_pinned BOOLEAN,
  is_locked BOOLEAN,
  is_resolved BOOLEAN,
  view_count INTEGER,
  reply_count INTEGER,
  last_reply_at TIMESTAMPTZ,
  rank REAL
) AS $$
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 1d. Bookmarks table
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_address, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_user ON forum_bookmarks(user_address);
CREATE INDEX IF NOT EXISTS idx_forum_bookmarks_thread ON forum_bookmarks(thread_id);

-- RLS
ALTER TABLE forum_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bookmarks" ON forum_bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON forum_bookmarks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own bookmarks" ON forum_bookmarks;
CREATE POLICY "Users can insert their own bookmarks" ON forum_bookmarks
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own bookmarks" ON forum_bookmarks;
CREATE POLICY "Users can delete their own bookmarks" ON forum_bookmarks
  FOR DELETE USING (true);

-- ============================================================
-- 1e. Thread reads table
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_thread_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_address, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_forum_thread_reads_user ON forum_thread_reads(user_address);
CREATE INDEX IF NOT EXISTS idx_forum_thread_reads_thread ON forum_thread_reads(thread_id);

-- RLS
ALTER TABLE forum_thread_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own read status" ON forum_thread_reads;
CREATE POLICY "Users can view their own read status" ON forum_thread_reads
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can upsert their own read status" ON forum_thread_reads;
CREATE POLICY "Users can upsert their own read status" ON forum_thread_reads
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own read status" ON forum_thread_reads;
CREATE POLICY "Users can update their own read status" ON forum_thread_reads
  FOR UPDATE USING (true);

-- ============================================================
-- 1f. Thread tags table
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_thread_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(thread_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_forum_thread_tags_tag ON forum_thread_tags(tag);
CREATE INDEX IF NOT EXISTS idx_forum_thread_tags_thread ON forum_thread_tags(thread_id);

-- RLS
ALTER TABLE forum_thread_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tags" ON forum_thread_tags;
CREATE POLICY "Anyone can view tags" ON forum_thread_tags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can insert tags" ON forum_thread_tags;
CREATE POLICY "Authenticated can insert tags" ON forum_thread_tags
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete tags" ON forum_thread_tags;
CREATE POLICY "Authenticated can delete tags" ON forum_thread_tags
  FOR DELETE USING (true);

-- ============================================================
-- 1g. View count increment function
-- ============================================================
CREATE OR REPLACE FUNCTION increment_thread_view_count(tid UUID)
RETURNS void AS $$
  UPDATE forum_threads SET view_count = COALESCE(view_count, 0) + 1 WHERE id = tid;
$$ LANGUAGE sql SECURITY DEFINER;

COMMIT;
