/**
 * Invite Code Service
 *
 * Handles generation and validation of referral/invite codes for onboarding
 * Features:
 * - Generate unique 6-character alphanumeric codes
 * - Validate codes before user registration
 * - Track referral relationships
 * - First user exception handling
 */

import { supabase } from '@/lib/supabase';

// ============================================================
// Constants
// ============================================================

const FIRST_USER_WALLET = '0x12a0cf22d632c859b793f852af03b9d515580244';

// Characters used for invite codes (excludes confusing: 0, O, I, 1)
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ============================================================
// Types
// ============================================================

export interface InviteValidationResult {
  isValid: boolean;
  error?: string;
  referrerWallet?: string;
  isFirstUser?: boolean;
}

export interface ReferralStats {
  totalInvited: number;
  invitedUsers: Array<{
    wallet_address: string;
    onboarded_at: string;
  }>;
}

// ============================================================
// Code Generation
// ============================================================

/**
 * Generate a random 6-character invite code
 * Uses uppercase letters and numbers, excluding confusing characters
 */
function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * INVITE_CHARS.length);
    code += INVITE_CHARS[randomIndex];
  }
  return code;
}

/**
 * Generate a unique invite code that doesn't exist in database
 * Retries until a unique code is found
 */
export async function generateUniqueInviteCode(): Promise<string> {
  const maxAttempts = 10;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const code = generateInviteCode();

    // Check if code exists
    const { data, error } = await supabase
      .from('user_profiles')
      .select('referral_key')
      .eq('referral_key', code)
      .single();

    // Code doesn't exist - we can use it
    if (error && error.code === 'PGRST116') {
      return code;
    }

    attempts++;
  }

  throw new Error(
    'Failed to generate unique invite code after multiple attempts',
  );
}

/**
 * Assign an invite code to a user's profile
 * Called after user profile is created
 */
export async function assignInviteCodeToUser(
  walletAddress: string,
): Promise<string> {
  const code = await generateUniqueInviteCode();

  const { error } = await supabase
    .from('user_profiles')
    .update({ referral_key: code })
    .eq('wallet_address', walletAddress.toLowerCase());

  if (error) {
    console.error('Error assigning invite code:', error);
    throw new Error('Failed to assign invite code to user');
  }

  return code;
}

// ============================================================
// Validation
// ============================================================

/**
 * Check if wallet is the first user (exception case)
 */
export function isFirstUser(walletAddress: string): boolean {
  return walletAddress.toLowerCase() === FIRST_USER_WALLET.toLowerCase();
}

/**
 * Validate an invite code before allowing user registration
 *
 * @param inviteCode - The 6-character code entered by user
 * @param newUserWallet - Wallet address of the new user
 * @returns Validation result with referrer info if valid
 */
export async function validateInviteCode(
  inviteCode: string,
  newUserWallet: string,
): Promise<InviteValidationResult> {
  try {
    // Normalize inputs
    const normalizedCode = inviteCode.toUpperCase().trim();
    const normalizedWallet = newUserWallet.toLowerCase();

    // Exception: First user doesn't need invite code
    if (isFirstUser(normalizedWallet)) {
      return {
        isValid: true,
        isFirstUser: true,
      };
    }

    // Validate code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      return {
        isValid: false,
        error: 'Invalid invite code format. Must be 6 characters.',
      };
    }

    // Check if code exists in database
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('wallet_address, referral_key')
      .eq('referral_key', normalizedCode)
      .maybeSingle(); // Use maybeSingle() to avoid 406 errors when no results found

    if (profileError || !profile) {
      return {
        isValid: false,
        error: 'Invalid invite code. Please check and try again.',
      };
    }

    // Prevent self-referral: Users cannot use their own invite code
    if (profile.wallet_address.toLowerCase() === normalizedWallet) {
      return {
        isValid: false,
        error: 'You cannot use your own invite code.',
      };
    }

    // Check if code has already been used by this wallet
    const { data: existingValidation } = await supabase
      .from('referral_validations')
      .select('id')
      .eq('invite_code', normalizedCode)
      .eq('used_by_wallet', normalizedWallet)
      .single();

    if (existingValidation) {
      return {
        isValid: false,
        error: 'You have already used this invite code.',
      };
    }

    // Valid code - return referrer info
    return {
      isValid: true,
      referrerWallet: profile.wallet_address,
    };
  } catch (error) {
    console.error('Error validating invite code:', error);
    return {
      isValid: false,
      error: 'An error occurred while validating your invite code.',
    };
  }
}

/**
 * Record successful invite code usage
 * Called after user profile is created
 */
export async function recordInviteCodeUsage(
  inviteCode: string,
  newUserWallet: string,
  referrerWallet?: string,
): Promise<void> {
  try {
    const { error } = await supabase.from('referral_validations').insert({
      invite_code: inviteCode.toUpperCase(),
      used_by_wallet: newUserWallet.toLowerCase(),
      referrer_wallet: referrerWallet?.toLowerCase(),
    });

    if (error) {
      console.error('Error recording invite code usage:', error);
    }
  } catch (error) {
    console.error('Error recording invite code usage:', error);
  }
}

/**
 * Update user profile with referrer info
 */
export async function updateUserWithReferrer(
  newUserWallet: string,
  referrerWallet: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        invited_by: referrerWallet.toLowerCase(),
        onboarded_at: new Date().toISOString(),
      })
      .eq('wallet_address', newUserWallet.toLowerCase());

    if (error) {
      console.error('Error updating user with referrer:', error);
    }
  } catch (error) {
    console.error('Error updating user with referrer:', error);
  }
}

// ============================================================
// Analytics & Stats
// ============================================================

/**
 * Get referral stats for a user
 * Shows how many people they've invited
 */
export async function getUserReferralStats(
  walletAddress: string,
): Promise<ReferralStats> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('wallet_address, onboarded_at')
      .eq('invited_by', walletAddress.toLowerCase())
      .order('onboarded_at', { ascending: false });

    if (error) {
      console.error('Error fetching referral stats:', error);
      return { totalInvited: 0, invitedUsers: [] };
    }

    return {
      totalInvited: data?.length || 0,
      invitedUsers: data || [],
    };
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return { totalInvited: 0, invitedUsers: [] };
  }
}

/**
 * Get user's own invite code for sharing
 */
export async function getUserInviteCode(
  walletAddress: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('referral_key')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error || !data) {
      return null;
    }

    return data.referral_key;
  } catch (error) {
    console.error('Error fetching user invite code:', error);
    return null;
  }
}

/**
 * Check if user has completed onboarding
 */
export async function hasCompletedOnboarding(
  walletAddress: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('onboarded_at')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error || !data) {
      return false;
    }

    return !!data.onboarded_at;
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
}

// ============================================================
// Admin Functions
// ============================================================

/**
 * Get total platform referral stats
 * Admin/analytics use only
 */
export async function getPlatformReferralStats(): Promise<{
  totalUsers: number;
  totalReferrals: number;
  averageReferralsPerUser: number;
}> {
  try {
    const { count: totalUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    const { count: totalReferrals } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .not('invited_by', 'is', null);

    return {
      totalUsers: totalUsers || 0,
      totalReferrals: totalReferrals || 0,
      averageReferralsPerUser:
        totalUsers && totalReferrals ? totalReferrals / totalUsers : 0,
    };
  } catch (error) {
    console.error('Error fetching platform referral stats:', error);
    return {
      totalUsers: 0,
      totalReferrals: 0,
      averageReferralsPerUser: 0,
    };
  }
}
