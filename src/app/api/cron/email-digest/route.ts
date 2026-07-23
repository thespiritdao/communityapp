/**
 * Weekly email digest cron job.
 *
 * Schedule: Mondays at 2pm UTC (see vercel.json)
 * Auth: CRON_SECRET header (Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDigest } from '@/lib/emailDigest';
import { requireCron } from '@/lib/cronAuth';

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const result = await runDigest('weekly');
    console.log(`[email-digest-weekly] Done: ${result.sent} sent, ${result.skipped} skipped`);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[email-digest-weekly] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
