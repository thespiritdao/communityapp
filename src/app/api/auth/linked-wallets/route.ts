// /api/auth/linked-wallets
//
//   GET    — list the caller's linked wallets
//   DELETE — revoke a linked wallet (body: { walletAddress })
//   PATCH  — set nickname (body: { walletAddress, nickname })
//
// All operations are gated on the JWT — caller can only see/modify
// their own wallets. The canonical wallet cannot be revoked.
//
// See docs/spec-platform-identity-multi-wallet.md.

import { type NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';
import {
  getUserWallets,
  revokeWallet,
  setWalletNickname,
} from '@/services/userWalletsService';

export const runtime = 'nodejs';

async function authenticate(req: NextRequest): Promise<{ userId: string } | NextResponse> {
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
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    const userId = payload?.sub as string | undefined;
    if (!userId) {
      return NextResponse.json(
        { error: 'malformed token' },
        { status: 401 },
      );
    }
    return { userId };
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const wallets = await getUserWallets(auth.userId);
  return NextResponse.json({ wallets });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  let body: { walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const target = body.walletAddress?.toLowerCase();
  if (!target || !/^0x[a-f0-9]{40}$/.test(target)) {
    return NextResponse.json(
      { error: 'invalid walletAddress' },
      { status: 400 },
    );
  }

  const result = await revokeWallet(auth.userId, target);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  let body: { walletAddress?: string; nickname?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const target = body.walletAddress?.toLowerCase();
  if (!target || !/^0x[a-f0-9]{40}$/.test(target)) {
    return NextResponse.json(
      { error: 'invalid walletAddress' },
      { status: 400 },
    );
  }

  const ok = await setWalletNickname(
    auth.userId,
    target,
    body.nickname?.trim() || null,
  );
  if (!ok) {
    return NextResponse.json(
      { error: 'failed to update nickname' },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
