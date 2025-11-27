/**
 * Bid Index Validation Utilities
 *
 * Validates on-chain bid indices to prevent critical assignment errors.
 *
 * CRITICAL ISSUES PREVENTED:
 * 1. Assigning bounty to wrong bidder (index 0 fallback)
 * 2. Approving bids without valid on-chain placement
 * 3. Database/on-chain state mismatches
 *
 * @module bidIndexValidator
 */

import { supabase } from '@/lib/supabase';
import type { PublicClient } from 'viem';
import BountyManagerABI from '@/abis/BountyManagerV2.json';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BidIndexValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  onChainBidder?: string;
  databaseBidder?: string;
  index?: number;
}

export interface BidValidationInput {
  bidId: string;
  bidderAddress: string;
  onchainBountyId: string;
  onchainBidIndex: number | null | undefined;
}

export interface OnChainBid {
  bidder: string;
  proposal: string;
  submittedAt: bigint;
  status: number;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates that bid index exists and is not using dangerous fallback
 * This is the PRIMARY validation to prevent critical bugs
 */
export const validateBidIndexExists = (
  bidIndex: number | null | undefined,
): { isValid: boolean; error?: string } => {
  // Check for null/undefined
  if (bidIndex === null || bidIndex === undefined) {
    return {
      isValid: false,
      error:
        'Bid index is missing. This bid may not have been placed on-chain correctly.',
    };
  }

  // Check for negative values (invalid)
  if (bidIndex < 0) {
    return {
      isValid: false,
      error: `Invalid bid index: ${bidIndex}. Index must be non-negative.`,
    };
  }

  // Warn about index 0 (might be valid, but requires extra verification)
  if (bidIndex === 0) {
    console.warn(
      '⚠️ Bid index is 0 - will require on-chain verification to ensure correct bidder',
    );
  }

  return { isValid: true };
};

/**
 * Fetches the on-chain bid at the specified index
 */
export const fetchOnChainBid = async (
  publicClient: PublicClient,
  onchainBountyId: string,
  bidIndex: number,
): Promise<OnChainBid | null> => {
  try {
    const contractAddress = process.env
      .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

    if (!contractAddress) {
      console.error('❌ BOUNTY_MANAGER_ADDRESS not configured');
      return null;
    }

    console.log('🔍 Fetching on-chain bid:', {
      bountyId: onchainBountyId,
      bidIndex,
      contractAddress,
    });

    // Get all bids for this bounty
    const bids = (await publicClient.readContract({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'getBids',
      args: [BigInt(onchainBountyId)],
    })) as any[];

    // Validate index is in range
    if (!bids || bidIndex >= bids.length) {
      console.error('❌ Bid index out of range:', {
        bidIndex,
        totalBids: bids?.length || 0,
        bountyId: onchainBountyId,
      });
      return null;
    }

    const bid = bids[bidIndex];
    console.log('✅ Retrieved on-chain bid:', {
      bidIndex,
      bidder: bid.bidder,
      status: bid.status,
      submittedAt: bid.submittedAt.toString(),
    });

    return bid;
  } catch (error) {
    console.error('❌ Error fetching on-chain bid:', error);
    return null;
  }
};

/**
 * Validates that the on-chain bidder matches the database bidder
 */
export const validateBidderMatch = (
  onChainBidder: string,
  databaseBidder: string,
): { isValid: boolean; error?: string } => {
  const normalizedOnChain = onChainBidder.toLowerCase();
  const normalizedDatabase = databaseBidder.toLowerCase();

  if (normalizedOnChain !== normalizedDatabase) {
    return {
      isValid: false,
      error: `Bidder mismatch! On-chain: ${onChainBidder}, Database: ${databaseBidder}. This bid cannot be approved safely.`,
    };
  }

  return { isValid: true };
};

/**
 * Validates that the bid status is valid for approval
 */
export const validateBidStatus = (
  status: number,
): { isValid: boolean; error?: string } => {
  // Status 0 = Pending (valid for approval)
  // Status 1 = Accepted (already approved)
  // Status 2 = Rejected (cannot approve)

  if (status === 1) {
    return {
      isValid: false,
      error: 'This bid has already been approved on-chain.',
    };
  }

  if (status === 2) {
    return {
      isValid: false,
      error: 'This bid has been rejected on-chain and cannot be approved.',
    };
  }

  if (status !== 0) {
    return {
      isValid: false,
      error: `Invalid bid status: ${status}. Expected status 0 (Pending).`,
    };
  }

  return { isValid: true };
};

// ============================================================================
// COMPREHENSIVE VALIDATION
// ============================================================================

/**
 * Performs comprehensive validation of a bid before approval
 *
 * This is the MAIN validation function that should be called before any approval
 *
 * VALIDATION STEPS:
 * 1. Check bid index exists (not null/undefined)
 * 2. Fetch on-chain bid at that index
 * 3. Verify on-chain bidder matches database bidder
 * 4. Verify bid status is Pending (0)
 *
 * @returns BidIndexValidationResult with detailed error/warning messages
 */
export const validateBidForApproval = async (
  input: BidValidationInput,
  publicClient: PublicClient,
): Promise<BidIndexValidationResult> => {
  const result: BidIndexValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
  };

  console.log('🔍 Starting comprehensive bid validation:', {
    bidId: input.bidId,
    bidderAddress: input.bidderAddress,
    onchainBountyId: input.onchainBountyId,
    onchainBidIndex: input.onchainBidIndex,
  });

  // Step 1: Validate bid index exists
  const indexCheck = validateBidIndexExists(input.onchainBidIndex);
  if (!indexCheck.isValid) {
    result.errors.push(indexCheck.error!);
    console.error('❌ Bid index validation failed:', indexCheck.error);
    return result;
  }

