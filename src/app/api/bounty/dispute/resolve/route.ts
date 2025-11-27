import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/bounty/dispute/resolve
 *
 * Propose or execute a resolution for a dispute
 *
 * Body:
 * {
 *   disputeId: string;
 *   proposerAddress: string;
 *   resolutionType: string;
 *   resolutionDescription: string;
 *   paymentAmount?: string;
 *   paymentToken?: 'SYSTEM' | 'SELF';
 *   paymentRecipient?: string;
 *   revisionRequirements?: string;
 *   revisionDeadline?: string;
 *   executeImmediately?: boolean; // Pod leaders can execute immediately
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      disputeId,
      proposerAddress,
      resolutionType,
      resolutionDescription,
      paymentAmount,
      paymentToken,
      paymentRecipient,
      revisionRequirements,
      revisionDeadline,
      executeImmediately = false,
    } = body;

    console.log('⚖️ Resolution request:', {
      disputeId,
      proposerAddress,
      resolutionType,
      executeImmediately,
    });

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (
      !disputeId ||
      !proposerAddress ||
      !resolutionType ||
      !resolutionDescription
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: disputeId, proposerAddress, resolutionType, resolutionDescription',
        },
        { status: 400 },
      );
    }

    // Validate resolution type
    const validResolutionTypes = [
      'payment_released',
      'payment_refunded',
      'partial_payment',
      'work_revision_required',
      'bounty_cancelled',
      'extend_deadline',
      'reduce_scope',
      'no_action',
      'other',
    ];

    if (!validResolutionTypes.includes(resolutionType)) {
      return NextResponse.json(
        {
          error: `Invalid resolution type. Must be one of: ${validResolutionTypes.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // =====================================================
    // 2. GET DISPUTE DETAILS
    // =====================================================

    const { data: dispute, error: disputeError } = await supabase
      .from('bounty_disputes')
      .select(`
        id,
        bounty_id,
        bid_id,
        filed_by,
        filed_against,
        filer_role,
        status,
        dispute_type,
        disputed_amount,
        disputed_token
      `)
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      console.error('❌ Dispute not found:', disputeError);
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Check if dispute is already resolved
    const resolvedStatuses = [
      'resolved_for_creator',
      'resolved_for_bidder',
      'resolved_compromise',
      'withdrawn',
      'closed',
    ];
    if (resolvedStatuses.includes(dispute.status)) {
      return NextResponse.json(
        { error: `Dispute is already ${dispute.status}` },
        { status: 400 },
      );
    }

    // =====================================================
    // 3. DETERMINE PROPOSER ROLE AND PERMISSIONS
    // =====================================================

    const proposerLower = proposerAddress.toLowerCase();
    let proposerRole: 'creator' | 'bidder' | 'pod_leader' | 'mediator' | null =
      null;
    let canExecuteImmediately = false;

    // Check if proposer is a party
    if (dispute.filed_by.toLowerCase() === proposerLower) {
      proposerRole = dispute.filer_role;
    } else if (dispute.filed_against.toLowerCase() === proposerLower) {
      proposerRole = dispute.filer_role === 'creator' ? 'bidder' : 'creator';
    }

    // Check if proposer is a mediator
    const { data: mediatorCheck } = await supabase
      .from('dispute_mediators')
      .select('id')
      .eq('dispute_id', disputeId)
      .eq('mediator_address', proposerLower)
      .eq('status', 'active')
      .single();

    if (mediatorCheck) {
      proposerRole = 'mediator';
    }

    // Check if proposer is a pod leader (can execute immediately)
    const { data: bounty } = await supabase
      .from('bounties')
      .select('pod_id')
      .eq('id', dispute.bounty_id)
      .single();

    if (bounty && bounty.pod_id) {
      const { data: pod } = await supabase
        .from('pods')
        .select('pod_leads')
        .eq('id', bounty.pod_id)
        .single();

      if (pod && pod.pod_leads) {
        const isPodLeader = pod.pod_leads.some(
          (lead: string) => lead.toLowerCase() === proposerLower,
        );

        if (isPodLeader) {
          proposerRole = 'pod_leader';
          canExecuteImmediately = true;
        }
      }
    }

    if (!proposerRole) {
      return NextResponse.json(
        {
          error:
            'Only parties involved, mediators, or pod leaders can propose resolutions',
        },
        { status: 403 },
      );
    }

    // =====================================================
    // 4. CREATE RESOLUTION RECORD
    // =====================================================

    const resolutionData: any = {
      dispute_id: disputeId,
      proposed_by: proposerLower,
      proposer_role: proposerRole,
      resolution_type: resolutionType,
      resolution_description: resolutionDescription,
      payment_amount: paymentAmount || null,
      payment_token: paymentToken || null,
      payment_recipient: paymentRecipient?.toLowerCase() || null,
      revision_requirements: revisionRequirements || null,
      revision_deadline: revisionDeadline || null,
      status:
        executeImmediately && canExecuteImmediately ? 'approved' : 'proposed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // If pod leader is executing immediately, mark all approvals
    if (executeImmediately && canExecuteImmediately) {
      resolutionData.pod_leader_approved = true;
      resolutionData.approved_by = [proposerLower];
    }

    const { data: newResolution, error: insertError } = await supabase
      .from('dispute_resolutions')
      .insert(resolutionData)
      .select()
      .single();

    if (insertError || !newResolution) {
      console.error('❌ Error creating resolution:', insertError);
      return NextResponse.json(
        { error: 'Failed to create resolution', details: insertError?.message },
        { status: 500 },
      );
    }

    console.log('✅ Resolution created:', newResolution.id);

    // =====================================================
    // 5. EXECUTE RESOLUTION IF IMMEDIATE
    // =====================================================

    let executionResult = null;

    if (executeImmediately && canExecuteImmediately) {
      console.log('⚡ Executing resolution immediately');

      // Update dispute status based on resolution
      let newDisputeStatus: string;
      switch (resolutionType) {
        case 'payment_released':
        case 'partial_payment':
          newDisputeStatus = 'resolved_for_bidder';
          break;
        case 'payment_refunded':
        case 'bounty_cancelled':
          newDisputeStatus = 'resolved_for_creator';
          break;
        case 'work_revision_required':
        case 'extend_deadline':
        case 'reduce_scope':
          newDisputeStatus = 'resolved_compromise';
          break;
        default:
          newDisputeStatus = 'resolved_compromise';
      }

      // Update dispute
      const { error: updateDisputeError } = await supabase
        .from('bounty_disputes')
        .update({
          status: newDisputeStatus,
          resolution_type: resolutionType,
          resolution_notes: resolutionDescription,
          resolved_by: proposerLower,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', disputeId);

      if (updateDisputeError) {
        console.error('❌ Error updating dispute:', updateDisputeError);
      } else {
        console.log('✅ Dispute status updated to', newDisputeStatus);
      }

      // Update resolution status
      const { error: updateResolutionError } = await supabase
        .from('dispute_resolutions')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          executed_by: proposerLower,
          execution_notes: 'Executed by pod leader',
          updated_at: new Date().toISOString(),
        })
        .eq('id', newResolution.id);

      if (updateResolutionError) {
        console.error('❌ Error updating resolution:', updateResolutionError);
      }

      executionResult = {
        executed: true,
        newDisputeStatus,
        executedBy: proposerLower,
        executedAt: new Date().toISOString(),
      };
    }

    // =====================================================
    // 6. CREATE COMMENT
    // =====================================================

    const commentText =
      executeImmediately && canExecuteImmediately
        ? `Pod leader executed resolution: ${resolutionType.replace(/_/g, ' ')}`
        : `${proposerRole === 'creator' ? 'Creator' : proposerRole === 'bidder' ? 'Bidder' : proposerRole === 'mediator' ? 'Mediator' : 'Pod leader'} proposed resolution: ${resolutionType.replace(/_/g, ' ')}`;

    const { error: commentError } = await supabase
      .from('dispute_comments')
      .insert({
        dispute_id: disputeId,
        author_address: proposerLower,
        author_role: proposerRole,
        comment_text: commentText,
        comment_type: 'resolution_proposal',
        is_private: false,
        created_at: new Date().toISOString(),
      });

    if (commentError) {
      console.error('⚠️ Error creating comment:', commentError);
    }

    // =====================================================
    // 7. SEND NOTIFICATIONS
    // =====================================================

    // Notify both parties
    const notificationPromises = [dispute.filed_by, dispute.filed_against]
      .filter((party: string) => party.toLowerCase() !== proposerLower)
      .map((party: string) =>
        unifiedNotificationService.createNotification({
          recipient_address: party.toLowerCase(),
          sender_address: proposerLower,
          notification_type: 'bounty_update',
          title:
            executeImmediately && canExecuteImmediately
              ? 'Dispute Resolved'
              : 'Resolution Proposed',
          message:
            executeImmediately && canExecuteImmediately
              ? `The dispute has been resolved: ${resolutionType.replace(/_/g, ' ')}`
              : `A resolution has been proposed for the dispute: ${resolutionType.replace(/_/g, ' ')}`,
          context_type: 'bounty',
          context_id: disputeId,
          context_url: `/bounty/dispute/${disputeId}`,
          priority: 'high',
        }),
      );

    try {
      await Promise.all(notificationPromises);
      console.log(`✅ Sent ${notificationPromises.length} notifications`);
    } catch (notifError) {
      console.error('⚠️ Error sending notifications:', notifError);
    }

    // =====================================================
    // 8. RETURN SUCCESS RESPONSE
    // =====================================================

    return NextResponse.json({
      success: true,
      resolution: {
        id: newResolution.id,
        disputeId: newResolution.dispute_id,
        resolutionType: newResolution.resolution_type,
        status: newResolution.status,
        proposedBy: newResolution.proposed_by,
        createdAt: newResolution.created_at,
      },
      execution: executionResult,
      message:
        executeImmediately && canExecuteImmediately
          ? 'Resolution executed successfully'
          : 'Resolution proposed successfully. Awaiting approval from all parties.',
    });
  } catch (error) {
    console.error('❌ Error in resolution API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/bounty/dispute/resolve?disputeId=xxx
 *
 * Get all resolutions for a dispute
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const disputeId = searchParams.get('disputeId');

    if (!disputeId) {
      return NextResponse.json(
        { error: 'Missing disputeId parameter' },
        { status: 400 },
      );
    }

    // Get all resolutions for this dispute
    const { data: resolutions, error } = await supabase
      .from('dispute_resolutions')
      .select('*')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching resolutions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch resolutions', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      resolutions: resolutions || [],
      count: resolutions?.length || 0,
    });
  } catch (error) {
    console.error('❌ Error in GET resolutions API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
