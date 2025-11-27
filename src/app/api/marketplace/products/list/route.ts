import { type NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdentity } from '@/utils/accessControlUtils';
import { filterAccessibleProductsAsync } from '@/features/shopping-cart/services/accessControl';
import type { IProduct } from '@/features/shopping-cart/models';

// Cache configuration
const CACHE_DURATION = 300; // 5 minutes cache
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

interface ProductsListResponse {
  products: IProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta: {
    totalProducts: number;
    accessibleCount: number;
    filters: {
      category?: string;
      token?: string;
      priceRange?: string;
    };
    timestamp: string;
    cached: boolean;
  };
}

/**
 * Optimized products list API with advanced pagination and caching
 * GET /api/marketplace/products/list
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse pagination parameters
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE))));
    
    // Parse filter parameters
    const userAddress = searchParams.get('address');
    const category = searchParams.get('category');
    const tokenFilter = searchParams.get('token');
    const sortBy = searchParams.get('sort') || 'created_at';
    const sortOrder = searchParams.get('order') || 'desc';
    const priceMin = searchParams.get('price_min');
    const priceMax = searchParams.get('price_max');
    const searchQuery = searchParams.get('q');
    
    // Build cache key for ETag
    const cacheKey = JSON.stringify({
      page,
      limit,
      userAddress: userAddress || 'public',
      category,
      tokenFilter,
      sortBy,
      sortOrder,
      priceMin,
      priceMax,
      searchQuery,
      version: '1.0'
    });
    
    const etag = Buffer.from(cacheKey).toString('base64');
    
    // Check client cache
    const clientEtag = request.headers.get('If-None-Match');
    if (clientEtag === etag) {
      return new NextResponse(null, { 
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': `private, max-age=${CACHE_DURATION}`,
        }
      });
    }

    // Build optimized database query
    let query = supabase
      .from('products')
      .select(`
        id,
        name,
        title,
        description,
        price_self,
        price_system,
        image_url,
        required_token,
        available_sizes,
        style,
        sku,
        units_available,
        is_free_shipping,
        created_at,
        owner_id,
        fund_destination_type,
        destination_address,
        pod_id
      `, { count: 'exact' });

    // Apply filters at database level
    if (category) {
      query = query.eq('category', category);
    }
    
    if (tokenFilter) {
      if (tokenFilter === 'no_token') {
        query = query.or('required_token.is.null,required_token.eq.');
      } else {
        query = query.eq('required_token', tokenFilter);
      }
    }
    
    if (priceMin) {
      query = query.gte('price_system', Number.parseFloat(priceMin));
    }
    
    if (priceMax) {
      query = query.lte('price_system', Number.parseFloat(priceMax));
    }
    
    if (searchQuery) {
      query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }
    
    // Apply sorting
    const validSortColumns = ['created_at', 'name', 'title', 'price_system', 'price_self'];
    const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';
    
    query = query.order(safeSort as any, { ascending: safeOrder === 'asc' });
    
    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);
    
    // Execute query
    const { data: products, error, count } = await query;
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products', details: error.message },
        { status: 500 }
      );
    }
    
    const totalProducts = count || 0;
    const totalPages = Math.ceil(totalProducts / limit);
    
    // Apply client-side access control if user address provided
    let accessibleProducts: IProduct[] = products || [];
    
    if (userAddress) {
      try {
        const identity = await getUserIdentity(userAddress);
        accessibleProducts = await filterAccessibleProductsAsync(products || [], identity);
        
        console.log(`API: Filtered ${products?.length || 0} products to ${accessibleProducts.length} accessible for ${userAddress}`);
      } catch (err) {
        console.error('Access control error:', err);
        // Fallback to public products only
        accessibleProducts = products?.filter(p => !p.required_token) || [];
      }
    } else {
      // No user address - return only public products
      accessibleProducts = products?.filter(p => !p.required_token) || [];
    }
    
    // Build response
    const response: ProductsListResponse = {
      products: accessibleProducts,
      pagination: {
        page,
        limit,
        total: totalProducts,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      meta: {
        totalProducts,
        accessibleCount: accessibleProducts.length,
        filters: {
          category: category || undefined,
          token: tokenFilter || undefined,
          priceRange: priceMin || priceMax ? `${priceMin || 0}-${priceMax || '∞'}` : undefined
        },
        timestamp: new Date().toISOString(),
        cached: false
      }
    };
    
    // Response headers for caching and performance
    const headers = new Headers({
      'ETag': etag,
      'Cache-Control': `private, max-age=${CACHE_DURATION}`,
      'X-Total-Count': String(totalProducts),
      'X-Accessible-Count': String(accessibleProducts.length),
      'X-Page': String(page),
      'X-Total-Pages': String(totalPages),
      'X-Rate-Limit': '100', // Requests per minute
      'Content-Type': 'application/json'
    });
    
    // Add CORS headers for frontend requests
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', 'X-Total-Count,X-Accessible-Count,X-Page,X-Total-Pages');
    
    return NextResponse.json(response, { headers });
    
  } catch (error) {
    console.error('API error in products/list:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}