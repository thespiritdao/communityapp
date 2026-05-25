// Pure crypto helpers for the pod password vault.
//
// Design (full architecture in docs/governance/... TODO):
//
//   identity key (per user)
//     deterministic seed = HKDF-SHA256(
//       ikm  = sigBytes,                 (CDP personal_sign over canonical message)
//       salt = "spiritdao-vault-v1",
//       info = "x25519-identity"
//     )                                  -> 32 bytes
//     X25519 secret = clamp(seed)
//     X25519 pubkey = scalarMultBase(secret)
//
//   per-entry content key
//     content_key = random 32 bytes (AES-GCM-256)
//     ciphertext  = AES-GCM(content_key, iv=random 12B, aad=label||sender_pub) -> password bytes
//
//   wrap content_key for each recipient
//     shared   = X25519(sender_secret, recipient_pubkey)
//     kek      = HKDF-SHA256(
//                  ikm  = shared,
//                  salt = sender_pubkey || recipient_pubkey,
//                  info = "spiritdao-vault-wrap-v1"
//                )            -> 32 bytes
//     wrapped  = AES-GCM(kek, iv=random 12B, aad=sender_pubkey||recipient_pubkey) -> content_key
//
//   unwrap (recipient side)
//     shared = X25519(recipient_secret, sender_pubkey)         (symmetric ECDH)
//     kek    = same HKDF derivation as above
//     content_key = AES-GCM-decrypt(kek, ...)
//
// Implementation uses Web Crypto API for AES-GCM (native, audited) and
// @noble/curves + @noble/hashes for X25519 + HKDF (no native browser
// support for X25519 yet).
//
// All public functions return base64url-encoded strings for portability
// over JSON. Binary buffers stay internal.

import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

// ── encoding helpers ──────────────────────────────────────────────────────

function bytesToBase64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// Hex-string (with or without 0x) → bytes. CDP signatures are 0x-hex.
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('hex string has odd length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ── canonical message (must match exactly what the UI signs) ──────────────

export const CANONICAL_IDENTITY_MESSAGE_VERSION = 'v1';
export function buildCanonicalIdentityMessage(eoaAddress: string): string {
  const eoa = eoaAddress.toLowerCase();
  return [
    `SpiritDAO Password Vault — derive identity key ${CANONICAL_IDENTITY_MESSAGE_VERSION}`,
    '',
    `Wallet: ${eoa}`,
    '',
    'Do not sign this message outside the SpiritDAO app.',
  ].join('\n');
}

// ── identity key derivation ───────────────────────────────────────────────

export interface IdentityKeypair {
  /** 32-byte X25519 secret key, base64url. KEEP IN MEMORY ONLY. */
  secretKey: string;
  /** 32-byte X25519 public key, base64url. Safe to publish. */
  publicKey: string;
}

/**
 * Derive an X25519 keypair from a CDP `signEvmMessage` signature.
 * The signature must be the EIP-191 personal_sign output over
 * `buildCanonicalIdentityMessage(eoaAddress)` — same message → same key.
 *
 * The signature itself never leaves the browser. Only the public key
 * (returned here) is safe to publish to the server.
 */
export function deriveIdentityKeypair(signatureHex: string): IdentityKeypair {
  const sigBytes = hexToBytes(signatureHex);
  if (sigBytes.length === 0) throw new Error('signature must not be empty');

  const seed = hkdf(
    sha256,
    sigBytes, // ikm
    utf8ToBytes('spiritdao-vault-v1'), // salt
    utf8ToBytes('x25519-identity'), // info
    32,
  );

  // x25519.getPublicKey clamps internally, so we just store the seed
  // as the secret and derive the public side from it.
  const publicKey = x25519.getPublicKey(seed);

  return {
    secretKey: bytesToBase64url(seed),
    publicKey: bytesToBase64url(publicKey),
  };
}

// ── content-key generation + AES-GCM helpers ──────────────────────────────

/** Generate a fresh AES-GCM-256 content key. Returns base64url(32 bytes). */
export async function generateContentKey(): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64url(raw);
}

/** Random 12-byte AES-GCM IV. */
function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

async function importAesGcmKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  /** base64url(IV) */
  iv: string;
  /** base64url(ciphertext || tag) */
  ciphertext: string;
}

/**
 * AES-GCM encrypt with optional AAD. Returns base64url-encoded IV + ciphertext.
 *
 * NOTE: SubtleCrypto in some browsers (recent Chrome/Safari) rejects
 * `additionalData: undefined` even though it's "optional." We omit the
 * key entirely when no AAD is provided. Node's webcrypto is more
 * permissive, which is why this bug only surfaced in the browser.
 */
