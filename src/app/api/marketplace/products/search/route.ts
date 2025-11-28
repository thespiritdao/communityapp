import { type NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdentity } from '@/utils/accessControlUtils';
import { filterAccessibleProductsAsync } from '@/features/shopping-cart/services/accessControl';
import type { IProduct } from '@/features/shopping-cart/models';

// Search configuration
const CACHE_DURATION = 180; // 3 minutes cache for search results
const MAX_SEARCH_RESULTS = 50;
const MIN_QUERY_LENGTH = 2;

interface SearchResult extends IProduct {
  _relevance_score?: number;
  _matched_fields?: string[];
}

interface SearchResponse {
  results: any[]; // Database schema uses snake_case, not full SearchResult interface
  query: string;
  suggestions: string[];
  facets: {
    categories: Array<{ name: string; count: number }>;
    tokens: Array<{ name: string; count: number }>;
    priceRanges: Array<{ range: string; count: number }>;
  };
  meta: {
    total: number;
    searchTime: number;
    cached: boolean;
    timestamp: string;
  };
}

/**
 * Advanced search API with full-text search, faceted filtering, and suggestions
 * GET /api/marketplace/products/search
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('q')?.trim() || '';
    const userAddress = searchParams.get('address');
    const category = searchParams.get('category');
    const tokenFilter = searchParams.get('token');
    const priceMin = searchParams.get('price_min');
    const priceMax = searchParams.get('price_max');
    const limit = Math.min(
      MAX_SEARCH_RESULTS,
      Number.parseInt(searchParams.get('limit') || '20'),
    );

    // Validate query length
    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        {
          error: 'Query too short',
          message: `Search query must be at least ${MIN_QUERY_LENGTH} characters`,
          minLength: MIN_QUERY_LENGTH,
        },
        { status: 400 },
      );
    }

    // Build cache key
    const cacheKey = JSON.stringify({
      query,
      userAddress: userAddress || 'public',
      category,
      tokenFilter,
      priceMin,
      priceMax,
      limit,
      version: '1.0',
    });

    const etag = Buffer.from(cacheKey).toString('base64');

    // Check client cache
    const clientEtag = request.headers.get('If-None-Match');
    if (clientEtag === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': `private, max-age=${CACHE_DURATION}`,
        },
      });
    }

    // Build full-text search query
    // Use PostgreSQL full-text search capabilities
    let searchQuery = supabase
      .from('products')
      .select(`
        *,
        ts_rank(
          to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(title, '')),
          plainto_tsquery('english', '${query}')
        ) as relevance_score
      `)
      .textSearch('fts', query, {
        type: 'websearch',
        config: 'english',
      })
      .order('relevance_score', { ascending: false })
      .limit(limit);

    // Apply additional filters
    if (category) {
      searchQuery = searchQuery.eq('category', category);
    }

    if (tokenFilter && tokenFilter !== 'all') {
      if (tokenFilter === 'no_token') {
        searchQuery = searchQuery.or(
          'required_token.is.null,required_token.eq.',
        );
      } else {
        searchQuery = searchQuery.eq('required_token', tokenFilter);
      }
    }

    if (priceMin) {
      searchQuery = searchQuery.gte(
        'price_system',
        Number.parseFloat(priceMin),
      );
    }

    if (priceMax) {
      searchQuery = searchQuery.lte(
        'price_system',
        Number.parseFloat(priceMax),
      );
    }

    // Execute search
    const { data: searchResults, error } = await searchQuery;

    if (error) {
      console.error('Search error:', error);
      return NextResponse.json(
        {
          error: 'Search failed',
          details: error.message,
        },
        { status: 500 },
      );
    }

    // Apply access control
    // Use any[] since database schema uses snake_case, not full SearchResult interface
    let accessibleResults: any[] = searchResults || [];

    if (userAddress) {
      try {
        const identity = await getUserIdentity(userAddress);
        accessibleResults = await filterAccessibleProductsAsync(
          (searchResults || []) as any,
          identity,
        );
      } catch (err) {
        console.error('Access control error in search:', err);
        accessibleResults =
          searchResults?.filter((p) => !p.required_token) || [];
      }
    } else {
      accessibleResults = searchResults?.filter((p) => !p.required_token) || [];
    }

    // Add matched fields information
    accessibleResults = accessibleResults.map((product) => {
      const matchedFields: string[] = [];
      const lowerQuery = query.toLowerCase();

      if (product.name?.toLowerCase().includes(lowerQuery))
        matchedFields.push('name');
      if (product.title?.toLowerCase().includes(lowerQuery))
        matchedFields.push('title');
      if (product.description?.toLowerCase().includes(lowerQuery))
        matchedFields.push('description');

      return {
        ...product,
        _matched_fields: matchedFields,
      };
    });

    // Generate search suggestions (for autocomplete)
    const suggestions = await generateSearchSuggestions(query);

    // Generate facets for filtering
    const facets = await generateSearchFacets(query);

    const searchTime = Date.now() - startTime;

    const response: SearchResponse = {
      results: accessibleResults,
      query,
      suggestions,
      facets,
      meta: {
        total: accessibleResults.length,
        searchTime,
        cached: false,
        timestamp: new Date().toISOString(),
      },
    };

    const headers = new Headers({
      ETag: etag,
      'Cache-Control': `private, max-age=${CACHE_DURATION}`,
      'X-Search-Time': String(searchTime),
      'X-Result-Count': String(accessibleResults.length),
      'Content-Type': 'application/json',
    });

    return NextResponse.json(response, { headers });
  } catch (error) {
    const searchTime = Date.now() - startTime;
    console.error('Search API error:', error);

    return NextResponse.json(
      {
        error: 'Search service error',
        message: error instanceof Error ? error.message : 'Unknown error',
        searchTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * Generate search suggestions based on query
 */
