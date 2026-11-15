#!/usr/bin/env node
/**
 * Build-time configuration check (runs as part of `npm run prebuild`).
 *
 * Fails the build with a readable list when a required environment variable
 * is missing, instead of letting the app start and fail on first use. On
 * Vercel a failed build leaves the previous deployment serving.
 *
 * Variables are loaded the same way Next.js loads them (.env, .env.local,
 * .env.production, ...), so local builds see the same values.
 *
 * Set SKIP_ENV_CHECK=1 to bypass (for example in CI jobs that only lint).
 * The full list with descriptions is in .env.example and docs/configuration.md.
 */
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

if (process.env.SKIP_ENV_CHECK === '1') {
  console.log('[check-env] skipped (SKIP_ENV_CHECK=1)');
  process.exit(0);
}

/** Required for every deployment. */
const REQUIRED = {
  NEXT_PUBLIC_APP_URL: 'Public base URL of this deployment, e.g. https://app.example.org',
  NEXT_PUBLIC_SUPABASE_URL: 'Supabase project URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Supabase publishable (anon) key',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase secret (service role) key, server only',
  NEXT_PUBLIC_CDP_PROJECT_ID: 'Coinbase Developer Platform project id (embedded wallets)',
  NEXT_PUBLIC_RPC_URL: 'RPC endpoint for the chain',
  NEXT_PUBLIC_PAYMASTER: 'Paymaster / bundler endpoint that sponsors member transactions',
  NEXT_PUBLIC_GOVERNANCE_POD_ID: 'UUID of the governance (executive) pod row',
  NEXT_PUBLIC_SYSTEM_TOKEN: '$SYSTEM token contract',
  NEXT_PUBLIC_SELF_TOKEN: '$SELF token contract',
  NEXT_PUBLIC_PROOF_OF_CURIOSITY: 'Membership (Proof of Curiosity) NFT contract',
  CRON_SECRET: 'Shared secret Vercel cron jobs send to /api/cron/*',
};

/** Required together: if any one is set, all must be. */
const GROUPS = [
  ['RESEND_API_KEY', 'EMAIL_FROM'],
  ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
  ['POD_ADMIN_PRIVATE_KEY', 'BACKEND_SMART_WALLET_ADDRESS'],
  ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME'],
];

const ADDRESS_VARS = [
  'NEXT_PUBLIC_SYSTEM_TOKEN',
  'NEXT_PUBLIC_SELF_TOKEN',
  'NEXT_PUBLIC_PROOF_OF_CURIOSITY',
  'BACKEND_SMART_WALLET_ADDRESS',
];
const UUID_VARS = [
  'NEXT_PUBLIC_GOVERNANCE_POD_ID',
  'NEXT_PUBLIC_COMMUNITY_POD_ID',
  'NEXT_PUBLIC_DEFAULT_POD_ID',
  'NEXT_PUBLIC_KAIROS_POD_ID',
];

const problems = [];
const has = (k) => Boolean(process.env[k] && process.env[k].trim());

for (const [k, why] of Object.entries(REQUIRED)) {
  if (!has(k)) problems.push(`missing ${k} — ${why}`);
}
for (const group of GROUPS) {
  const set = group.filter(has);
  if (set.length > 0 && set.length < group.length) {
    problems.push(`${group.filter((k) => !has(k)).join(', ')} must be set because ${set.join(', ')} is set`);
  }
}
for (const k of ADDRESS_VARS) {
  if (has(k) && !/^0x[0-9a-fA-F]{40}$/.test(process.env[k].trim())) problems.push(`${k} is not an address`);
}
for (const k of UUID_VARS) {
  if (has(k) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env[k].trim())) {
    problems.push(`${k} is not a UUID`);
  }
}
if (has('NEXT_PUBLIC_APP_URL')) {
  try {
    new URL(process.env.NEXT_PUBLIC_APP_URL);
  } catch {
    problems.push('NEXT_PUBLIC_APP_URL is not a URL');
  }
}

if (problems.length > 0) {
  console.error('\n[check-env] Configuration is incomplete:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nSee .env.example and docs/configuration.md. Set SKIP_ENV_CHECK=1 to bypass.\n');
  process.exit(1);
}
console.log('[check-env] configuration OK');
