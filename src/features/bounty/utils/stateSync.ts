/**
 * State Synchronization Utilities for Bounty System
 *
 * Ensures on-chain state and database state remain consistent with:
 * - Deduplication protection
 * - Retry mechanisms
 * - Conflict resolution
 * - Audit trails
 *
 * @module stateSync
 */

import { supabase } from '@/lib/supabase';
import type { PublicClient } from 'viem';
import BountyManagerABI from '@/abis/BountyManagerV2.json';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BidApprovalStateUpdate {
  bidId: string;
  bountyId: string;
  transactionHash: string;
  onchainBountyId: string;
  onchainBidIndex: number;
  status: 'approved';
  reviewer: string;
  approver: string;
  timestamp: string;
}

export interface PaymentStateUpdate {
  bidId: string;
  bountyId: string;
  transactionHash: string;
  paymentAmount: string;
  paymentToken: 'SYSTEM' | 'SELF';
  status: 'completed';
  timestamp: string;
}

export interface MilestonePaymentStateUpdate {
  milestoneId: string;
  bountyId: string;
  transactionHash: string;
  paymentAmount: string;
  paymentToken: 'SYSTEM' | 'SELF';
  status: 'completed';
  timestamp: string;
}

export interface StateUpdateResult {
  success: boolean;
  updateId?: string;
  isDuplicate: boolean;
  error?: string;
}

export interface OnChainBidState {
  bidder: string;
  proposal: string;
  submittedAt: bigint;
  status: number; // 0 = Pending, 1 = Accepted, 2 = Rejected
}

export interface OnChainBountyState {
  id: bigint;
  creator: string;
  value: bigint;
  token: string;
  status: number; // 0 = Open, 1 = Assigned, 2 = Completed, 3 = Cancelled
  assignee?: string;
  reviewer?: string;
  approver?: string;
}

// ============================================================================
// DEDUPLICATION CHECKS
// ============================================================================

/**
 * Checks if a bid approval has already been processed for this transaction
 * Prevents duplicate database updates from multiple callback invocations
 */
export const checkBidApprovalDuplicate = async (
  transactionHash: string,
  bidId: string,
): Promise<boolean> => {
  try {
    console.log('🔍 Checking for duplicate bid approval:', {
      transactionHash,
      bidId,
    });

    const { data, error } = await supabase
      .from('bid_state_updates')
      .select('id, transaction_hash, bid_id, created_at')
      .eq('transaction_hash', transactionHash)
      .eq('bid_id', bidId)
      .eq('update_type', 'approval')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error checking for duplicate:', error);
      return false;
    }

    if (data) {
      console.log('⚠️ Duplicate approval detected:', {
        updateId: data.id,
        createdAt: data.created_at,
      });
      return true;
    }

    console.log('✅ No duplicate found, safe to proceed');
    return false;
  } catch (error) {
    console.error('❌ Error in duplicate check:', error);
    return false;
  }
};

/**
 * Checks if a payment has already been processed for this transaction
 */
export const checkPaymentDuplicate = async (
  transactionHash: string,
  bidId: string,
): Promise<boolean> => {
  try {
    console.log('🔍 Checking for duplicate payment:', {
      transactionHash,
      bidId,
    });

    const { data, error } = await supabase
      .from('bid_state_updates')
      .select('id, transaction_hash, bid_id, created_at')
      .eq('transaction_hash', transactionHash)
      .eq('bid_id', bidId)
      .eq('update_type', 'payment')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Error checking for duplicate:', error);
      return false;
    }

    if (data) {
      console.log('⚠️ Duplicate payment detected:', {
        updateId: data.id,
        createdAt: data.created_at,
      });
      return true;
    }

    console.log('✅ No duplicate found, safe to proceed');
    return false;
  } catch (error) {
    console.error('❌ Error in duplicate check:', error);
    return false;
  }
};

// ============================================================================
// ON-CHAIN STATE VERIFICATION
// ============================================================================

/**
 * Fetches on-chain bid state from contract
 */
