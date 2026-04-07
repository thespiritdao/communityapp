import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getProfile(walletAddress: string) {
  const { data } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, email')
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle();
  return data;
}

/**
 * Send email to a recipient when tokens are minted to their wallet via a donation.
 */
export async function sendTokensReceivedEmail({
  recipientWallet,
  amount,
  tokenSymbol,
  senderName,
}: {
  recipientWallet: string;
  amount: string | number;
  tokenSymbol: 'SYSTEM' | 'SELF';
  senderName?: string; // undefined = anonymous donation
}) {
  try {
    const profile = await getProfile(recipientWallet);
    if (!profile?.email) return;

    const firstName = profile.first_name || 'Community Member';
    const formattedAmount = Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const tokenLabel = `$${tokenSymbol}`;
    const fromLabel = senderName ? senderName : 'a Donation';

    const { error } = await resend.emails.send({
      from: 'SpiritDAO <community@spiritdao.org>',
      to: profile.email,
      subject: `You received ${formattedAmount} ${tokenLabel}`,
      text: [
        `Dear ${firstName},`,
        '',
        `You have just received ${formattedAmount} ${tokenLabel} from ${fromLabel}.`,
        '',
        'You can distribute these funds to your preferred pods, community members, or use them for Artifact purchases, Events, or Bounties!',
        '',
        `Check your full account balance on your Identity card or redeem $SYSTEM for cash by using our Claims function within the donation section.`,
        '',
        'Thank you for being part of SpiritDAO.',
        '',
        'The SpiritDAO Team',
        'https://app.spiritdao.org',
      ].join('\n'),
    });

    if (error) {
      console.error('[donationEmail] Resend error:', error);
    } else {
      console.log(`[donationEmail] Sent tokens-received email to ${profile.email}`);
    }
  } catch (err) {
    // Non-fatal — never block the main flow
    console.error('[donationEmail] Failed to send email:', err);
  }
}
