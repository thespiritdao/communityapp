import { type NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getUserIdentity } from '@/utils/accessControlUtils';
import { filterAccessibleProductsAsync } from '@/features/shopping-cart/services/accessControl';
import type { IProduct } from '@/features/shopping-cart/models';

// Cache configuration
const CACHE_DURATION = 60; // 60 seconds cache

/**
 * Optimized API endpoint for fetching accessible products
 * - Server-side token gating
 * - Response caching with ETags
 * - Reduced payload size
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');
    const page = Number.parseInt(searchParams.get('page') || '1');
    const limit = Number.parseInt(searchParams.get('limit') || '50');
    const sortBy = searchParams.get('sort') || 'created_at';
    const tokenFilter = searchParams.get('token');

    // Build cache key
    const cacheKey = `products:${userAddress || 'public'}:${page}:${limit}:${sortBy}:${tokenFilter || 'all'}`;

    // Check if client has cached version (using If-None-Match header)
    const clientEtag = request.headers.get('If-None-Match');
    const currentEtag = Buffer.from(cacheKey).toString('base64');

    if (clientEtag === currentEtag) {
      // Client has current version
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': `private, max-age=${CACHE_DURATION}`,
        },
      });
    }

    // Build database query
    let query = supabase
      .from('products')
      .select('*')
      .order(sortBy as any, { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    // Apply token filter at database level if specified
    if (tokenFilter) {
      if (tokenFilter === 'no_token') {
        query = query.or('required_token.is.null,requiredToken.is.null');
      } else {
        query = query.or(
          `required_token.eq.${tokenFilter},requiredToken.eq.${tokenFilter}`,
        );
      }
    }

    const { data: products, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 },
      );
    }

    let accessibleProducts: IProduct[] = products || [];

    // Apply access control if user address provided
    if (userAddress) {
      try {
        // Get user identity (this should ideally be cached server-side too)
        const identity = await getUserIdentity(userAddress);

        // Filter products based on access
        accessibleProducts = await filterAccessibleProductsAsync(
          products || [],
          identity,
        );

        console.log(
          `Filtered ${products?.length || 0} products to ${accessibleProducts.length} accessible for ${userAddress}`,
        );
      } catch (err) {
        console.error('Error filtering products:', err);
        // Fall back to public products only
        accessibleProducts =
          products?.filter((p) => !p.required_token && !p.requiredToken) || [];
      }
    } else {
      // No user address - return only public products
      accessibleProducts =
        products?.filter((p) => !p.required_token && !p.requiredToken) || [];
    }

    // Prepare optimized response
    const response = {
      products: accessibleProducts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      meta: {
        totalProducts: count || 0,
        accessibleCount: accessibleProducts.length,
        cached: false,
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(response, {
      headers: {
        ETag: currentEtag,
        'Cache-Control': `private, max-age=${CACHE_DURATION}`,
        'X-Total-Count': String(count || 0),
        'X-Accessible-Count': String(accessibleProducts.length),
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST endpoint for bulk access checking
 * Useful for checking multiple products at once
 */
export async function POST(request: NextRequest) {
  try {
    const { productIds, userAddress } = await request.json();

    if (!productIds || !Array.isArray(productIds)) {
      return NextResponse.json(
        { error: 'productIds array required' },
        { status: 400 },
      );
    }

    if (!userAddress) {
      return NextResponse.json(
        { error: 'userAddress required' },
        { status: 400 },
      );
    }

    // Fetch specific products
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 },
      );
    }

    // Get user identity
    const identity = await getUserIdentity(userAddress);

    // Check access for each product
    const accessResults = await Promise.all(
      (products || []).map(async (product) => {
        const { canUserAccessProductAsync } = await import(
          '@/features/shopping-cart/services/accessControl'
        );
        const canAccess = await canUserAccessProductAsync(product, identity);

        return {
          productId: product.id,
          canAccess,
          requiredToken: product.required_token,
        };
      }),
    );

    return NextResponse.json({
      results: accessResults,
      userAddress,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
