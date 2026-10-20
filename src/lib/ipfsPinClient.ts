// src/lib/ipfsPinClient.ts
// Client-side: pin JSON to IPFS through the server (POST /api/ipfs/pin), which
// holds the Pinata key. Never call Pinata from the browser.

import { ensureAuthHeaders } from '@/lib/authHeaders';

export type PinKind =
  | 'pod_agreement'
  | 'hat_details'
  | 'hat_metadata'
  | 'bounty_metadata'
  | 'bid_metadata';

export async function pinJsonViaServer(
  kind: PinKind,
  content: unknown,
  name?: string,
  keyvalues?: Record<string, string | number>,
): Promise<string> {
  const headers = await ensureAuthHeaders();
  const response = await fetch('/api/ipfs/pin', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, content, name, keyvalues }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.cid) {
    throw new Error(data?.error || `IPFS pin failed (${response.status})`);
  }
  return data.cid as string;
}
