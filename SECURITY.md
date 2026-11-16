# Security policy

SpiritDAO runs this code in production for real communities, and the contracts
hold real funds. We want to hear about problems, and we will treat reporters
with respect.

## Reporting a vulnerability

Email **ron@spiritdao.org** with a description of the issue, steps to
reproduce, and the impact you believe it has. Encrypting is not required. Please
do not open a public GitHub issue, discussion or pull request for a security
problem, and please do not test against the production deployment at
app.spiritdao.org or its contracts beyond what is needed to confirm the issue.

You should hear back within five working days. We will tell you what we found,
what we intend to do, and when. Once a fix is live we are happy to credit you in
the release notes if you want that.

## Scope

In scope:

- This repository: the Next.js app, API routes, Supabase migrations and RLS
  policies, and the Solidity contracts under `src/contracts/`.
- The production deployment at app.spiritdao.org, for issues that can be
  demonstrated without harming members or funds.

Out of scope:

- Third-party services we depend on (Coinbase Developer Platform, Supabase,
  Vercel, LiveKit, Hats Protocol, Base). Report those to the vendor.
- Denial of service, rate-limit exhaustion, or anything that requires
  volumetric testing against production.
- Issues that need a member's own device or credentials to be compromised first.

## What we consider serious

- Any path that lets one member read another member's private data: direct
  messages, email, location, or event registrations for events they neither
  attend nor organise. Anything readable without signing in.
- Not private by design: signed-in members can see who belongs to which pod
  and how members voted (membership is an on-chain hat anyway), and public
  profile fields. Reports that a member can read these are not
  vulnerabilities, but reports that a non-member or a signed-out visitor can
  are.
- Any path that lets a caller act as a member they are not, on-chain or in the
  database.
- Treasury, bounty or donation flows that move funds without the required
  signatures.
- Service-role or admin routes reachable without the intended authorization.

## Past work

The authority model and the history of the hardening work are documented in
`docs/permission-systems-architecture.md`, `docs/secrets-and-key-custody.md`,
and the dated audits under `docs/` and `docs/archive/audits/`. Reading them
first will save you time and may point you at the areas we are least sure of.