async function generateSearchSuggestions(query: string): Promise<string[]> {
  try {
    // Get similar product names for autocomplete
    const { data } = await supabase
      .from('products')
      .select('name, title')
      .or(`name.ilike.%${query}%,title.ilike.%${query}%`)
      .limit(5);

    const suggestions: string[] = [];

    data?.forEach((product) => {
      if (product.name && !suggestions.includes(product.name)) {
        suggestions.push(product.name);
      }
      if (product.title && !suggestions.includes(product.title)) {
        suggestions.push(product.title);
      }
    });

    return suggestions.slice(0, 5);
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return [];
  }
}

/**
 * Generate faceted search results for filtering
 */
async function generateSearchFacets(query: string) {
  try {
    // Get facet counts
    const { data: tokenFacets } = await supabase
      .from('products')
      .select('required_token')
      .textSearch('fts', query, { type: 'websearch', config: 'english' });

    // Count token requirements
    const tokenCounts: Record<string, number> = {};
    tokenFacets?.forEach((product) => {
      const token = product.required_token || 'no_token';
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    });

    // Get price ranges
    const { data: priceData } = await supabase
      .from('products')
      .select('price_system')
      .textSearch('fts', query, { type: 'websearch', config: 'english' })
      .not('price_system', 'is', null);

    const priceRanges = [
      { range: '0-10', count: 0 },
      { range: '10-50', count: 0 },
      { range: '50-100', count: 0 },
      { range: '100+', count: 0 },
    ];

    priceData?.forEach((product) => {
      const price = product.price_system || 0;
      if (price <= 10) priceRanges[0].count++;
      else if (price <= 50) priceRanges[1].count++;
      else if (price <= 100) priceRanges[2].count++;
      else priceRanges[3].count++;
    });

    return {
      categories: [], // Could add categories if product schema includes them
      tokens: Object.entries(tokenCounts).map(([name, count]) => ({
        name,
        count,
      })),
      priceRanges: priceRanges.filter((range) => range.count > 0),
    };
  } catch (error) {
    console.error('Error generating facets:', error);
    return {
      categories: [],
      tokens: [],
      priceRanges: [],
    };
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, If-None-Match',
      'Access-Control-Max-Age': '86400',
    },
  });
}
