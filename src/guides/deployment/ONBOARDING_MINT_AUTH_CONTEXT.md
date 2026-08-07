# Onboarding Mint Routes — Auth Context & Decision

**Date:** 2026-08-06
**Why this doc exists:** to explain, in plain terms, what the onboarding mint
routes do, what was (and wasn't) changed, and the one decision needed to finish
hardening them without breaking new-user signups.

---

## What these routes are (NOT legacy — verified live)

Three API routes mint tokens using the backend admin wallet:

| Route | Mints | Who triggers it today |
|---|---|---|
| `mint-poc` | Proof-of-Curiosity (membership token) | **Every regular new user** at onboarding |
| `mint-hat` | Executive Pod Leader Hat | The **first user** only (DAO bootstrap) |
| `mint-advocate` | Advocate NFT (ERC721Votes, voting power) | (a) first user at bootstrap; (b) **any donor's first confirmed donation** |

**Confirmed against the code (`OnboardingHatMinting.tsx`):**
- Regular new users get **PoC only**. Advocate is **NOT airdropped at sign-on**.
- Advocate = donations only, via `donations/mint/confirm` → `maybeAirdropAdvocate`.
  This matches the intended rule exactly. New users without Advocate are correct.
- Non-Advocate holders can vote in pod business, just not DAO-wide exec proposals.

**Conclusion:** these routes are actively used by live onboarding and donation
flows. They **cannot be deleted** without breaking signup and donor rewards.

---

## The actual problem (why the audit flagged them)

The routes had **no caller authentication**. They validated the wallet address
*format* and deduped on balance, but anyone who could POST to them could mint
themselves a PoC, a Hat, or an Advocate NFT (voting power) — without signing up,
donating, or holding an invite. At public launch that is a Sybil / governance-
capture vector.

The donation gate and invite gate exist in the *callers*, not in the routes
themselves — so a direct call to the route skips every gate.

---

## What was changed (state as of this doc)

1. **`src/lib/mintAuth.ts` (new):** a fail-closed `requireMintAuth(req, wallet)`
   guard. Accepts a request if EITHER:
   - it carries the internal secret header (`x-internal-secret` ===
     `INTERNAL_API_SECRET`) — for trusted server-to-server calls; OR
   - it carries a valid Supabase JWT whose wallet matches the mint target.
   Everything else → 401/403.
2. **All three routes** now call `requireMintAuth` right after address validation.
3. **`donations/mint/confirm`** (server-side caller) now sends the internal
   secret header. ✅ This path is complete and safe (once `INTERNAL_API_SECRET`
   is configured).

## What is NOT yet done (the open risk)

**The browser onboarding component (`OnboardingHatMinting.tsx`) does not yet
send any auth**, so its calls to `mint-poc` / `mint-hat` / `mint-advocate`
would now be rejected (401). **If shipped as-is, new-user onboarding breaks.**
Nothing is committed or pushed — this is caught before deploy.

The reason it isn't finished: the correct auth signal for the browser path
depends on onboarding timing, and choosing wrong locks out real signups.

---

## The timing problem (the crux)

At the moment onboarding mints, the user has:
- ✅ a **CDP** login (wallet exists — `useCurrentUser`, `useEvmAddress` are set)
- ✅ a **validated invite code** (checked client-side before this step)
- ❓ a **Supabase JWT** — MAY NOT EXIST YET. CDP auth and the Supabase session
  are separate; the JWT can lag behind the first mint.

So requiring a Supabase JWT is the risky option: if the session isn't ready at
first-mint, the new user 401s and cannot onboard.

---

## The three ways to finish (pick one)

### Option A — Re-validate the invite code server-side (recommended)
Onboarding passes the invite code it already validated; each mint route
re-checks it against the DB (`invite_codes`) before minting.
- ✅ Matches the true gate: an invite **is** the right to join and mint.
- ✅ Works even before a Supabase JWT exists — no signup-timing risk.
- ✅ Ties minting to a consumable/tracked invite (also curbs abuse).
- ⚠️ Small refactor: thread the invite code from InviteCodeModal → mint calls,
  and add a server-side invite check to the routes. First-user bootstrap keeps
  its existing bypass.

### Option B — Require Supabase JWT, best-effort
Onboarding attaches `session.access_token` when present (pattern already used
in `BountyFormV2.tsx`).
- ✅ Simplest change.
- ❌ If the session lags at first-mint → 401 → user can't onboard. Only safe if
  we first PROVE the session always exists at that point (needs testing).

### Option C — Proxy behind a server route
Add one server-side onboarding route that holds the internal secret and does its
own invite check; the browser calls only that route, never `mint-*` directly.
- ✅ Cleanest boundary; browser never touches the privileged routes.
- ⚠️ Larger change; adds an indirection layer.

---

## New env var needed either way

`INTERNAL_API_SECRET` — a random secret shared by server-to-server callers
(donation route → mint route). Add to `.env` and Vercel. If unset, the internal
path fails closed (server calls would 401), so it MUST be configured before
deploy.

---

## Recommendation

**Option A.** It authenticates against the thing that actually confers the right
to mint (the invite), sidesteps the JWT timing risk entirely, and adds invite-
consumption tracking as a bonus. Option C is a fine alternative if you prefer a
hard server boundary. Option B is only acceptable if we first confirm the
Supabase session is always present at first-mint.

---

## RESOLUTION (2026-08-06) — invite-gating was NOT viable; here's what shipped

Mid-implementation we found that **"join without an invite code" is a supported
signup path** (`handleJoinWithoutCode` / empty-code branch in `page.tsx` store
`NO_CODE` and let the user through). That breaks Option A: if the mint routes
reject callers without a valid invite, we break real no-code signups; if they
accept no-code, the gate is meaningless. Invite re-validation and open self-serve
membership are mutually exclusive.

**So we secured by sensitivity instead ("lock advocate+hat, leave PoC open"):**

- **mint-poc — intentionally OPEN.** Self-serve membership is by design; the
  route dedupes on balance (a wallet already holding PoC is skipped). No auth
  gate. Comment added in the route explaining why.
- **mint-advocate — server-to-server ONLY** (`requireInternalSecret`). The one
  live caller (`donations/mint/confirm`) sends `x-internal-secret`. Voting-power
  minting is now closed to the public. First-user bootstrap branch retained but
  noted as server-only.
- **mint-hat — server-to-server ONLY** (`requireInternalSecret`). Founding-user
  bootstrap has already run; no live browser caller.

`src/lib/mintAuth.ts` now exports `requireInternalSecret(req)` (fails closed if
`INTERNAL_API_SECRET` unset). The invite-based `requireMintAuth` was removed.

**Action required before deploy:** set `INTERNAL_API_SECRET` in **Vercel** to the
same value now in `.env`, or donation-triggered Advocate mints will 401.
