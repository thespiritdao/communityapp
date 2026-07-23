// src/lib/cronAuth.ts
// Shared cron authorization — FAILS CLOSED.
//
// Every cron route must reject a request unless it carries the exact
// `Authorization: Bearer <CRON_SECRET>` header. Critically, if CRON_SECRET is
// NOT configured (missing env var, typo, deploy misconfig) this returns false
// so the route rejects everything — a misconfig makes cron STOP (loud, safe)
// rather than become PUBLIC (silent, dangerous).
//
// This replaces the old fail-OPEN pattern
//   if (process.env.CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) 401
// which skipped the check entirely when the secret was unset.

/** True if the request is an authenticated cron call. Fails closed. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured → deny everything
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Returns a 401 Response if the request is not an authenticated cron call,
 * otherwise null. Usage:
 *   const denied = requireCron(req);
 *   if (denied) return denied;
 */
export function requireCron(req: Request): Response | null {
  if (isAuthorizedCron(req)) return null;
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Like requireCron, but permits the call in non-production when CRON_SECRET is
 * unset — for routes that are triggered locally during development. In
 * PRODUCTION this still fails CLOSED (a missing secret rejects everything).
 * Use only where local invocation without a secret is intended.
 */
export function requireCronAllowingDev(req: Request): Response | null {
  if (process.env.NODE_ENV !== 'production' && !process.env.CRON_SECRET) {
    return null; // dev convenience only — never applies in production
  }
  return requireCron(req);
}
