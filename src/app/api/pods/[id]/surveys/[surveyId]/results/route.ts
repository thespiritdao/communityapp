import { type NextRequest, NextResponse } from 'next/server';
import { isPodLeader } from '@/lib/serverPodAuth';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
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


/**
 * Answers submitted before 2026-09-11 were JSON-encoded a second time before
 * being written to the jsonb column, so they come back wrapped in literal
 * quotes ("\"Town Hall Time\""). Unwrap those so historic responses still
 * tally. Values written correctly pass straight through.
 */
function normalizeAnswer(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  const looksEncoded =
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('{');
  if (!looksEncoded) return raw;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function extractIds(req: NextRequest): { podId: string; surveyId: string } {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/surveys\/([^/]+)\/results/);
  return { podId: match?.[1] ?? '', surveyId: match?.[2] ?? '' };
}

// GET /api/pods/[id]/surveys/[surveyId]/results
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { podId, surveyId } = extractIds(req);
  if (!podId || !surveyId) return NextResponse.json({ error: 'Missing IDs' }, { status: 400 });

  const isLeader = await isPodLeader(podId, wallet);
  if (!isLeader) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Get questions
  const { data: questions } = await supabaseAdmin
    .from('survey_questions')
    .select('*')
    .eq('survey_id', surveyId)
    .order('sort_order', { ascending: true });

  if (!questions || questions.length === 0) {
    return NextResponse.json({ total_responses: 0, questions: [] });
  }

  // Get total response count
  const { count: totalResponses } = await supabaseAdmin
    .from('survey_responses')
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', surveyId);

  // Get all answers for this survey's questions
  const questionIds = questions.map((q: any) => q.id);
  const { data: answers } = await supabaseAdmin
    .from('survey_answers')
    .select('question_id, answer_value')
    .in('question_id', questionIds);

  // Aggregate results per question
  const questionResults = questions.map((question: any) => {
    const questionAnswers = (answers || [])
      .filter((a: any) => a.question_id === question.id)
      .map((a: any) => ({ ...a, answer_value: normalizeAnswer(a.answer_value) }));

    // Questions can be optional, so the share of people choosing an option is
    // measured against the people who answered that question, not everyone who
    // opened the survey.
    const answeredCount = questionAnswers.length;

    let summary: any;

    switch (question.question_type) {
      case 'multiple_choice':
      case 'single_select': {
        const optionCounts: Record<string, number> = {};
        (question.options || []).forEach((opt: string) => {
          optionCounts[opt] = 0;
        });

        for (const answer of questionAnswers) {
          const val = answer.answer_value;
          if (Array.isArray(val)) {
            for (const v of val) {
              if (optionCounts[v] !== undefined) optionCounts[v]++;
            }
          } else if (typeof val === 'string') {
            if (optionCounts[val] !== undefined) optionCounts[val]++;
          }
        }

        summary = {
          type: 'option_counts',
          option_counts: optionCounts,
          answered_count: answeredCount,
        };
        break;
      }

      case 'free_text': {
        const responses = questionAnswers
          .map((a: any) => {
            const val = a.answer_value;
            return typeof val === 'string' ? val : JSON.stringify(val);
          })
          .slice(0, 200);

        summary = { type: 'free_text', responses, answered_count: answeredCount };
        break;
      }

      case 'rating_scale': {
        const distribution: Record<number, number> = {};
        let sum = 0;
        let count = 0;

        for (const answer of questionAnswers) {
          const val = typeof answer.answer_value === 'number'
            ? answer.answer_value
            : parseInt(String(answer.answer_value), 10);

          if (!isNaN(val)) {
            distribution[val] = (distribution[val] || 0) + 1;
            sum += val;
            count++;
          }
        }

        summary = {
          type: 'rating',
          average: count > 0 ? Math.round((sum / count) * 100) / 100 : 0,
          distribution,
          answered_count: count,
        };
        break;
      }

      default:
        summary = { type: 'unknown' };
    }

    return {
      question_id: question.id,
      question_text: question.question_text,
      question_type: question.question_type,
      options: question.options,
      rating_max: question.rating_max,
      summary,
    };
  });

  return NextResponse.json({
    total_responses: totalResponses || 0,
    questions: questionResults,
  });
}
