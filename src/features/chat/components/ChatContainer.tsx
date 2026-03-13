// src/features/chat/components/ChatContainer.tsx

'use client';

import { useAuthContext } from '@/features/identity';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import '@/features/chat/styles/Chat.css';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import type { TokenBalance } from '@/utils/fetchTokenBalances';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { usePodModules } from '@/features/pods/hooks/usePodModules';
import type { ChatGroup, Message, UserProfile } from '../types';
import ChatInput from './ChatInput';
import MessageList from './MessageList';
import { ChatDebugPanel } from './ChatDebugPanel';
const TABLE_NAME = 'chat_messages';

interface ChatContainerProps {
  chatGroupId?: string;
}

export default function ChatContainer({ chatGroupId }: ChatContainerProps) {
  const { session, isAuthenticated, signIn } = useAuthContext();
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [selectedChatGroup, setSelectedChatGroup] = useState<ChatGroup | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // hats/roles from permissions
  const {
    userHats,
    userRoles,
    permissions,
    getPermissionsForPod,
    hasPermissionInPod,
  } = useHatPermissions();

  // on-chain balances (hasProofOfCuriosity, etc.)
  const { balances } = useTokenBalances();

  // notifications for mentions
  const { createNotification } = useUnifiedNotifications();

  // pod modules for permission checking
  const {
    isModuleEnabled,
    modules,
    loading: modulesLoading,
    refreshModules,
  } = usePodModules();

  // normalize env Proof of Curiosity address once
  const POC = useMemo(
    () => (process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY || '').toLowerCase(),
    [],
  );

  // normalize Advocate Token address
  const ADVOCATE_TOKEN = useMemo(
    () => (process.env.NEXT_PUBLIC_ADVOCATE || '').toLowerCase(),
    [],
  );

  // Get current user profile
  useEffect(() => {
    const fetchUser = async () => {
      console.log('👤 ChatContainer: Fetching current user profile...');

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ ChatContainer: Error getting session:', sessionError);
        return;
      }

      const userId = sessionData?.session?.user?.id;

      if (!userId) {
        console.warn('⚠️ ChatContainer: No user ID found in session');
        return;
      }

      console.log('👤 ChatContainer: Found user ID:', userId);

      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error(
          '❌ ChatContainer: Error loading user profile:',
          profileError,
        );
        return;
      }

      console.log('✅ ChatContainer: Loaded user profile:', {
        wallet: userProfile?.wallet_address,
        firstName: userProfile?.first_name,
        lastName: userProfile?.last_name,
      });

      setCurrentUser(userProfile || null);
    };
    fetchUser();
  }, []);

  // Load accessible chat groups
  useEffect(() => {
    const loadGroups = async () => {
      // Parallelize chat_groups and pods queries for faster loading
      const [groupsResult, podsResult] = await Promise.all([
        supabase.from('chat_groups').select('*'),
        supabase.from('pods').select(
          'id, pod_image_url, token_address, management_hat_id, membership_hat_id',
        ),
      ]);

      const { data: allGroups, error: cgErr } = groupsResult;
      if (cgErr) {
        console.error('Error loading chat_groups:', cgErr);
        setChatGroups([]);
        setLoading(false);
        return;
      }

      const { data: pods, error: podsErr } = podsResult;
      if (podsErr) {
        console.error('Error loading pods:', podsErr);
      }

      // Map pod_id -> image
      const podImageById = new Map<string, string>();
      // Map any hat/token address -> image
      const hatToImage = new Map<string, string>();

      (pods || []).forEach((p) => {
        const img = p.pod_image_url || '/images/symbolobinfin.png';
        if (p.id) podImageById.set(String(p.id), img);

        const keys = [
          String(p.token_address ?? '').toLowerCase(),
          String(p.management_hat_id ?? '').toLowerCase(),
          String(p.membership_hat_id ?? '').toLowerCase(),
        ].filter(Boolean);

        keys.forEach((k) => hatToImage.set(k, img));
      });

      // --- STEP 1: Filter by module permissions FIRST (more efficient) ---
      console.log('Chat: Step 1 - Filtering by module permissions first');
      console.log(
        'Chat: All groups before module filter:',
        (allGroups || []).map((g) => ({
          id: g.id,
          title: g.title,
          pod_id: g.pod_id,
          required_token: g.required_token,
        })),
      );

      const moduleFilteredGroups = (allGroups || []).filter((group) => {
        // Non-pod chats (like general community chat) always pass module check
        if (!group.pod_id) {
          console.log('Chat: Non-pod chat passes module check:', group.title);
          return true;
        }

        // For pod-specific chats, check if chat module is enabled
        const chatEnabled = isModuleEnabled(group.pod_id, 'chat_enabled');
        console.log('Chat: Module check for pod', group.pod_id, ':', {
          groupTitle: group.title,
          chatEnabled,
          moduleDataLoaded: Object.keys(modules).length > 0,
          hasModuleEntry: !!modules[group.pod_id],
        });

        return chatEnabled;
      });

      console.log(
        'Chat: Groups after module filter:',
        moduleFilteredGroups.map((g) => ({
          id: g.id,
          title: g.title,
          pod_id: g.pod_id,
        })),
      );

      // --- STEP 2: Filter by eligibility (HAT ownership / permissions) ---
      console.log(
        'Chat: Step 2 - Checking eligibility for module-enabled chats',
      );

      const allowed = moduleFilteredGroups.filter((group) => {
        const requiredToken = String(group.required_token || '').toLowerCase();

        console.log('Chat: Checking eligibility for group:', {
          groupTitle: group.title,
          requiredToken: requiredToken,
          userHatsCount: (userHats || []).length,
          userRolesCount: (userRoles || []).length,
          userHatsPreview: (userHats || [])
            .slice(0, 3)
            .map((h) => String(h).slice(0, 10) + '...'),
          POC: POC,
          ADVOCATE_TOKEN: ADVOCATE_TOKEN,
          hasProofOfCuriosity: balances?.hasProofOfCuriosity ?? false,
          hasAdvocate: (balances as any)?.hasAdvocate ?? false,
          isAdvocateChat: requiredToken === ADVOCATE_TOKEN,
          isGeneralChat: requiredToken === POC,
        });

        // 1) Direct HAT ownership (userHats is a list of hat/token ids)
        const hasHatToken = (userHats || []).some(
          (h) => String(h || '').toLowerCase() === requiredToken,
        );

        // 2) Explicit PoC token via balances context
        const hasPoC = requiredToken === POC && !!balances?.hasProofOfCuriosity;

        // 2d) Explicit Advocate Token via balances context
        // Advocate token grants access to Advocate-specific chat
        const hasAdvocateToken =
          requiredToken === ADVOCATE_TOKEN && !!(balances as any)?.hasAdvocate;

        // 3) Role-level permission with chatAccess
        const hasPermission = (userRoles || []).some((role) => {
          const roleMatch =
            String(role.hatId || '').toLowerCase() === requiredToken;
          const hasChatAccess = role.permissions?.chatAccess;

          if (roleMatch) {
            console.log('Chat: Found matching role for', group.title, ':', {
              roleName: role.name,
              roleHatId: String(role.hatId).slice(0, 10) + '...',
              hasChatAccess: hasChatAccess,
              allPermissions: Object.keys(role.permissions || {}),
            });
          }

          return roleMatch && hasChatAccess;
        });

        // For pod chats with permission system, ONLY check permission (not direct HAT ownership)
        // Direct HAT ownership is already factored into the role permissions loaded from database
        // PoC and Advocate are exceptions - they grant direct access without permission checks
        const eligible =
          hasPermission ||
          hasPoC ||
          hasAdvocateToken;

        console.log('Chat: Eligibility result for', group.title, ':', {
          hasHatToken,
          hasPoC,
          hasAdvocateToken,
          hasPermission,
          eligible,
          willBeShown: eligible,
          logic: 'Using permission system + PoC + Advocate (Advocate Chat)',
        });

        return eligible;
      });

      console.log(
        'Chat: Groups after eligibility filter:',
        allowed.map((g) => ({
          id: g.id,
          title: g.title,
        })),
      );

      // --- STEP 3: Attach images for final display ---
      const withImages = allowed.map((group) => {
        const key = String(group.required_token || '').toLowerCase();
        const byPodId = group.pod_id && podImageById.get(String(group.pod_id));
        const byHat = hatToImage.get(key);
        const finalImage = byPodId || byHat || '/images/symbolobinfin.png';

        // Debug logging for image resolution
        console.log('Chat: Group image resolution:', {
          groupTitle: group.title,
          groupPodId: group.pod_id,
          requiredToken: group.required_token,
          key: key,
          byPodId: byPodId,
          byHat: byHat,
          finalImage: finalImage,
        });

        return {
          ...group,
          pod_image_url: finalImage,
          name: group.title, // for UI
        };
      });

      setChatGroups(withImages);
      setLoading(false);
    };

    // wait until we have hats/roles and balances and modules are loaded
    if (userHats && userRoles && balances && !modulesLoading) {
      console.log(
        'Chat: All dependencies ready, loading groups. Modules state:',
        {
          modulesLoading,
          modulesCount: Object.keys(modules).length,
          modules,
        },
      );
      loadGroups();
    }
  }, [userHats, userRoles, balances, POC, modulesLoading, modules]);

  // Auto-select if chatGroupId prop provided
  useEffect(() => {
    if (!chatGroupId || chatGroups.length === 0) return;
    const match = chatGroups.find((g) => g.id === chatGroupId);
    if (match) setSelectedChatGroup(match);
  }, [chatGroupId, chatGroups]);

  // Load messages for selected group (history + realtime)
  useEffect(() => {
    if (!selectedChatGroup) return;

    const fetchData = async () => {
      setLoading(true);

      const { data: messagesData, error: msgErr } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('chat_group_id', selectedChatGroup.id)
        .order('created_at', { ascending: true });
      if (msgErr) {
        console.error('Error loading messages:', msgErr);
      }

      const { data: usersData, error: usersErr } = await supabase
        .from('user_profiles')
        .select('*');
      if (usersErr) {
        console.error('Error loading user_profiles:', usersErr);
      }

      // Parse attachments from JSON string to array
      const parsedMessages = (messagesData || []).map(msg => ({
        ...msg,
        attachments: typeof msg.attachments === 'string'
          ? JSON.parse(msg.attachments || '[]')
          : msg.attachments || []
      }));

      setMessages(parsedMessages);
      setUsers(usersData || []);
      setLoading(false);
    };

    fetchData();

    // subscribe to new messages
    const sub = supabase
      .channel(`chat-${selectedChatGroup.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLE_NAME,
          filter: `chat_group_id=eq.${selectedChatGroup.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Parse attachments from JSON string to array
          const parsedMsg = {
            ...newMsg,
            attachments: typeof newMsg.attachments === 'string'
              ? JSON.parse(newMsg.attachments || '[]')
              : newMsg.attachments || []
          };
          setMessages((prev) => [...prev, parsedMsg]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [selectedChatGroup]);

  // Send message
  const handleSendMessage = async (
    content: string,
    attachments?: string[],
    mentions?: any[],
  ) => {
    if (!currentUser || !selectedChatGroup) {
      console.error('❌ ChatContainer: Cannot send message - missing data:', {
        hasCurrentUser: !!currentUser,
        hasSelectedChatGroup: !!selectedChatGroup,
      });
      return;
    }

    console.log('📤 ChatContainer: Sending message with content:', content);
    console.log('📤 ChatContainer: Current user:', {
      wallet: currentUser.wallet_address,
      profilePic: currentUser.profile_picture,
    });
    console.log('📤 ChatContainer: Selected chat group:', {
      id: selectedChatGroup.id,
      title: selectedChatGroup.title,
      requiredToken: selectedChatGroup.required_token,
    });
    console.log('📤 ChatContainer: Mentions received:', mentions);

    try {
      const messageData = {
        content,
        attachments: attachments || [],
        sender_wallet_id: currentUser.wallet_address,
        sender_profile_picture: currentUser.profile_picture,
        chat_group_id: selectedChatGroup.id,
        created_at: new Date().toISOString(),
        required_token: selectedChatGroup.required_token || null,
      };

      console.log(
        '📤 ChatContainer: Attempting to send message via API:',
        messageData,
      );

      // Get current session token to send to API
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token;

      console.log('📤 ChatContainer: Has access token:', !!accessToken);
      console.log('📤 ChatContainer: Chat details:', {
        chatGroupId: selectedChatGroup.id,
        chatTitle: selectedChatGroup.title,
        requiredToken: selectedChatGroup.required_token,
        podId: selectedChatGroup.pod_id,
      });

      // Send message via API route (handles @everyone validation and notifications)
      const response = await fetch('/api/chat-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Send authorization header with session token
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        credentials: 'include', // ✅ Send session cookies for authentication
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ ChatContainer: Error sending message:', {
          status: response.status,
          error: errorData.error,
          messageData,
        });

        // Show permission error to user if @everyone was denied
        if (response.status === 403 && errorData.error?.includes('@everyone')) {
          alert(errorData.error);
        }
        return;
      }

      const { message: data } = await response.json();
      console.log('✅ ChatContainer: Message sent successfully via API:', data);

      // Process mentions from UserTagging component (not extracted from text)
      if (mentions && mentions.length > 0) {
        console.log('Processing mentions for notifications:', mentions);

        // Create notifications for each mentioned user
        for (const mention of mentions) {
          // Skip @everyone - it's handled by the API route
          if (mention.id === 'everyone') {
            console.log('ChatContainer: Skipping @everyone (handled by API)');
            continue;
          }

          console.log('ChatContainer: Processing mention:', {
            mentionId: mention.id,
            mentionIdLower: mention.id.toLowerCase(),
            currentUserAddress: currentUser.wallet_address,
            currentUserAddressLower: currentUser.wallet_address.toLowerCase(),
            isSelfMention:
              mention.id.toLowerCase() ===
              currentUser.wallet_address.toLowerCase(),
          });

          // Don't notify yourself
          if (
            mention.id.toLowerCase() !==
            currentUser.wallet_address.toLowerCase()
          ) {
            try {
              console.log(
                'ChatContainer: About to create mention notification for:',
                {
                  recipientId: mention.id,
                  recipientDisplay: mention.display,
                  senderId: currentUser.wallet_address,
                  senderName:
                    `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim(),
                  chatGroupId: selectedChatGroup.id,
                },
              );

              await createNotification({
                recipient_address: mention.id,
                sender_address: currentUser.wallet_address,
                notification_type: 'user_mentioned',
                title: 'You were mentioned in a chat',
                message:
                  `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() +
                  ' mentioned you in a chat',
                context_type: 'chat',
                context_id: selectedChatGroup.id,
                context_url: `/chat/${selectedChatGroup.id}`,
                priority: 'medium',
              });

              console.log(
                'ChatContainer: ✅ Successfully created notification for mention:',
                mention.display || mention.name,
              );
            } catch (notificationError) {
              console.error(
                'ChatContainer: ❌ Error creating mention notification:',
                notificationError,
              );
              console.error('ChatContainer: Error details:', {
                error: notificationError,
                mentionId: mention.id,
                chatGroupId: selectedChatGroup.id,
                currentUserAddress: currentUser.wallet_address,
              });
              // Don't fail the entire message send if notification fails
            }
          } else {
            console.log(
              'ChatContainer: Skipping self-mention for:',
              mention.display,
            );
          }
        }
      } else {
        console.log('No mentions found in message');
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
    }
  };

  // Chat list view
  if (!selectedChatGroup) {
    return (
      <div className="chat-shell chat-list-view">
        {/* Debug panel for mobile troubleshooting */}
        <ChatDebugPanel />

        {/* rounded card container with white background */}
        <div className="chat-groups-container">
          <div className="flex items-center justify-between mb-4">
            <h1 className="chat-title text-3xl font-bold">Community Chats</h1>
            {Object.keys(modules).length === 0 && (
              <button
                onClick={refreshModules}
                className="px-3 py-1 text-xs rounded"
                style={{ backgroundColor: '#8FAAA1', color: '#FFFFFF' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = '#6F8F86')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = '#8FAAA1')
                }
              >
                Refresh Modules
              </button>
            )}
          </div>

          {loading ? (
            <p>Loading chat groups...</p>
          ) : chatGroups.length > 0 ? (
            <ul>
              {chatGroups.map((group) => (
                <li
                  key={group.id}
                  className="chat-group-item chat-group-item"
                  onClick={() => setSelectedChatGroup(group)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="chat-group-core">
                    <img
                      src={group.pod_image_url || '/images/symbolobinfin.png'}
                      alt={`${group.title} icon`}
                      className="pod-avatar pod-avatar--sm"
                    />
                    <span className="chat-group-name">{group.title}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No accessible chat groups.</p>
          )}
        </div>
      </div>
    );
  }

  // Selected chat view
  return (
    <div className="chat-shell">
      {/* rounded card container */}
      <div className="chat-container">
        <header className="chat-header">
          <button
            className="back-button"
            onClick={() => setSelectedChatGroup(null)}
          >
            Chat List
          </button>
          <h2>
            <b>{selectedChatGroup.title}</b>
          </h2>
        </header>

        <main className="chat-main">
          <section className="chat-messages">
            <MessageList
              messages={messages}
              currentUser={currentUser}
              users={users}
              loading={loading}
              canModerate={permissions?.chatModeration || false}
              chatGroupId={selectedChatGroup.id}
            />
          </section>
        </main>

        <footer className="chat-input-section">
          <ChatInput
            onSendMessage={handleSendMessage}
            chatId={selectedChatGroup.id}
          />
        </footer>
      </div>
    </div>
  );
}
