// POST /api/invites/email — send invitation emails (individual or bulk).
// Auth: any onboarded member (JWT). The sender's existing referral_key is the
// invite code; recipients land on /?invite=CODE and skip manual code entry.
//
// Abuse guards: fixed boilerplate copy (sender cannot inject content), max 20
// sends per sender per day, dedup against existing members and anyone invited
// in the last 30 days.

import { type NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  getWalletFromRequest,
  isPodLeader,
  isExecutiveLeader,
} from '@/lib/serverPodAuth';
import { getOrCreatePodInviteUrl } from '@/lib/podInviteLink';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PER_DAY = 20;
const APP_URL = 'https://app.spiritdao.org';

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const wallet = await getWalletFromRequest(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawEmails: string[] = Array.isArray(body.emails) ? body.emails : [];
  const podId: string | null = body.podId || null;

  const emails = [
    ...new Set(
      rawEmails
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ];
  if (emails.length === 0) {
    return NextResponse.json({ error: 'No email addresses provided' }, { status: 400 });
  }

  // Sender profile — needs a name and a referral key to invite.
  const { data: sender } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name, referral_key, onboarded_at')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();

  if (!sender?.referral_key) {
    return NextResponse.json(
      { error: 'Your profile has no referral code yet. Complete onboarding first.' },
      { status: 403 },
    );
  }
  const senderName =
    [sender.first_name, sender.last_name].filter(Boolean).join(' ') ||
    'A SpiritDAO member';

  // Optional pod enrollment. If the sender is a LEADER/EXEC of the selected pod,
  // the email carries a pod-enroll link (invitee auto-joins that pod on signup).
  // Otherwise the pod is used for attribution only ("from {podName}") and the
  // plain referral link is sent — regular members can't enroll people into a pod.
  let podName: string | null = null;
  let podEnrollCode: string | null = null;
  if (podId) {
    const { data: pod } = await supabaseAdmin
      .from('pods')
      .select('name, pod_leads')
      .eq('id', podId)
      .maybeSingle();
    if (pod) {
      const { data: membership } = await supabaseAdmin
        .from('pod_members')
        .select('id')
        .eq('pod_id', podId)
        .eq('wallet', wallet.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();
      const isLead = pod.pod_leads?.includes(wallet.toLowerCase());
      if (membership || isLead) {
        podName = pod.name;
        // Leader/exec of this pod? → generate a real pod-enroll link.
        const [leader, exec] = await Promise.all([
          isPodLeader(podId, wallet),
          isExecutiveLeader(wallet),
        ]);
        if (leader || exec) {
          const podLink = await getOrCreatePodInviteUrl(podId, wallet);
          if (podLink) podEnrollCode = podLink.code;
        }
      }
    }
  }

  // Daily rate limit.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: sentToday } = await supabaseAdmin
    .from('email_invites')
    .select('*', { count: 'exact', head: true })
    .eq('sender_wallet', wallet.toLowerCase())
    .gte('sent_at', dayAgo);
  const remaining = MAX_PER_DAY - (sentToday || 0);
  if (remaining <= 0) {
    return NextResponse.json(
      { error: `Daily invite limit reached (${MAX_PER_DAY}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  // Pod-enroll link if the sender leads/execs the selected pod; otherwise the
  // personal referral link (app access only).
  const inviteCode = podEnrollCode || sender.referral_key;
  const inviteUrl = `${APP_URL}/?invite=${inviteCode}`;
  const results: Array<{ email: string; status: 'sent' | 'skipped'; reason?: string }> = [];
  let sentCount = 0;

  for (const email of emails) {
    if (sentCount >= remaining) {
      results.push({ email, status: 'skipped', reason: 'daily limit reached' });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'skipped', reason: 'invalid email' });
      continue;
    }

    // Already a member?
    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      results.push({ email, status: 'skipped', reason: 'already a member' });
      continue;
    }

    // Invited in the last 30 days (by anyone)?
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from('email_invites')
      .select('id')
      .eq('email', email)
      .gte('sent_at', monthAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      results.push({ email, status: 'skipped', reason: 'recently invited' });
      continue;
    }

    const fromLine = podName
      ? `${senderName} from ${podName}`
      : senderName;

    try {
      const { error: sendError } = await resend.emails.send({
        from: 'SpiritDAO <community@spiritdao.org>',
        to: email,
        subject: podEnrollCode
          ? `${senderName} invited you to join ${podName} on SpiritDAO`
          : `${senderName} invited you to join SpiritDAO`,
        text: [
          'Hello,',
          '',
          podEnrollCode
            ? `${fromLine} is inviting you to join ${podName} on SpiritDAO — a community of communities building better ways to live and decide together. This link will add you to ${podName} when you sign up.`
            : `${fromLine} is inviting you to join SpiritDAO — a community of communities building better ways to live and decide together.`,
          '',
          'Get started here:',
          inviteUrl,
          '',
          'Joining is free. You can create your account with just an email address — no crypto experience needed.',
          '',
          `This invitation was sent by ${senderName} through the SpiritDAO app. If you weren't expecting it, you can simply ignore this email — you won't receive any further messages unless you join.`,
          '',
          'The SpiritDAO Team',
          'community@spiritdao.org | https://app.spiritdao.org',
        ].join('\n'),
      });
      if (sendError) {
        results.push({ email, status: 'skipped', reason: 'send failed' });
        console.error('[invites/email] Resend error:', sendError);
        continue;
      }
    } catch (e) {
      results.push({ email, status: 'skipped', reason: 'send failed' });
      console.error('[invites/email] send exception:', e);
      continue;
    }

    await supabaseAdmin.from('email_invites').insert({
      sender_wallet: wallet.toLowerCase(),
      email,
      pod_id: podName ? podId : null,
      invite_code: inviteCode,
    });
    sentCount++;
    results.push({ email, status: 'sent' });
  }

  return NextResponse.json({
    sent: sentCount,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  });
}
