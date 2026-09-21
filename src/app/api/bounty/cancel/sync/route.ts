import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { requireWalletMatch } from '@/lib/apiPodGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

/**
 * POST /api/bounty/cancel/sync
 *
 * Syncs database state AFTER a successful on-chain cancellation.
 * This endpoint is called ONLY after the blockchain transaction succeeds.
 *
 * Transaction-First Architecture:
 * 1. User initiates cancellation
 * 2. Transaction executes on blockchain (source of truth)
 * 3. On success → This endpoint syncs database to match blockchain
 * 4. Send notifications and update UI
 *
 * This prevents database/blockchain desync if transaction fails.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      bountyId,
      onchainId,
      cancelerAddress,
      cancellationReason,
      transactionHash,
    } = body;

    console.log('🔄 Syncing bounty cancellation to database:', {
      bountyId,
      onchainId,
      cancelerAddress,
      transactionHash,
    });

    // Validation
    if (!bountyId || !cancelerAddress || !transactionHash) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: bountyId, cancelerAddress, transactionHash',
        },
        { status: 400 },
      );
    }

    // cancelerAddress must be the authenticated caller.
    const walletOrDenied = await requireWalletMatch(request, cancelerAddress);
    if (walletOrDenied instanceof Response) return walletOrDenied;

    // Get bounty details
    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select('*')
      .eq('id', bountyId)
      .single();

    if (bountyError || !bounty) {
      console.error('❌ Bounty not found:', bountyError);
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }

    // Check if already cancelled (idempotent operation)
    if (bounty.status === 'cancelled') {
      console.log('✅ Bounty already cancelled in database (idempotent)');
      return NextResponse.json({
        success: true,
        alreadyCancelled: true,
        bounty,
        message: 'Bounty was already cancelled in database',
      });
    }

    // Verify canceler is authorized (bounty creator or pod leader)
    let isAuthorized =
      bounty.creator_address?.toLowerCase() === cancelerAddress.toLowerCase();

    if (!isAuthorized && bounty.pod_id) {
      // Check if canceler is a pod leader
      const { data: pod } = await supabase
        .from('pods')
        .select('pod_leads')
        .eq('id', bounty.pod_id)
        .single();

      if (pod && pod.pod_leads) {
        isAuthorized = pod.pod_leads.some(
          (lead: string) =>
            lead.toLowerCase() === cancelerAddress.toLowerCase(),
        );
      }
    }

    if (!isAuthorized) {
      console.error('❌ Canceler not authorized');
      return NextResponse.json(
        {
          error:
            'Only the bounty creator or pod leaders can cancel this bounty',
        },
        { status: 403 },
      );
    }

    // Update bounty status to cancelled (syncing with blockchain state)
    const { data: updatedBounty, error: updateError } = await supabase
      .from('bounties')
      .update({
        status: 'cancelled',
        cancellation_reason: cancellationReason,
        cancellation_tx_hash: transactionHash,
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelerAddress.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bountyId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating bounty status:', updateError);
      return NextResponse.json(
        {
          error: 'Failed to update bounty status',
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    console.log('✅ Bounty status synced to database:', bountyId);

    // Archive all pending bids
    const { data: archivedBids, error: archiveBidsError } = await supabase
      .from('bids')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('bounty_id', bountyId)
      .in('status', ['pending', 'legacy_pending'])
      .select('id, bidder_address');

    if (archiveBidsError) {
      console.error('⚠️ Error archiving bids:', archiveBidsError);
      // Non-fatal error, continue
    } else {
      console.log(`✅ ${archivedBids?.length || 0} pending bids archived`);
    }

    // Get all bids for notifications
    const { data: allBids } = await supabase
      .from('bids')
      .select('bidder_address, status')
      .eq('bounty_id', bountyId);

    // Send notifications to all bidders
    if (allBids && allBids.length > 0) {
      const notificationPromises = allBids.map((bid) =>
        unifiedNotificationService.createNotification({
          recipient_address: bid.bidder_address.toLowerCase(),
          sender_address: cancelerAddress.toLowerCase(),
          notification_type: 'bounty_update',
          title: 'Bounty Cancelled',
          message: `The bounty "${bounty.title}" has been cancelled${cancellationReason ? `. Reason: ${cancellationReason}` : ''}`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),
      );

      try {
        await Promise.all(notificationPromises);
        console.log(
          `✅ Cancellation notifications sent to ${allBids.length} bidders`,
        );
      } catch (notifError) {
        console.error('⚠️ Error sending notifications:', notifError);
        // Non-fatal error, continue
      }
    }

    return NextResponse.json({
      success: true,
      bounty: updatedBounty,
      transactionHash,
      archivedBidsCount: archivedBids?.length || 0,
      notificationsSent: allBids?.length || 0,
    });
  } catch (error) {
    console.error('❌ Error in bounty cancellation sync:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