export async function aesGcmEncrypt(
  contentKeyB64: string,
  plaintext: string,
  aad?: Uint8Array,
): Promise<EncryptedBlob> {
  const key = await importAesGcmKey(base64urlToBytes(contentKeyB64));
  const iv = randomIv();
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
  if (aad) params.additionalData = aad as BufferSource;
  const ctBuf = await crypto.subtle.encrypt(
    params,
    key,
    utf8ToBytes(plaintext) as BufferSource,
  );
  return {
    iv: bytesToBase64url(iv),
    ciphertext: bytesToBase64url(new Uint8Array(ctBuf)),
  };
}

/**
 * AES-GCM decrypt. Throws on bad key / IV / AAD / tag mismatch.
 */
export async function aesGcmDecrypt(
  contentKeyB64: string,
  blob: EncryptedBlob,
  aad?: Uint8Array,
): Promise<string> {
  const key = await importAesGcmKey(base64urlToBytes(contentKeyB64));
  const iv = base64urlToBytes(blob.iv);
  const ct = base64urlToBytes(blob.ciphertext);
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
  if (aad) params.additionalData = aad as BufferSource;
  const ptBuf = await crypto.subtle.decrypt(params, key, ct as BufferSource);
  return bytesToUtf8(new Uint8Array(ptBuf));
}

// ── wrap / unwrap content keys for X25519 recipients ──────────────────────

/** AAD binding a wrapped key to a specific (sender, recipient) pair. */
function wrapAad(senderPublicKeyB64: string, recipientPublicKeyB64: string): Uint8Array {
  return utf8ToBytes(`spiritdao-vault-wrap-v1|${senderPublicKeyB64}|${recipientPublicKeyB64}`);
}

function deriveWrapKek(
  senderSecretKeyB64: string,
  senderPublicKeyB64: string,
  recipientPublicKeyB64: string,
): Uint8Array {
  const senderSk = base64urlToBytes(senderSecretKeyB64);
  const recipientPk = base64urlToBytes(recipientPublicKeyB64);
  const shared = x25519.getSharedSecret(senderSk, recipientPk);
  // Bind salt to sender||recipient pubkeys so a swapped pair can't reuse a KEK.
  const salt = concatBytes(
    base64urlToBytes(senderPublicKeyB64),
    base64urlToBytes(recipientPublicKeyB64),
  );
  return hkdf(
    sha256,
    shared,
    salt,
    utf8ToBytes('spiritdao-vault-wrap-v1'),
    32,
  );
}

/**
 * Wrap (encrypt) a content key for a single recipient.
 * Returns a base64url string containing `iv || ciphertext || tag`.
 */
export async function wrapContentKey(args: {
  contentKeyB64: string;
  senderSecretKeyB64: string;
  senderPublicKeyB64: string;
  recipientPublicKeyB64: string;
}): Promise<string> {
  const kek = deriveWrapKek(
    args.senderSecretKeyB64,
    args.senderPublicKeyB64,
    args.recipientPublicKeyB64,
  );
  const key = await importAesGcmKey(kek);
  const iv = randomIv();
  const aad = wrapAad(args.senderPublicKeyB64, args.recipientPublicKeyB64);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
    key,
    base64urlToBytes(args.contentKeyB64) as BufferSource,
  );
  return bytesToBase64url(concatBytes(iv, new Uint8Array(ctBuf)));
}

/**
 * Unwrap (decrypt) a content key for the calling recipient.
 * X25519 ECDH is symmetric — same shared secret regardless of direction —
 * so the recipient uses their own secret + the sender's public key.
 */
export async function unwrapContentKey(args: {
  wrappedB64: string;
  recipientSecretKeyB64: string;
  recipientPublicKeyB64: string;
  senderPublicKeyB64: string;
}): Promise<string> {
  // Note: from the recipient's perspective they are the "sender" for the
  // purpose of deriveWrapKek (their secret, the other side's public). The
  // AAD/salt order is fixed by sender||recipient — we keep that ordering
  // consistent with the wrap call.
  const sharedKek = (() => {
    const shared = x25519.getSharedSecret(
      base64urlToBytes(args.recipientSecretKeyB64),
      base64urlToBytes(args.senderPublicKeyB64),
    );
    const salt = concatBytes(
      base64urlToBytes(args.senderPublicKeyB64),
      base64urlToBytes(args.recipientPublicKeyB64),
    );
    return hkdf(
      sha256,
      shared,
      salt,
      utf8ToBytes('spiritdao-vault-wrap-v1'),
      32,
    );
  })();

  const key = await importAesGcmKey(sharedKek);
  const wrapped = base64urlToBytes(args.wrappedB64);
  if (wrapped.length < 12 + 16) {
    throw new Error('wrapped key blob is too short');
  }
  const iv = wrapped.slice(0, 12);
  const ct = wrapped.slice(12);
  const aad = wrapAad(args.senderPublicKeyB64, args.recipientPublicKeyB64);
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
    key,
    ct as BufferSource,
  );
  return bytesToBase64url(new Uint8Array(ptBuf));
}

