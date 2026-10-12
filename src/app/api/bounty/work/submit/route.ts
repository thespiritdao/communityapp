import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { requireWallet, requireWalletMatch } from '@/lib/apiPodGuard';
import { isExecutiveLeader, isPodLeader } from '@/lib/serverPodAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      bountyId,
      bidId,
      submitterAddress,
      submissionTitle,
      submissionDescription,
      deliverableUrls,
      attachmentUrls,
      completedDeliverables,
    } = body;

    console.log('📝 Work submission request:', {
      bountyId,
      bidId,
      submitterAddress,
      submissionTitle,
    });

    // Validation
    if (!bountyId || !bidId || !submitterAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: bountyId, bidId, submitterAddress' },
        { status: 400 },
      );
    }

    // submitterAddress must be the authenticated caller (service-role write).
    const walletOrDenied = await requireWalletMatch(request, submitterAddress);
    if (walletOrDenied instanceof Response) return walletOrDenied;

    if (!submissionTitle?.trim() || !submissionDescription?.trim()) {
      return NextResponse.json(
        { error: 'Submission title and description are required' },
        { status: 400 },
      );
    }

    // Verify the bid exists and is approved
    const { data: bid, error: bidError } = await supabase
      .from('bids')
      .select('id, status, bidder_address')
      .eq('id', bidId)
      .eq('bounty_id', bountyId)
      .single();

    if (bidError || !bid) {
      console.error('❌ Bid not found:', bidError);
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    if (bid.status !== 'approved') {
      console.error('❌ Bid not approved:', bid.status);
      return NextResponse.json(
        { error: 'Only approved bids can submit work' },
        { status: 403 },
      );
    }

    if (bid.bidder_address?.toLowerCase() !== submitterAddress.toLowerCase()) {
      console.error('❌ Submitter is not the bidder');
      return NextResponse.json(
        { error: 'Only the bidder can submit work for this bid' },
        { status: 403 },
      );
    }

    // Check if there's already a pending submission for this bid
    // Allow resubmission if status is 'revision_requested', but not if 'pending', 'approved', or 'rejected'
    const { data: existingSubmissions, error: existingError } = await supabase
      .from('work_submissions')
      .select('id, status')
      .eq('bid_id', bidId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      console.error('❌ Error checking existing submissions:', existingError);
      return NextResponse.json(
        {
          error: 'Failed to check for existing submissions',
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    const latestSubmission = existingSubmissions && existingSubmissions.length > 0 ? existingSubmissions[0] : null;

    // Block submission if latest submission is pending (under review)
    if (latestSubmission && latestSubmission.status === 'pending') {
      return NextResponse.json(
        {
          error:
            'You already have a pending work submission. Please wait for review before submitting again.',
        },
        { status: 409 },
      );
    }

    // Block submission if already approved
    if (latestSubmission && latestSubmission.status === 'approved') {
      return NextResponse.json(
        {
          error:
            'Your work submission has already been approved. No further submissions needed.',
        },
        { status: 409 },
      );
    }

    // Allow submission if:
    // - No previous submission exists
    // - Previous submission was rejected
    // - Previous submission requires revision
    console.log('✅ Submission allowed:', latestSubmission ? `Previous status: ${latestSubmission.status}` : 'No previous submission');

    // Get the latest revision number for this bid
    const { data: revisionData } = await supabase
      .from('work_submissions')
      .select('revision_number')
      .eq('bid_id', bidId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const revisionNumber = revisionData
      ? revisionData.revision_number + 1
      : 1;

    // Insert work submission
    const { data: submission, error: submitError } = await supabase
      .from('work_submissions')
      .insert({
        bounty_id: bountyId,
        bid_id: bidId,
        submitter_address: submitterAddress.toLowerCase(),
        submission_title: submissionTitle,
        submission_description: submissionDescription,
        deliverable_urls: deliverableUrls || [],
        attachment_urls: attachmentUrls || [],
        completed_deliverables: completedDeliverables || [],
        status: 'pending',
        revision_number: revisionNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (submitError) {
      console.error('❌ Error creating work submission:', submitError);
      return NextResponse.json(
        {
          error: 'Failed to create work submission',
          details: submitError.message,
        },
        { status: 500 },
      );
    }

    console.log('✅ Work submission created:', submission.id);

    // Update bid status to indicate work has been submitted
    // (Optional: You might want a separate status like 'work_submitted')

    // Get bounty creator for notification
    const { data: bounty } = await supabase
      .from('bounties')
      .select('creator_address, title')
      .eq('id', bountyId)
      .single();

    // Send notification to bounty creator (non-blocking)
    if (bounty?.creator_address) {
      try {
        await unifiedNotificationService.createNotification({
          recipient_address: bounty.creator_address.toLowerCase(),
          sender_address: submitterAddress.toLowerCase(),
          notification_type: 'bounty_update',
          title: 'Work Submitted',
          message: `Work has been submitted for your bounty "${bounty.title}". Please review the submission.`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}/submissions`,
          priority: 'high',
        });

        console.log('✅ Notification sent to bounty creator');
      } catch (notifError) {
        // Don't fail the whole request if notification fails
        console.error('⚠️  Failed to send notification:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      submission,
    });
  } catch (error) {
    console.error('❌ Error in work submission API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// GET: Fetch work submissions for a bounty or bid
/**
 * Privacy: a submission is visible to its submitter, the bounty's creator,
 * leaders of the bounty's pod, and Executive Leaders. Rows the caller may
 * not see are dropped (whatever filter was used).
 */
async function visibleSubmissions(rows: any[], wallet: string): Promise<any[]> {
  if (rows.length === 0) return rows;
  if (await isExecutiveLeader(wallet)) return rows;

  const bountyIds = [...new Set(rows.map((r) => r.bounty_id).filter(Boolean))];
  const { data: bounties } = await supabase
    .from('bounties')
    .select('id, creator_address, pod_id')
    .in('id', bountyIds);
  const byId = new Map((bounties ?? []).map((b: any) => [b.id, b]));

  const leaderCache = new Map<string, boolean>();
  const leads = async (podId: string) => {
    if (!leaderCache.has(podId)) leaderCache.set(podId, await isPodLeader(podId, wallet));
    return leaderCache.get(podId)!;
  };

  const out: any[] = [];
  for (const r of rows) {
    const b: any = byId.get(r.bounty_id);
    if (
      String(r.submitter_address || '').toLowerCase() === wallet ||
      String(b?.creator_address || '').toLowerCase() === wallet ||
      (b?.pod_id && (await leads(b.pod_id)))
    ) {
      out.push(r);
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const walletOrDenied = await requireWallet(request);
    if (walletOrDenied instanceof Response) return walletOrDenied;
    const wallet = walletOrDenied;

    const { searchParams } = new URL(request.url);
    const bountyId = searchParams.get('bountyId');
    const podId = searchParams.get('podId');
    const bidId = searchParams.get('bidId');
    const submitterAddress = searchParams.get('submitterAddress');

    if (!bountyId && !podId && !bidId && !submitterAddress) {
      return NextResponse.json(
        {
          error:
            'At least one filter parameter required: bountyId, podId, bidId, or submitterAddress',
        },
        { status: 400 },
      );
    }

    // If podId is provided, first get all bounties for that pod
    if (podId) {
      const { data: bounties, error: bountyError } = await supabase
        .from('bounties')
        .select('id')
        .eq('pod_id', podId);

      if (bountyError) {
        console.error('❌ Error fetching bounties for pod:', bountyError);
        return NextResponse.json(
          {
            error: 'Failed to fetch bounties for pod',
            details: bountyError.message,
          },
          { status: 500 },
        );
      }

      const bountyIds = bounties.map((b) => b.id);

      console.log(`🔍 Fetching work submissions for pod ${podId}:`, {
        bountyCount: bounties.length,
        bountyIds,
      });

      const { data, error } = await supabase
        .from('work_submissions')
        .select('*')
        .in('bounty_id', bountyIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching work submissions:', error);
        return NextResponse.json(
          { error: 'Failed to fetch work submissions', details: error.message },
          { status: 500 },
        );
      }

      const visible = await visibleSubmissions(data ?? [], wallet);
      console.log(`✅ Found ${visible.length} visible work submissions for pod ${podId}`);

      return NextResponse.json({
        success: true,
        submissions: visible,
      });
    }

    // Original logic for other filters
    let query = supabase
      .from('work_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (bountyId) {
      query = query.eq('bounty_id', bountyId);
    }

    if (bidId) {
      query = query.eq('bid_id', bidId);
    }

    if (submitterAddress) {
      query = query.eq('submitter_address', submitterAddress.toLowerCase());
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching work submissions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch work submissions', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      submissions: await visibleSubmissions(data ?? [], wallet),
    });
  } catch (error) {
    console.error('❌ Error in work submission GET:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
