// src/app/api/forum/moderate/route.ts
// Server-side forum moderation — uses service role to bypass RLS

import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getHatId } from '@/lib/hatRegistry';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_CONTRACT = (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
  '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137') as `0x${string}`;

const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// True if the caller wears ANY of the given hats on-chain. Fails closed:
// an RPC error counts as "does not wear it".
async function wearsAnyHat(caller: string, hatIds: string[]): Promise<boolean> {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  for (const hatId of hatIds) {
    try {
      const balance = await publicClient.readContract({
        address: HATS_CONTRACT,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [caller as `0x${string}`, BigInt(hatId)],
      });
      if ((balance as bigint) > 0n) return true;
    } catch (e) {
      console.error(`Forum moderation: hat check failed for ${hatId}:`, e);
    }
  }
  return false;
}

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return (
      payload.wallet_address ||
      payload.user_metadata?.wallet_address ||
      null
    );
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const moderatorAddress = await getWalletFromToken(token);
    if (!moderatorAddress) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const { action, targetType, targetId, reason } = body;

    if (!action || !targetType || !targetId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the caller has forumModeration permission for the relevant pod
    const { data: thread } = targetType === 'thread'
      ? await supabaseAdmin.from('forum_threads').select('category_id').eq('id', targetId).single()
      : await supabaseAdmin.from('forum_posts').select('thread_id, forum_threads(category_id)').eq('id', targetId).single();

    const categoryId = targetType === 'thread'
      ? (thread as any)?.category_id
      : (thread as any)?.forum_threads?.category_id;

    const { data: category } = categoryId
      ? await supabaseAdmin
          .from('forum_categories')
          .select('pod_id')
          .eq('id', categoryId)
          .single()
      : { data: null };

    // The exec hat moderates everything, including global (pod-less) categories
    const execHatId = await getHatId('EXECUTIVE_POD_LEADER');
    const candidateHatIds: string[] = [];

    if (category?.pod_id) {
      // Hats of this pod's roles that carry forumModeration
      const { data: roles } = await supabaseAdmin
        .from('pod_role_permissions')
        .select('token_address, permissions')
        .eq('pod_id', category.pod_id)
        .eq('is_active', true);

      for (const r of roles || []) {
        if ((r as any).permissions?.forumModeration === true && (r as any).token_address) {
          candidateHatIds.push((r as any).token_address);
        }
      }
    }
    if (execHatId) candidateHatIds.push(execHatId);

    if (candidateHatIds.length === 0) {
      return NextResponse.json(
        { error: 'No moderation roles configured for this pod' },
        { status: 403 },
      );
    }

    // On-chain verification: the caller must actually wear a moderation hat
    // (or the exec hat) right now. Fails closed on RPC errors.
    const isModerator = await wearsAnyHat(moderatorAddress, candidateHatIds);
    if (!isModerator) {
      return NextResponse.json(
        { error: 'Forbidden: caller does not hold a moderation role for this pod' },
        { status: 403 },
      );
    }

    // Execute the action using service role (bypasses all RLS)
    if (action === 'delete' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .delete()
        .eq('id', targetId);

      if (error) throw error;

      // Fire-and-forget audit log
      supabaseAdmin.from('forum_moderator_actions').insert({
        moderator_address: moderatorAddress.toLowerCase(),
        action_type: 'delete',
        target_type: 'thread',
        target_id: targetId,
        reason: reason || null,
        metadata: {},
      }).then(() => {}, () => {});

      return NextResponse.json({ success: true });
    }

    if (action === 'delete' && targetType === 'post') {
      const { error } = await supabaseAdmin
        .from('forum_posts')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: moderatorAddress.toLowerCase(),
        })
        .eq('id', targetId);

      if (error) throw error;

      supabaseAdmin.from('forum_moderator_actions').insert({
        moderator_address: moderatorAddress.toLowerCase(),
        action_type: 'delete',
        target_type: 'post',
        target_id: targetId,
        reason: reason || null,
        metadata: {},
      }).then(() => {}, () => {});

      return NextResponse.json({ success: true });
    }

    if (action === 'pin' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_pinned: true, pinned_at: new Date().toISOString(), pinned_by: moderatorAddress.toLowerCase() })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'unpin' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_pinned: false, pinned_at: null, pinned_by: null })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'lock' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_locked: true })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (action === 'unlock' && targetType === 'thread') {
      const { error } = await supabaseAdmin
        .from('forum_threads')
        .update({ is_locked: false })
        .eq('id', targetId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Forum moderation API error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