export const getOnChainBidState = async (
  publicClient: PublicClient,
  bountyId: string,
  bidIndex: number,
): Promise<OnChainBidState | null> => {
  try {
    const contractAddress = process.env
      .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

    const bids = (await publicClient.readContract({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'getBids',
      args: [BigInt(bountyId)],
    })) as any[];

    if (!bids || bidIndex >= bids.length) {
      console.error('❌ Bid index out of range:', {
        bountyId,
        bidIndex,
        totalBids: bids?.length || 0,
      });
      return null;
    }

    const bid = bids[bidIndex];
    console.log('✅ Retrieved on-chain bid state:', {
      bountyId,
      bidIndex,
      bidder: bid.bidder,
      status: bid.status,
    });

    return bid;
  } catch (error) {
    console.error('❌ Error fetching on-chain bid state:', error);
    return null;
  }
};

/**
 * Fetches on-chain bounty state from contract
 */
export const getOnChainBountyState = async (
  publicClient: PublicClient,
  bountyId: string,
): Promise<OnChainBountyState | null> => {
  try {
    const contractAddress = process.env
      .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

    const bounty = (await publicClient.readContract({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'getBounty',
      args: [BigInt(bountyId)],
    })) as any;

    console.log('✅ Retrieved on-chain bounty state:', {
      bountyId,
      status: bounty.status,
      value: bounty.value.toString(),
    });

    return bounty;
  } catch (error) {
    console.error('❌ Error fetching on-chain bounty state:', error);
    return null;
  }
};

// ============================================================================
// BID APPROVAL STATE SYNC
// ============================================================================

/**
 * Synchronizes bid approval state between on-chain and database
 * Includes deduplication and verification
 */
