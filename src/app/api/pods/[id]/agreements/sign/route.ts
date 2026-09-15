// src/app/api/pods/[id]/agreements/sign/route.ts
//
// Records that the caller signed a pod agreement — after checking the proof.
// Phase 1 step 4 of APP_AUDIT_2026-09-15.md: the browser used to insert the
// pod_accountability_signatures row itself (F2: any member could insert one
// for anyone). Now the row is written here, and only when either
//
//   - the agreement has an IPFS CID and Hats' EligibilityModule reports
//     hasSignedAgreement(keccak(cid), wallet) == true on Base, or
//   - the agreement predates pinning (no CID) and the caller supplies the
//     message they signed plus a signature that verifies against their own
//     wallet.
//
// The signing itself stays where it was (a transaction from the browser);
// this route only records what the chain — or the signature — proves.

import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, verifyMessage } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';
import {
  ELIGIBILITY_MODULE_ABI,
  ELIGIBILITY_MODULE_ADDRESS,
  agreementHashFromCid,
} from '@/features/pods/services/OnChainAgreementService';

export const runtime = 'nodejs';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

export async function POST(req: NextRequest) {
  const podId = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/agreements\/sign/)?.[1] ?? '';
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const walletOrDenied = requireWallet(req);
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
    let stage = 'hash';
    try {
      const hash = agreementHashFromCid(agreementCid);
      stage = 'read';
      signed = (await publicClient.readContract({
        address: ELIGIBILITY_MODULE_ADDRESS,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'hasSignedAgreement',
        args: [hash, wallet as `0x${string}`],
      })) === true;
    } catch (err) {
      const e = err as Error & { shortMessage?: string; cause?: unknown };
      console.error('[agreements/sign] chain read failed', { stage, module: ELIGIBILITY_MODULE_ADDRESS, message: e?.message, stack: e?.stack });
      return NextResponse.json(
        {
          error: 'Could not read the signature from the chain; try again shortly',
          detail: e?.shortMessage || e?.message || String(err),
          stage,
          module: ELIGIBILITY_MODULE_ADDRESS,
          frame: (e?.stack || '').split('\n').slice(1, 4).map((l) => l.trim()),
        },
        { status: 503 },
      );
    }
    if (!signed) {
      return NextResponse.json(
        { error: 'The chain does not show this wallet as having signed this agreement yet' },
        { status: 409 },
      );
    }
    proof = `onchain:${agreementHashFromCid(agreementCid)}`;
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

  if (roleId) {
    const { error: eligErr } = await supabaseAdmin.from('user_eligibility_status').upsert(
      {
        user_wallet: wallet,
        pod_id: podId,
        role_id: roleId,
        criteria_type: 'agreement',
        criteria_id: agreementId,
        status: 'met',
        proof,
        verified_at: now,
        last_checked: now,
      },
      { onConflict: 'user_wallet,pod_id,role_id,criteria_type,criteria_id' },
    );
    if (eligErr) console.warn('[agreements/sign] eligibility upsert failed:', eligErr.message);
  }

  return NextResponse.json({ ok: true, proof: agreementCid ? 'onchain' : 'signature' });
}
