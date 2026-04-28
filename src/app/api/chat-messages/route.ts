// src/app/api/chat-messages/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { everyoneTagService } from '@/services/everyoneTagService';
import { everyoneNotificationService } from '@/services/everyoneNotificationService';
import { recordExplorerEvent } from '@/lib/explorerEvents';
// Special access tokens (same as ChatContainer.tsx)
const POC =
  process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY_TOKEN?.toLowerCase() || '';
const ADVOCATE_TOKEN =
  process.env.NEXT_PUBLIC_ADVOCATE?.toLowerCase() || '';

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
    // For embedded wallet apps, session is stored in localStorage, not cookies
    // Get the access token from Authorization header
    const authHeader = request.headers.get('Authorization');
    const accessToken = authHeader?.replace('Bearer ', '');

    console.log('🔐 Chat API: Auth header present:', !!authHeader);
    console.log('🔐 Chat API: Access token present:', !!accessToken);

    if (!accessToken) {
      console.error('❌ Chat API: No access token in Authorization header');
      return NextResponse.json(
        { error: 'Unauthorized - No access token provided' },
        { status: 401 },
      );
    }

    // Create Supabase client with the provided access token (for user auth)
    const supabase = createClient(
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

    // Create service role client for permission checks (bypasses RLS)
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

    // ✅ SECURITY: Step 1 - Verify authenticated session by getting user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    console.log('🔐 Chat API: User check:', {
      hasUser: !!user,
      userId: user?.id,
      hasError: !!userError,
      error: userError?.message,
    });

    if (userError || !user) {
      console.error('❌ Chat message POST: Invalid or expired token');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or expired session' },
        { status: 401 },
      );
    }

    // ✅ SECURITY: Step 2 - Verify sender wallet matches authenticated user
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('wallet_address')
      .eq('user_id', user.id)
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

    // Fetch the chat group's required token, pod_id, and access_level (using admin to bypass RLS)
    const { data: groupData, error: groupError } = await supabaseAdmin
      .from('chat_groups')
      .select('required_token, pod_id, title, access_level')
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
    const access_level = groupData.access_level;

    console.log('📋 Chat message POST: Validating access to', groupData.title, {
      required_token: required_token.slice(0, 10) + '...',
      pod_id: pod_id,
      access_level: access_level,
    });

    // ✅ SECURITY: Step 3 - Check if user has permission to send messages
    let hasPermission = false;

    // ✅ Check access_level from database - "both" means open to all authenticated users
    if (access_level === 'both' || access_level === 'public') {
      console.log('✅ Chat message POST: Chat has open access_level:', access_level);
      hasPermission = true;
    }

    console.log('🔐 Chat message POST: Starting permission checks:', {
      required_token: required_token.slice(0, 10) + '...',
      POC: POC.slice(0, 10) + '...',
      isPOCChat: required_token === POC,
      hasPodId: !!pod_id,
      pod_id,
    });

    // Special case: Proof of Curiosity token grants direct access
    if (required_token === POC) {
      console.log('🔍 Chat message POST: Checking PoC token balance...');
      const { data: balanceData, error: balanceError } = await supabaseAdmin
        .from('token_balances')
        .select('balance')
        .eq('wallet_address', sender_wallet_id.toLowerCase())
        .eq('contract_address', POC)
        .gt('balance', 0)
        .single();

      console.log('🔍 Chat message POST: PoC balance query result:', {
        hasBalance: !!balanceData,
        balance: balanceData?.balance,
        error: balanceError?.message,
      });

      if (balanceData) {
        hasPermission = true;
        console.log('✅ Chat message POST: User has Proof of Curiosity token');
      }
    }



    // Special case: Advocate token grants access to Advocate chat
    if (!hasPermission && required_token === ADVOCATE_TOKEN) {
      console.log('🔍 Chat message POST: Checking Advocate token balance...');
      const { data: balanceData, error: balanceError } = await supabaseAdmin
        .from('token_balances')
        .select('balance')
        .eq('wallet_address', sender_wallet_id.toLowerCase())
        .eq('contract_address', ADVOCATE_TOKEN)
        .gt('balance', 0)
        .single();

      console.log('🔍 Chat message POST: Advocate token balance query result:', {
        hasBalance: !!balanceData,
        balance: balanceData?.balance,
        error: balanceError?.message,
      });

      if (balanceData) {
        hasPermission = true;
        console.log('✅ Chat message POST: User has Advocate token');
      }
    }

    // Check pod-based permissions via active_pod_members and role permissions
    if (!hasPermission && pod_id) {
      console.log('🔍 Chat message POST: Checking pod membership...');
      // Get user's membership in this pod (using admin to bypass RLS)
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('active_pod_members')
        .select('hat_id, membership_type')
        .eq('pod_id', pod_id)
        .eq('wallet', sender_wallet_id.toLowerCase())
        .eq('is_active', true)
        .single();

      console.log('🔍 Chat message POST: Membership query result:', {
        hasMembership: !!membership,
        hat_id: membership?.hat_id?.slice(0, 10) + '...',
        type: membership?.membership_type,
        error: membershipError?.message,
      });

      if (membership) {
        console.log('📋 Chat message POST: Found pod membership:', {
          hat_id: membership.hat_id?.slice(0, 10) + '...',
          type: membership.membership_type,
        });

        // ✅ FIX: Get ALL role permissions for this pod, then check if user's hat has chatAccess
        // This handles hierarchical roles (e.g., leadership hat vs membership hat)
        // Using admin client to bypass RLS
        const { data: allRolePermissions, error: roleError } = await supabaseAdmin
          .from('pod_role_permissions')
          .select('permissions, role_name, token_address')
          .eq('pod_id', pod_id);

        console.log('🔍 Chat message POST: Found', allRolePermissions?.length || 0, 'roles in pod');

        if (allRolePermissions && allRolePermissions.length > 0) {
          // Find the role matching user's hat_id
          const userRole = allRolePermissions.find(
            role => role.token_address?.toLowerCase() === membership.hat_id?.toLowerCase()
          );

          console.log('🔍 Chat message POST: User role lookup:', {
            userHatId: membership.hat_id?.slice(0, 10) + '...',
            foundRole: !!userRole,
            roleName: userRole?.role_name,
            availableRoles: allRolePermissions.map(r => ({
              name: r.role_name,
              token: r.token_address?.slice(0, 10) + '...'
            })),
          });

          if (userRole) {
            const permissions =
              typeof userRole.permissions === 'string'
                ? JSON.parse(userRole.permissions)
                : userRole.permissions;

            hasPermission = permissions.chatAccess === true;

            console.log('🔐 Chat message POST: Permission check:', {
              role: userRole.role_name,
              chatAccess: permissions.chatAccess,
              allPermissions: Object.keys(permissions),
              hasPermission,
            });
          } else {
            console.log('⚠️ Chat message POST: User hat not found in pod role permissions');
            console.log('🔍 Chat message POST: Chat required_token:', required_token.slice(0, 10) + '...');
            console.log('🔍 Chat message POST: User hat_id:', membership.hat_id?.slice(0, 10) + '...');
          }
        } else {
          console.log('⚠️ Chat message POST: No role permissions found for pod');
        }
      } else {
        console.log('⚠️ Chat message POST: No pod membership found');
      }
    } else if (!hasPermission) {
      console.log('⚠️ Chat message POST: Skipping pod check - no pod_id');
    }

    // ✅ SECURITY: Step 4 - Reject if no permission
    if (!hasPermission) {
      console.error('❌ Chat message POST: User lacks chatAccess permission');
      console.error('❌ Permission denied summary:', {
        chatTitle: groupData.title,
        requiredToken: required_token,
        accessLevel: access_level,
        podId: pod_id,
        userWallet: sender_wallet_id,
        checkedPoC: required_token === POC,

        checkedAdvocate: required_token === ADVOCATE_TOKEN,
        checkedPodMembership: !!pod_id,
      });
      return NextResponse.json(
        {
          error:
            'Forbidden - You do not have permission to send messages in this chat',
          debug: {
            chatTitle: groupData.title,
            requiredToken: required_token.slice(0, 10) + '...',
            hasPodId: !!pod_id,
          }
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
      .from('chat_messages')
      .insert([
        {
          content,
          sender_wallet_id,
          chat_group_id,
          required_token,
          attachments: JSON.stringify(attachments || []),
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

    // Pulse: log first-ever chat message in this pod's group as a milestone.
    // Cheap to detect — count rows in this group and gate on === 1. Dedupe key
    // ensures races (concurrent inserts) only produce one event.
    if (data && pod_id) {
      const { count: msgCount } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('chat_group_id', chat_group_id);
      if (msgCount === 1) {
        recordExplorerEvent({
          type: 'chat_first_message_in_pod',
          title: 'First message sent in a chat channel',
          actor: sender_wallet_id,
          pod_id,
          url: `/chat/${chat_group_id}`,
          metadata: { chat_group_id, message_id: data.id },
          dedupe_key: `chat_first_message_in_pod:${chat_group_id}`,
        }).catch((err) => console.warn('[chat-messages] explorer event failed:', err));
      }
    }

    console.log('✅ Chat message POST: Message sent successfully');
    return NextResponse.json({ message: data });
  } catch (error: any) {
    console.error('❌ Chat message POST: Unexpected error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
