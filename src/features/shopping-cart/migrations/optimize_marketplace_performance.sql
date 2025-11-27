-- =====================================================
-- Marketplace Performance Optimization
-- =====================================================
-- This migration adds indexes, views, and triggers for optimal
-- marketplace API performance and full-text search capabilities
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =====================================================
-- PERFORMANCE INDEXES
-- =====================================================

-- Primary indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_products_required_token_btree ON products(required_token);
CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_price_system ON products(price_system);
CREATE INDEX IF NOT EXISTS idx_products_price_self ON products(price_self);
CREATE INDEX IF NOT EXISTS idx_products_units_available ON products(units_available);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_products_token_created ON products(required_token, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_price_token ON products(price_system, required_token);
CREATE INDEX IF NOT EXISTS idx_products_available_created ON products(units_available, created_at DESC) WHERE units_available > 0;

-- GIN indexes for array and text search
CREATE INDEX IF NOT EXISTS idx_products_available_sizes_gin ON products USING GIN(available_sizes);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON products USING GIN(description gin_trgm_ops);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_products_fts ON products USING GIN(
  to_tsvector('english', 
    coalesce(name, '') || ' ' || 
    coalesce(title, '') || ' ' || 
    coalesce(description, '')
  )
);

-- Add computed column for full-text search if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'fts') THEN
    ALTER TABLE products ADD COLUMN fts tsvector GENERATED ALWAYS AS (
      to_tsvector('english', 
        coalesce(name, '') || ' ' || 
        coalesce(title, '') || ' ' || 
        coalesce(description, '')
      )
    ) STORED;
  END IF;
END $$;

-- Index the computed FTS column
CREATE INDEX IF NOT EXISTS idx_products_fts_generated ON products USING GIN(fts);

-- =====================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- =====================================================

-- Popular products view (for recommendations)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_popular_products AS
SELECT 
  p.id,
  p.name,
  p.title,
  p.price_system,
  p.price_self,
  p.image_url,
  p.required_token,
  p.created_at,
  COALESCE(order_stats.order_count, 0) as order_count,
  COALESCE(order_stats.total_revenue, 0) as total_revenue,
  COALESCE(order_stats.last_ordered, p.created_at) as last_ordered
FROM products p
LEFT JOIN (
  SELECT 
    product_id,
    COUNT(*) as order_count,
    SUM(price_paid_system + price_paid_self) as total_revenue,
    MAX(created_at) as last_ordered
  FROM marketplace_orders 
  WHERE status IN ('completed', 'processing')
  GROUP BY product_id
) order_stats ON p.id::text = order_stats.product_id
ORDER BY order_count DESC, total_revenue DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS mv_popular_products_id ON mv_popular_products(id);

-- Product categories view (if categories are added later)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_product_stats AS
SELECT 
  required_token,
  COUNT(*) as product_count,
  AVG(price_system) as avg_price_system,
  AVG(price_self) as avg_price_self,
  MIN(price_system) as min_price_system,
  MAX(price_system) as max_price_system,
  SUM(units_available) as total_units_available
FROM products 
WHERE required_token IS NOT NULL
GROUP BY required_token
ORDER BY product_count DESC;

-- =====================================================
-- TRIGGERS FOR AUTOMATIC REFRESH
-- =====================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_marketplace_views()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh popular products view (with concurrency support)
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_popular_products;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_stats;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh views when products change
DROP TRIGGER IF EXISTS trigger_refresh_marketplace_views ON products;
CREATE TRIGGER trigger_refresh_marketplace_views
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_marketplace_views();

-- Trigger to refresh views when orders change
DROP TRIGGER IF EXISTS trigger_refresh_marketplace_views_orders ON marketplace_orders;
CREATE TRIGGER trigger_refresh_marketplace_views_orders
  AFTER INSERT OR UPDATE OR DELETE ON marketplace_orders
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_marketplace_views();

-- =====================================================
-- OPTIMIZED VIEWS FOR API ENDPOINTS
-- =====================================================

-- Fast product list view with precomputed fields
CREATE OR REPLACE VIEW v_products_optimized AS
SELECT 
  p.id,
  p.name,
  p.title,
  p.description,
  p.price_system,
  p.price_self,
  p.image_url,
  p.required_token,
  p.available_sizes,
  p.style,
  p.sku,
  p.units_available,
  p.is_free_shipping,
  p.created_at,
  p.owner_id,
  p.fund_destination_type,
  p.destination_address,
  p.pod_id,
  -- Precomputed fields for performance
  CASE 
    WHEN p.required_token IS NULL OR p.required_token = '' THEN 'public'
    ELSE 'gated'
  END as access_type,
  CASE 
    WHEN p.units_available > 0 THEN 'available'
    ELSE 'out_of_stock'
  END as availability_status,
  -- Price range categorization
  CASE 
    WHEN p.price_system <= 10 THEN 'budget'
    WHEN p.price_system <= 50 THEN 'mid_range'
    WHEN p.price_system <= 100 THEN 'premium'
    ELSE 'luxury'
  END as price_category,
  -- Popularity score from materialized view
  COALESCE(mp.order_count, 0) as popularity_score
