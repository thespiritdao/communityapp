-- Create function to increment knowledge item view count
CREATE OR REPLACE FUNCTION increment_knowledge_view(item_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE knowledge_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_knowledge_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_knowledge_view(UUID) TO anon;
