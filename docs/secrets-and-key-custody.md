# Secrets and key custody

*Written 2026-09-20 as item 5 of the hardening plan. Contains no secret values,
only names, what each one can do, and how to rotate it. Safe to make public.*

---

## The finding that matters most

**Three of the most powerful credentials in the system are in this repository's
git history, and they are still the live values.**

`.env` was committed on 2024-12-06 and again on 2025-01-07, and `.env.local` on
2025-01-16. All three commits were later removed from the working tree, but git
keeps the blobs forever. Comparing the historical values against the current
ones by hash, without printing either:

| Credential | In git history since | Still the live value |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | 2024-12-06 | yes |
| `SUPABASE_JWT_SECRET` | 2024-12-06 | yes |
| `SUPABASE_DB_PASSWORD` | 2024-12-06 | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 2024-12-06 | yes, and public by design — not a concern |

Both API keys are JWTs signed by `SUPABASE_JWT_SECRET`. Anyone holding the
secret can mint their own service role key at any time, so the secret being in
history is the whole of the problem; the keys are downstream of it.

That is 652 days. What each one grants to anyone holding it:

- **Service role key** — reads and writes every table, bypassing all row
  security. Today's anonymous lockdown does not apply to it.
- **JWT secret** — mints a valid session for any member, including the
  `wallet_address` claim. Server-side authority is now decided from hats on
  chain, so this cannot forge a pod leader, but it can read and write anything
  an ordinary member can, as anyone.
- **Database password** — direct SQL, including schema changes.

### How exposed is it, really

The repository is private, so this is not public knowledge. Two things stop it
being a shrug:

1. **The history begins with Coinbase-authored commits from December 2023**, so
   this project is derived from a public upstream. If it is a GitHub *fork*
   rather than an independent copy, objects pushed to a private fork can be
   retrieved from the public parent by anyone who knows the commit hash. Worth
   checking on the repository page whether it says "forked from". If it does,
   treat these three as public and rotate today.
2. **Item 15 of the plan is to open the repository.** That cannot happen until
   these are rotated, regardless of the answer to the above.

### What I did not do

I did not rotate them. Each has a blast radius that needs a person present:

- Rotating the **JWT secret** signs every member out at once.
- Rotating the **service role key** breaks the app between the rotation and the
  Vercel environment being updated.
- Neither can be done from here in any case: rotation happens in the Supabase
  dashboard, and no management token exists on this machine.

The runbook below makes each one a short, ordered operation.

---

## Where secrets live today

Every secret sits in one plaintext file, `App/commapp/.env`, holding **42
non-public values**. The same file is the source for the Vercel production
environment. There is no password manager in the loop and no separation between
credentials that read and credentials that can move money or mint roles.

`.gitignore` does cover `*.env`, and as of today a pre-push hook refuses any
push whose commits touch a secrets file, so the 2024 mistake cannot repeat
silently. Neither helps with what is already in the history.

### The ones that can do real damage

