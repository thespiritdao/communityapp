// src/lib/pinataServer.ts
// Pin JSON to IPFS through Pinata. SERVER ONLY — PINATA_JWT must never reach
// the browser (it shipped in a public bundle as NEXT_PUBLIC_PINATA_JWT until
// 2026-10; see App/PRIVACY_REVIEW_2026-10-09.md). Browser code pins through
// POST /api/ipfs/pin via src/lib/ipfsPinClient.ts.

const PINATA_PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

export interface PinJsonOptions {
  content: unknown;
  name: string;
  keyvalues?: Record<string, string | number>;
}

export function isPinataConfigured(): boolean {
  return !!process.env.PINATA_JWT;
}

/** Pin a JSON value and return its CID (CIDv1). Throws on failure. */
export async function pinJson({ content, name, keyvalues }: PinJsonOptions): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error('PINATA_JWT not configured');

  const response = await fetch(PINATA_PIN_JSON_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: { name, ...(keyvalues && { keyvalues }) },
      pinataOptions: { cidVersion: 1 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata pin failed: ${response.status} ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as { IpfsHash: string };
  return data.IpfsHash;
}
