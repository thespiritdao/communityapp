import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTokensReceivedEmail } from '@/lib/donationEmail';

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
        status: 'minting', // Will be updated to 'minted' by cron when confirmed
        tx_hash: userOpHash,
        minter_address: minter,
        mint_initiated_at: new Date().toISOString(),
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

    // Fire-and-forget: airdrop Advocate NFT on first donation
    maybeAirdropAdvocate(data.user_wallet, donationId);

    // Fire-and-forget: email recipient that tokens are incoming
    sendTokensReceivedEmail({
      recipientWallet: data.user_wallet,
      amount: data.system_tokens_to_mint,
      tokenSymbol: 'SYSTEM',
    });

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
