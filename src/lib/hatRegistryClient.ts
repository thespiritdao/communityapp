/**
 * hatRegistryClient
 *
 * Client-side hat ID store, populated at app startup from /api/hat-registry.
 * Mirrors the keys in src/lib/hatRegistry.ts.
 *
 * Keys (resolved from the structural pods configured in the environment):
 *   EXECUTIVE_POD_LEADER  — governance pod's management (leader) hat
 *   COMMUNITY_PODS_PARENT — community parent pod's management hat
 *   DEFAULT_POD           — default community's pod hat
 *   DEFAULT_POD_LEADER    — default community's leader hat
 *   DEFAULT_POD_MEMBER    — default community's member hat
 */

import type { HatIds, HatKey } from '@/lib/hatRegistry';

let _ids: Partial<HatIds> = {};
let _initialized = false;

export function initHatRegistry(ids: Partial<HatIds>): void {
  _ids = ids;
  _initialized = true;
}

export function isHatRegistryReady(): boolean {
  return _initialized;
}

export function getClientHatId(key: HatKey): `0x${string}` | undefined {
  return _ids[key];
}

export function getClientHatIds(): Partial<HatIds> {
  return _ids;
}
