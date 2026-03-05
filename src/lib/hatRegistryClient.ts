/**
 * hatRegistryClient
 *
 * Client-side hat ID store, populated at app startup from /api/hat-registry.
 * Mirrors the keys in src/lib/hatRegistry.ts.
 *
 * Current hats (top hat 0x00000749):
 *   EXECUTIVE_POD_LEADER       — Executive Pod leader hat
 *   COMMUNITY_PODS_PARENT      — Community Pods parent hat
 *   TEMPORAL_NATURALISM        — Temporal Naturalism pod hat
 *   TEMPORAL_NATURALISM_MEMBER — Temporal Naturalism member hat
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
