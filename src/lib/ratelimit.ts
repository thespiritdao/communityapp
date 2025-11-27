/**
 * Rate Limiting Utility
 *
 * Uses Upstash Redis for distributed rate limiting across serverless functions.
 *
 * Setup:
 * 1. Create Upstash Redis database at https://console.upstash.com
 * 2. Add environment variables:
 *    UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *    UPSTASH_REDIS_REST_TOKEN=your_token_here
 *
 * Usage:
 * import { rateLimiters } from '@/lib/ratelimit';
 *
 * const { success, limit, remaining, reset } = await rateLimiters.sensemaker.limit(identifier);
 * if (!success) {
 *   return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
 * }
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Initialize Redis client
 * Falls back to no-op implementation if env vars are missing
 */
function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('⚠️ UPSTASH_REDIS env vars not configured. Rate limiting disabled.');
    return null;
  }

  return new Redis({
    url,
    token,
  });
}

const redis = createRedisClient();

/**
 * No-op rate limiter for when Redis is not configured
 * Always returns success to prevent breaking the app
 */
const noOpLimiter = {
  limit: async (identifier: string) => ({
    success: true,
    limit: 0,
    remaining: 0,
    reset: 0,
    pending: Promise.resolve(),
  }),
};

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
   *
   * Usage:
   * const ip = req.ip ?? req.headers.get("x-forwarded-for") ?? "127.0.0.1";
   * const { success } = await rateLimiters.sensemaker.limit(ip);
   */
  sensemaker: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
        analytics: true,
        prefix: "ratelimit:sensemaker",
      })
    : noOpLimiter,

  /**
   * Airdrop Endpoint
   *
   * Limit: 3 requests per hour per wallet address
   * Why: Prevents blockchain spam and abuse of gas-sponsored airdrops
   *
   * Usage:
   * const { success } = await rateLimiters.airdrop.limit(walletAddress.toLowerCase());
   */
  airdrop: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, "1 h"), // 3 requests per hour
        analytics: true,
        prefix: "ratelimit:airdrop",
      })
    : noOpLimiter,

  /**
   * Notification Send
   *
   * Limit: 100 requests per hour per user
   * Why: Prevents notification spam to users
   *
   * Usage:
   * const { success } = await rateLimiters.notifications.limit(senderAddress.toLowerCase());
   */
  notifications: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 h"), // 100 requests per hour
        analytics: true,
        prefix: "ratelimit:notifications",
      })
    : noOpLimiter,

  /**
   * Bounty Creation
   *
   * Limit: 10 requests per hour per user
   * Why: Prevents bounty spam
   *
   * Usage:
   * const { success } = await rateLimiters.bountyCreate.limit(creatorAddress.toLowerCase());
   */
  bountyCreate: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 h"), // 10 requests per hour
        analytics: true,
        prefix: "ratelimit:bounty:create",
      })
    : noOpLimiter,
};

/**
 * Helper function to get client IP from Next.js request
 */
export function getClientIp(req: Request): string {
  // Try x-forwarded-for (Vercel, proxies)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  // Try x-real-ip (nginx, other proxies)
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to localhost (development)
  return "127.0.0.1";
}

/**
 * Helper function to format rate limit error response
 */
export function rateLimitErrorResponse(reset: number) {
  const resetDate = new Date(reset);
  const retryAfter = Math.ceil((reset - Date.now()) / 1000);

  return {
    error: "Rate limit exceeded",
    message: "Too many requests. Please try again later.",
    retryAfter, // seconds until reset
    resetAt: resetDate.toISOString(),
  };
}

/**
 * Type guard to check if rate limiting is enabled
 */
export function isRateLimitingEnabled(): boolean {
  return redis !== null;
}
