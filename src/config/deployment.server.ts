/**
 * Server-only deployment configuration.
 *
 * Values here identify this deployment's mail senders, service wallets and
 * integrations. They are read from the environment with no fallback to any
 * real deployment's values. Do not import this file from client components.
 *
 * See .env.example and docs/configuration.md for the full list.
 */

import { appHost } from './deployment';

if (typeof window !== 'undefined') {
  throw new Error('src/config/deployment.server.ts must not be imported in the browser');
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function lowerList(value: string | undefined): string[] {
  return list(value).map((s) => s.toLowerCase());
}

// ─── Email ──────────────────────────────────────────────────────────────────

/** Sender for member email, for example `Example Org <hello@example.org>`. */
export function emailFrom(): string {
  return required('EMAIL_FROM', process.env.EMAIL_FROM);
}

/** Sender for donation receipts; defaults to EMAIL_FROM. */
export function emailFromDonations(): string {
  return process.env.EMAIL_FROM_DONATIONS || emailFrom();
}

/** Inbox that receives account-deletion and privacy requests. */
export function supportInbox(): string {
  return required(
    'SUPPORT_EMAIL',
    process.env.SUPPORT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  );
}

// ─── Service wallets ────────────────────────────────────────────────────────

/**
 * Smart-wallet address controlled by POD_ADMIN_PRIVATE_KEY through the
 * Coinbase Developer Platform. Used as the sender for sponsored backend
 * operations (minting, $SELF issuance, agent provisioning).
 */
export function backendSmartWallet(): `0x${string}` {
  const v = required(
    'BACKEND_SMART_WALLET_ADDRESS',
    process.env.BACKEND_SMART_WALLET_ADDRESS,
  );
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error('BACKEND_SMART_WALLET_ADDRESS is not an address');
  }
  return v as `0x${string}`;
}

/**
 * Extra contract addresses the paymaster route may sponsor calls to, in
 * addition to the contracts named in the NEXT_PUBLIC_* address variables
 * (for example pod treasuries that predate registration in the database).
 */
export const PAYMASTER_EXTRA_ALLOWLIST = lowerList(
  process.env.PAYMASTER_EXTRA_ALLOWLIST,
);

// ─── Community agent ────────────────────────────────────────────────────────

/**
 * Domain for the synthetic auth accounts created for community agents
 * (`<wallet>@<domain>`). Changing it after agents exist orphans their
 * accounts, so it has no derived default.
 */
export function agentEmailDomain(): string {
  return required('AGENT_EMAIL_DOMAIN', process.env.AGENT_EMAIL_DOMAIN);
}

/**
 * Pods whose agent is funded by the organisation instead of a treasury
 * subscription. Funding waives payment only; every agent still faces its
 * recurring existence referendum.
 */
export const AGENT_GRANT_FUNDED_POD_IDS = list(
  process.env.COMMUNITY_AGENT_GRANT_FUNDED_POD_IDS,
);

// ─── Integrations ───────────────────────────────────────────────────────────

/** Contact address sent to OpenStreetMap Nominatim, as its usage policy requires. */
export function geocodeContactEmail(): string {
  return required('GEOCODE_CONTACT_EMAIL', process.env.GEOCODE_CONTACT_EMAIL);
}

/** Origins allowed to call the Sensemaker chat API from another site. */
export function sensemakerAllowedOrigins(): string[] {
  const configured = list(process.env.SENSEMAKER_ALLOWED_ORIGINS);
  return configured.length > 0 ? configured : [`https://${appHost()}`];
}

/** Pinecone index holding the community knowledge base for the Sensemaker. */
export function pineconeIndexName(): string {
  return required('PINECONE_INDEX_NAME', process.env.PINECONE_INDEX_NAME);
}

/** Pinecone index holding the shared philosophy library (optional feature). */
export const PINECONE_PHILOSOPHY_INDEX =
  process.env.PINECONE_PHILOSOPHY_INDEX || undefined;
