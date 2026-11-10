# Contributing

Thanks for looking at this. SpiritDAO is a small nonprofit with one maintainer,
so the most useful contributions are the ones that are easy to review.

## Before you start

- Read [`docs/README.md`](docs/README.md), then the architecture docs it lists
  first: pods architecture, authentication and session model, permission design.
- Open an issue before a large change so we can agree on the approach.
- Security problems go to the address in [`SECURITY.md`](SECURITY.md), never to a
  public issue or pull request.

## Ground rules that come from the codebase

These are the constraints every change has to respect. They exist because the
app handles membership in a religious nonprofit, which is sensitive personal
data, and moves real funds on-chain.

1. **Authority lives on the server, the chain and Row Level Security.** Never
   trust a wallet address or role from the request body. New API writes go
   through the guards in `src/lib/apiPodGuard.ts` and `src/lib/serverPodAuth.ts`,
   or through RLS. Do not add service-role routes that skip them.
2. **On-chain writes are signed by the caller's own smart wallet.** The backend
   admin keys are for provisioning, not for acting on a member's behalf.
3. **Never commit secrets or personal data.** No `.env*`, key files, member
   emails, or exports. `npm run hooks:install` installs a pre-push hook that
   refuses commits touching secrets files. `.env.example` is the only place a
   variable name is introduced.
4. **Schema changes are migrations.** Add a timestamped file under
   `supabase/migrations/`, wrap it in a transaction, and note in the PR that it
   must be applied by hand. Never edit an applied migration.
5. **Private data must not reach another member's browser.** `npm run
   verify:static` checks the obvious cases and runs in CI. Think about the
   non-obvious ones.
6. **Document what you build.** A user-facing change gets a short guide under
   `docs/` or in the in-app docs, and an entry in `docs/README.md`.

## Workflow

```bash
git checkout -b my-change
npm install
npm run dev
# make the change
npm run check          # biome
npm test               # vitest (some inherited suites are known-red; do not make them worse)
npm run verify:static
```

Open a pull request against `main` using the template. Describe what changed
and why, how you tested it, and anything a reviewer should look at closely.
Pull requests from forks do not receive repository secrets, so the production
verification suites will not run on them; the maintainer runs those before
merging.

Merging to `main` deploys to production. Keep that in mind when you ask for a
merge and when you review one.

## Code style

- TypeScript, React function components, Tailwind.
- Formatting and lint via Biome (`npm run check`).
- Keep features inside `src/features/<feature>/` with `components/`, `hooks/`,
  `services/` and `types.ts`. Shared server helpers go in `src/lib/`.
- Prefer small, reviewable commits with messages that say what and why.

## License

By contributing you agree that your contributions are licensed under the MIT
License that covers this repository.