| Name | What it can do | Notes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | full database read and write, ignores row security | in git history |
| `SUPABASE_JWT_SECRET` | mint a session as any member | in git history |
| `SUPABASE_DB_PASSWORD` | direct SQL and schema changes | in git history |
| `POD_ADMIN_PRIVATE_KEY` | signs as the backend hat admin: mints and revokes roles | contract key |
| `EXECUTIVE_MINTING_PRIVATE_KEY` | mints executive-level credentials | contract key |
| `PRIVATE_KEY`, `TEST_PRIVATE_KEY` | general signing keys | contract keys |
| `AGENT_WALLET_MASTER_KEY`, `MINTING_WALLET_DATA` | derives agent wallets | contract material |
| `VERCEL_TOKEN` | deploy, read and write environment variables | |
| `STRIPE_*` (7 values) | charge cards, receive webhooks | money |
| `RESEND_API_KEY`, `SMTP_PASS` | send mail as the organisation | reputation |
| `CRON_SECRET`, `INTERNAL_API_SECRET` | call internal endpoints | |
| `PINATA_JWT` | write to the file store | |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PINECONE_API_KEY` | spend money | |
| `VAPID_PRIVATE_KEY` | send push notifications to members | |

The top hat and the backend admin key remain single signers. That is a separate
item in the plan (13) and a governance question as much as a technical one.

---

## Rotation runbook

**Corrected 2026-09-20 after checking how the keys are actually built.** The
anon key and the service role key are not independent secrets: both are JWTs
signed by `SUPABASE_JWT_SECRET`, issued 2024-12-06 and valid until 2034.
Verified by checking each one's signature against the secret.

That has one large consequence: **rotating the JWT secret invalidates both API
keys at once.** They are not three rotations, they are two — the database
password, and everything else together. Rotating the secret without replacing
both keys in the same sitting takes the app down, because the old keys stop
verifying the moment the secret changes.

### 1. Database password — do this first, nothing breaks

1. Supabase dashboard → Project Settings → Database → Reset database password.
2. Put the new value in local `.env` as `SUPABASE_DB_PASSWORD`, and update the
   Vercel entry (`dPUhOvGL15lpVwsV`).
3. Nothing deployed authenticates with it; it is used for applying migrations
   from a developer machine.

Downtime: none. Sessions: unaffected.

### 2. JWT secret, anon key and service role key — one operation

This ends every signed-in session. Announce it, or accept that members will be
asked to sign in again with no warning.

1. Supabase dashboard → Project Settings → API → JWT Settings → generate a new
   JWT secret. The anon and service role keys shown on that page are reissued
   at the same time.
2. Copy all three new values: JWT secret, anon key, service role key.
3. Update all three in local `.env` **and** in Vercel, across production,
   preview and development. The entry ids are `id5AehaVTvrH9xyQ` (JWT secret),
   `tfTy4t7uHfktnfy3` (anon key) and `nmTcXoSwIVy1qQmj` (service role key).
4. Redeploy production. The anon key is compiled into the browser bundle, so a
   redeploy is required, not optional.
5. Verify with `npm run verify:prod`. Every suite authenticates with the new
   values, so a pass is real evidence the rotation is complete.
6. Sign in as a member and confirm a normal session works.

Downtime: the window between step 1 and the redeploy finishing. Sessions: all
of them end.

### 4. Contract keys — needs a decision first

`POD_ADMIN_PRIVATE_KEY` and `EXECUTIVE_MINTING_PRIVATE_KEY` cannot be rotated
like an API key: the address is what holds authority on chain, so a new key
means granting the new address its hats and revoking the old one. Sequence:

1. Decide custody: hardware wallet, or a cloud key service. A hardware wallet is
   cheaper and means a person signs; a key service keeps the scheduled jobs that
   currently sign with these keys working unattended. **The scheduled jobs are
   the deciding factor and this choice is still open.**
2. Generate the new key inside the chosen custody.
3. Grant the new address the hats the old one administers.
4. Move the app to the new address.
5. Revoke the old address, and verify with `scripts/verify-authority.mjs`.

Until then the old keys stay in `.env`, which is the status quo rather than a
regression.

### 5. Everything else

Stripe, Resend, Pinata, the model providers, VAPID and the Vercel token each
rotate in their own dashboard. None has been seen in a log. Rotate them when
convenient, after the three above.

---

## Where secrets should live

Once the three database credentials are rotated, the destination matters more
than the rotation:

- **Contract keys**: hardware wallet or key service. Never in a file.
- **Everything else**: a password manager as the source of truth, with Vercel
  holding its own copy for the deployed app. `.env` becomes a working copy that
  can be deleted and regenerated rather than the only place a value exists.
- **CI**: the security workflow needs the service role key and the JWT secret as
  repository secrets. That is a third copy of two powerful credentials, so it is
  worth revisiting when the repository opens: a fork's pull request cannot read
  them, and the workflow is already limited to pushes on `main` for that reason.

## What is already done

- `.gitignore` covers `*.env`.
- A pre-push hook refuses commits touching a secrets file (`npm run hooks:install`).
- The LiveKit API secret, which did appear in a session log on 2026-09-11, was
  rotated on 2026-09-18, and the old pair is rejected by the server.
- The SSH key for the LiveKit host was replaced on 2026-09-18 and the old one
  removed from the server.
