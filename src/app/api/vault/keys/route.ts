// Vault user-key endpoints.
//
//   GET  /api/vault/keys?eoa=0x...           → { publicKey: string | null }
//   GET  /api/vault/keys?eoa=0x...,0x...     → { keys: { [eoa]: pubkey } }
//   POST /api/vault/keys                     → publish own pubkey
//
// The POST is gated on the caller's authenticated wallet matching the
// `eoaAddress` in the body. The GET is fully public to authenticated
// users — pubkeys are public material; you need to be able to look up
// "what's Y's pubkey so I can wrap a key to them."
//
// Server uses the admin client because the auth middleware here lives
// in Supabase RLS (vault_user_keys policies, see 20260523000002).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

function getWalletFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as any;
    const w =
      payload?.wallet_address ??
      payload?.user_metadata?.wallet_address ??
      null;
    return typeof w === 'string' ? w.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eoaParam = url.searchParams.get('eoa');
  if (!eoaParam) {
    return NextResponse.json(
      { error: 'eoa query param required' },
      { status: 400 },
    );
  }

  // Comma-separated list support.
  const eoas = eoaParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[a-f0-9]{40}$/.test(s));

  if (eoas.length === 0) {
    return NextResponse.json(
      { error: 'no valid EOA addresses provided' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('vault_user_keys')
    .select('eoa_address, public_key')
    .in('eoa_address', eoas);

  if (error) {
    console.error('[vault/keys][GET] db error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (eoas.length === 1) {
    const row = (data ?? []).find((r) => r.eoa_address === eoas[0]);
    return NextResponse.json({
      publicKey: row?.public_key ?? null,
    });
  }

  const keys: Record<string, string> = {};
  for (const row of data ?? []) {
    keys[row.eoa_address] = row.public_key;
  }
  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const callerWallet = getWalletFromAuthHeader(authHeader);
  if (!callerWallet) {
    return NextResponse.json(
      { error: 'authentication required' },
      { status: 401 },
    );
  }

  let body: { eoaAddress?: string; publicKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const eoa = body.eoaAddress?.toLowerCase();
  const publicKey = body.publicKey;
  if (!eoa || !publicKey) {
    return NextResponse.json(
      { error: 'eoaAddress and publicKey required' },
      { status: 400 },
    );
  }
  if (!/^0x[a-f0-9]{40}$/.test(eoa)) {
    return NextResponse.json(
      { error: 'eoaAddress is not a valid EVM address' },
      { status: 400 },
    );
  }
  if (eoa !== callerWallet) {
    return NextResponse.json(
      { error: 'can only publish your own vault key' },
      { status: 403 },
    );
  }

  // Upsert — same user may republish if they re-bootstrap.
  const { error } = await supabaseAdmin.from('vault_user_keys').upsert(
    {
      eoa_address: eoa,
      public_key: publicKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'eoa_address' },
  );

  if (error) {
    console.error('[vault/keys][POST] db error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
