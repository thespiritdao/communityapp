/**
 * Tenure bands — the 5-tier ecosystem-wide $SELF prestige standing (D-19b).
 *
 * Single source of truth for band NAMES, IMAGES, and DESCRIPTIONS. The on-chain
 * SelfPrestige contract stores ONLY the tier number (0..5) + lifetime hours; all
 * presentation lives here, so renaming/re-imaging is a frontend-only change.
 *
 * Tier numbers match SelfPrestige._tierForHours():
 *   0 = none (pre-membership), 1 = Curious (membership floor), 2 = Resident,
 *   3 = Mainstay, 4 = Pillar, 5 = Elder.
 *
 * Hour thresholds here are for DISPLAY ("50–250 hrs") and must mirror the
 * contract's `tierThresholds` (set at deploy: [10,50,250,600] hours for tiers
 * 2..5). If you change the contract thresholds, update minHours below to match.
 */

export interface TenureBand {
  tier: number;
  name: string;
  image: string;
  /** Inclusive lower bound of lifetime hours for this band. */
  minHours: number;
  /** Exclusive upper bound (null = open-ended top band). */
  maxHours: number | null;
  description: string;
}

export const TENURE_BANDS: TenureBand[] = [
  {
    tier: 1,
    name: 'Curious',
    image: '/images/members/curioussquare500x.jpg',
    minHours: 0,
    maxHours: 10,
    description:
      'Holds Proof of Curiosity. You have joined the ecosystem and are moving through onboarding toward your first contributions.',
  },
  {
    tier: 2,
    name: 'Resident',
    image: '/images/members/residentsquare500x.jpg',
    minHours: 10,
    maxHours: 50,
    description:
      'You now dwell in the ecosystem — present, participating, and putting in time across communities.',
  },
  {
    tier: 3,
    name: 'Mainstay',
    image: '/images/members/mainstaysquare500x.jpg',
    minHours: 50,
    maxHours: 250,
    description:
      'A reliable, load-bearing presence. Your sustained participation is part of what keeps the ecosystem running.',
  },
  {
    tier: 4,
    name: 'Pillar',
    image: '/images/members/pillarsquare500x.jpg',
    minHours: 250,
    maxHours: 600,
    description:
      'A sustained, structural contributor. The ecosystem leans on the depth of your ongoing commitment.',
  },
  {
    tier: 5,
    name: 'Elder',
    image: '/images/members/eldersquare500.jpg', // note: file lacks the trailing 'x'
    minHours: 600,
    maxHours: null,
    description:
      'Longest-tenured. Years of accumulated participation place you among the deepest roots of the community.',
  },
];

/** Map an on-chain tier number (0..5) to its band. tier 0 (pre-membership)
 *  has no band; callers may show "Curious" as the membership floor for any
 *  Proof-of-Curiosity holder even before on-chain hours exist. */
export function bandForTier(tier: number): TenureBand | null {
  return TENURE_BANDS.find((b) => b.tier === tier) ?? null;
}

/** Convenience: the Curious band (membership floor). */
export const CURIOUS_BAND = TENURE_BANDS[0];

/** Format wei-scale lifetime hours (1e18 = 1h) as a human "Hh Mm" string. */
export function formatLifetimeHours(weiHours: bigint): string {
  const HOUR = 10n ** 18n;
  const MINUTE = HOUR / 60n;
  const h = weiHours / HOUR;
  const m = (weiHours % HOUR) / MINUTE;
  if (h === 0n && m === 0n) return '0h';
  if (h === 0n) return `${m}m`;
  if (m === 0n) return `${h}h`;
  return `${h}h ${m}m`;
}