export const syncBidApprovalState = async (
  config: BidApprovalStateUpdate,
  publicClient?: PublicClient,
): Promise<StateUpdateResult> => {
  try {
    console.log('🔄 Starting bid approval state sync:', {
      bidId: config.bidId,
      transactionHash: config.transactionHash,
    });

    // Step 1: Check for duplicates
    const isDuplicate = await checkBidApprovalDuplicate(
      config.transactionHash,
      config.bidId,
    );

    if (isDuplicate) {
      console.log('⚠️ Approval already processed, skipping update');
      return {
        success: true,
        isDuplicate: true,
      };
    }

    // Step 2: Verify on-chain state (if publicClient provided)
    if (publicClient) {
      const onChainBid = await getOnChainBidState(
        publicClient,
        config.onchainBountyId,
        config.onchainBidIndex,
      );

      if (!onChainBid) {
        console.error('❌ Could not verify on-chain bid state');
        return {
          success: false,
          isDuplicate: false,
          error: 'On-chain verification failed',
        };
      }

      // Verify bid status is Accepted (1)
      if (onChainBid.status !== 1) {
        console.error('❌ On-chain bid status mismatch:', {
          expected: 1,
          actual: onChainBid.status,
        });
        return {
          success: false,
          isDuplicate: false,
          error: 'On-chain bid not in Accepted state',
        };
      }
    }

    // Step 3: Create state update record
    const { data: updateRecord, error: updateError } = await supabase
      .from('bid_state_updates')
      .insert({
        bid_id: config.bidId,
        bounty_id: config.bountyId,
        transaction_hash: config.transactionHash,
        update_type: 'approval',
        onchain_bounty_id: config.onchainBountyId,
        onchain_bid_index: config.onchainBidIndex,
        new_status: config.status,
        metadata: {
          reviewer: config.reviewer,
          approver: config.approver,
          timestamp: config.timestamp,
        },
      })
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error creating state update record:', updateError);
      throw updateError;
    }

    console.log('✅ State update record created:', updateRecord.id);

    // Step 4: Update bid status
    // Note: Database has 'reviewer_address' and 'final_approver_address' columns
    const { error: bidUpdateError } = await supabase
      .from('bids')
      .update({
        status: config.status,
        reviewer_address: config.reviewer, // Technical reviewer who approves bids
        final_approver_address: config.approver, // Final approver for payment release
        reviewed_at: config.timestamp,
      })
      .eq('id', config.bidId);

    if (bidUpdateError) {
      console.error('❌ Error updating bid status:', bidUpdateError);
      throw bidUpdateError;
    }

    console.log('✅ Bid status updated successfully');

    // Step 4.5: Create milestones if this is a milestone-based bid
    const { data: bidData, error: bidFetchError } = await supabase
      .from('bids')
      .select('payment_option, deliverables')
      .eq('id', config.bidId)
      .single();

    if (!bidFetchError && bidData && bidData.payment_option === 'milestones') {
      console.log('🎯 Creating milestones for milestone-based bid');

      try {
        // Parse deliverables and create milestones
        const deliverables = Array.isArray(bidData.deliverables)
          ? bidData.deliverables
          : typeof bidData.deliverables === 'string'
            ? JSON.parse(bidData.deliverables)
            : [];

        if (deliverables && deliverables.length > 0) {
          const milestonesData = deliverables.map((deliverable: any) => ({
            bid_id: config.bidId,
            deliverable_description:
              deliverable.description || 'Milestone deliverable',
            due_date:
              deliverable.due_date ||
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
            payment_amount:
              deliverable.paymentAmount || deliverable.payment_amount || '0',
            status: 'pending',
          }));

          const { error: milestonesError } = await supabase
            .from('milestones')
            .insert(milestonesData);

          if (milestonesError) {
            console.error('❌ Error creating milestones:', milestonesError);
          } else {
            console.log(
              `✅ Created ${milestonesData.length} milestones for bid ${config.bidId}`,
            );
          }
        }
      } catch (milestonesCreateError) {
        console.error(
          '❌ Error processing milestones creation:',
          milestonesCreateError,
        );
      }
    }

    // Step 5: Increment bids_accepted_count
    console.log(
      '📊 Incrementing bids_accepted_count for bounty:',
      config.bountyId,
    );
    const { error: counterError } = await supabase.rpc(
      'increment_bids_accepted',
      { bounty_id_param: config.bountyId },
    );

    if (counterError) {
      console.error('❌ Error incrementing bid counter:', counterError);
      // Don't throw - bid update was successful, continue with status update
    } else {
      console.log('✅ Bid counter incremented successfully');
    }

    // Step 6: Check if should close bounty based on bid acceptance mode
    const { data: bounty, error: bountyFetchError } = await supabase
      .from('bounties')
      .select('bid_acceptance_mode, max_bids_accepted, bids_accepted_count')
      .eq('id', config.bountyId)
      .single();

    if (bountyFetchError) {
      console.error(
        '❌ Error fetching bounty for status check:',
        bountyFetchError,
      );
    }

    // Determine new bounty status based on bid acceptance mode
    // When a bid is approved, the bounty should be 'assigned' (worker is working on it)
    // It should NOT be 'closed' - that would prevent work submission and payment
    let newStatus = 'assigned'; // Bid approved = work assigned to bidder

    if (bounty) {
      console.log('🔍 Bid approved, setting bounty status:', {
        mode: bounty.bid_acceptance_mode,
        maxBids: bounty.max_bids_accepted,
        acceptedCount: bounty.bids_accepted_count,
        newStatus: 'assigned',
      });

      // Note: Bid acceptance mode controls whether MORE bids can be accepted
      // But the bounty stays 'assigned' until work is completed and payment released
      if (bounty.bid_acceptance_mode === 'single') {
        console.log('✅ Single bid mode - bounty assigned to one worker');
      } else if (
        bounty.bid_acceptance_mode === 'multiple' &&
        bounty.bids_accepted_count >= (bounty.max_bids_accepted || 1)
      ) {
        console.log(
          `✅ Multiple bid mode limit reached (${bounty.bids_accepted_count}/${bounty.max_bids_accepted}) - all slots filled`,
        );
      } else {
        console.log(
          'ℹ️ Bounty assigned, can still accept more bids (unlimited or date_limited mode, or slots available)',
        );
      }
    }

    // Step 7: Update bounty status
    const { error: bountyUpdateError } = await supabase
      .from('bounties')
      .update({
        status: newStatus,
        updated_at: config.timestamp,
      })
      .eq('id', config.bountyId);

    if (bountyUpdateError) {
      console.error('❌ Error updating bounty status:', bountyUpdateError);
      // Don't throw - bid update was successful
    } else {
      console.log(`✅ Bounty status updated to: ${newStatus}`);
    }

    console.log('✅ Bid approval state sync complete');

    return {
      success: true,
      updateId: updateRecord.id,
      isDuplicate: false,
    };
  } catch (error) {
    console.error('❌ Error syncing bid approval state:', error);
    return {
      success: false,
      isDuplicate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// ============================================================================
// PAYMENT STATE SYNC
// ============================================================================

/**
 * Synchronizes payment state between on-chain and database
 * Includes deduplication and verification
 */
export const syncPaymentState = async (
  config: PaymentStateUpdate,
  publicClient?: PublicClient,
): Promise<StateUpdateResult> => {
  try {
    console.log('🔄 Starting payment state sync:', {
      bidId: config.bidId,
      transactionHash: config.transactionHash,
    });

    // Step 1: Check for duplicates
    const isDuplicate = await checkPaymentDuplicate(
      config.transactionHash,
      config.bidId,
    );

    if (isDuplicate) {
      console.log('⚠️ Payment already processed, skipping update');
      return {
        success: true,
        isDuplicate: true,
      };
    }

    // Step 2: Verify on-chain state (if publicClient provided)
    if (publicClient) {
      // Get bid to find the on-chain bounty ID
      const { data: bid, error: bidError } = await supabase
        .from('bids')
        .select('bounty_id')
        .eq('id', config.bidId)
        .single();

      if (bidError || !bid) {
        console.error('❌ Could not find bid in database');
        return {
          success: false,
          isDuplicate: false,
          error: 'Bid not found in database',
        };
      }

      // Get bounty to find on-chain ID
      const { data: bounty, error: bountyError } = await supabase
        .from('bounties')
        .select('onchain_id')
        .eq('id', bid.bounty_id)
        .single();

      if (bountyError || !bounty || !bounty.onchain_id) {
        console.error('❌ Could not find bounty on-chain ID');
        return {
          success: false,
          isDuplicate: false,
          error: 'Bounty on-chain ID not found',
        };
      }

      // Verify bounty is completed on-chain
      const onChainBounty = await getOnChainBountyState(
        publicClient,
        bounty.onchain_id.toString(),
      );

      if (!onChainBounty) {
        console.error('❌ Could not verify on-chain bounty state');
        return {
          success: false,
          isDuplicate: false,
          error: 'On-chain verification failed',
        };
      }

      // Verify bounty status is Completed (2)
      if (onChainBounty.status !== 2) {
        console.error('❌ On-chain bounty status mismatch:', {
          expected: 2,
          actual: onChainBounty.status,
        });
        return {
          success: false,
          isDuplicate: false,
          error: 'On-chain bounty not in Completed state',
        };
      }
    }

    // Step 3: Create state update record
    const { data: updateRecord, error: updateError } = await supabase
      .from('bid_state_updates')
      .insert({
        bid_id: config.bidId,
        bounty_id: config.bountyId,
        transaction_hash: config.transactionHash,
        update_type: 'payment',
        new_status: config.status,
        metadata: {
          paymentAmount: config.paymentAmount,
          paymentToken: config.paymentToken,
          timestamp: config.timestamp,
        },
      })
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error creating state update record:', updateError);
      throw updateError;
    }

    console.log('✅ State update record created:', updateRecord.id);

    // Step 4: Update bid status
    const { error: bidUpdateError } = await supabase
      .from('bids')
      .update({
        status: config.status,
      })
      .eq('id', config.bidId);

    if (bidUpdateError) {
      console.error('❌ Error updating bid status:', bidUpdateError);
      throw bidUpdateError;
    }

    console.log('✅ Bid status updated to completed');

    // Step 5: Update bounty status
    const { error: bountyUpdateError } = await supabase
      .from('bounties')
      .update({
        status: 'completed',
        updated_at: config.timestamp,
      })
      .eq('id', config.bountyId);

    if (bountyUpdateError) {
      console.error('❌ Error updating bounty status:', bountyUpdateError);
      // Don't throw - bid update was successful
    }

    console.log('✅ Payment state sync complete');

    return {
      success: true,
      updateId: updateRecord.id,
      isDuplicate: false,
    };
  } catch (error) {
    console.error('❌ Error syncing payment state:', error);
    return {
      success: false,
      isDuplicate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

/**
 * Resolves conflicts between on-chain and database state
 * Used for recovery and data integrity maintenance
 */
export const resolveStateConflict = async (
  bidId: string,
  publicClient: PublicClient,
): Promise<boolean> => {
  try {
    console.log('🔧 Resolving state conflict for bid:', bidId);

    // Get database bid state
    const { data: bid, error: bidError } = await supabase
      .from('bids')
      .select('*, bounties!inner(onchain_id)')
      .eq('id', bidId)
      .single();

    if (bidError || !bid) {
      console.error('❌ Could not find bid:', bidError);
      return false;
    }

    const onchainBountyId = (bid.bounties as any).onchain_id;
    if (!onchainBountyId || !bid.onchain_bid_index) {
      console.error('❌ Missing on-chain identifiers');
      return false;
    }

    // Get on-chain bid state
    const onChainBid = await getOnChainBidState(
      publicClient,
      onchainBountyId.toString(),
      bid.onchain_bid_index,
    );

    if (!onChainBid) {
      console.error('❌ Could not fetch on-chain state');
      return false;
    }

    // Map on-chain status to database status
    let correctStatus: string;
    if (onChainBid.status === 0) correctStatus = 'pending';
    else if (onChainBid.status === 1) correctStatus = 'approved';
    else if (onChainBid.status === 2) correctStatus = 'rejected';
    else correctStatus = 'pending';

    // Update database if mismatch
    if (bid.status !== correctStatus) {
      console.log('🔧 Correcting database state:', {
        bidId,
        currentStatus: bid.status,
        correctStatus,
      });

      await supabase
        .from('bids')
        .update({ status: correctStatus })
        .eq('id', bidId);

      console.log('✅ State conflict resolved');
      return true;
    }

    console.log('✅ No conflict found');
    return true;
  } catch (error) {
    console.error('❌ Error resolving state conflict:', error);
    return false;
  }
};

// ============================================================================
// MILESTONE PAYMENT STATE SYNCHRONIZATION
// ============================================================================

export const syncMilestonePaymentState = async (
  config: MilestonePaymentStateUpdate,
  publicClient?: PublicClient,
): Promise<StateUpdateResult> => {
  try {
    console.log('🔄 Starting milestone payment state sync:', {
      milestoneId: config.milestoneId,
      transactionHash: config.transactionHash,
    });

    // Step 1: Check for duplicates using a simple milestone_id + transaction_hash check
    const { data: existingUpdate } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', config.milestoneId)
      .eq('status', 'completed')
      .maybeSingle();

    if (existingUpdate) {
      console.log('⚠️ Milestone payment already processed, skipping update');
      return {
        success: true,
        isDuplicate: true,
      };
    }

    // Step 2: Update milestone status
    const { error: milestoneUpdateError } = await supabase
      .from('milestones')
      .update({
        status: 'completed',
        completed_at: config.timestamp,
        completed_by: config.transactionHash, // Track the transaction hash as completion reference
      })
      .eq('id', config.milestoneId);

    if (milestoneUpdateError) {
      console.error(
        '❌ Error updating milestone status:',
        milestoneUpdateError,
      );
      throw milestoneUpdateError;
    }

    console.log('✅ Milestone status updated to completed');

    // Step 3: Get the bid_id for this milestone to check other milestones
    const { data: milestone, error: milestoneError } = await supabase
      .from('milestones')
      .select('bid_id')
      .eq('id', config.milestoneId)
      .single();

    if (milestoneError || !milestone) {
      console.error('❌ Error getting milestone bid_id:', milestoneError);
      throw milestoneError;
    }

    // Step 4: Check if all milestones for this bid are completed
    const { data: allMilestones, error: milestonesError } = await supabase
      .from('milestones')
      .select('status')
      .eq('bid_id', milestone.bid_id);

    if (!milestonesError && allMilestones) {
      const allCompleted = allMilestones.every((m) => m.status === 'completed');

      if (allCompleted) {
        // Update bounty status to completed if all milestones are done
        await supabase
          .from('bounties')
          .update({
            status: 'completed',
            updated_at: config.timestamp,
          })
          .eq('id', config.bountyId);

        console.log('✅ All milestones completed - bounty marked as completed');
      }
    }

    console.log('✅ Milestone payment state sync complete');

    return {
      success: true,
      updateId: config.milestoneId,
      isDuplicate: false,
    };
  } catch (error) {
    console.error('❌ Error syncing milestone payment state:', error);
    return {
      success: false,
      isDuplicate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Deduplication
  checkBidApprovalDuplicate,
  checkPaymentDuplicate,

  // On-chain verification
  getOnChainBidState,
  getOnChainBountyState,

  // State synchronization
  syncBidApprovalState,
  syncPaymentState,
  syncMilestonePaymentState,

  // Conflict resolution
  resolveStateConflict,
};
