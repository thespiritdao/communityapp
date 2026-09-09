import { NextRequest, NextResponse } from 'next/server';
import { sendTokensReceivedEmail } from '@/lib/donationEmail';
import { createClient } from '@supabase/supabase-js';
import { requireWalletMatch } from '@/lib/apiPodGuard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const runtime = 'nodejs';

/**
 * POST /api/gifts/notify
 * Called client-side after a peer gift transaction succeeds.
 * Sends an email to the recipient and optionally looks up the sender's name.
 * The sender must be the authenticated caller (this sends email on their behalf).
 */
export async function POST(request: NextRequest) {
  try {
    const { recipient_wallet, sender_wallet, amount, token } = await request.json();

    if (!recipient_wallet || !sender_wallet || !amount || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const walletOrDenied = requireWalletMatch(request, sender_wallet);
    if (walletOrDenied instanceof Response) return walletOrDenied;

    // Look up sender name for the email
    const { data: senderProfile } = await supabase
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('wallet_address', sender_wallet.toLowerCase())
      .maybeSingle();

    const senderName =
      senderProfile?.first_name
        ? [senderProfile.first_name, senderProfile.last_name].filter(Boolean).join(' ')
        : undefined;

    // Fire-and-forget — non-blocking
    sendTokensReceivedEmail({
      recipientWallet: recipient_wallet,
      amount,
      tokenSymbol: token as 'SYSTEM' | 'SELF',
      senderName,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[gifts/notify] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
