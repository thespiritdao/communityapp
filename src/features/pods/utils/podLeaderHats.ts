// Pod Leader HAT configuration (2-tier structure)
export const POD_LEADER_HATS = {
  EXECUTIVE_POD_LEADER: process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER as `0x${string}` || '0x0000008800010000000000000000000000000000000000000000000000000000',
  DEV_POD_LEADER: process.env.NEXT_PUBLIC_DEV_POD_LEADER as `0x${string}` || '0x0000008800020000000000000000000000000000000000000000000000000000',
} as const;

// Map pod IDs to their leader HAT IDs
export const POD_TO_LEADER_HAT: Record<string, string> = {
  'executive-pod': POD_LEADER_HATS.EXECUTIVE_POD_LEADER,
  'dev-pod': POD_LEADER_HATS.DEV_POD_LEADER,
};

// HATS contract configuration
export const HATS_CONFIG = {
  CONTRACT_ADDRESS: '0x3bc1a0ad72417f2d411118085256fc53cbddd137' as `0x${string}`,
  CHAIN_ID: 8453, // Base
} as const;