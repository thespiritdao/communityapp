import { describe, expect, it, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  buildCanonicalIdentityMessage,
  createEntryPayload,
  deriveIdentityKeypair,
  generateContentKey,
  openEntry,
  unwrapContentKey,
  wrapContentKey,
  type IdentityKeypair,
} from './vaultCrypto';

// Node 20+ ships WebCrypto on globalThis.crypto, but Vitest runs in a Node
// env where SubtleCrypto isn't automatically pinned to globalThis. Make
// sure crypto.subtle is available so the module-under-test can use it.
beforeAll(() => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    // @ts-expect-error – node webcrypto satisfies the spec
    globalThis.crypto = webcrypto;
  }
});

// ── helpers ────────────────────────────────────────────────────────────────

/** Build a fake EOA signature blob deterministically from a seed string. */
function fakeSig(seed: string): string {
  // 65-byte EIP-191 signature shape: r(32) || s(32) || v(1). We don't need
  // a valid ECDSA sig — the crypto module only uses the bytes as HKDF ikm.
  // Pad/repeat the seed to 65 bytes.
  const bytes = new Uint8Array(65);
  const seedBytes = new TextEncoder().encode(seed);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = seedBytes[i % seedBytes.length];
  }
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

function freshIdentity(seed: string): IdentityKeypair {
  return deriveIdentityKeypair(fakeSig(seed));
}

// ── canonical message ─────────────────────────────────────────────────────

describe('buildCanonicalIdentityMessage', () => {
  it('lowercases the address', () => {
    const msg = buildCanonicalIdentityMessage('0xAbCdEf0000000000000000000000000000000000');
    expect(msg).toContain('Wallet: 0xabcdef0000000000000000000000000000000000');
  });

  it('is deterministic for the same input', () => {
    const a = buildCanonicalIdentityMessage('0x1111111111111111111111111111111111111111');
    const b = buildCanonicalIdentityMessage('0x1111111111111111111111111111111111111111');
    expect(a).toBe(b);
  });

  it('includes the version tag', () => {
    const msg = buildCanonicalIdentityMessage('0x2222222222222222222222222222222222222222');
    expect(msg).toContain('v1');
  });
});

// ── identity derivation ───────────────────────────────────────────────────

describe('deriveIdentityKeypair', () => {
  it('is deterministic — same signature → same keypair', () => {
    const a = deriveIdentityKeypair(fakeSig('alice'));
    const b = deriveIdentityKeypair(fakeSig('alice'));
    expect(a.secretKey).toBe(b.secretKey);
    expect(a.publicKey).toBe(b.publicKey);
  });

  it('different signatures produce different keypairs', () => {
    const a = deriveIdentityKeypair(fakeSig('alice'));
    const b = deriveIdentityKeypair(fakeSig('bob'));
    expect(a.publicKey).not.toBe(b.publicKey);
  });

  it('rejects an empty signature', () => {
    expect(() => deriveIdentityKeypair('')).toThrow();
    expect(() => deriveIdentityKeypair('0x')).toThrow();
  });
});

// ── AES-GCM round trip ────────────────────────────────────────────────────

