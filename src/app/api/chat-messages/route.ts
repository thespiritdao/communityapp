// src/app/api/chat-messages/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { everyoneTagService } from '@/services/everyoneTagService';
import { everyoneNotificationService } from '@/services/everyoneNotificationService';

// Proof of Curiosity token for special access (same as ChatContainer.tsx)
const POC =
  process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY_TOKEN?.toLowerCase() || '';

export async function POST(request: Request) {
  const body = await request.json();
  const { content, attachments, sender_wallet_id, chat_group_id } = body;

  if (!content || !sender_wallet_id || !chat_group_id) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    );
  }

  try {
    // Create server-side Supabase client with cookie access
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storage: {
            getItem: (key: string) => {
              const cookie = cookieStore.get(key);
              return cookie?.value || null;
            },
            setItem: () => {},
            removeItem: () => {},
          },
        },
      }
    );

    // ✅ SECURITY: Step 1 - Verify authenticated session
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      console.error('❌ Chat message POST: No authenticated session');
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 },
      );
    }

    // ✅ SECURITY: Step 2 - Verify sender wallet matches authenticated user
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('wallet_address')
      .eq('user_id', sessionData.session.user.id)
      .single();

    if (
      !userProfile ||
      userProfile.wallet_address.toLowerCase() !==
        sender_wallet_id.toLowerCase()
    ) {
      console.error('❌ Chat message POST: Wallet mismatch', {
        authenticated: userProfile?.wallet_address,
        claimed: sender_wallet_id,
      });
      return NextResponse.json(
        { error: 'Unauthorized - Wallet mismatch' },
        { status: 403 },
      );
    }

    console.log('✅ Chat message POST: User authenticated:', sender_wallet_id);

    // Fetch the chat group's required token and pod_id
    const { data: groupData, error: groupError } = await supabase
      .from('chat_groups')
      .select('required_token, pod_id, title')
      .eq('id', chat_group_id)
      .single();

    if (groupError || !groupData) {
      return NextResponse.json(
        { error: 'Invalid chat group' },
        { status: 400 },
      );
    }

    const required_token = groupData.required_token?.toLowerCase() || '';
    const pod_id = groupData.pod_id;

    console.log('📋 Chat message POST: Validating access to', groupData.title, {
      required_token: required_token.slice(0, 10) + '...',
      pod_id: pod_id,
    });

    // ✅ SECURITY: Step 3 - Check if user has permission to send messages
    let hasPermission = false;

    // Special case: Proof of Curiosity token grants direct access
    if (required_token === POC) {
      const { data: balanceData } = await supabase
        .from('token_balances')
        .select('balance')
        .eq('wallet_address', sender_wallet_id.toLowerCase())
        .eq('contract_address', POC)
        .gt('balance', 0)
        .single();

      if (balanceData) {
        hasPermission = true;
        console.log('✅ Chat message POST: User has Proof of Curiosity token');
      }
    }

    // Check pod-based permissions via active_pod_members and role permissions
    if (!hasPermission && pod_id) {
      // Get user's membership in this pod
      const { data: membership } = await supabase
        .from('active_pod_members')
        .select('hat_id, membership_type')
        .eq('pod_id', pod_id)
        .eq('wallet', sender_wallet_id.toLowerCase())
        .eq('is_active', true)
        .single();

      if (membership) {
        console.log('📋 Chat message POST: Found pod membership:', {
          hat_id: membership.hat_id?.slice(0, 10) + '...',
          type: membership.membership_type,
        });

        // Get role permissions for this HAT
        const { data: rolePermissions } = await supabase
          .from('pod_role_permissions')
          .select('permissions, role_name')
          .eq('pod_id', pod_id)
          .eq('token_address', membership.hat_id)
          .single();

        if (rolePermissions) {
          const permissions =
            typeof rolePermissions.permissions === 'string'
              ? JSON.parse(rolePermissions.permissions)
              : rolePermissions.permissions;

          hasPermission = permissions.chatAccess === true;

          console.log('🔐 Chat message POST: Permission check:', {
            role: rolePermissions.role_name,
            chatAccess: permissions.chatAccess,
            hasPermission,
          });
        }
      }
    }

    // ✅ SECURITY: Step 4 - Reject if no permission
    if (!hasPermission) {
      console.error('❌ Chat message POST: User lacks chatAccess permission');
      return NextResponse.json(
        {
          error:
            'Forbidden - You do not have permission to send messages in this chat',
        },
        { status: 403 },
      );
    }

    console.log(
      '✅ Chat message POST: Permission validated, inserting message',
    );

    // ✅ SECURITY: Step 5 - Check for @everyone tag and validate permission
    let isEveryoneTag = false;
    if (everyoneTagService.detectEveryoneTag(content)) {
      console.log('🔔 Chat message POST: @everyone tag detected, checking permission...');

      const everyoneValidation = await everyoneTagService.validateAndExtractEveryone(
        content,
        {
          userWallet: sender_wallet_id,
          chatGroupId: chat_group_id,
          podId: pod_id,
          contextType: 'chat',
        },
      );

      if (!everyoneValidation.isValid) {
        console.error('❌ Chat message POST: @everyone permission denied');
        return NextResponse.json(
          {
            error: everyoneValidation.reason || 'You do not have permission to use @everyone in this chat',
          },
          { status: 403 },
        );
      }

      isEveryoneTag = everyoneValidation.shouldNotify;
      console.log('✅ Chat message POST: @everyone permission validated');
    }

    // Insert the new message with its associated chat_group_id and inherited required_token
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          content,
          attachments: attachments || [],
          sender_wallet_id,
          chat_group_id,
          required_token,
          is_everyone_tag: isEveryoneTag,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('❌ Chat message POST: Insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ✅ NOTIFICATION: Send @everyone notifications if applicable
    if (isEveryoneTag && data && pod_id) {
      console.log('🔔 Chat message POST: Triggering @everyone notifications...');

      // Get sender name and pod name for better notification context
      const senderName = await everyoneNotificationService.getSenderName(sender_wallet_id);
      const podName = await everyoneNotificationService.getPodName(pod_id);
      const messagePreview = everyoneNotificationService.createMessagePreview(content);

      // Send notifications asynchronously (don't block response)
      everyoneNotificationService.sendEveryoneNotifications({
        senderAddress: sender_wallet_id,
        senderName,
        messageContent: content,
        messagePreview,
        contextType: 'chat',
        contextId: chat_group_id,
        contextUrl: `/chat/${chat_group_id}`,
        podId: pod_id,
        podName,
      }).then((result) => {
        console.log(`✅ Chat message POST: @everyone notifications sent: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`);
      }).catch((error) => {
        console.error('❌ Chat message POST: @everyone notification error:', error);
      });
    }

    console.log('✅ Chat message POST: Message sent successfully');
    return NextResponse.json({ message: data });
  } catch (error: any) {
    console.error('❌ Chat message POST: Unexpected error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
