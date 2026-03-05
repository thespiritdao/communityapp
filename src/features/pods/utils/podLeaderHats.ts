// Pod Leader HAT configuration
// Hat IDs are sourced from pod_role_permissions via getClientHatId (client)
// or getHatId (server).
import { getClientHatId } from '@/lib/hatRegistryClient';

export const POD_LEADER_HATS = {
  EXECUTIVE_POD_LEADER:
    getClientHatId('EXECUTIVE_POD_LEADER') ||
    ('0x0000074900010000000000000000000000000000000000000000000000000000' as `0x${string}`),
} as const;

// Map pod IDs to their leader HAT IDs
export const POD_TO_LEADER_HAT: Record<string, string> = {
  'executive-pod': POD_LEADER_HATS.EXECUTIVE_POD_LEADER,
};

// HATS contract configuration
export const HATS_CONFIG = {
  CONTRACT_ADDRESS:
    '0x3bc1a0ad72417f2d411118085256fc53cbddd137' as `0x${string}`,
  CHAIN_ID: 8453, // Base
} as const;
