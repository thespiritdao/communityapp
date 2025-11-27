// /src/app/api/airdrop/route.ts

import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import { airdropMembership, checkAirdropStatus } from '@/utils/airdrop';
import { rateLimiters, rateLimitErrorResponse } from '@/lib/ratelimit';

export async function POST(req: Request) {
  try {
    const { walletAddress } = await req.json();
    console.log(`🔹 Airdrop initiated for ${walletAddress}`);

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 },
      );
    }

    // Rate limiting (CRITICAL - prevents airdrop spam)
    // Limit: 3 requests per hour per wallet address
    const normalizedAddress = walletAddress.toLowerCase();
    const { success, limit, remaining, reset } =
      await rateLimiters.airdrop.limit(normalizedAddress);

    if (!success) {
      console.warn(
        `[Airdrop] Rate limit exceeded for wallet: ${normalizedAddress}`,
      );
      return NextResponse.json(
        {
          ...rateLimitErrorResponse(reset),
          message:
            'Too many airdrop requests. You can request another airdrop in ' +
            Math.ceil((reset - Date.now()) / 1000 / 60) +
            ' minutes.',
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        },
      );
    }

    console.log(
      `[Airdrop] Rate limit check passed: ${remaining}/${limit} remaining for ${normalizedAddress}`,
    );

    // Check existing membership
    const { data: existingUser, error } = await supabase
      .from('user_profiles')
      .select('membership_status')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (error) {
      console.error('❌ Supabase query error:', error);
      return NextResponse.json(
        { error: 'Database query failed' },
        { status: 500 },
      );
    }

    if (existingUser?.membership_status) {
      console.log('✅ User already has membership. Skipping airdrop.');
      return NextResponse.json(
        { message: 'User already has membership' },
        { status: 200 },
      );
    }

    // Submit via Gelato Relay
    const {
      success: airdropSuccess,
      taskId,
      error: airdropError,
    } = await airdropMembership(walletAddress);

    if (!airdropSuccess || !taskId) {
      console.error('❌ Airdrop submission failed:', airdropError);
      return NextResponse.json(
        { error: 'Airdrop submission failed' },
        { status: 500 },
      );
    }

    // Store the task information
    const { error: insertError } = await supabase.from('relay_tasks').insert({
      wallet_address: walletAddress,
      task_id: taskId,
      status: 'pending',
    });

    if (insertError) {
      console.error('❌ Failed to record task:', insertError);
    }

    return NextResponse.json(
      {
        message: 'Airdrop submitted',
        taskId,
      },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      },
    );
  } catch (error) {
    console.error('❌ Airdrop API error:', error);
    return NextResponse.json({ error: 'Airdrop failed' }, { status: 500 });
  }
}

// Add status check endpoint
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
  }

  try {
    const status = await checkAirdropStatus(taskId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 },
    );
  }
}
