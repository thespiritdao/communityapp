import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendDonationReceiptEmail } from '@/lib/donationReceipt';
import { recordExplorerEvent } from '@/lib/explorerEvents';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Fire-and-forget: mint Advocate NFT if this is the donor's first confirmed donation.
 * Non-blocking — failure here does not affect the mint confirmation response.
 */
async function maybeAirdropAdvocate(userWallet: string, currentDonationId: string) {
  try {
    // Check if this wallet has any OTHER donations that have been minted (status = 'minting' or 'minted')
    // We exclude the current one since it just transitioned to 'minting' in this same request.
    const { data: priorMints } = await supabase
      .from('pending_donations')
      .select('id')
      .eq('user_wallet', userWallet.toLowerCase())
      .in('status', ['minting', 'minted'])
      .neq('id', currentDonationId)
      .limit(1);

    if (priorMints && priorMints.length > 0) {
      // Not a first donation — skip
      return;
    }

    // First donation — trigger Advocate mint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const mintResponse = await fetch(`${baseUrl}/api/onboarding/mint-advocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: userWallet }),
    });

    if (!mintResponse.ok) {
      const errData = await mintResponse.json().catch(() => ({}));
      console.error('⚠️ First-donation Advocate mint failed (non-critical):', errData);
    } else {
      const result = await mintResponse.json();
      if (result.alreadyHadNFT) {
        console.log(`ℹ️ First donation for ${userWallet} — Advocate already held, skipping mint`);
      } else {
        console.log(`🎖️ Advocate NFT minted for first-time donor: ${userWallet}`);
      }
    }
  } catch (err) {
    // Non-blocking — log and continue
    console.error('⚠️ maybeAirdropAdvocate error (non-critical):', err);
  }
}

/**
 * POST /api/donations/mint/confirm
 *
 * Records that a donation has been minted via frontend Smart Wallet transaction
 * This endpoint is called AFTER the executive initiates the mint transaction
 *
 * The actual minting happens on the frontend with the executive's Smart Wallet (gasless)
 * This matches the pattern used for bounties, pods, and all other transactions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { donationId, userOpHash, minter } = body;

    if (!donationId || !userOpHash || !minter) {
      return NextResponse.json(
        { error: 'donationId, userOpHash, and minter are required' },
        { status: 400 }
      );
    }

    console.log('📝 Recording mint transaction:', {
      donationId,
      userOpHash,
      minter,
    });

    // Update donation with mint transaction info
    const { data, error } = await supabase
      .from('pending_donations')
      .update({
        status: 'minted',
        mint_transaction_hash: userOpHash,
        minted_at: new Date().toISOString(),
      })
      .eq('id', donationId)
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to update donation:', error);
      return NextResponse.json(
        { error: 'Database update failed', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Mint transaction recorded');

    // Pulse: surface the minted donation in /explorer (treasury category).
    // Fire-and-forget — never block the mint confirmation on the feed write.
    // The /explorer donation card renders a fee breakdown from these camelCase
    // metadata fields (fiatAmount/stripeFee/operationsFee/dignitiesFee/
    // systemTokens). Fee model: 8% of net is split 4% Operations (cash) + 4%
    // Eight Dignities community pool (minted to treasury). org_fee is the total
    // 8%; community_tokens_to_mint is the 4% dignities portion.
    const communityTokens = Number(data.community_tokens_to_mint || 0);
    const orgFee = Number(data.org_fee || 0);
    const operationsFee = Math.max(0, orgFee - communityTokens);
    recordExplorerEvent({
      type: 'donation',
      title: `Donation of $${Number(data.fiat_amount).toFixed(2)} — ${Number(data.system_tokens_to_mint).toFixed(2)} $SYSTEM minted`,
      actor: data.user_wallet || null,
      amount_value: Number(data.system_tokens_to_mint),
      amount_token: 'SYSTEM',
      url: `https://basescan.org/tx/${userOpHash}`,
      metadata: {
        donation_type: 'system_mint',
        donation_id: donationId,
        tx_hash: userOpHash,
        // Fields consumed by the /explorer donation card:
        fiatAmount: Number(data.fiat_amount),
        stripeFee: Number(data.stripe_fee || 0),
        operationsFee: operationsFee.toFixed(2),
        dignitiesFee: communityTokens.toFixed(2),
        systemTokens: Number(data.system_tokens_to_mint),
      },
      dedupe_key: `donation:mint:${donationId}`,
    }).catch((e) => console.error('[mint/confirm] explorer event failed (non-critical):', e));

    // Fire-and-forget: airdrop Advocate NFT on first donation
    maybeAirdropAdvocate(data.user_wallet, donationId);

    // Fire-and-forget: send PDF receipt with HTML email
    (async () => {
      try {
        // Look up donor profile for name and email
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, email')
          .eq('wallet_address', data.user_wallet.toLowerCase())
          .maybeSingle();

        const donorEmail = profile?.email || data.donor_email;
        if (!donorEmail) return;

        const donorName = profile?.first_name
          ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`
          : 'Community Member';

        const systemTokens = Number(data.system_tokens_to_mint);
        const fiat = Number(data.fiat_amount);
        const stripeFee = Number(data.stripe_fee ?? 0);
        const orgFee = Number(data.org_fee ?? 0);
        const communityTokens = Number(data.community_tokens_to_mint ?? 0);

        const donationDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });

        await sendDonationReceiptEmail({
          type: 'system',
          donorName,
          donorEmail,
          donationDate,
          paymentId: data.stripe_payment_id || donationId,
          fiatAmount: fiat,
          stripeFee,
          operationsFee: orgFee / 2,
          communityFee: orgFee / 2,
          systemTokensMinted: systemTokens,
          communityTokensMinted: communityTokens,
          deductibleAmount: fiat - systemTokens,
        });
      } catch (err) {
        console.error('[mint/confirm] PDF receipt email failed (non-critical):', err);
      }
    })();

    return NextResponse.json({
      success: true,
      donation: data,
      message: 'Mint transaction recorded. Will be confirmed by cron job.',
    });

  } catch (error: any) {
    console.error('❌ Confirm mint error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