  const bidIndex = input.onchainBidIndex!;
  result.index = bidIndex;

  // Step 2: Fetch on-chain bid
  const onChainBid = await fetchOnChainBid(
    publicClient,
    input.onchainBountyId,
    bidIndex,
  );

  if (!onChainBid) {
    result.errors.push(
      'Could not fetch on-chain bid. The contract may be unavailable or the bid index may be invalid.',
    );
    console.error('❌ Failed to fetch on-chain bid');
    return result;
  }

  result.onChainBidder = onChainBid.bidder;
  result.databaseBidder = input.bidderAddress;

  // Step 3: Validate bidder matches
  const bidderCheck = validateBidderMatch(
    onChainBid.bidder,
    input.bidderAddress,
  );
  if (!bidderCheck.isValid) {
    result.errors.push(bidderCheck.error!);
    console.error('❌ Bidder validation failed:', bidderCheck.error);
    return result;
  }

  // Step 4: Validate bid status
  const statusCheck = validateBidStatus(onChainBid.status);
  if (!statusCheck.isValid) {
    result.errors.push(statusCheck.error!);
    console.error('❌ Bid status validation failed:', statusCheck.error);
    return result;
  }

  // Add warning if index is 0 (first bid)
  if (bidIndex === 0) {
    result.warnings.push(
      'This is the first bid (index 0). Extra verification performed to ensure correct bidder.',
    );
  }

  // All validations passed
  result.isValid = true;
  console.log('✅ Bid validation successful:', {
    bidIndex,
    bidder: onChainBid.bidder,
    status: onChainBid.status,
  });

  return result;
};

/**
 * Validates multiple bids for batch approval
 * Returns array of validation results in same order as inputs
 */
export const validateMultipleBidsForApproval = async (
  inputs: BidValidationInput[],
  publicClient: PublicClient,
): Promise<BidIndexValidationResult[]> => {
  console.log(`🔍 Validating ${inputs.length} bids for batch approval`);

  const results = await Promise.all(
    inputs.map((input) => validateBidForApproval(input, publicClient)),
  );

  const validCount = results.filter((r) => r.isValid).length;
  const invalidCount = results.length - validCount;

  console.log(
    `✅ Batch validation complete: ${validCount} valid, ${invalidCount} invalid`,
  );

  return results;
};

// ============================================================================
// DATABASE VALIDATION HELPERS
// ============================================================================

/**
 * Retrieves bid data from database for validation
 */
export const getBidDataForValidation = async (
  bidId: string,
): Promise<BidValidationInput | null> => {
  try {
    const { data: bid, error } = await supabase
      .from('bids')
      .select(`
        id,
        bidder_address,
        onchain_bid_index,
        bounty_id,
        bounties!inner(onchain_id)
      `)
      .eq('id', bidId)
      .single();

    if (error || !bid) {
      console.error('❌ Could not find bid in database:', error);
      return null;
    }

    const onchainBountyId = (bid.bounties as any)?.onchain_id;
    if (!onchainBountyId) {
      console.error('❌ Bounty missing on-chain ID');
      return null;
    }

    return {
      bidId: bid.id,
      bidderAddress: bid.bidder_address,
      onchainBountyId: onchainBountyId.toString(),
      onchainBidIndex: bid.onchain_bid_index,
    };
  } catch (error) {
    console.error('❌ Error fetching bid data:', error);
    return null;
  }
};

/**
 * Convenience function: Validate bid by ID only
 * Fetches necessary data from database first
 */
export const validateBidById = async (
  bidId: string,
  publicClient: PublicClient,
): Promise<BidIndexValidationResult> => {
  console.log('🔍 Validating bid by ID:', bidId);

  const bidData = await getBidDataForValidation(bidId);

  if (!bidData) {
    return {
      isValid: false,
      errors: ['Could not fetch bid data from database'],
      warnings: [],
    };
  }

  return validateBidForApproval(bidData, publicClient);
};

// ============================================================================
// ERROR MESSAGE FORMATTING
// ============================================================================

/**
 * Formats validation result into user-friendly error message
 */
export const formatValidationError = (
  result: BidIndexValidationResult,
): string => {
  if (result.isValid) {
    return '';
  }

  let message = 'Cannot approve bid due to validation errors:\n\n';

  result.errors.forEach((error, index) => {
    message += `${index + 1}. ${error}\n`;
  });

  if (result.warnings.length > 0) {
    message += '\nWarnings:\n';
    result.warnings.forEach((warning, index) => {
      message += `- ${warning}\n`;
    });
  }

  if (result.onChainBidder && result.databaseBidder) {
    message += '\nDetails:\n';
    message += `- On-chain bidder: ${result.onChainBidder}\n`;
    message += `- Database bidder: ${result.databaseBidder}\n`;
  }

  return message.trim();
};

/**
 * Formats validation result into console-friendly log
 */
export const logValidationResult = (result: BidIndexValidationResult): void => {
  if (result.isValid) {
    console.log('✅ Bid validation passed', {
      index: result.index,
      bidder: result.onChainBidder,
      warnings: result.warnings,
    });
  } else {
    console.error('❌ Bid validation failed', {
      index: result.index,
      errors: result.errors,
      warnings: result.warnings,
      onChainBidder: result.onChainBidder,
      databaseBidder: result.databaseBidder,
    });
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Primary validation
  validateBidForApproval,
  validateBidById,
  validateMultipleBidsForApproval,

  // Individual checks
  validateBidIndexExists,
  validateBidderMatch,
  validateBidStatus,

  // Helper functions
  fetchOnChainBid,
  getBidDataForValidation,
  formatValidationError,
  logValidationResult,
};
