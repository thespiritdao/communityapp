import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';


async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

function extractIds(req: NextRequest): { podId: string; surveyId: string } {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/surveys\/([^/]+)\/respond/);
  return { podId: match?.[1] ?? '', surveyId: match?.[2] ?? '' };
}

async function isInAudience(wallet: string, audience: any[]): Promise<boolean> {
  for (const target of audience) {
    if (target.type === 'all_users') {
      return true;
    }

    if (target.type === 'pod' && target.pod_id) {
      const { data: member } = await supabaseAdmin
        .from('active_pod_members')
        .select('id')
        .eq('pod_id', target.pod_id)
        .eq('wallet', wallet.toLowerCase())
        .limit(1)
        .single();

      if (member) return true;
    }
  }
  return false;
}

// POST /api/pods/[id]/surveys/[surveyId]/respond
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { podId, surveyId } = extractIds(req);
  if (!podId || !surveyId) return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });

  // Fetch survey
  const { data: survey, error: surveyError } = await supabaseAdmin
    .from('surveys')
    .select('*')
    .eq('id', surveyId)
    .eq('pod_id', podId)
    .single();

  if (surveyError || !survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  // Check survey is active
  if (survey.status !== 'active') {
    return NextResponse.json({ error: 'Survey is not active' }, { status: 400 });
  }

  // Check date range
  const now = new Date();
  if (survey.starts_at && new Date(survey.starts_at) > now) {
    return NextResponse.json({ error: 'Survey has not started yet' }, { status: 400 });
  }
  if (survey.ends_at && new Date(survey.ends_at) < now) {
    return NextResponse.json({ error: 'Survey has ended' }, { status: 400 });
  }

  // Check audience membership
  const inAudience = await isInAudience(wallet, survey.audience || []);
  if (!inAudience) {
    return NextResponse.json({ error: 'You are not in the target audience for this survey' }, { status: 403 });
  }

  // Check for existing response
  const { data: existing } = await supabaseAdmin
    .from('survey_responses')
    .select('id')
    .eq('survey_id', surveyId)
    .eq('respondent_wallet', wallet.toLowerCase())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'You have already responded to this survey' }, { status: 409 });
  }

  const body = await req.json();
  const { answers } = body;

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'Answers are required' }, { status: 400 });
  }

  // Insert response header
  const { data: response, error: responseError } = await supabaseAdmin
    .from('survey_responses')
    .insert({
      survey_id: surveyId,
      respondent_wallet: wallet.toLowerCase(),
    })
    .select()
    .single();

  if (responseError) {
    return NextResponse.json({ error: responseError.message }, { status: 500 });
  }

  // Insert answers. answer_value is a jsonb column, so the value is handed
  // over as-is: the client encodes it once on the way out. Calling
  // JSON.stringify() here encoded it a second time, storing the option as
  // "\"Town Hall Time\"" — quote characters and all — which then matched no
  // option when results were tallied.
  const answerRows = answers.map((a: any) => ({
    response_id: response.id,
    question_id: a.question_id,
    answer_value: a.answer_value,
  }));

  const { error: answersError } = await supabaseAdmin
    .from('survey_answers')
    .insert(answerRows);

  if (answersError) {
    // Clean up response on failure
    await supabaseAdmin.from('survey_responses').delete().eq('id', response.id);
    return NextResponse.json({ error: answersError.message }, { status: 500 });
  }

  // Explorer event (non-blocking)
  recordExplorerEvent({
    type: 'survey_response_submitted',
    title: `Completed a survey: "${survey.title}"`,
    actor: wallet,
    pod_id: podId,
    url: `/pods/${podId}`,
    metadata: { survey_id: surveyId, survey_title: survey.title },
    dedupe_key: `survey_response:${surveyId}:${wallet.toLowerCase()}`,
  }).catch((err) => console.warn('[surveys] explorer event failed:', err));

  return NextResponse.json({ response_id: response.id }, { status: 201 });
}
