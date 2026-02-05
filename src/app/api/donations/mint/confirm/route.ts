import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
