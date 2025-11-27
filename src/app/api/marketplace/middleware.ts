import { type NextRequest, NextResponse } from 'next/server';

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMITS = {
  '/api/marketplace/products/list': 100, // 100 requests per minute
  '/api/marketplace/products/search': 50, // 50 searches per minute
  '/api/marketplace/products/accessible': 80, // 80 requests per minute
  '/api/marketplace/orders': 30, // 30 order operations per minute
  default: 60, // Default rate limit
};

// In-memory rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Compression thresholds
const COMPRESSION_THRESHOLD = 1024; // Compress responses larger than 1KB
const SUPPORTED_ENCODINGS = ['gzip', 'deflate', 'br'];

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(request: NextRequest, endpoint: string) {
  const clientIP = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const rateLimitKey = `${clientIP}:${endpoint}`;

  const limit = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
  const now = Date.now();

  // Clean up expired entries
  cleanupExpiredEntries();

  const current = rateLimitStore.get(rateLimitKey);

  if (!current || now > current.resetTime) {
    // New window or expired
    rateLimitStore.set(rateLimitKey, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });

    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: now + RATE_LIMIT_WINDOW,
      limit,
    };
  }

  if (current.count >= limit) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: current.resetTime,
      limit,
      retryAfter: Math.ceil((current.resetTime - now) / 1000),
    };
  }

  // Increment counter
  current.count++;
  rateLimitStore.set(rateLimitKey, current);

  return {
    allowed: true,
    remaining: limit - current.count,
    resetTime: current.resetTime,
    limit,
  };
}

/**
 * Compression middleware
 */
export function compressionMiddleware(request: NextRequest, response: any) {
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const contentLength = JSON.stringify(response).length;

  // Skip compression for small responses
  if (contentLength < COMPRESSION_THRESHOLD) {
    return {
      shouldCompress: false,
      encoding: null,
      headers: {},
    };
  }

  // Determine best encoding
  let selectedEncoding = null;

  if (acceptEncoding.includes('br')) {
    selectedEncoding = 'br';
  } else if (acceptEncoding.includes('gzip')) {
    selectedEncoding = 'gzip';
  } else if (acceptEncoding.includes('deflate')) {
    selectedEncoding = 'deflate';
  }

  if (!selectedEncoding) {
    return {
      shouldCompress: false,
      encoding: null,
      headers: {},
    };
  }

  return {
    shouldCompress: true,
    encoding: selectedEncoding,
    headers: {
      'Content-Encoding': selectedEncoding,
      Vary: 'Accept-Encoding',
    },
  };
}

/**
 * Security headers middleware
 */
export function securityHeadersMiddleware() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

/**
 * Performance monitoring middleware
 */
export function performanceMiddleware(startTime: number) {
  const endTime = Date.now();
  const duration = endTime - startTime;

  // Log slow requests
  if (duration > 1000) {
    console.warn(`Slow API request: ${duration}ms`);
  }

  return {
    'X-Response-Time': `${duration}ms`,
    'X-Timestamp': new Date().toISOString(),
  };
}

/**
 * CORS middleware for marketplace APIs
 */
export function corsMiddleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_PRODUCTION_URL,
  ].filter(Boolean);

  const isAllowedOrigin = !origin || allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers':
      'X-Total-Count, X-Response-Time, X-Rate-Limit-Remaining, ETag',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Combined middleware for marketplace APIs
 */
export function marketplaceMiddleware(
  request: NextRequest,
  endpoint: string,
  startTime: number = Date.now(),
) {
  // Rate limiting
  const rateLimit = rateLimitMiddleware(request, endpoint);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${rateLimit.limit} per minute.`,
        retryAfter: rateLimit.retryAfter,
      },
      {
        status: 429,
        headers: {
          'X-Rate-Limit-Limit': String(rateLimit.limit),
          'X-Rate-Limit-Remaining': '0',
          'X-Rate-Limit-Reset': String(rateLimit.resetTime),
          'Retry-After': String(rateLimit.retryAfter),
          ...corsMiddleware(request),
          ...securityHeadersMiddleware(),
        },
      },
    );
  }

  // Return middleware headers for successful requests
  return {
    rateLimitHeaders: {
      'X-Rate-Limit-Limit': String(rateLimit.limit),
      'X-Rate-Limit-Remaining': String(rateLimit.remaining),
      'X-Rate-Limit-Reset': String(rateLimit.resetTime),
    },
    corsHeaders: corsMiddleware(request),
    securityHeaders: securityHeadersMiddleware(),
    performanceHeaders: performanceMiddleware(startTime),
  };
}

/**
 * Request logging middleware
 */
export function requestLogger(request: NextRequest, endpoint: string) {
  const clientIP = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const timestamp = new Date().toISOString();

  console.log(
    `[${timestamp}] ${request.method} ${endpoint} - IP: ${clientIP} - UA: ${userAgent.substring(0, 100)}`,
  );
}

/**
 * Helper functions
 */
function getClientIP(request: NextRequest): string {
  // Check various headers for client IP
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const remoteAddr = request.headers.get('remote-addr');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return realIP || remoteAddr || 'unknown';
}

function cleanupExpiredEntries() {
  const now = Date.now();

  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Response wrapper with all middleware applied
 */
export function createOptimizedResponse(
  data: any,
  request: NextRequest,
  endpoint: string,
  startTime: number = Date.now(),
) {
  const middleware = marketplaceMiddleware(request, endpoint, startTime);

  // Check if it's a rate limit response
  if (middleware instanceof NextResponse) {
    return middleware;
  }

  // Apply compression if beneficial
  const compression = compressionMiddleware(request, data);

  // Combine all headers
  const headers = {
    ...middleware.rateLimitHeaders,
    ...middleware.corsHeaders,
    ...middleware.securityHeaders,
    ...middleware.performanceHeaders,
    ...compression.headers,
    'Content-Type': 'application/json',
  };

  return NextResponse.json(data, { headers });
}

/**
 * Error response wrapper
 */
export function createErrorResponse(
  error: string,
  status: number,
  request: NextRequest,
  endpoint: string,
  details?: any,
) {
  const errorResponse = {
    error,
    status,
    timestamp: new Date().toISOString(),
    endpoint,
    ...(details && { details }),
  };

  const headers = {
    ...corsMiddleware(request),
    ...securityHeadersMiddleware(),
    'Content-Type': 'application/json',
  };

  return NextResponse.json(errorResponse, { status, headers });
}
