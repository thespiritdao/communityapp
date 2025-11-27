import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      submissionId,
      reviewerAddress,
      status, // 'approved' | 'rejected' | 'revision_requested'
      reviewComments,
    } = body;

    console.log('🔍 Work review request:', {
      submissionId,
      reviewerAddress,
      status,
    });

    // Validation
    if (!submissionId || !reviewerAddress || !status) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: submissionId, reviewerAddress, status',
        },
        { status: 400 },
      );
    }

    if (!['approved', 'rejected', 'revision_requested'].includes(status)) {
      return NextResponse.json(
        {
          error:
            'Invalid status. Must be: approved, rejected, or revision_requested',
        },
        { status: 400 },
      );
    }

    // Get submission details
    const { data: submission, error: submissionError } = await supabase
      .from('work_submissions')
      .select(`
        *,
        bounties!inner(id, creator_address, pod_id, title, value_amount, value_token, onchain_id),
        bids!inner(id, bidder_address, proposed_amount)
      `)
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      console.error('❌ Submission not found:', submissionError);
      return NextResponse.json(
        { error: 'Work submission not found' },
        { status: 404 },
      );
    }

    // Verify reviewer is authorized (bounty creator or pod leader)
    const bounty = submission.bounties;
    let isAuthorized =
      bounty.creator_address?.toLowerCase() === reviewerAddress.toLowerCase();

    if (!isAuthorized && bounty.pod_id) {
      // Check if reviewer is a pod leader
      const { data: pod } = await supabase
        .from('pods')
        .select('pod_leads')
        .eq('id', bounty.pod_id)
        .single();

      if (pod && pod.pod_leads) {
        isAuthorized = pod.pod_leads.some(
          (lead: string) =>
            lead.toLowerCase() === reviewerAddress.toLowerCase(),
        );
      }
    }

    if (!isAuthorized) {
      console.error('❌ Reviewer not authorized');
      return NextResponse.json(
        {
          error:
            'Only the bounty creator or pod leaders can review work submissions',
        },
        { status: 403 },
      );
    }

    // Update submission
    const { data: updatedSubmission, error: updateError } = await supabase
      .from('work_submissions')
      .update({
        status,
        reviewer_address: reviewerAddress.toLowerCase(),
        review_comments: reviewComments,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating submission:', updateError);
      return NextResponse.json(
        { error: 'Failed to update submission', details: updateError.message },
        { status: 500 },
      );
    }

    console.log('✅ Work submission reviewed:', {
      submissionId,
      status,
      reviewer: reviewerAddress,
    });

    // Handle status-specific actions
    if (status === 'approved') {
      // DO NOT change bounty status to 'completed' yet - payment hasn't been released!
      // Status will be updated to 'completed' by BountyCompletion component after payment
      // Keep bounty status as 'assigned' so it appears in Pay tab

      // Update bid status to indicate work is approved and ready for payment
      await supabase
        .from('bids')
        .update({
          status: 'work_approved', // New status: work approved, awaiting payment
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.bid_id);

      console.log(
        '✅ Work approved - bounty remains "assigned" until payment released',
      );

      // Send notification to bidder
      const bid = submission.bids;
      await unifiedNotificationService.createNotification({
        recipient_address: bid.bidder_address.toLowerCase(),
        sender_address: reviewerAddress.toLowerCase(),
        notification_type: 'bounty_update',
        title: 'Work Approved!',
        message: `Your work submission for "${bounty.title}" has been approved! ${reviewComments ? `Feedback: ${reviewComments}` : ''}`,
        context_type: 'bounty',
        context_id: submission.bounty_id,
        context_url: `/bounty/${submission.bounty_id}`,
        priority: 'high',
      });

      console.log('✅ Approval notification sent to bidder');
    } else if (status === 'rejected') {
      // Send rejection notification
      const bid = submission.bids;
      await unifiedNotificationService.createNotification({
        recipient_address: bid.bidder_address.toLowerCase(),
        sender_address: reviewerAddress.toLowerCase(),
        notification_type: 'bounty_update',
        title: 'Work Submission Rejected',
        message: `Your work submission for "${bounty.title}" was not accepted. ${reviewComments ? `Reason: ${reviewComments}` : 'Please contact the bounty creator for details.'}`,
        context_type: 'bounty',
        context_id: submission.bounty_id,
        context_url: `/bounty/${submission.bounty_id}`,
        priority: 'high',
      });

      console.log('✅ Rejection notification sent to bidder');
    } else if (status === 'revision_requested') {
      // Send revision request notification
      const bid = submission.bids;
      await unifiedNotificationService.createNotification({
        recipient_address: bid.bidder_address.toLowerCase(),
        sender_address: reviewerAddress.toLowerCase(),
        notification_type: 'bounty_update',
        title: 'Revision Requested',
        message: `Please revise your work submission for "${bounty.title}". ${reviewComments || 'See review comments for details.'}`,
        context_type: 'bounty',
        context_id: submission.bounty_id,
        context_url: `/bounty/${submission.bounty_id}/submissions`,
        priority: 'high',
      });

      console.log('✅ Revision request notification sent to bidder');
    }

    return NextResponse.json({
      success: true,
      submission: updatedSubmission,
    });
  } catch (error) {
    console.error('❌ Error in work review API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
