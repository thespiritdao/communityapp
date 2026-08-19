// src/lib/ledgerMerkle.ts
//
// Merkle computation for activity-ledger anchoring (Congregant Phase 6).
// Kept in a lib (not the cron route) so the export API and any verification
// tooling share the exact same formula.
//
// Leaf formula (documented in LedgerAnchor.sol and /api/explorer/export):
//   leaf = keccak256(utf8("{id}|{type}|{actor}|{actor_type}|{created_at}"))
// Tree: pairwise keccak256(concat(left, right)); odd node promoted unchanged.
// Events ordered by (created_at, id) ascending.

import { keccak256, toBytes, concat } from 'viem';

export const LEAF_FORMULA =
  'keccak256(utf8("{id}|{type}|{actor}|{actor_type}|{created_at}")); pairwise keccak256(left||right), odd promoted; order (created_at, id) asc';

export interface LedgerLeafInput {
  id: string;
  type: string;
  actor: string | null;
  actor_type: string | null;
  created_at: string;
}

export function computeLeaf(e: LedgerLeafInput): `0x${string}` {
  return keccak256(
    toBytes(`${e.id}|${e.type}|${e.actor ?? ''}|${e.actor_type ?? 'human'}|${e.created_at}`),
  );
}

export function computeMerkleRoot(leaves: `0x${string}`[]): `0x${string}` {
  if (leaves.length === 0) {
    return '0x0000000000000000000000000000000000000000000000000000000000000000';
  }
  let level = leaves;
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(keccak256(concat([level[i], level[i + 1]])));
      } else {
        next.push(level[i]); // odd node promoted
      }
    }
    level = next;
  }
  return level[0];
}
