// @vitest-environment node
//
// Node, not jsdom: this is server-side code, and jose's byte-array checks fail
// against a browser-shim TextEncoder from a different realm.
//
// Tests for the session verifier.
//
// The asymmetric path cannot be exercised against the real project until the
// signing key is rotated, and rotating before knowing it works is the wrong
// order. So a real HTTP server serves a key pair generated here at the path
// the verifier looks for. That exercises the genuine code path, including the
// fetch, rather than a stub standing in for it.

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterAll, describe, expect, it } from 'vitest';

const LEGACY_SECRET = 'test-legacy-secret-value-long-enough-to-sign';

// Generate the key pair and stand up the keys endpoint before importing the
// module, because it reads its configuration once at import time.
const { privateKey, publicKey } = await generateKeyPair('ES256', {
  extractable: true,
});
const publicJwk = { ...(await exportJWK(publicKey)), alg: 'ES256', kid: 'test-key' };

const server: Server = createServer((req, res) => {
  if (req.url?.includes('/.well-known/jwks.json')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [publicJwk] }));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as AddressInfo;

process.env.SUPABASE_JWT_SECRET = LEGACY_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;

const { verifySessionToken, walletFromClaims } = await import(
  './verifySessionToken'
);

afterAll(() => {
  server.close();
});

const legacyKey = () => new TextEncoder().encode(LEGACY_SECRET);

async function hs256(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(legacyKey());
}

describe('verifySessionToken', () => {
  it('accepts a legacy HS256 token, which is what sign-in still mints', async () => {
    const token = await hs256({ sub: 'user-1', wallet_address: '0xABC' });
    const claims = await verifySessionToken(token);
    expect(claims?.sub).toBe('user-1');
  });

  it('accepts an ES256 token signed by a published key, which is what rotation produces', async () => {
    const token = await new SignJWT({ sub: 'user-2', role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);
    const claims = await verifySessionToken(token);
    expect(claims?.sub).toBe('user-2');
    expect(claims?.role).toBe('authenticated');
  });

  it('refuses an HS256 token signed with the wrong secret', async () => {
    const token = await new SignJWT({ sub: 'attacker' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('not-the-secret-not-the-secret-xxxx'));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('refuses an ES256 token signed by a key the project does not publish', async () => {
    const other = await generateKeyPair('ES256', { extractable: true });
    const token = await new SignJWT({ sub: 'attacker' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(other.privateKey);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('refuses an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: 'user-3' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(legacyKey());
    expect(await verifySessionToken(token)).toBeNull();
  });

  it('refuses rubbish, an empty string and a missing token', async () => {
    expect(await verifySessionToken('not-a-jwt')).toBeNull();
    expect(await verifySessionToken('')).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it('refuses an unsigned token claiming alg none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    expect(await verifySessionToken(`${header}.${body}.`)).toBeNull();
  });
});

describe('walletFromClaims', () => {
  it('reads the wallet from either place it may be recorded, lowercased', () => {
    expect(walletFromClaims({ sub: 'a', wallet_address: '0xAbC' })).toBe('0xabc');
    expect(
      walletFromClaims({ sub: 'a', user_metadata: { wallet_address: '0xDEF' } }),
    ).toBe('0xdef');
    expect(walletFromClaims({ sub: 'a' })).toBeNull();
    expect(walletFromClaims(null)).toBeNull();
  });
});
