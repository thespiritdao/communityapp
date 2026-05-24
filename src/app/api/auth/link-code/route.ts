// POST /api/auth/link-code
// Issue a one-time code that another device (signing in for the
// first time) can use to link itself to this user account.
//
// Requires authentication. The caller's JWT identifies the user;
// the body identifies which of their linked wallets is issuing.
//
// Returns { code, expiresAt }. The code expires in 10 minutes and
// is single-use.
//
// See docs/spec-platform-identity-multi-wallet.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import {
  issueLinkCode,
  isLinkedWallet,
} from '@/services/userWalletsService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'server configuration error' },
      { status: 500 },
    );
  }

  let payload: any;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const userId = payload?.sub as string | undefined;
  const jwtWallet = (
    payload?.wallet_address ?? payload?.user_metadata?.wallet_address
  )?.toLowerCase();

  if (!userId || !jwtWallet) {
    return NextResponse.json(
      { error: 'malformed token (missing sub or wallet_address)' },
      { status: 401 },
    );
  }

  // The wallet issuing the code must be one of the user's linked
  // wallets. The JWT wallet is the canonical one; we accept any
  // linked wallet from the body for flexibility, but require that it
  // actually be linked.
  let body: { issuingWallet?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }

  const issuingWallet = (body.issuingWallet ?? jwtWallet).toLowerCase();
  if (!(await isLinkedWallet(userId, issuingWallet))) {
    return NextResponse.json(
      { error: 'issuing wallet is not linked to this user' },
      { status: 403 },
    );
  }

  const result = await issueLinkCode({ userId, issuingWallet });
  if (!result) {
    return NextResponse.json(
      { error: 'failed to issue link code' },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
}
