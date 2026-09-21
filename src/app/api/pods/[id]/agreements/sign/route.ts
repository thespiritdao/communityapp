// src/app/api/pods/[id]/agreements/sign/route.ts
//
// Records that the caller signed a pod agreement — after checking the proof.
// Phase 1 step 4 of APP_AUDIT_2026-09-15.md: the browser used to insert the
// pod_accountability_signatures row itself (F2: any member could insert one
// for anyone). Now the row is written here, and only when either
//
//   - the agreement has an IPFS CID and the eligibility module on Base shows
//     the wallet as having signed keccak(cid) — read through
//     hasSignedOnChain(), which handles both deployed module shapes — or
//   - the agreement predates pinning (no CID) and the caller supplies the
//     message they signed plus a signature that verifies against their own
//     wallet.
//
// The signing itself stays where it was (a transaction from the browser);
// this route only records what the chain — or the signature — proves.
//
// GET returns which module this server is pointed at. Public addresses only;
// it exists because production and a developer machine were found pointing
// at different contracts.

import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, verifyMessage } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import {
  ELIGIBILITY_MODULE_ADDRESS,
  hasSignedOnChain,
  moduleHatAdmin,
} from '@/features/pods/services/OnChainAgreementService';

export const runtime = 'nodejs';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

export async function GET() {
  // Probe with hat id 1: MultiCriteria answers hatAdmins(); EligibilityModule
  // has no such function and throws.
  const admin = ELIGIBILITY_MODULE_ADDRESS ? await moduleHatAdmin(publicClient as never, 1n) : null;
  return NextResponse.json({
    module: ELIGIBILITY_MODULE_ADDRESS ?? null,
    kind: !ELIGIBILITY_MODULE_ADDRESS ? 'unconfigured' : admin === null ? 'EligibilityModule' : 'MultiCriteriaEligibilityModule',
  });
}

export async function POST(req: NextRequest) {
  const podId = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/agreements\/sign/)?.[1] ?? '';
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  const body = await req.json().catch(() => ({}));
  const agreementId = String(body.agreementId || '').trim();
  const roleId = body.roleId ? String(body.roleId) : null;
  const agreementText = String(body.agreementText || '');
  const agreementCid = body.agreementCid ? String(body.agreementCid) : null;
  const message = body.message ? String(body.message) : null;
  const signature = body.signature ? String(body.signature) : null;

  if (!agreementId || !agreementText) {
    return NextResponse.json({ error: 'agreementId and agreementText are required' }, { status: 400 });
  }

  let proof: string;

  if (agreementCid) {
    if (!ELIGIBILITY_MODULE_ADDRESS) {
      return NextResponse.json({ error: 'On-chain agreements are not configured' }, { status: 503 });
    }
    let signed: boolean;
    try {
      signed = await hasSignedOnChain(publicClient as never, agreementCid, wallet as `0x${string}`);
    } catch (err) {
      const e = err as Error & { shortMessage?: string };
      console.error('[agreements/sign] chain read failed', { module: ELIGIBILITY_MODULE_ADDRESS, message: e?.message });
      return NextResponse.json(
        { error: 'Could not read the signature from the chain; try again shortly', detail: e?.shortMessage || e?.message || String(err), module: ELIGIBILITY_MODULE_ADDRESS },
        { status: 503 },
      );
    }
    if (!signed) {
      return NextResponse.json(
        { error: 'The chain does not show this wallet as having signed this agreement yet' },
        { status: 409 },
      );
    }
    proof = `onchain:${agreementCid}`;
  } else {
    // Legacy agreements (no pinned text): a message signature from the
    // caller's own wallet. The message must be about this agreement.
    if (!message || !signature) {
      return NextResponse.json({ error: 'message and signature are required for an agreement without a CID' }, { status: 400 });
    }
    if (!message.includes(agreementText) || !message.toLowerCase().includes(wallet)) {
      return NextResponse.json({ error: 'The signed message does not cover this agreement and wallet' }, { status: 400 });
    }
    let valid = false;
    try {
      valid = await verifyMessage({ address: wallet as `0x${string}`, message, signature: signature as `0x${string}` });
    } catch {
      valid = false;
    }
    if (!valid) {
      return NextResponse.json({ error: 'Signature does not verify against your wallet' }, { status: 409 });
    }
    proof = signature;
  }

  const now = new Date().toISOString();
  const { error: sigErr } = await supabaseAdmin.from('pod_accountability_signatures').insert({
    pod_id: podId,
    signer_address: wallet,
    signature_data: proof,
    accountability_statement: agreementText,
    signed_at: now,
    is_valid: true,
  });
  if (sigErr) return NextResponse.json({ error: sigErr.message }, { status: 500 });

  // The browser used to also upsert user_eligibility_status here. That table
  // has never existed in production — the write failed and was swallowed on
  // every signing since the feature shipped. The signature row above, and the
  // chain itself, are the record. Whether a cached eligibility table should
  // exist at all is a Phase 3 decision; nothing is written to one here.
  void roleId;

  return NextResponse.json({ ok: true, proof: agreementCid ? 'onchain' : 'signature' });
}
