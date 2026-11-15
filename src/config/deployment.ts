/**
 * Deployment configuration (safe for client and server).
 *
 * Everything that identifies a particular deployment of this app (its URL,
 * chain, pods, contact addresses) is read here from the environment. There
 * are deliberately no fallbacks to any real deployment's values: an instance
 * that has not configured a value gets `undefined` (optional values) or a
 * clear error when the value is used (required values).
 *
 * Only NEXT_PUBLIC_* variables belong in this file, because it is bundled into
 * the browser. Server-only settings live in ./deployment.server.ts.
 *
 * Next.js inlines NEXT_PUBLIC_* values at build time only when they are read
 * with a literal `process.env.NEXT_PUBLIC_X` expression, which is why every
 * read below is spelled out.
 *
 * The full list of variables, with descriptions, is in .env.example and
 * docs/configuration.md.
 */

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

// ─── App ────────────────────────────────────────────────────────────────────

/** Public base URL of this deployment, without a trailing slash. Required. */
export function appUrl(): string {
  return required('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL).replace(
    /\/+$/,
    '',
  );
}

/** Host name of this deployment (for example `app.example.org`). */
export function appHost(): string {
  return new URL(appUrl()).host;
}

/** Display name of the deployment, used in titles and wallet prompts. */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Community App';

/** Public contact address shown in footers, receipts and the terms page. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined;

/** Address members write to for account deletion and privacy requests. */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || CONTACT_EMAIL;

/** Optional public website of the organisation running this deployment. */
export const ORG_URL = process.env.NEXT_PUBLIC_ORG_URL || undefined;

/**
 * Legal name and US tax id (EIN) of the organisation, printed on donation
 * receipts and donation pages. Receipts claim tax-deductibility, so a
 * deployment that takes donations must set both to its own registered values.
 */
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || APP_NAME;
export const ORG_EIN = process.env.NEXT_PUBLIC_ORG_EIN || '';

/**
 * Wallets allowed to sign up without an invite code, to bootstrap the first
 * operator of a new deployment. Public: the check runs in the browser too.
 */
export const INVITE_BOOTSTRAP_WALLETS = list(
  process.env.NEXT_PUBLIC_INVITE_BOOTSTRAP_WALLETS,
).map((w) => w.toLowerCase());

// ─── Chain ──────────────────────────────────────────────────────────────────

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');

/** Primary RPC endpoint. Required for any on-chain read or write. */
export function rpcUrl(): string {
  return required('NEXT_PUBLIC_RPC_URL', process.env.NEXT_PUBLIC_RPC_URL);
}

/** Additional public RPC endpoints tried after the primary one. */
export const RPC_FALLBACKS = list(process.env.NEXT_PUBLIC_RPC_FALLBACKS);

/** Block explorer base URL for the configured chain. */
export const EXPLORER_URL =
  CHAIN_ID === 84532 ? 'https://sepolia.basescan.org' : 'https://basescan.org';

/** Paymaster / bundler endpoint used to sponsor members' transactions. */
export function paymasterUrl(): string {
  return required('NEXT_PUBLIC_PAYMASTER', process.env.NEXT_PUBLIC_PAYMASTER);
}

// ─── Pods with a structural role ────────────────────────────────────────────
// The governance model has a few pods with special meaning. Their ids are
// deployment data, so they come from the environment.

export const PODS = {
  /** The executive pod: leads platform governance and reviews new pods. */
  governance: process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID || undefined,
  /** The parent pod under which community pods are created. */
  communityParent: process.env.NEXT_PUBLIC_COMMUNITY_POD_ID || undefined,
  /** Community that new members are enrolled in at onboarding (optional). */
  defaultCommunity: process.env.NEXT_PUBLIC_DEFAULT_POD_ID || undefined,
  /**
   * Pod whose community agent runs the dedicated Kairos persona and also
   * draws on the shared philosophy corpus (optional).
   */
  kairos: process.env.NEXT_PUBLIC_KAIROS_POD_ID || undefined,
} as const;

/** True when `podId` is the configured governance (executive) pod. */
export function isGovernancePod(podId: string | null | undefined): boolean {
  return Boolean(podId && PODS.governance && podId === PODS.governance);
}

/** The governance pod id, or an error if it is not configured. */
export function governancePodId(): string {
  return required('NEXT_PUBLIC_GOVERNANCE_POD_ID', PODS.governance);
}

// ─── Hosts used by the browser ──────────────────────────────────────────────

/** Public host serving large media such as knowledge-base videos (optional). */
export const FILES_HOST = process.env.NEXT_PUBLIC_FILES_HOST || undefined;

export const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';

/** Google Analytics 4 measurement id; analytics is off when unset. */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;

/**
 * Base builder code (for example `bc_xxxxxxxx`) used for ERC-8021 transaction
 * attribution. Attribution is omitted when unset.
 */
export const BUILDER_CODE = process.env.NEXT_PUBLIC_BUILDER_CODE || undefined;

const ERC8021_MARKER = '80218021802180218021802180218021';
const builderCodeParts = BUILDER_CODE
  ? {
      codes: Array.from(new TextEncoder().encode(BUILDER_CODE), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
      length: BUILDER_CODE.length.toString(16).padStart(2, '0'),
    }
  : undefined;

/**
 * ERC-8021 schema-0 suffix: codes ‖ codesLength ‖ schemaId(0) ‖ marker.
 * Appended to wagmi transactions and to CDP user operations alike. Check an
 * attributed transaction with Base's Builder Code Validation tool.
 */
export const BUILDER_CODE_SUFFIX = builderCodeParts
  ? (`0x${builderCodeParts.codes}${builderCodeParts.length}00${ERC8021_MARKER}` as `0x${string}`)
  : undefined;

/** Base mini-app id advertised in the page head (optional). */
export const BASE_APP_ID = process.env.NEXT_PUBLIC_BASE_APP_ID || undefined;