// ── high-level "create entry" / "open entry" helpers ──────────────────────

export interface VaultEntryRecipient {
  /** EOA address, lowercase. */
  eoaAddress: string;
  /** base64url X25519 public key. */
  publicKey: string;
}

export interface CreatedEntry {
  passwordCiphertext: string;
  passwordIv: string;
  loginCiphertext: string | null;
  loginIv: string | null;
  notesCiphertext: string | null;
  notesIv: string | null;
  senderPubkey: string;
  wraps: Array<{
    recipientEoa: string;
    wrappedKey: string;
  }>;
}

/**
 * Build the full payload to send to the server when creating a new vault entry.
 * Generates a fresh content key, encrypts the password (and optional notes),
 * and wraps the content key for each recipient.
 *
 * The label and tags are NOT encrypted — they're plaintext for search/index.
 */
export async function createEntryPayload(args: {
  passwordPlaintext: string;
  loginPlaintext?: string;
  notesPlaintext?: string;
  sender: IdentityKeypair;
  recipients: VaultEntryRecipient[];
}): Promise<CreatedEntry> {
  if (args.recipients.length === 0) {
    throw new Error('createEntryPayload: at least one recipient required');
  }

  const contentKeyB64 = await generateContentKey();
  const passwordBlob = await aesGcmEncrypt(
    contentKeyB64,
    args.passwordPlaintext,
  );
  const loginBlob = args.loginPlaintext
    ? await aesGcmEncrypt(contentKeyB64, args.loginPlaintext)
    : null;
  const notesBlob = args.notesPlaintext
    ? await aesGcmEncrypt(contentKeyB64, args.notesPlaintext)
    : null;

  const wraps = await Promise.all(
    args.recipients.map(async (r) => ({
      recipientEoa: r.eoaAddress.toLowerCase(),
      wrappedKey: await wrapContentKey({
        contentKeyB64,
        senderSecretKeyB64: args.sender.secretKey,
        senderPublicKeyB64: args.sender.publicKey,
        recipientPublicKeyB64: r.publicKey,
      }),
    })),
  );

  return {
    passwordCiphertext: passwordBlob.ciphertext,
    passwordIv: passwordBlob.iv,
    loginCiphertext: loginBlob?.ciphertext ?? null,
    loginIv: loginBlob?.iv ?? null,
    notesCiphertext: notesBlob?.ciphertext ?? null,
    notesIv: notesBlob?.iv ?? null,
    senderPubkey: args.sender.publicKey,
    wraps,
  };
}

/**
 * Open (decrypt) a vault entry that the caller has a wrapped key for.
 */
export async function openEntry(args: {
  passwordCiphertext: string;
  passwordIv: string;
  loginCiphertext: string | null;
  loginIv: string | null;
  notesCiphertext: string | null;
  notesIv: string | null;
  senderPubkey: string;
  myWrappedKey: string;
  myIdentity: IdentityKeypair;
}): Promise<{ password: string; login: string | null; notes: string | null }> {
  const contentKeyB64 = await unwrapContentKey({
    wrappedB64: args.myWrappedKey,
    recipientSecretKeyB64: args.myIdentity.secretKey,
    recipientPublicKeyB64: args.myIdentity.publicKey,
    senderPublicKeyB64: args.senderPubkey,
  });

  const password = await aesGcmDecrypt(contentKeyB64, {
    ciphertext: args.passwordCiphertext,
    iv: args.passwordIv,
  });

  const login =
    args.loginCiphertext && args.loginIv
      ? await aesGcmDecrypt(contentKeyB64, {
          ciphertext: args.loginCiphertext,
          iv: args.loginIv,
        })
      : null;

  const notes =
    args.notesCiphertext && args.notesIv
      ? await aesGcmDecrypt(contentKeyB64, {
          ciphertext: args.notesCiphertext,
          iv: args.notesIv,
        })
      : null;

  return { password, login, notes };
}