describe('aesGcm round-trip', () => {
  it('encrypts and decrypts plaintext', async () => {
    const key = await generateContentKey();
    const blob = await aesGcmEncrypt(key, 'hello world');
    const out = await aesGcmDecrypt(key, blob);
    expect(out).toBe('hello world');
  });

  it('produces a fresh IV on every encryption', async () => {
    const key = await generateContentKey();
    const a = await aesGcmEncrypt(key, 'same text');
    const b = await aesGcmEncrypt(key, 'same text');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('decryption fails with the wrong key', async () => {
    const keyA = await generateContentKey();
    const keyB = await generateContentKey();
    const blob = await aesGcmEncrypt(keyA, 'secret');
    await expect(aesGcmDecrypt(keyB, blob)).rejects.toThrow();
  });

  it('AAD binding — tampered AAD causes decryption to fail', async () => {
    const key = await generateContentKey();
    const aad = new TextEncoder().encode('correct aad');
    const blob = await aesGcmEncrypt(key, 'secret', aad);
    const wrongAad = new TextEncoder().encode('wrong aad');
    await expect(aesGcmDecrypt(key, blob, wrongAad)).rejects.toThrow();
  });
});

// ── wrap / unwrap ─────────────────────────────────────────────────────────

describe('wrap / unwrap content key', () => {
  it('recipient can unwrap a key wrapped to them by the sender', async () => {
    const sender = freshIdentity('alice');
    const recipient = freshIdentity('bob');
    const contentKey = await generateContentKey();
    const wrapped = await wrapContentKey({
      contentKeyB64: contentKey,
      senderSecretKeyB64: sender.secretKey,
      senderPublicKeyB64: sender.publicKey,
      recipientPublicKeyB64: recipient.publicKey,
    });
    const unwrapped = await unwrapContentKey({
      wrappedB64: wrapped,
      recipientSecretKeyB64: recipient.secretKey,
      recipientPublicKeyB64: recipient.publicKey,
      senderPublicKeyB64: sender.publicKey,
    });
    expect(unwrapped).toBe(contentKey);
  });

  it('a third party cannot unwrap', async () => {
    const sender = freshIdentity('alice');
    const recipient = freshIdentity('bob');
    const eve = freshIdentity('eve');
    const contentKey = await generateContentKey();
    const wrapped = await wrapContentKey({
      contentKeyB64: contentKey,
      senderSecretKeyB64: sender.secretKey,
      senderPublicKeyB64: sender.publicKey,
      recipientPublicKeyB64: recipient.publicKey,
    });
    await expect(
      unwrapContentKey({
        wrappedB64: wrapped,
        recipientSecretKeyB64: eve.secretKey,
        recipientPublicKeyB64: eve.publicKey,
        senderPublicKeyB64: sender.publicKey,
      }),
    ).rejects.toThrow();
  });

  it('AAD is bound to (sender, recipient) — swapping recipients fails', async () => {
    const sender = freshIdentity('alice');
    const r1 = freshIdentity('r1');
    const r2 = freshIdentity('r2');
    const contentKey = await generateContentKey();
    const wrappedForR1 = await wrapContentKey({
      contentKeyB64: contentKey,
      senderSecretKeyB64: sender.secretKey,
      senderPublicKeyB64: sender.publicKey,
      recipientPublicKeyB64: r1.publicKey,
    });
    // r2 trying to unwrap r1's blob with their own secret + sender pub
    // should fail (different shared secret + different AAD binding).
    await expect(
      unwrapContentKey({
        wrappedB64: wrappedForR1,
        recipientSecretKeyB64: r2.secretKey,
        recipientPublicKeyB64: r2.publicKey,
        senderPublicKeyB64: sender.publicKey,
      }),
    ).rejects.toThrow();
  });

  it('every wrap of the same content key produces a distinct blob (fresh IV)', async () => {
    const sender = freshIdentity('alice');
    const recipient = freshIdentity('bob');
    const contentKey = await generateContentKey();
    const a = await wrapContentKey({
      contentKeyB64: contentKey,
      senderSecretKeyB64: sender.secretKey,
      senderPublicKeyB64: sender.publicKey,
      recipientPublicKeyB64: recipient.publicKey,
    });
    const b = await wrapContentKey({
      contentKeyB64: contentKey,
      senderSecretKeyB64: sender.secretKey,
      senderPublicKeyB64: sender.publicKey,
      recipientPublicKeyB64: recipient.publicKey,
    });
    expect(a).not.toBe(b);
  });
});

// ── createEntryPayload / openEntry (multi-recipient) ──────────────────────

describe('createEntryPayload + openEntry', () => {
  it('all recipients can independently decrypt; non-recipients cannot', async () => {
    const sender = freshIdentity('alice');
    const r1 = freshIdentity('r1');
    const r2 = freshIdentity('r2');
    const r3 = freshIdentity('r3');
    const eve = freshIdentity('eve');

    const payload = await createEntryPayload({
      passwordPlaintext: 'hunter2',
      notesPlaintext: 'shared admin login',
      sender,
      recipients: [
        { eoaAddress: '0xr1', publicKey: r1.publicKey },
        { eoaAddress: '0xr2', publicKey: r2.publicKey },
        { eoaAddress: '0xr3', publicKey: r3.publicKey },
      ],
    });

    expect(payload.wraps).toHaveLength(3);

    for (const [identity, ix] of [
      [r1, 0],
      [r2, 1],
      [r3, 2],
    ] as const) {
      const opened = await openEntry({
        passwordCiphertext: payload.passwordCiphertext,
        passwordIv: payload.passwordIv,
        notesCiphertext: payload.notesCiphertext,
        notesIv: payload.notesIv,
        senderPubkey: payload.senderPubkey,
        myWrappedKey: payload.wraps[ix].wrappedKey,
        myIdentity: identity,
      });
      expect(opened.password).toBe('hunter2');
      expect(opened.notes).toBe('shared admin login');
    }

    // Eve has no wrap, but even if she steals one of r1's, she can't
    // unwrap it with her own secret.
    await expect(
      openEntry({
        passwordCiphertext: payload.passwordCiphertext,
        passwordIv: payload.passwordIv,
        notesCiphertext: payload.notesCiphertext,
        notesIv: payload.notesIv,
        senderPubkey: payload.senderPubkey,
        myWrappedKey: payload.wraps[0].wrappedKey,
        myIdentity: eve,
      }),
    ).rejects.toThrow();
  });

  it('omits notes blob when no notes given', async () => {
    const sender = freshIdentity('alice');
    const r1 = freshIdentity('r1');
    const payload = await createEntryPayload({
      passwordPlaintext: 'pw',
      sender,
      recipients: [{ eoaAddress: '0xr1', publicKey: r1.publicKey }],
    });
    expect(payload.notesCiphertext).toBeNull();
    expect(payload.notesIv).toBeNull();
    const opened = await openEntry({
      passwordCiphertext: payload.passwordCiphertext,
      passwordIv: payload.passwordIv,
      notesCiphertext: null,
      notesIv: null,
      senderPubkey: payload.senderPubkey,
      myWrappedKey: payload.wraps[0].wrappedKey,
      myIdentity: r1,
    });
    expect(opened.password).toBe('pw');
    expect(opened.notes).toBeNull();
  });

  it('rejects empty recipient list', async () => {
    const sender = freshIdentity('alice');
    await expect(
      createEntryPayload({
        passwordPlaintext: 'pw',
        sender,
        recipients: [],
      }),
    ).rejects.toThrow();
  });
});

// ── rotation scenario ─────────────────────────────────────────────────────

describe('rotation', () => {
  it('after a content-key rotation, the evicted recipient cannot decrypt the new ciphertext', async () => {
    const sender = freshIdentity('alice');
    const r1 = freshIdentity('r1');
    const r2 = freshIdentity('r2');
    const evicted = freshIdentity('evicted');

    // Initial: all three are recipients.
    const v1 = await createEntryPayload({
      passwordPlaintext: 'original',
      sender,
      recipients: [
        { eoaAddress: '0xr1', publicKey: r1.publicKey },
        { eoaAddress: '0xr2', publicKey: r2.publicKey },
        { eoaAddress: '0xev', publicKey: evicted.publicKey },
      ],
    });

    // Confirm evicted can read the original.
    const evictedReadV1 = await openEntry({
      passwordCiphertext: v1.passwordCiphertext,
      passwordIv: v1.passwordIv,
      notesCiphertext: null,
      notesIv: null,
      senderPubkey: v1.senderPubkey,
      myWrappedKey: v1.wraps[2].wrappedKey,
      myIdentity: evicted,
    });
    expect(evictedReadV1.password).toBe('original');

    // Rotate: new content + new wraps excluding the evicted recipient.
    // In production, any remaining reader does this from their browser.
    const rotated = await createEntryPayload({
      passwordPlaintext: 'rotated value',
      sender: r1, // r1 plays the role of "sender" for the rotation
      recipients: [
        { eoaAddress: '0xr1', publicKey: r1.publicKey },
        { eoaAddress: '0xr2', publicKey: r2.publicKey },
      ],
    });

    // r2 can decrypt the rotated entry.
    const r2Reads = await openEntry({
      passwordCiphertext: rotated.passwordCiphertext,
      passwordIv: rotated.passwordIv,
      notesCiphertext: null,
      notesIv: null,
      senderPubkey: rotated.senderPubkey,
      myWrappedKey: rotated.wraps[1].wrappedKey,
      myIdentity: r2,
    });
    expect(r2Reads.password).toBe('rotated value');

    // The evicted user holds onto their stale wrap from v1 — but it
    // doesn't decrypt the rotated ciphertext.
    await expect(
      openEntry({
        passwordCiphertext: rotated.passwordCiphertext,
        passwordIv: rotated.passwordIv,
        notesCiphertext: null,
        notesIv: null,
        senderPubkey: rotated.senderPubkey,
        myWrappedKey: v1.wraps[2].wrappedKey, // stale wrap from before
        myIdentity: evicted,
      }),
    ).rejects.toThrow();
  });
});
