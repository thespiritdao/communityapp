import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { requireWallet, requireWalletMatch } from '@/lib/apiPodGuard';
import { canViewDispute } from '@/lib/disputeAccess';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

/**
 * POST /api/bounty/dispute/evidence
 *
 * Submit evidence for a dispute
 *
 * Body:
 * {
 *   disputeId: string;
 *   submitterAddress: string;
 *   evidenceType: string;
 *   evidenceTitle: string;
 *   evidenceDescription: string;
 *   fileUrls?: string[];
 *   externalLinks?: string[];
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      disputeId,
      submitterAddress,
      evidenceType,
      evidenceTitle,
      evidenceDescription,
      fileUrls = [],
      externalLinks = [],
    } = body;

    console.log('📎 Evidence submission request:', {
      disputeId,
      submitterAddress,
      evidenceType,
    });

    // submitterAddress must be the authenticated caller.
    const walletOrDenied = await requireWalletMatch(request, submitterAddress);
    if (walletOrDenied instanceof Response) return walletOrDenied;

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (
      !disputeId ||
      !submitterAddress ||
      !evidenceType ||
      !evidenceTitle ||
      !evidenceDescription
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: disputeId, submitterAddress, evidenceType, evidenceTitle, evidenceDescription',
        },
        { status: 400 },
      );
    }

    // Validate evidence type
    const validEvidenceTypes = [
      'work_sample',
      'communication_log',
      'contract_document',
      'payment_proof',
      'timeline_proof',
      'requirement_proof',
      'screenshot',
      'video',
      'document',
      'link',
      'other',
    ];

    if (!validEvidenceTypes.includes(evidenceType)) {
      return NextResponse.json(
        {
          error: `Invalid evidence type. Must be one of: ${validEvidenceTypes.join(', ')}`,
        },
        { status: 400 },
      );
    }

    if (fileUrls.length === 0 && externalLinks.length === 0) {
      return NextResponse.json(
        { error: 'Must provide at least one file URL or external link' },
        { status: 400 },
      );
    }

    // =====================================================
    // 2. GET DISPUTE DETAILS
    // =====================================================

    const { data: dispute, error: disputeError } = await supabase
      .from('bounty_disputes')
      .select('id, filed_by, filed_against, status, bounty_id, bid_id')
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      console.error('❌ Dispute not found:', disputeError);
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Check if dispute is still open for evidence
    const closedStatuses = [
      'resolved_for_creator',
      'resolved_for_bidder',
      'resolved_compromise',
      'withdrawn',
      'closed',
    ];
    if (closedStatuses.includes(dispute.status)) {
      return NextResponse.json(
        { error: `Cannot submit evidence for ${dispute.status} dispute` },
        { status: 400 },
      );
    }

    // =====================================================
    // 3. VERIFY SUBMITTER IS INVOLVED IN DISPUTE
    // =====================================================

    const submitterLower = submitterAddress.toLowerCase();
    const isParty =
      dispute.filed_by.toLowerCase() === submitterLower ||
      dispute.filed_against.toLowerCase() === submitterLower;

    // Check if submitter is a mediator
    const { data: mediatorCheck } = await supabase
      .from('dispute_mediators')
      .select('id')
      .eq('dispute_id', disputeId)
      .eq('mediator_address', submitterLower)
      .eq('status', 'active')
      .single();

    const isMediator = !!mediatorCheck;

    // Check if submitter is a pod leader
    let isPodLeader = false;
    if (dispute.bounty_id) {
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
          isPodLeader = pod.pod_leads.some(
            (lead: string) => lead.toLowerCase() === submitterLower,
          );
        }
      }
    }

    if (!isParty && !isMediator && !isPodLeader) {
      return NextResponse.json(
        {
          error:
            'Only parties involved in the dispute, mediators, or pod leaders can submit evidence',
        },
        { status: 403 },
      );
    }

    // Determine submitter role
    let submitterRole: 'creator' | 'bidder' | 'mediator' | 'pod_leader';
    if (dispute.filed_by.toLowerCase() === submitterLower) {
      submitterRole = 'creator';
    } else if (dispute.filed_against.toLowerCase() === submitterLower) {
      submitterRole = 'bidder';
    } else if (isMediator) {
      submitterRole = 'mediator';
    } else {
      submitterRole = 'pod_leader';
    }

    // =====================================================
    // 4. GET CURRENT EVIDENCE COUNT FOR DISPLAY ORDER
    // =====================================================

    const { count: evidenceCount } = await supabase
      .from('dispute_evidence')
      .select('id', { count: 'exact', head: true })
      .eq('dispute_id', disputeId);

    const displayOrder = (evidenceCount || 0) + 1;

    // =====================================================
    // 5. INSERT EVIDENCE RECORD
    // =====================================================

    const { data: newEvidence, error: insertError } = await supabase
      .from('dispute_evidence')
      .insert({
        dispute_id: disputeId,
        submitted_by: submitterLower,
        submitter_role: submitterRole,
        evidence_type: evidenceType,
        evidence_title: evidenceTitle,
        evidence_description: evidenceDescription,
        file_urls: fileUrls,
        external_links: externalLinks,
        display_order: displayOrder,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !newEvidence) {
      console.error('❌ Error inserting evidence:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit evidence', details: insertError?.message },
        { status: 500 },
      );
    }

    console.log('✅ Evidence submitted:', newEvidence.id);

    recordExplorerEvent({
      type: 'dispute_evidence_added',
      title: `Evidence submitted: ${evidenceTitle}`,
      actor: submitterLower,
      metadata: { dispute_id: disputeId, evidence_id: newEvidence.id, evidence_type: evidenceType },
      dedupe_key: `dispute_evidence_added:${newEvidence.id}`,
    }).catch((err) => console.warn('[dispute/evidence] explorer event failed:', err));

    // =====================================================
    // 6. CREATE COMMENT NOTIFICATION
    // =====================================================

    const { error: commentError } = await supabase
      .from('dispute_comments')
      .insert({
        dispute_id: disputeId,
        author_address: submitterLower,
        author_role: submitterRole,
        comment_text: `${submitterRole === 'creator' ? 'Creator' : submitterRole === 'bidder' ? 'Bidder' : submitterRole === 'mediator' ? 'Mediator' : 'Pod leader'} submitted evidence: ${evidenceTitle}`,
        comment_type: 'evidence_submission',
        is_private: false,
        created_at: new Date().toISOString(),
      });

    if (commentError) {
      console.error('⚠️ Error creating evidence comment:', commentError);
      // Non-fatal
    }

    // =====================================================
    // 7. SEND NOTIFICATIONS
    // =====================================================

    const notificationPromises: Promise<any>[] = [];

    // Notify the other party
    const otherParty =
      dispute.filed_by.toLowerCase() === submitterLower
        ? dispute.filed_against
        : dispute.filed_by;

    notificationPromises.push(
      unifiedNotificationService.createNotification({
        recipient_address: otherParty.toLowerCase(),
        sender_address: submitterLower,
        notification_type: 'bounty_update',
        title: 'New Evidence Submitted',
        message: `New evidence has been submitted for the dispute: ${evidenceTitle}`,
        context_type: 'bounty',
        context_id: disputeId,
        context_url: `/bounty/dispute/${disputeId}`,
        priority: 'medium',
      }),
    );

    // Notify mediators
    const { data: mediators } = await supabase
      .from('dispute_mediators')
      .select('mediator_address')
      .eq('dispute_id', disputeId)
      .eq('status', 'active');

    if (mediators && mediators.length > 0) {
      mediators.forEach((mediator: any) => {
        if (mediator.mediator_address.toLowerCase() !== submitterLower) {
          notificationPromises.push(
            unifiedNotificationService.createNotification({
              recipient_address: mediator.mediator_address.toLowerCase(),
              sender_address: submitterLower,
              notification_type: 'bounty_update',
              title: 'New Evidence Submitted',
              message: `New evidence has been submitted for a dispute you're mediating: ${evidenceTitle}`,
              context_type: 'bounty',
              context_id: disputeId,
              context_url: `/bounty/dispute/${disputeId}`,
              priority: 'medium',
            }),
          );
        }
      });
    }

    if (notificationPromises.length > 0) {
      try {
        await Promise.all(notificationPromises);
        console.log(`✅ Sent ${notificationPromises.length} notifications`);
      } catch (notifError) {
        console.error('⚠️ Error sending notifications:', notifError);
      }
    }

    // =====================================================
    // 8. UPDATE DISPUTE STATUS IF NEEDED
    // =====================================================

    if (dispute.status === 'awaiting_evidence') {
      const { error: updateError } = await supabase
        .from('bounty_disputes')
        .update({
          status: 'under_review',
          updated_at: new Date().toISOString(),
        })
        .eq('id', disputeId);

      if (updateError) {
        console.error('⚠️ Error updating dispute status:', updateError);
      } else {
        console.log('✅ Dispute status updated to under_review');
      }
    }

    // =====================================================
    // 9. RETURN SUCCESS RESPONSE
    // =====================================================

    return NextResponse.json({
      success: true,
      evidence: {
        id: newEvidence.id,
        disputeId: newEvidence.dispute_id,
        evidenceType: newEvidence.evidence_type,
        evidenceTitle: newEvidence.evidence_title,
        submitterRole: newEvidence.submitter_role,
        createdAt: newEvidence.created_at,
      },
      message: 'Evidence submitted successfully',
    });
  } catch (error) {
    console.error('❌ Error in evidence submission API:', error);
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
 * GET /api/bounty/dispute/evidence?disputeId=xxx
 *
 * Get all evidence for a dispute
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

    const walletOrDenied = await requireWallet(request);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const { data: disputeRow } = await supabase
      .from('bounty_disputes')
      .select('id, bounty_id, filed_by, filed_against')
      .eq('id', disputeId)
      .maybeSingle();
    if (!disputeRow) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }
    if (!(await canViewDispute(disputeRow, walletOrDenied))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all evidence for this dispute
    const { data: evidence, error } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('dispute_id', disputeId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('❌ Error fetching evidence:', error);
      return NextResponse.json(
        { error: 'Failed to fetch evidence', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      evidence: evidence || [],
      count: evidence?.length || 0,
    });
  } catch (error) {
    console.error('❌ Error in GET evidence API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
