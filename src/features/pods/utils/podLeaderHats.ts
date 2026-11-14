// Pod Leader HAT configuration
// Hat ids come from the hat registry (src/lib/hatRegistry.ts), loaded into
// the client at app start. Read them at use time, not at import time.
import { getClientHatId } from '@/lib/hatRegistryClient';

export const POD_LEADER_HATS = {
  get EXECUTIVE_POD_LEADER(): `0x${string}` | undefined {
    return getClientHatId('EXECUTIVE_POD_LEADER');
  },
};

// Extra pod-id -> leader-hat mappings. Empty: a pod's leader hat is its
// management_hat_id, which callers already check.
export const POD_TO_LEADER_HAT: Record<string, string> = {};

// HATS contract configuration
export const HATS_CONFIG = {
  CONTRACT_ADDRESS:
    '0x3bc1a0ad72417f2d411118085256fc53cbddd137' as `0x${string}`,
  CHAIN_ID: 8453, // Base
} as const;
