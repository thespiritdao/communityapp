-- Create RPC function to increment knowledge item view count
-- This allows atomic increments without race conditions

CREATE OR REPLACE FUNCTION increment_knowledge_view(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE knowledge_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION increment_knowledge_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_knowledge_view(uuid) TO anon;

COMMENT ON FUNCTION increment_knowledge_view IS 'Atomically increment the view count for a knowledge item';
