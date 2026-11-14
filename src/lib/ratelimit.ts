/**
 * Rate Limiting Utility
 *
 * Uses Supabase Postgres for distributed rate limiting across serverless
 * functions (fixed-window counters via the `rate_limit_hit` RPC — see
 * supabase/baseline/01_schema.sql). Replaced Upstash Redis, whose
 * free-tier database was reclaimed for inactivity and took the endpoint down.
 *
 * Server-side ONLY — requires SUPABASE_SERVICE_ROLE_KEY; the RPC is not
 * executable by anon/authenticated roles.
 *
 * Usage:
 * import { rateLimiters } from '@/lib/ratelimit';
 *
 * const { success, limit, remaining, reset } = await rateLimiters.sensemaker.limit(identifier);
 * if (!success) {
 *   return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
 * }
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client for the rate-limit RPC.
 * Falls back to null (no-op limiting) if env vars are missing (local dev).
 */
function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn(
      '⚠️ Supabase service-role env vars not configured. Rate limiting disabled.',
    );
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const admin = createAdminClient();

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms when the current window resets
  pending: Promise<void>;
}

interface RateLimiter {
  limit: (identifier: string) => Promise<RateLimitResult>;
}

/**
 * No-op rate limiter for when Supabase is not configured
 * Always returns success to prevent breaking the app
 */
const noOpLimiter: RateLimiter = {
  limit: async (_identifier: string) => ({
    success: true,
    limit: 0,
    remaining: 0,
    reset: 0,
    pending: Promise.resolve(),
  }),
};

/**
 * Fixed-window limiter backed by the rate_limit_hit RPC.
 * Throws when the database call fails — callers decide fail-open vs
 * fail-closed (the Sensemaker route fails closed because requests cost
 * real LLM tokens).
 */
function makeLimiter(
  prefix: string,
  maxRequests: number,
  windowSeconds: number,
): RateLimiter {
  if (!admin) return noOpLimiter;

  return {
    limit: async (identifier: string): Promise<RateLimitResult> => {
      const { data, error } = await admin.rpc('rate_limit_hit', {
        p_key: `${prefix}:${identifier}`,
        p_limit: maxRequests,
        p_window_seconds: windowSeconds,
      });

      if (error) {
        throw new Error(`rate_limit_hit RPC failed: ${error.message}`);
      }

      return {
        success: data.allowed === true,
        limit: maxRequests,
        remaining: data.remaining ?? 0,
        reset: new Date(data.reset_at).getTime(),
        pending: Promise.resolve(),
      };
    },
  };
}

/**
 * Rate limiters for different endpoints
 */
export const rateLimiters = {
  /**
   * Sensemaker AI Chat
   *
   * Limit: 10 requests per minute per IP
   * Why: Prevents abuse of expensive AI API calls (OpenAI + Anthropic)
   * Cost per request: ~$0.0012 - $0.015
   */
  sensemaker: makeLimiter('sensemaker', 10, 60),

  /**
   * Airdrop Endpoint
   *
   * Limit: 3 requests per hour per wallet address
   * Why: Prevents blockchain spam and abuse of gas-sponsored airdrops
   */
  airdrop: makeLimiter('airdrop', 3, 3600),

  /**
   * Notification Send
   *
   * Limit: 100 requests per hour per user
   * Why: Prevents notification spam to users
   */
  notifications: makeLimiter('notifications', 100, 3600),

  /**
   * Bounty Creation
   *
   * Limit: 10 requests per hour per user
   * Why: Prevents bounty spam
   */
  bountyCreate: makeLimiter('bounty:create', 10, 3600),

  /**
   * Public ledger export (Congregant Phase 6 field instrument)
   *
   * Limit: 60 requests per minute per IP
   * Why: Generous enough for a researcher paginating the full ledger,
   * tight enough to stop scraping abuse of the DB.
   */
  explorerExport: makeLimiter('explorer:export', 60, 60),
};

/**
 * Helper function to get client IP from Next.js request
 */
export function getClientIp(req: Request): string {
  // Cloudflare proxies in front of Vercel, so x-forwarded-for holds the CF
  // edge IP (Vercel overwrites it with the connecting IP). cf-connecting-ip
  // carries the real client through the proxy.
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  // Try x-forwarded-for (Vercel, proxies)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Try x-real-ip (nginx, other proxies)
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to localhost (development)
  return '127.0.0.1';
}

/**
 * Helper function to format rate limit error response
 */
export function rateLimitErrorResponse(reset: number) {
  const resetDate = new Date(reset);
  const retryAfter = Math.ceil((reset - Date.now()) / 1000);

  return {
    error: 'Rate limit exceeded',
    message: 'Too many requests. Please try again later.',
    retryAfter, // seconds until reset
    resetAt: resetDate.toISOString(),
  };
}

/**
 * Type guard to check if rate limiting is enabled
 */
export function isRateLimitingEnabled(): boolean {
  return admin !== null;
}
