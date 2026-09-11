// src/lib/ipfsFetch.ts
// Fetch JSON pinned to IPFS, reliably.
//
// Pinata's shared public gateway (gateway.pinata.cloud) now rate-limits or
// hangs on unauthenticated reads, and ipfs.io / dweb.link answer 429 with a
// "switching to a service worker gateway" notice. Bounty and bid metadata is
// read through this path, so a single hard-coded public gateway means titles
// and descriptions silently disappear.
//
// Order: authenticated Pinata (we pinned it, so this is authoritative and
// fast), then a trustless public gateway, then the historical public ones.
// Every attempt is bounded by a timeout so one stalled gateway cannot hang a
// route. SERVER ONLY — PINATA_JWT must not reach the browser.

const DEFAULT_TIMEOUT_MS = 8000;

export interface IpfsFetchResult<T = unknown> {
  data: T | null;
  source: string | null;
  errors: string[];
}

function gateways(hash: string): Array<{ label: string; url: string; auth: boolean }> {
  const dedicated = process.env.PINATA_GATEWAY_DOMAIN; // e.g. my-gateway.mypinata.cloud
  return [
    { label: 'pinata', url: `https://gateway.pinata.cloud/ipfs/${hash}`, auth: true },
    ...(dedicated
      ? [{ label: 'pinata-dedicated', url: `https://${dedicated}/ipfs/${hash}`, auth: true }]
      : []),
    { label: 'trustless', url: `https://trustless-gateway.link/ipfs/${hash}?format=raw`, auth: false },
    { label: 'ipfs.io', url: `https://ipfs.io/ipfs/${hash}`, auth: false },
    { label: 'dweb', url: `https://dweb.link/ipfs/${hash}`, auth: false },
  ];
}

/** Fetch and parse JSON stored at `hash`. Never throws; inspect `.data`. */
export async function fetchIpfsJson<T = unknown>(
  hash: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<IpfsFetchResult<T>> {
  const errors: string[] = [];
  if (!hash || hash.startsWith('temp_')) {
    return { data: null, source: null, errors: ['no usable IPFS hash'] };
  }

  const jwt = process.env.PINATA_JWT;
  for (const gw of gateways(hash)) {
    if (gw.auth && !jwt) continue;
    try {
      const res = await fetch(gw.url, {
        headers: {
          Accept: 'application/json',
          ...(gw.auth && jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
      if (!res.ok) {
        errors.push(`${gw.label}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      try {
        return { data: JSON.parse(text) as T, source: gw.label, errors };
      } catch {
        errors.push(`${gw.label}: not JSON`);
      }
    } catch (err) {
      errors.push(`${gw.label}: ${(err as Error).name || 'error'}`);
    }
  }
  console.warn(`[ipfsFetch] all gateways failed for ${hash}: ${errors.join(', ')}`);
  return { data: null, source: null, errors };
}
