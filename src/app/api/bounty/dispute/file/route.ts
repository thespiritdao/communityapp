import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { recordExplorerEvent } from '@/lib/explorerEvents';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/bounty/dispute/file
 *
 * File a new dispute for a bounty
 *
 * Body:
 * {
 *   bountyId: string;
 *   bidId?: string;
 *   workSubmissionId?: string;
 *   filerAddress: string;
 *   disputeType: string;
 *   disputeTitle: string;
 *   disputeDescription: string;
 *   desiredResolution: string;
 *   disputedAmount?: string;
 *   disputedToken?: 'SYSTEM' | 'SELF';
 *   priority?: 'low' | 'medium' | 'high' | 'urgent';
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      bountyId,
      bidId,
      workSubmissionId,
      filerAddress,
      disputeType,
      disputeTitle,
      disputeDescription,
      desiredResolution,
      disputedAmount,
      disputedToken,
      priority = 'medium',
    } = body;

    console.log('🚨 Dispute filing request:', {
      bountyId,
      bidId,
      filerAddress,
      disputeType,
    });

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (
      !bountyId ||
      !filerAddress ||
      !disputeType ||
      !disputeTitle ||
      !disputeDescription ||
      !desiredResolution
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: bountyId, filerAddress, disputeType, disputeTitle, disputeDescription, desiredResolution',
        },
        { status: 400 },
      );
    }

    // Validate dispute type
    const validDisputeTypes = [
      'work_quality',
      'work_incomplete',
      'payment_not_released',
      'scope_changed',
      'deadline_missed',
      'communication_failed',
      'terms_violated',
      'other',
    ];

    if (!validDisputeTypes.includes(disputeType)) {
      return NextResponse.json(
        {
          error: `Invalid dispute type. Must be one of: ${validDisputeTypes.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // =====================================================
    // 2. GET BOUNTY DETAILS
    // =====================================================

    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select(
        'id, title, creator_address, status, value_amount, value_token, pod_id',
      )
      .eq('id', bountyId)
      .single();

    if (bountyError || !bounty) {
      console.error('❌ Bounty not found:', bountyError);
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }

    // Check if bounty is already cancelled
    if (bounty.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot file dispute on cancelled bounty' },
        { status: 400 },
      );
    }

    // =====================================================
    // 3. DETERMINE FILER ROLE AND OPPONENT
    // =====================================================

    let filerRole: 'creator' | 'bidder' | null = null;
    let filedAgainst: string | null = null;

    // Check if filer is the creator
    if (bounty.creator_address?.toLowerCase() === filerAddress.toLowerCase()) {
      filerRole = 'creator';

      // If bid is specified, filed against the bidder
      if (bidId) {
        const { data: bid, error: bidError } = await supabase
          .from('bids')
          .select('bidder_address, status')
          .eq('id', bidId)
          .eq('bounty_id', bountyId)
          .single();

        if (bidError || !bid) {
          return NextResponse.json(
            { error: 'Bid not found or does not belong to this bounty' },
            { status: 404 },
          );
        }

        filedAgainst = bid.bidder_address.toLowerCase();
      } else {
        return NextResponse.json(
          { error: 'Creators must specify a bid when filing a dispute' },
          { status: 400 },
        );
      }
    } else {
      // Check if filer is a bidder
      if (!bidId) {
        return NextResponse.json(
          { error: 'Bidders must specify their bid when filing a dispute' },
          { status: 400 },
        );
      }

      const { data: bid, error: bidError } = await supabase
        .from('bids')
        .select('bidder_address, status')
        .eq('id', bidId)
        .eq('bounty_id', bountyId)
        .single();

      if (bidError || !bid) {
        return NextResponse.json(
          { error: 'Bid not found or does not belong to this bounty' },
          { status: 404 },
        );
      }

      if (bid.bidder_address.toLowerCase() === filerAddress.toLowerCase()) {
        filerRole = 'bidder';
        filedAgainst = bounty.creator_address?.toLowerCase() || '';
      } else {
        return NextResponse.json(
          {
            error:
              'You can only file disputes for bounties you created or bid on',
          },
          { status: 403 },
        );
      }
    }

    if (!filerRole || !filedAgainst) {
      return NextResponse.json(
        { error: 'Could not determine dispute parties' },
        { status: 400 },
      );
    }

    // =====================================================
    // 4. CHECK FOR EXISTING OPEN DISPUTES
    // =====================================================

    const { data: existingDisputes, error: existingError } = await supabase
      .from('bounty_disputes')
      .select('id, status')
      .eq('bounty_id', bountyId)
      .in('status', [
        'open',
        'under_review',
        'awaiting_evidence',
        'pending_resolution',
      ]);

    if (existingError) {
      console.error('❌ Error checking existing disputes:', existingError);
    }

    if (existingDisputes && existingDisputes.length > 0) {
      return NextResponse.json(
        {
          error:
            'There is already an open dispute for this bounty. Please wait for it to be resolved.',
          existingDisputeId: existingDisputes[0].id,
        },
        { status: 409 },
      );
    }

    // =====================================================
    // 5. CREATE DISPUTE RECORD
    // =====================================================

    const { data: newDispute, error: insertError } = await supabase
      .from('bounty_disputes')
      .insert({
        bounty_id: bountyId,
        bid_id: bidId || null,
        work_submission_id: workSubmissionId || null,
        filed_by: filerAddress.toLowerCase(),
        filed_against: filedAgainst,
        filer_role: filerRole,
        dispute_type: disputeType,
        dispute_title: disputeTitle,
        dispute_description: disputeDescription,
        desired_resolution: desiredResolution,
        status: 'open',
        priority: priority,
        disputed_amount: disputedAmount || bounty.value_amount,
        disputed_token: disputedToken || bounty.value_token,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !newDispute) {
      console.error('❌ Error creating dispute:', insertError);
      return NextResponse.json(
        { error: 'Failed to create dispute', details: insertError?.message },
        { status: 500 },
      );
    }

    console.log('✅ Dispute created:', newDispute.id);

    recordExplorerEvent({
      type: 'dispute_opened',
      title: `Dispute filed: ${disputeTitle}`,
      actor: filerAddress,
      url: `/bounty/${bountyId}`,
      metadata: { dispute_id: newDispute.id, bounty_id: bountyId, dispute_type: disputeType, priority },
      dedupe_key: `dispute_opened:${newDispute.id}`,
    }).catch((err) => console.warn('[dispute/file] explorer event failed:', err));

    // =====================================================
    // 6. CREATE INITIAL SYSTEM COMMENT
    // =====================================================

    const { error: commentError } = await supabase
      .from('dispute_comments')
      .insert({
        dispute_id: newDispute.id,
        author_address: 'system',
        author_role: 'system',
        comment_text: `Dispute filed by ${filerRole === 'creator' ? 'bounty creator' : 'bidder'}. Type: ${disputeType.replace('_', ' ')}`,
        comment_type: 'system_message',
        is_private: false,
        created_at: new Date().toISOString(),
      });

    if (commentError) {
      console.error('⚠️ Error creating system comment:', commentError);
      // Non-fatal, continue
    }

    // =====================================================
    // 7. SEND NOTIFICATIONS
    // =====================================================

    // Notify the opponent
    try {
      await unifiedNotificationService.createNotification({
        recipient_address: filedAgainst,
        sender_address: filerAddress.toLowerCase(),
        notification_type: 'bounty_update',
        title: 'Dispute Filed',
        message: `A dispute has been filed on bounty "${bounty.title}". Type: ${disputeType.replace('_', ' ')}`,
        context_type: 'bounty',
        context_id: newDispute.id,
        context_url: `/bounty/dispute/${newDispute.id}`,
        priority: priority === 'urgent' ? 'high' : 'medium',
      });
    } catch (opponentNotifError) {
      console.error(
        '⚠️ Error sending opponent notification:',
        opponentNotifError,
      );
    }

    // Notify pod leaders if bounty belongs to a pod
    if (bounty.pod_id) {
      const { data: pod } = await supabase
        .from('pods')
        .select('pod_leads, name')
        .eq('id', bounty.pod_id)
        .single();

      if (pod && pod.pod_leads && pod.pod_leads.length > 0) {
        const podLeaderPromises = pod.pod_leads
          .filter(
            (lead: string) =>
              lead.toLowerCase() !== filerAddress.toLowerCase() &&
              lead.toLowerCase() !== filedAgainst,
          )
          .map((lead: string) =>
            unifiedNotificationService.createNotification({
              recipient_address: lead.toLowerCase(),
              sender_address: 'system',
              notification_type: 'bounty_update',
              title: 'Dispute Requires Review',
              message: `A ${priority} priority dispute has been filed on bounty "${bounty.title}" in pod "${pod.name}". Your mediation may be required.`,
              context_type: 'bounty',
              context_id: newDispute.id,
              context_url: `/bounty/dispute/${newDispute.id}`,
              priority: 'high',
            }),
          );

        if (podLeaderPromises.length > 0) {
          await Promise.all(podLeaderPromises);
          console.log(`✅ Notified ${podLeaderPromises.length} pod leaders`);
        }
      }
    }

    // =====================================================
    // 8. PAUSE BOUNTY PAYMENTS (if in assigned status)
    // =====================================================

    if (bounty.status === 'in-progress') {
      console.log(
        '⚠️ Bounty is in-progress, payment release should be paused until dispute resolves',
      );
      // This will be enforced in the payment release component
    }

    // =====================================================
    // 9. RETURN SUCCESS RESPONSE
    // =====================================================

    return NextResponse.json({
      success: true,
      dispute: {
        id: newDispute.id,
        bountyId: newDispute.bounty_id,
        bidId: newDispute.bid_id,
        disputeType: newDispute.dispute_type,
        disputeTitle: newDispute.dispute_title,
        status: newDispute.status,
        priority: newDispute.priority,
        createdAt: newDispute.created_at,
      },
      message:
        'Dispute filed successfully. Both parties and pod leaders have been notified.',
    });
  } catch (error) {
    console.error('❌ Error in dispute filing API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
