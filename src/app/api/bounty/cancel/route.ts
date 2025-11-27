import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      bountyId,
      cancelerAddress,
      cancellationReason
    } = body;

    console.log('🚫 Bounty cancellation request:', {
      bountyId,
      cancelerAddress
    });

    // Validation
    if (!bountyId || !cancelerAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: bountyId, cancelerAddress' },
        { status: 400 }
      );
    }

    // Get bounty details
    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select('*')
      .eq('id', bountyId)
      .single();

    if (bountyError || !bounty) {
      console.error('❌ Bounty not found:', bountyError);
      return NextResponse.json(
        { error: 'Bounty not found' },
        { status: 404 }
      );
    }

    // Check if bounty can be cancelled
    if (bounty.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel a completed bounty' },
        { status: 400 }
      );
    }

    if (bounty.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Bounty is already cancelled' },
        { status: 400 }
      );
    }

    // Verify canceler is authorized (bounty creator or pod leader)
    let isAuthorized = bounty.creator_address?.toLowerCase() === cancelerAddress.toLowerCase();

    if (!isAuthorized && bounty.pod_id) {
      // Check if canceler is a pod leader
      const { data: pod } = await supabase
        .from('pods')
        .select('pod_leads')
        .eq('id', bounty.pod_id)
        .single();

      if (pod && pod.pod_leads) {
        isAuthorized = pod.pod_leads.some(
          (lead: string) => lead.toLowerCase() === cancelerAddress.toLowerCase()
        );
      }
    }

    if (!isAuthorized) {
      console.error('❌ Canceler not authorized');
      return NextResponse.json(
        { error: 'Only the bounty creator or pod leaders can cancel this bounty' },
        { status: 403 }
      );
    }

    // Check for approved bids
    const { data: approvedBids, error: bidsError } = await supabase
      .from('bids')
      .select('id, bidder_address, proposed_amount')
      .eq('bounty_id', bountyId)
      .eq('status', 'approved');

    if (bidsError) {
      console.error('❌ Error checking approved bids:', bidsError);
      return NextResponse.json(
        { error: 'Failed to check for approved bids', details: bidsError.message },
        { status: 500 }
      );
    }

    // Prevent cancellation if there are approved bids with work in progress
    if (approvedBids && approvedBids.length > 0) {
      // Check if any work has been submitted
      const { data: workSubmissions } = await supabase
        .from('work_submissions')
        .select('id, status')
        .eq('bounty_id', bountyId);

      if (workSubmissions && workSubmissions.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot cancel bounty with approved bids and submitted work. Please review or reject the work first.',
            hasWorkSubmissions: true
          },
          { status: 400 }
        );
      }

      // If there are approved bids but no work submitted yet, allow cancellation but warn
      console.log('⚠️ Cancelling bounty with approved bids (no work submitted yet)');
    }

    // Update bounty status to cancelled
    const { data: updatedBounty, error: updateError } = await supabase
      .from('bounties')
      .update({
        status: 'cancelled',
        cancellation_reason: cancellationReason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelerAddress.toLowerCase(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bountyId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error cancelling bounty:', updateError);
      return NextResponse.json(
        { error: 'Failed to cancel bounty', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('✅ Bounty cancelled:', bountyId);

    // Archive all pending bids
    const { error: archiveBidsError } = await supabase
      .from('bids')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .eq('bounty_id', bountyId)
      .eq('status', 'pending');

    if (archiveBidsError) {
      console.error('⚠️ Error archiving bids:', archiveBidsError);
      // Non-fatal error, continue
    } else {
      console.log('✅ Pending bids archived');
    }

    // Send notifications to all bidders
    const { data: allBids } = await supabase
      .from('bids')
      .select('bidder_address, status')
      .eq('bounty_id', bountyId);

    if (allBids && allBids.length > 0) {
      const notificationPromises = allBids.map(bid =>
        unifiedNotificationService.createNotification({
          recipient_address: bid.bidder_address.toLowerCase(),
          sender_address: cancelerAddress.toLowerCase(),
          notification_type: 'bounty_update',
          title: 'Bounty Cancelled',
          message: `The bounty "${bounty.title}" has been cancelled. ${cancellationReason ? `Reason: ${cancellationReason}` : ''}`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high'
        })
      );

      try {
        await Promise.all(notificationPromises);
        console.log(`✅ Cancellation notifications sent to ${allBids.length} bidders`);
      } catch (notifError) {
        console.error('⚠️ Error sending notifications:', notifError);
      }
    }

    // Handle refund logic
    // Note: Actual on-chain refund would happen via smart contract
    // This is just tracking the cancellation in the database
    const refundInfo = {
      shouldRefund: true,
      amount: bounty.value_amount,
      token: bounty.value_token,
      recipient: bounty.creator_address,
      hasApprovedBids: approvedBids && approvedBids.length > 0
    };

    return NextResponse.json({
      success: true,
      bounty: updatedBounty,
      refundInfo,
      archivedBidsCount: allBids?.length || 0
    });

  } catch (error) {
    console.error('❌ Error in bounty cancellation API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
