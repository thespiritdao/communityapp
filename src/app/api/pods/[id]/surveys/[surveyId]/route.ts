import { type NextRequest, NextResponse } from 'next/server';
import { isPodLeader } from '@/lib/serverPodAuth';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requirePodPermissionOrLeader } from '@/lib/apiPodGuard';
import jwt from 'jsonwebtoken';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { sendServerNotificationBatch, type ServerNotificationPayload } from '@/lib/serverNotifications';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}


function extractIds(req: NextRequest): { podId: string; surveyId: string } {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/surveys\/([^/]+)/);
  return { podId: match?.[1] ?? '', surveyId: match?.[2] ?? '' };
}

// GET /api/pods/[id]/surveys/[surveyId]
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { podId, surveyId } = extractIds(req);
  if (!podId || !surveyId) return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });

  const { data: survey, error: surveyError } = await supabaseAdmin
    .from('surveys')
    .select('*')
    .eq('id', surveyId)
    .eq('pod_id', podId)
    .single();

  if (surveyError) return NextResponse.json({ error: 'Survey not found' }, { status: 404 });

  const { data: questions } = await supabaseAdmin
    .from('survey_questions')
    .select('*')
    .eq('survey_id', surveyId)
    .order('sort_order', { ascending: true });

  // Check if current user already responded
  const { data: existingResponse } = await supabaseAdmin
    .from('survey_responses')
    .select('id')
    .eq('survey_id', surveyId)
    .eq('respondent_wallet', wallet.toLowerCase())
    .single();

  return NextResponse.json({
    survey,
    questions: questions || [],
    has_responded: !!existingResponse,
  });
}

// PUT /api/pods/[id]/surveys/[surveyId]
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const { podId, surveyId } = extractIds(req);
  if (!podId || !surveyId) return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });

  // Granular gate: pod leader OR a role granting surveyManage.
  const walletOrDenied = await requirePodPermissionOrLeader(req, podId, 'surveyManage');
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  // Snapshot prior status for detecting transitions
  const { data: priorSurvey } = await supabaseAdmin
    .from('surveys')
    .select('status, title')
    .eq('id', surveyId)
    .eq('pod_id', podId)
    .single();

  const body = await req.json();
  const allowedFields: Record<string, any> = {};

  if (body.title !== undefined) allowedFields.title = body.title;
  if (body.description !== undefined) allowedFields.description = body.description;
  if (body.status !== undefined) {
    if (!['draft', 'active', 'closed'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    allowedFields.status = body.status;
  }
  if (body.audience !== undefined) allowedFields.audience = body.audience;
  if (body.starts_at !== undefined) allowedFields.starts_at = body.starts_at;
  if (body.ends_at !== undefined) allowedFields.ends_at = body.ends_at;

  allowedFields.updated_at = new Date().toISOString();

  const { data: survey, error } = await supabaseAdmin
    .from('surveys')
    .update(allowedFields)
    .eq('id', surveyId)
    .eq('pod_id', podId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If questions were provided, replace them
  if (body.questions && Array.isArray(body.questions)) {
    await supabaseAdmin
      .from('survey_questions')
      .delete()
      .eq('survey_id', surveyId);

    const questionRows = body.questions.map((q: any, index: number) => ({
      survey_id: surveyId,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options || [],
      rating_max: q.rating_max || 5,
      sort_order: index,
      is_required: q.is_required !== false,
    }));

    await supabaseAdmin.from('survey_questions').insert(questionRows);
  }

  // ── Explorer event + notifications when survey goes active ──────────────
  const wasActive = priorSurvey?.status === 'active';
  const nowActive = survey.status === 'active';

  if (!wasActive && nowActive) {
    // Resolve pod name for the explorer title
    const { data: podRow } = await supabaseAdmin
      .from('pods')
      .select('name')
      .eq('id', podId)
      .single();
    const podName = podRow?.name || 'A pod';

    // Explorer event
    recordExplorerEvent({
      type: 'survey_published',
      title: `${podName} shared a survey: "${survey.title}"`,
      actor: wallet,
      pod_id: podId,
      url: `/pods/${podId}`,
      metadata: { survey_id: surveyId, survey_title: survey.title },
      dedupe_key: `survey_published:${surveyId}`,
    }).catch((err) => console.warn('[surveys] explorer event failed:', err));

    // Notify audience members
    notifySurveyAudience(survey, podId, podName, wallet).catch((err) =>
      console.warn('[surveys] audience notifications failed:', err),
    );
  }

  return NextResponse.json({ survey });
}

/** Collect audience wallets and send survey_published notifications in batch. */
async function notifySurveyAudience(
  survey: any,
  podId: string,
  podName: string,
  senderWallet: string,
) {
  const audience: Array<{ type: string; pod_id?: string }> = survey.audience || [];
  const walletSet = new Set<string>();

  for (const target of audience) {
    if (target.type === 'all_users') {
      const { data: users } = await supabaseAdmin
        .from('user_profiles')
        .select('wallet_address');
      if (users) {
        for (const u of users) {
          if (u.wallet_address) walletSet.add(u.wallet_address.toLowerCase());
        }
      }
    } else if (target.type === 'pod' && target.pod_id) {
      // active_pod_members view
      const { data: members } = await supabaseAdmin
        .from('active_pod_members')
        .select('wallet')
        .eq('pod_id', target.pod_id);
      if (members) {
        for (const m of members) {
          if (m.wallet) walletSet.add(m.wallet.toLowerCase());
        }
      }
      // pod_leads array (leaders may not be in pod_members)
      const { data: pod } = await supabaseAdmin
        .from('pods')
        .select('pod_leads')
        .eq('id', target.pod_id)
        .single();
      if (pod?.pod_leads && Array.isArray(pod.pod_leads)) {
        for (const lead of pod.pod_leads) {
          if (lead) walletSet.add(lead.toLowerCase());
        }
      }
    }
  }

  // Don't notify the sender
  walletSet.delete(senderWallet.toLowerCase());

  if (walletSet.size === 0) return;

  const payloads: ServerNotificationPayload[] = Array.from(walletSet).map(
    (recipientWallet) => ({
      recipient_address: recipientWallet,
      sender_address: senderWallet.toLowerCase(),
      notification_type: 'survey_published',
      title: `New survey from ${podName}`,
      message: `"${survey.title}" — your input is requested.`,
      context_url: `/pods/${podId}`,
      context_type: 'pod',
      context_id: survey.id,
      priority: 'medium' as const,
    }),
  );

  await sendServerNotificationBatch(payloads);
}

// DELETE /api/pods/[id]/surveys/[surveyId]
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { podId, surveyId } = extractIds(req);
  if (!podId || !surveyId) return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });

  // Granular gate: pod leader OR a role granting surveyManage.
  const walletOrDenied = await requirePodPermissionOrLeader(req, podId, 'surveyManage');
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;

  const { error } = await supabaseAdmin
    .from('surveys')
    .delete()
    .eq('id', surveyId)
    .eq('pod_id', podId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
