/**
 * Profile completeness — one definition, used wherever members are listed.
 *
 * Member lists (the /members directory, the pod View page, the pod manage
 * panel) show people with filled-in profiles first so a newcomer sees faces
 * and names before a wall of 0x addresses. Three fields count, each worth
 * one point: a name, a profile picture, and a bio. Lists sort by score
 * descending, then alphabetically by name; ties keep their incoming order
 * (Array.prototype.sort is stable).
 */

export type CompletenessFields = {
  first_name?: string | null;
  last_name?: string | null;
  profile_picture?: string | null;
  bio?: string | null;
};

export const MAX_PROFILE_SCORE = 3;

export function profileFullName(p: CompletenessFields | null | undefined): string {
  return `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
}

/** 0 = anonymous wallet, 3 = name + picture + bio. */
export function profileScore(p: CompletenessFields | null | undefined): number {
  if (!p) return 0;
  let score = 0;
  if (profileFullName(p)) score += 1;
  if (p.profile_picture?.trim()) score += 1;
  if (p.bio?.trim()) score += 1;
  return score;
}

/**
 * Comparator: more complete profiles first, then A→Z by name. Returns 0 for
 * equally complete anonymous entries so the caller's original order holds.
 */
export function compareByCompleteness(
  a: CompletenessFields | null | undefined,
  b: CompletenessFields | null | undefined,
): number {
  const diff = profileScore(b) - profileScore(a);
  if (diff !== 0) return diff;
  const an = profileFullName(a).toLowerCase();
  const bn = profileFullName(b).toLowerCase();
  if (an && bn) return an.localeCompare(bn);
  return 0;
}

/**
 * Sort a list of wallet addresses by the completeness of their profiles,
 * resolving each through the supplied lookup (typically useProfiles().getProfile).
 */
export function sortAddressesByCompleteness(
  addresses: string[],
  lookup: (address: string) => CompletenessFields | null | undefined,
): string[] {
  return [...addresses].sort((a, b) => compareByCompleteness(lookup(a), lookup(b)));
}
