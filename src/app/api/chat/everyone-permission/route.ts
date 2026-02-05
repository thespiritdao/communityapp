// API Route: Check @everyone permission for a user in a specific chat/pod context
import { NextResponse } from 'next/server';
import { everyoneTagService } from '@/services/everyoneTagService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userWallet, chatGroupId, podId, contextType } = body;

    if (!userWallet) {
      return NextResponse.json(
        { error: 'User wallet address is required' },
        { status: 400 },
      );
    }

    if (!chatGroupId && !podId) {
      return NextResponse.json(
        { error: 'Either chatGroupId or podId is required' },
        { status: 400 },
      );
    }

    if (!contextType || !['chat', 'forum'].includes(contextType)) {
      return NextResponse.json(
        { error: 'contextType must be either "chat" or "forum"' },
        { status: 400 },
      );
    }

    const permission = await everyoneTagService.checkEveryoneTagPermission({
      userWallet,
      chatGroupId,
      podId,
      contextType,
    });

    return NextResponse.json({
      canUseEveryoneTag: permission.canUseEveryoneTag,
      reason: permission.reason,
      podId: permission.podId,
      chatGroupId: permission.chatGroupId,
    });
  } catch (error: any) {
    console.error('[API] @everyone permission check error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check @everyone permission' },
      { status: 500 },
    );
  }
}
