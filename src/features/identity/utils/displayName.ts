import type { UserProfile } from '../types';

/**
 * Get display name for a user profile
 * Falls back to truncated wallet address if no name is available
 */
export const displayName = (
  profile: UserProfile | null | undefined, 
  walletAddress: string
): string => {
  if (!profile) {
    return `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
  }

  const firstName = profile.first_name?.trim() || '';
  const lastName = profile.last_name?.trim() || '';
  
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }
  
  // No name available, use wallet address
  return `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
};

/**
 * Get short display name (first name only or truncated wallet)
 */
export const shortDisplayName = (
  profile: UserProfile | null | undefined, 
  walletAddress: string
): string => {
  if (!profile?.first_name?.trim()) {
    return `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
  }
  
  return profile.first_name.trim();
};