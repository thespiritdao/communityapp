import { NextRequest, NextResponse } from 'next/server';
import { requireWallet } from '@/lib/apiPodGuard';
import { isPinataConfigured, pinJson } from '@/lib/pinataServer';

export const runtime = 'nodejs';

/**
 * POST /api/ipfs/pin — pin JSON to IPFS for a signed-in member.
 *
 * Replaces the browser calling Pinata directly with NEXT_PUBLIC_PINATA_JWT.
 * Body: { kind, content, name?, keyvalues? }. `kind` is an allowlist so the
 * shared Pinata quota can't be used as a general file host. Responds { cid }.
 */

const ALLOWED_KINDS = new Set([
  'pod_agreement',
  'hat_details',
  'hat_metadata',
  'bounty_metadata',
  'bid_metadata',
]);

const MAX_CONTENT_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const walletOrDenied = await requireWallet(request);
  if (walletOrDenied instanceof Response) return walletOrDenied;
  const wallet = walletOrDenied;

  if (!isPinataConfigured()) {
    return NextResponse.json({ error: 'IPFS pinning is not configured' }, { status: 503 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { kind, content, name, keyvalues } = body ?? {};
  if (typeof kind !== 'string' || !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Unsupported kind' }, { status: 400 });
  }
  if (content === undefined || content === null) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    return NextResponse.json({ error: 'content too large' }, { status: 413 });
  }

  // Pinata keyvalues accept only strings and numbers.
  const safeKeyvalues: Record<string, string | number> = {};
  if (keyvalues && typeof keyvalues === 'object') {
    for (const [k, v] of Object.entries(keyvalues).slice(0, 8)) {
      if (typeof v === 'string') safeKeyvalues[k] = v.slice(0, 200);
      else if (typeof v === 'number') safeKeyvalues[k] = v;
    }
  }
  safeKeyvalues.type = kind;
  safeKeyvalues.uploaded_by = wallet;

  try {
    const cid = await pinJson({
      content,
      name: (typeof name === 'string' && name.slice(0, 100)) || `${kind}-${Date.now()}`,
      keyvalues: safeKeyvalues,
    });
    return NextResponse.json({ cid });
  } catch (error) {
    console.error('IPFS pin failed:', error);
    return NextResponse.json({ error: 'Failed to pin to IPFS' }, { status: 502 });
  }
}
