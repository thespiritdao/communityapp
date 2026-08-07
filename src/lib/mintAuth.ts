// src/lib/mintAuth.ts
// Authorization for the PRIVILEGED onboarding mint routes: mint-advocate
// (ERC721Votes voting power) and mint-hat (Executive Pod Leader hat).
// These must NOT be publicly callable. FAILS CLOSED.
//
// Design note: mint-poc is intentionally NOT gated by this — self-serve
// membership (including "join without an invite code") is a supported signup
// path, so PoC minting is open by design and protected by its own balance
// dedupe, not by auth.
//
// The only legitimate callers of the privileged routes are server-to-server:
//   - mint-advocate: /api/donations/mint/confirm (donor's first donation)
//   - mint-hat / mint-advocate: one-time founding-user bootstrap (already done)
// All legitimate callers run server-side and can present INTERNAL_API_SECRET.
// A browser has no legitimate reason to call these directly.

/**
 * Returns null if the request carries the internal server-to-server secret,
 * otherwise a 401 Response. Fails closed: if INTERNAL_API_SECRET is unset,
 * every call is rejected (a misconfig disables minting loudly rather than
 * leaving it public).
 *
 * Usage:
 *   const denied = requireInternalSecret(request);
 *   if (denied) return denied;
 */
export function requireInternalSecret(req: Request): Response | null {
  const secret = process.env.INTERNAL_API_SECRET;
  const provided = req.headers.get('x-internal-secret');
  if (secret && provided && provided === secret) return null;

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Unauthorized: this mint route is server-to-server only.',
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}
