// Client-side SDK for the password vault API.
//
// All methods return parsed JSON or throw with a helpful message.
// Auth tokens are pulled from supabase-js's current session and sent
// as Bearer headers — server routes verify via SUPABASE_JWT_SECRET.
//
// This is the only file UI components should import to talk to the
// vault backend. It does NOT do any crypto — that's vaultCrypto.ts.

import { supabase } from '@/utils/supabaseClient';

// ── Types matching the API response shapes ──────────────────────────────

export interface VaultEntry {
  id: string;
  podId: string;
  label: string;
  tags: string[];
  /** pod_role_permissions IDs allowed to read. Empty = any reader. */
  allowedRoleIds: string[];
  loginCiphertext: string | null;
  loginIv: string | null;
  notesCiphertext: string | null;
  notesIv: string | null;
  passwordCiphertext: string;
  passwordIv: string;
  senderPubkey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  myWrappedKey: string | null;
}

export interface VaultRole {
  id: string;
  name: string;
  type: string;
  hasPasswordsAccess: boolean;
  hasPasswordsManage: boolean;
}

export interface VaultPendingGrant {
  id: string;
  entryId: string;
  newcomerEoa: string;
  createdAt: string;
}

export interface VaultRotationJob {
  id: string;
  evictedEoa: string;
  status: 'pending' | 'in_progress' | 'complete';
  createdAt: string;
}

export interface VaultRecipient {
  eoaAddress: string;
  publicKey: string | null;
  roles: string[];
  /** pod_role_permissions IDs this wallet currently holds in the pod. */
  roleIds: string[];
  isManager: boolean;
  hasPublishedKey: boolean;
}

export interface VaultWrapInput {
  recipientEoa: string;
  wrappedKey: string;
}

export interface CreateEntryInput {
  label: string;
  tags?: string[];
  /** Empty array / undefined = any reader with passwordsAccess. */
  allowedRoleIds?: string[];
  passwordCiphertext: string;
  passwordIv: string;
  loginCiphertext?: string | null;
  loginIv?: string | null;
  notesCiphertext?: string | null;
  notesIv?: string | null;
  senderPubkey: string;
  wraps: VaultWrapInput[];
}

export interface UpdateEntryInput extends CreateEntryInput {
  // PUT requires the same fields as create (re-encrypt rotates the key).
}

export interface SubmitGrantsInput {
  wraps: Array<{
    entryId: string;
    recipientEoa: string;
    /** Pubkey of the granter — needed because each wrap is bound to its sender. */
    senderPubkey: string;
    wrappedKey: string;
  }>;
}

export interface SubmitRotationInput {
  jobId: string;
  entries: Array<{
    entryId: string;
    passwordCiphertext: string;
    passwordIv: string;
    loginCiphertext?: string | null;
    loginIv?: string | null;
    notesCiphertext?: string | null;
    notesIv?: string | null;
    senderPubkey: string;
    wraps: VaultWrapInput[];
  }>;
}

// ── Internal helpers ────────────────────────────────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated — please reconnect your wallet');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const headers = await authHeader();
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text };
  }
  if (!res.ok) {
    const msg = parsed?.error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as T;
}

// ── User-key endpoints ──────────────────────────────────────────────────

export async function getUserPubkey(
  eoaAddress: string,
): Promise<string | null> {
  const eoa = eoaAddress.toLowerCase();
  const res = await request<{ publicKey: string | null }>(
    'GET',
    `/api/vault/keys?eoa=${encodeURIComponent(eoa)}`,
  );
  return res.publicKey;
}

export async function getUserPubkeys(
  eoaAddresses: string[],
): Promise<Record<string, string>> {
  if (eoaAddresses.length === 0) return {};
  const eoas = eoaAddresses.map((e) => e.toLowerCase()).join(',');
  if (eoaAddresses.length === 1) {
    // Server returns { publicKey } for single, { keys } for many. Normalize.
    const res = await request<{ publicKey: string | null }>(
      'GET',
      `/api/vault/keys?eoa=${encodeURIComponent(eoas)}`,
    );
    return res.publicKey ? { [eoaAddresses[0].toLowerCase()]: res.publicKey } : {};
  }
  const res = await request<{ keys: Record<string, string> }>(
    'GET',
    `/api/vault/keys?eoa=${encodeURIComponent(eoas)}`,
  );
  return res.keys ?? {};
}