FROM products p
LEFT JOIN mv_popular_products mp ON p.id = mp.id;

-- Fast search view with relevance scoring
CREATE OR REPLACE VIEW v_products_search AS
SELECT 
  p.*,
  -- Pre-calculate search relevance factors
  length(p.name) as name_length,
  length(p.description) as description_length,
  CASE WHEN p.image_url IS NOT NULL THEN 1 ELSE 0 END as has_image,
  CASE WHEN p.units_available > 0 THEN 2 ELSE 0 END as availability_boost
FROM v_products_optimized p;

-- =====================================================
-- FUNCTIONS FOR COMMON QUERIES
-- =====================================================

-- Function to get paginated products with filters
CREATE OR REPLACE FUNCTION get_products_paginated(
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 20,
  p_token_filter TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_order TEXT DEFAULT 'desc',
  p_search_query TEXT DEFAULT NULL
)
RETURNS TABLE(
  id INTEGER,
  name TEXT,
  title TEXT,
  description TEXT,
  price_system NUMERIC,
  price_self NUMERIC,
  image_url TEXT,
  required_token TEXT,
  available_sizes TEXT[],
  units_available INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  access_type TEXT,
  availability_status TEXT,
  total_count BIGINT
) AS $$
DECLARE
  offset_count INTEGER;
  where_clause TEXT := '';
  order_clause TEXT;
  search_clause TEXT := '';
BEGIN
  offset_count := (p_page - 1) * p_limit;
  
  -- Build WHERE clause
  IF p_token_filter IS NOT NULL THEN
    IF p_token_filter = 'no_token' THEN
      where_clause := 'WHERE (required_token IS NULL OR required_token = '''')';
    ELSE
      where_clause := 'WHERE required_token = ''' || p_token_filter || '''';
    END IF;
  END IF;
  
  -- Add search clause
  IF p_search_query IS NOT NULL THEN
    search_clause := CASE 
      WHEN where_clause = '' THEN 'WHERE '
      ELSE ' AND '
    END || 'fts @@ plainto_tsquery(''english'', ''' || p_search_query || ''')';
    where_clause := where_clause || search_clause;
  END IF;
  
  -- Build ORDER BY clause
  order_clause := 'ORDER BY ' || 
    CASE p_sort_by
      WHEN 'name' THEN 'name'
      WHEN 'price' THEN 'price_system'
      WHEN 'popularity' THEN 'popularity_score'
      ELSE 'created_at'
    END || ' ' ||
    CASE p_sort_order
      WHEN 'asc' THEN 'ASC'
      ELSE 'DESC'
    END;
  
  -- Execute query
  RETURN QUERY EXECUTE '
    SELECT 
      p.id, p.name, p.title, p.description, p.price_system, p.price_self,
      p.image_url, p.required_token, p.available_sizes, p.units_available,
      p.created_at, p.access_type, p.availability_status,
      COUNT(*) OVER() as total_count
    FROM v_products_optimized p ' ||
    where_clause || ' ' ||
    order_clause || '
    LIMIT ' || p_limit || ' OFFSET ' || offset_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PERFORMANCE MONITORING
-- =====================================================

-- View to monitor query performance
CREATE OR REPLACE VIEW v_query_stats AS
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation,
  most_common_vals,
  most_common_freqs
FROM pg_stats 
WHERE schemaname = 'public' 
  AND tablename IN ('products', 'marketplace_orders');

-- =====================================================
-- MAINTENANCE PROCEDURES
-- =====================================================

-- Procedure to update statistics and refresh views
CREATE OR REPLACE FUNCTION maintain_marketplace_performance()
RETURNS VOID AS $$
BEGIN
  -- Update table statistics
  ANALYZE products;
  ANALYZE marketplace_orders;
  
  -- Refresh materialized views
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_popular_products;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_stats;
  
  -- Log maintenance
  RAISE NOTICE 'Marketplace performance maintenance completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL DATA REFRESH
-- =====================================================

-- Refresh materialized views initially
REFRESH MATERIALIZED VIEW mv_popular_products;
REFRESH MATERIALIZED VIEW mv_product_stats;

-- Update statistics
ANALYZE products;
ANALYZE marketplace_orders;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON INDEX idx_products_fts IS 'Full-text search index for product names, titles, and descriptions';
COMMENT ON INDEX idx_products_token_created IS 'Composite index for filtering by token and sorting by creation date';
COMMENT ON MATERIALIZED VIEW mv_popular_products IS 'Cached popular products with order statistics for recommendations';
COMMENT ON FUNCTION get_products_paginated IS 'Optimized function for paginated product queries with filtering and search';
COMMENT ON FUNCTION maintain_marketplace_performance IS 'Maintenance procedure to refresh views and update statistics';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Marketplace performance optimization completed successfully!';
  RAISE NOTICE '📊 Added % indexes for fast queries', (
    SELECT COUNT(*) 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'products'
      AND indexname LIKE 'idx_products_%'
  );
  RAISE NOTICE '🔍 Full-text search enabled with tsvector support';
  RAISE NOTICE '📈 Materialized views created for analytics';
  RAISE NOTICE '⚡ Optimized views and functions ready for API use';
END $$;