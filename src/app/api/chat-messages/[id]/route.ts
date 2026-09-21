// src/app/api/chat-messages/[id]/route.ts
//
// DELETE a chat message. Allowed for: the message's sender, or a member of
// the group's pod who holds the chatModeration permission / leads the pod /
// wears the Executive Leader hat. Direct messages: sender only.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getWalletFromToken, isPodLeader, isExecutiveLeader } from '@/lib/serverPodAuth';
import { PodAccessControlService } from '@/features/pods/services/PodAccessControlService';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    // Get the access token from Authorization header
    const authHeader = request.headers.get('Authorization');
    const accessToken = authHeader?.replace('Bearer ', '');

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized - No access token provided' },
        { status: 401 }
      );
    }

    // Create user client to verify auth
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid session' },
        { status: 401 }
      );
    }

    // Create service role client to bypass RLS for deletion
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const messageId = params.id;

    // Who is calling? The JWT's wallet claim (verified signature).
    const callerWallet = (await getWalletFromToken(accessToken))?.toLowerCase();
    if (!callerWallet) {
      return NextResponse.json({ error: 'Unauthorized - No wallet in session' }, { status: 401 });
    }

    // What is being deleted?
    const { data: message, error: messageError } = await supabaseAdmin
      .from('chat_messages')
      .select('id, sender_wallet_id, chat_group_id, is_direct_message')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const isSender = String(message.sender_wallet_id ?? '').toLowerCase() === callerWallet;
    let allowed = isSender;

    if (!allowed && message.chat_group_id && !message.is_direct_message) {
      const { data: group } = await supabaseAdmin
        .from('chat_groups')
        .select('pod_id')
        .eq('id', message.chat_group_id)
        .maybeSingle();

      if (group?.pod_id) {
        const perm = await PodAccessControlService.requirePodPermission(
          callerWallet,
          group.pod_id,
          'chatModeration',
        );
        allowed =
          perm.allowed ||
          (await isPodLeader(group.pod_id, callerWallet)) ||
          (await isExecutiveLeader(callerWallet));
      }
    }

    if (!allowed) {
      console.warn('🗑️ Delete message API: denied', { messageId, callerWallet });
      return NextResponse.json(
        { error: 'You can only delete your own messages, or moderate a pod chat you have permission for' },
        { status: 403 },
      );
    }

    console.log('🗑️ Delete message API: Deleting message', messageId, 'for user', user.id, isSender ? '(own)' : '(moderation)');

    // Delete the message using service role (bypasses RLS)
    const { error: deleteError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) {
      console.error('❌ Delete message API: Failed to delete:', deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    console.log('✅ Delete message API: Message deleted successfully');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Delete message API: Unexpected error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