export async function publishMyPubkey(
  eoaAddress: string,
  publicKey: string,
): Promise<void> {
  await request<{ success: true }>('POST', '/api/vault/keys', {
    eoaAddress: eoaAddress.toLowerCase(),
    publicKey,
  });
}

// ── Entry endpoints ─────────────────────────────────────────────────────

export async function listEntries(podId: string): Promise<VaultEntry[]> {
  const res = await request<{ entries: VaultEntry[] }>(
    'GET',
    `/api/pods/${podId}/passwords`,
  );
  return res.entries ?? [];
}

export async function getEntry(
  podId: string,
  entryId: string,
): Promise<VaultEntry> {
  const res = await request<{ entry: VaultEntry }>(
    'GET',
    `/api/pods/${podId}/passwords/${entryId}`,
  );
  return res.entry;
}

export async function createEntry(
  podId: string,
  input: CreateEntryInput,
): Promise<{ id: string }> {
  return request<{ id: string }>('POST', `/api/pods/${podId}/passwords`, input);
}

export async function updateEntry(
  podId: string,
  entryId: string,
  input: UpdateEntryInput,
): Promise<void> {
  await request<{ success: true }>(
    'PUT',
    `/api/pods/${podId}/passwords/${entryId}`,
    input,
  );
}

export async function deleteEntry(
  podId: string,
  entryId: string,
): Promise<void> {
  await request<{ success: true }>(
    'DELETE',
    `/api/pods/${podId}/passwords/${entryId}`,
  );
}

// ── Recipients ──────────────────────────────────────────────────────────

export async function getRecipients(
  podId: string,
  /** Restrict to wallets holding one of these role IDs (audience filter). */
  roleIds?: string[],
): Promise<VaultRecipient[]> {
  let url = `/api/pods/${podId}/passwords/recipients`;
  if (roleIds && roleIds.length > 0) {
    url += `?roleIds=${encodeURIComponent(roleIds.join(','))}`;
  }
  const res = await request<{ recipients: VaultRecipient[] }>('GET', url);
  return res.recipients ?? [];
}

// ── Pod roles (for audience picker) ─────────────────────────────────────

export async function getRoles(podId: string): Promise<VaultRole[]> {
  const res = await request<{ roles: VaultRole[] }>(
    'GET',
    `/api/pods/${podId}/passwords/roles`,
  );
  return res.roles ?? [];
}

// ── Grant queue ─────────────────────────────────────────────────────────

export async function getPendingGrants(
  podId: string,
): Promise<VaultPendingGrant[]> {
  const res = await request<{ grants: VaultPendingGrant[] }>(
    'GET',
    `/api/pods/${podId}/passwords/grants`,
  );
  return res.grants ?? [];
}

export async function submitGrants(
  podId: string,
  input: SubmitGrantsInput,
): Promise<{ granted: number }> {
  return request<{ success: true; granted: number }>(
    'POST',
    `/api/pods/${podId}/passwords/grants`,
    input,
  );
}

// ── Rotation queue ──────────────────────────────────────────────────────

export async function getRotationJobs(
  podId: string,
): Promise<VaultRotationJob[]> {
  const res = await request<{ jobs: VaultRotationJob[] }>(
    'GET',
    `/api/pods/${podId}/passwords/rotations`,
  );
  return res.jobs ?? [];
}

export async function submitRotation(
  podId: string,
  input: SubmitRotationInput,
): Promise<{ rotated: number }> {
  return request<{ success: true; rotated: number }>(
    'POST',
    `/api/pods/${podId}/passwords/rotations`,
    input,
  );
}
