import { type NextRequest, NextResponse } from 'next/server';
import { isPodLeader } from '@/lib/serverPodAuth';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requirePodPermissionOrLeader } from '@/lib/apiPodGuard';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}


function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/surveys/);
  return match?.[1] ?? '';
}

// GET /api/pods/[id]/surveys — List surveys for a pod
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const { data: surveys, error } = await supabaseAdmin
    .from('surveys')
    .select('*')
    .eq('pod_id', podId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach response count and user's response status to each survey
  const surveysWithCounts = await Promise.all(
    (surveys || []).map(async (survey: any) => {
      const { count } = await supabaseAdmin
        .from('survey_responses')
        .select('id', { count: 'exact', head: true })
        .eq('survey_id', survey.id);

      const { data: userResponse } = await supabaseAdmin
        .from('survey_responses')
        .select('id')
        .eq('survey_id', survey.id)
        .eq('respondent_wallet', wallet.toLowerCase())
        .single();

      return { ...survey, response_count: count || 0, has_responded: !!userResponse };
    }),
  );

  return NextResponse.json({ surveys: surveysWithCounts });
}

// POST /api/pods/[id]/surveys — Create a new survey
export async function POST(req: NextRequest): Promise<NextResponse> {
  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  // Granular gate: a pod leader OR any member whose role grants surveyManage.
  const walletOrDenied = await requirePodPermissionOrLeader(req, podId, 'surveyManage');
  if (walletOrDenied instanceof NextResponse) return walletOrDenied;
  const wallet = walletOrDenied;

  // Verify surveys module is enabled
  const { data: modules } = await supabaseAdmin
    .from('pod_modules')
    .select('surveys_enabled')
    .eq('pod_id', podId)
    .single();

  if (!modules?.surveys_enabled) {
    return NextResponse.json({ error: 'Surveys module is not enabled for this pod' }, { status: 400 });
  }

  // Audit follow-up: creation had no leadership check — any signed-in member
  // could open a survey in any pod with the module on. The guide says leaders
  // create surveys; now the server does too.
  if (!(await isPodLeader(podId, wallet))) {
    return NextResponse.json({ error: 'Only pod leaders can create surveys' }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, audience, questions, starts_at, ends_at } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!audience || !Array.isArray(audience) || audience.length === 0) {
    return NextResponse.json({ error: 'At least one audience target is required' }, { status: 400 });
  }
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'At least one question is required' }, { status: 400 });
  }

  // Insert survey
  const { data: survey, error: surveyError } = await supabaseAdmin
    .from('surveys')
    .insert({
      pod_id: podId,
      title: title.trim(),
      description: description?.trim() || null,
      status: 'draft',
      created_by: wallet.toLowerCase(),
      audience,
      starts_at: starts_at || null,
      ends_at: ends_at || null,
    })
    .select()
    .single();

  if (surveyError) return NextResponse.json({ error: surveyError.message }, { status: 500 });

  // Insert questions
  const questionRows = questions.map((q: any, index: number) => ({
    survey_id: survey.id,
    question_text: q.question_text,
    question_type: q.question_type,
    options: q.options || [],
    rating_max: q.rating_max || 5,
    sort_order: index,
    is_required: q.is_required !== false,
  }));

  const { data: insertedQuestions, error: questionsError } = await supabaseAdmin
    .from('survey_questions')
    .insert(questionRows)
    .select();

  if (questionsError) {
    // Clean up the survey if questions fail
    await supabaseAdmin.from('surveys').delete().eq('id', survey.id);
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  return NextResponse.json({ survey, questions: insertedQuestions }, { status: 201 });
}
