// POST /api/account/delete — member-initiated account deletion request.
// Auth: signed-in member (JWT → wallet). Records the request in
// account_deletion_requests and notifies SUPPORT_EMAIL, who completes
// the deletion within 30 days (same process as the public
// /identity/account-deletion page). Body must include { confirm: "DELETE" }.

import { appUrl, CONTACT_EMAIL } from '@/config/deployment';
import { emailFrom, supportInbox } from '@/config/deployment.server';
import { type NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getWalletFromRequest } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const wallet = await getWalletFromRequest(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Confirmation phrase missing' },
      { status: 400 },
    );
  }

  const walletLc = wallet.toLowerCase();
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('first_name, last_name, email')
    .eq('wallet_address', walletLc)
    .maybeSingle();
  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    'Unknown member';

  // Already pending? Idempotent success — the request is on file.
  const { data: existing } = await supabaseAdmin
    .from('account_deletion_requests')
    .select('id, requested_at')
    .eq('wallet_address', walletLc)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ status: 'already_pending' });
  }

  // Record the request and notify the operators. The email is the working
  // process; the row is the audit trail. Requiring both to fail before
  // erroring keeps a transient failure of one from blocking the member.
  const { error: insertError } = await supabaseAdmin
    .from('account_deletion_requests')
    .insert({
      wallet_address: walletLc,
      email: profile?.email ?? null,
    });
  if (insertError) {
    console.error('[account/delete] insert failed:', insertError);
  }

  let emailSent = false;
  try {
    const { error: sendError } = await resend.emails.send({
      from: emailFrom(),
      to: supportInbox(),
      subject: `Account deletion request — ${name}`,
      text: [
        'A member requested account deletion from the app.',
        '',
        `Name: ${name}`,
        `Wallet: ${walletLc}`,
        `Email: ${profile?.email || '(none on profile)'}`,
        `Requested: ${new Date().toISOString()}`,
        '',
        'Per the published policy, deletion must be completed within 30 days:',
        `${appUrl()}/identity/account-deletion`,
      ].join('\n'),
    });
    if (sendError) {
      console.error('[account/delete] Resend error:', sendError);
    } else {
      emailSent = true;
    }
  } catch (e) {
    console.error('[account/delete] send exception:', e);
  }

  if (insertError && !emailSent) {
    return NextResponse.json(
      { error: `Could not submit the request. Please email ${supportInbox()}.` },
      { status: 500 },
    );
  }

  // Acknowledge to the member's email so they have a record.
  if (profile?.email) {
    try {
      await resend.emails.send({
        from: emailFrom(),
        to: profile.email,
        subject: 'Your SpiritDAO account deletion request',
        text: [
          `Hello ${profile.first_name || 'there'},`,
          '',
          'We received your request to delete your SpiritDAO Community account.',
          'It will be completed within 30 days. Details on what is deleted and',
          `what is retained: ${appUrl()}/identity/account-deletion`,
          '',
          'If you did not make this request, reply to this email immediately.',
          '',
          'The SpiritDAO Team',
        ].join('\n'),
      });
    } catch (e) {
      console.error('[account/delete] ack email failed:', e);
    }
  }

  return NextResponse.json({ status: 'requested' });
}
