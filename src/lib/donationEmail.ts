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
 * Send donation receipt email when $SYSTEM tokens are minted to a donor's wallet.
 * Includes IRS quid pro quo disclosure with tax-deductible amount calculation.
 */
export async function sendTokensReceivedEmail({
  recipientWallet,
  amount,
  tokenSymbol,
  senderName,
  fiatAmount,
  stripeFee,
  orgFee,
  communityTokens,
}: {
  recipientWallet: string;
  amount: string | number;
  tokenSymbol: 'SYSTEM' | 'SELF';
  senderName?: string;
  fiatAmount?: number;
  stripeFee?: number;
  orgFee?: number;
  communityTokens?: number;
}) {
  try {
    const profile = await getProfile(recipientWallet);
    if (!profile?.email) return;

    const firstName = profile.first_name || 'Community Member';
    const systemTokens = Number(amount);
    const isDonation = tokenSymbol === 'SYSTEM' && fiatAmount != null;

    // Peer gift — simple notification email
    if (!isDonation) {
      const fromLabel = senderName ?? 'a community member';
      const { error } = await resend.emails.send({
        from: 'SpiritDAO <community@spiritdao.org>',
        to: profile.email,
        subject: `You received ${systemTokens.toFixed(2)} $${tokenSymbol}`,
        text: [
          `Dear ${firstName},`,
          '',
          `You have just received ${systemTokens.toFixed(2)} $${tokenSymbol} from ${fromLabel}.`,
          '',
          'You can distribute these funds to pods or community members, or use them for Artifact purchases, Events, or Bounties.',
          '',
          'Check your full balance on your Identity card at app.spiritdao.org.',
          '',
          'The SpiritDAO Team',
          'community@spiritdao.org | https://app.spiritdao.org',
        ].join('\n'),
      });
      if (error) console.error('[donationEmail] Resend error (gift):', error);
      return;
    }

    // Donation receipt email with tax disclosure
    const fiat        = Number(fiatAmount);
    const stripe      = Number(stripeFee  ?? 0);
    const platform    = Number(orgFee     ?? 0);
    const community   = Number(communityTokens ?? 0);
    const deductible  = fiat - systemTokens; // fiat minus FMV of tokens received by donor

    const fmt  = (n: number) => n.toFixed(2);
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const { error } = await resend.emails.send({
      from: 'SpiritDAO <community@spiritdao.org>',
      to: profile.email,
      subject: `Your SpiritDAO donation receipt — $${fmt(fiat)}`,
      text: [
        `Dear ${firstName},`,
        '',
        `Thank you for your donation to SpiritDAO. Your $SYSTEM tokens have been minted and are now available in your wallet.`,
        '',
        '─────────────────────────────',
        'DONATION SUMMARY',
        '─────────────────────────────',
        `Date:                          ${date}`,
        `Donation amount:               $${fmt(fiat)}`,
        `Processing fee:               -$${fmt(stripe)}`,
        `SpiritDAO platform fee:       -$${fmt(platform)}`,
        `$SYSTEM minted to you:         ${fmt(systemTokens)} $SYSTEM`,
        `Community pool (minted separately): ${fmt(community)} $SYSTEM`,
        '',
        '─────────────────────────────',
        'TAX RECEIPT',
        '─────────────────────────────',
        'SpiritDAO is a registered 501(c)(3) nonprofit organization.',
        'EIN: 99-1308806',
        '',
        `In exchange for your donation, you received $SYSTEM tokens with an`,
        `estimated fair market value of $${fmt(systemTokens)}.`,
        `Per IRS quid pro quo rules, the tax-deductible portion of your`,
        `donation is:`,
        '',
        `  $${fmt(fiat)} - $${fmt(systemTokens)} = $${fmt(deductible)}`,
        '',
        'Please retain this email as your official donation receipt.',
        'No goods or services beyond the $SYSTEM tokens described above',
        'were provided in connection with this contribution.',
        '',
        '─────────────────────────────',
        'WHAT CAN YOU DO WITH YOUR $SYSTEM?',
        '─────────────────────────────',
        '• Distribute funds to pods or community members',
        '• Use them for Artifact purchases, Events, or Bounties',
        '• Redeem for cash via the Claims function in the donation section',
        '',
        'Check your full balance on your Identity card at app.spiritdao.org.',
        '',
        'The SpiritDAO Team',
        'community@spiritdao.org | https://app.spiritdao.org',
        '',
        'SpiritDAO is a 501(c)(3) nonprofit organization. EIN: 99-1308806.',
        'Contributions are tax-deductible to the extent permitted by law.',
      ].join('\n'),
    });

    if (error) {
      console.error('[donationEmail] Resend error:', error);
    } else {
      console.log(`[donationEmail] Sent donation receipt to ${profile.email}`);
    }
  } catch (err) {
    console.error('[donationEmail] Failed to send email:', err);
  }
}
