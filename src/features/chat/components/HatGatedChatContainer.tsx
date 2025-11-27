"use client";

import { useAuthContext } from '@/features/identity';
import type React from "react";
import { useEffect, useState } from "react";
import '@/features/chat/styles/Chat.css';
import { useAccount } from "wagmi";
import { supabase } from "@/utils/supabaseClient";
import { useHatPermissions } from "@/hooks/useHatPermissions";
import type { Message, UserProfile, ChatGroup } from "../types";
import ChatInput from "./ChatInput";
import MessageList from "./MessageList";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, Lock, Crown } from "lucide-react";
import { extractMentionedWalletsEnhanced } from '@/utils/mentions';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { useEligibility } from '../../pods/hooks/useEligibility';

interface HatGatedChatContainerProps {
  chatGroupId?: string;
  requiredHat?: string; // Optional specific HAT requirement
  podId?: string; // Optional pod-specific chat
  eligibilityRoleId?: string; // Optional role-based eligibility check
}

export const HatGatedChatContainer: React.FC<HatGatedChatContainerProps> = ({
  chatGroupId,
  requiredHat,
  podId,
  eligibilityRoleId
}) => {
  const { address } = useAccount();
  const { session, isAuthenticated, signIn } = useAuthContext();
  const { createNotification } = useUnifiedNotifications();
  
  // HAT-based permissions
  const {
    canAccessChat,
    userRoles,
    userHats,
    isPodLeader,
    isLoading: permissionsLoading,
    error: permissionsError,
    hasHat
  } = useHatPermissions();

  // Eligibility-based permissions
  const {
    checkUserEligibility,
    loading: eligibilityLoading,
    error: eligibilityError
  } = useEligibility();

  // State
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [selectedChatGroup, setSelectedChatGroup] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [eligibilityCheckResult, setEligibilityCheckResult] = useState<any>(null);

  // --- NEW: Pod metadata (id -> { name, image_url }) ---
  const [podsMeta, setPodsMeta] = useState<Record<string, { name: string; image_url: string | null }>>({});

  const fetchPodsMeta = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const { data, error } = await supabase
        .from('pods')
        .select('id, name, image_url, image')
        .in('id', ids);

      if (error) throw error;

      const map: Record<string, { name: string; image_url: string | null }> = {};
      (data || []).forEach((p: any) => {
        map[p.id] = {
          name: p?.name ?? p?.id,
          image_url: p?.image_url ?? p?.image ?? null,
        };
      });
      setPodsMeta(prev => ({ ...prev, ...map }));
    } catch (e) {
      console.error('fetchPodsMeta error:', e);
    }
  };
  // --- /NEW ---

  // Enhanced access check with eligibility rules
  const checkAccess = async (): Promise<boolean> => {
    // Basic chat access permission
    if (!canAccessChat) {
      console.log('❌ Chat access denied: No basic chat permission');
      return false;
    }

    // Specific HAT requirement
    if (requiredHat && !hasHat(requiredHat)) {
      console.log('❌ Chat access denied: Missing required HAT:', requiredHat);
      return false;
    }

    // Role-based eligibility check
    if (eligibilityRoleId && address) {
      try {
        const eligibilityResult = await checkUserEligibility(podId || '', eligibilityRoleId);
        setEligibilityCheckResult(eligibilityResult);
        
        if (!eligibilityResult?.eligible) {
          console.log('❌ Chat access denied: Failed eligibility requirements for role:', eligibilityRoleId);
          return false;
        }
        console.log('✅ Chat access granted: User meets eligibility requirements');
      } catch (error) {
        console.error('Error checking eligibility:', error);
        return false;
      }
    }

    // Pod-specific access (user must be member of the pod)
    if (podId) {
      const podRole = userRoles.find(role => role.podId === podId);
      if (!podRole) {
        console.log('❌ Chat access denied: Not a member of pod:', podId);
        return false;
      }
    }

    return true;
  };

  // Fetch current user data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!address) return;

      try {
        const { data: sessionData, error: sessionError } = await getCurrentSession();
        if (sessionError || !sessionData.session) {
          throw new Error("No authenticated user found");
        }

        const userId = sessionData.session.user.id;
        const { data: userProfile, error: userProfileError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (userProfileError || !userProfile) {
          throw new Error("User profile not found");
        }

        setCurrentUser(userProfile);
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [address]);

  // Check access when permissions are loaded
  useEffect(() => {
    const performAccessCheck = async () => {
      if (!permissionsLoading && !permissionsError && !eligibilityLoading) {
        const hasAccess = await checkAccess();
        setAccessDenied(!hasAccess);
        
        if (!hasAccess) {
          console.log('❌ Chat access denied. User permissions:', {
            canAccessChat,
            userRoles: userRoles.length,
            userHats: userHats.length,
            requiredHat,
            podId,
            eligibilityRoleId,
            eligibilityResult: eligibilityCheckResult
          });
        }
      }
    };
    
    performAccessCheck();
  }, [canAccessChat, userRoles, userHats, requiredHat, podId, eligibilityRoleId, permissionsLoading, permissionsError, eligibilityLoading]);

  // Fetch chat groups based on HAT permissions
  useEffect(() => {
    if (!selectedChatGroup && !accessDenied && currentUser?.wallet_address) {
      const fetchHatGatedChatGroups = async () => {
        try {
          setLoading(true);

          // Get available chat groups based on user's HATs
          const availableGroups: ChatGroup[] = [];

          // General chat (requires basic chat access)
          if (canAccessChat) {
            availableGroups.push({
              id: 'general',
              name: 'General Chat',
              description: 'General community discussion',
              required_token: null,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }

          // Pod-specific chats based on user's roles
          for (const role of userRoles) {
            if (role.podId) {
              availableGroups.push({
                id: `pod-${role.podId}`,
                name: `${role.podId.charAt(0).toUpperCase() + role.podId.slice(1)} Pod Chat`,
                description: `Private chat for ${role.name}`,
                required_token: role.hatId,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            }
          }

          // Leadership chat (for pod leaders only)
          if (isPodLeader) {
            availableGroups.push({
              id: 'leadership',
              name: 'Pod Leaders Chat',
              description: 'Private chat for pod leaders',
              required_token: 'leadership',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }

          setChatGroups(availableGroups);

          // --- NEW: fetch pod metadata for any pod groups we just built ---
          const podIds = Array.from(new Set(
            availableGroups
              .filter(g => g.id.startsWith('pod-'))
              .map(g => g.id.slice(4))
          ));
          await fetchPodsMeta(podIds);
          // --- /NEW ---

          // Auto-select based on context
          if (chatGroupId) {
            const targetGroup = availableGroups.find(g => g.id === chatGroupId);
            if (targetGroup) {
              setSelectedChatGroup(targetGroup);
            }
          } else if (podId) {
            const podGroup = availableGroups.find(g => g.id === `pod-${podId}`);
            if (podGroup) {
              setSelectedChatGroup(podGroup);
            }
          } else {
            // Default to general chat
            const generalGroup = availableGroups.find(g => g.id === 'general');
            if (generalGroup) {
              setSelectedChatGroup(generalGroup);
            }
          }

        } catch (error) {
          console.error("Error fetching HAT-gated chat groups:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchHatGatedChatGroups();
    }
  }, [selectedChatGroup, accessDenied, currentUser, canAccessChat, userRoles, isPodLeader, chatGroupId, podId]);

  // Fetch messages for selected chat group
  useEffect(() => {
    if (selectedChatGroup && !accessDenied) {
      const fetchMessages = async () => {
        setLoading(true);
        try {
          const { data: messagesData, error } = await supabase
            .from("messages")
            .select("*")
            .eq("chat_group_id", selectedChatGroup.id)
            .order("created_at", { ascending: true });

          if (error) throw error;

          setMessages(messagesData || []);

          // Get unique user IDs from messages
          const userIds = [...new Set(messagesData?.map(m => m.user_id) || [])];
          
          if (userIds.length > 0) {
            const { data: usersData, error: usersError } = await supabase
              .from("user_profiles")
              .select("*")
              .in("user_id", userIds);

            if (usersError) throw usersError;
            setUsers(usersData || []);
          }

        } catch (error) {
          console.error("Error fetching messages:", error);
        } finally {
          setLoading(false);
        }
      };

      fetchMessages();

      // Set up real-time subscription
      const channel = supabase
        .channel(`chat-${selectedChatGroup.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_group_id=eq.${selectedChatGroup.id}` },
          async (payload) => {
            const newMessage = payload.new as Message;
            setMessages(prev => [...prev, newMessage]);

            // Handle mentions
            const mentionedWallets = extractMentionedWalletsEnhanced(newMessage.content);
            if (mentionedWallets.length > 0 && currentUser) {
              for (const wallet of mentionedWallets) {
                await createNotification({
                  recipient_address: wallet,
                  sender_address: currentUser.wallet_address,
                  notification_type: 'user_mentioned',
                  category: 'general',
                  title: 'You were mentioned in a chat',
                  message: `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() + ' mentioned you in a HAT-gated chat',
                  context_type: 'chat',
                  context_id: selectedChatGroup.id,
                  context_url: `/chat/${selectedChatGroup.id}`,
                  priority: 'medium'
                });
              }
            }

            // Add sender to users if not already present
            if (!users.find(u => u.user_id === newMessage.user_id)) {
              const { data: userData } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("user_id", newMessage.user_id)
                .single();
              
              if (userData) {
                setUsers(prev => [...prev, userData]);
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedChatGroup, accessDenied, currentUser, users, createNotification]);

  // Handle sending messages
  const handleSendMessage = async (content: string) => {
    if (!currentUser || !selectedChatGroup || accessDenied) return;

    try {
      const { error } = await supabase
        .from("messages")
        .insert({
          content,
          user_id: currentUser.user_id,
          chat_group_id: selectedChatGroup.id,
          wallet_address: currentUser.wallet_address
        });

      if (error) throw error;
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Loading state
  if (permissionsLoading || loading || eligibilityLoading) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading chat permissions...</p>
          {eligibilityLoading && (
            <p className="text-sm text-gray-500 mt-2">Checking eligibility requirements...</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Access denied
  if (accessDenied || permissionsError || eligibilityError) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-6 w-6 text-red-500" />
            Chat Access Restricted
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-gray-600">
              You don't have the required permissions to access this chat.
            </p>
            
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">Required Access:</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Valid HAT token for chat access</li>
                {requiredHat && <li>• Specific HAT: {requiredHat}</li>}
                {podId && <li>• Membership in {podId} pod</li>}
                {eligibilityRoleId && (
                  <li>• Meet eligibility requirements for role access</li>
                )}
              </ul>
            </div>

            {/* Show eligibility check results if available */}
            {eligibilityCheckResult && !eligibilityCheckResult.eligible && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <h4 className="font-medium text-red-800 mb-2">Eligibility Requirements Not Met:</h4>
                <div className="text-sm text-red-700">
                  <p className="mb-2">{eligibilityCheckResult.evaluation?.overallResult?.message}</p>
                  {eligibilityCheckResult.evaluation?.overallResult && (
                    <p>Requirements passed: {eligibilityCheckResult.evaluation.overallResult.passed}/{eligibilityCheckResult.evaluation.overallResult.total}</p>
                  )}
                </div>
              </div>
            )}

            {userHats.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Your Current HATs:</h4>
                <div className="flex flex-wrap gap-2">
                  {userRoles.map((role, index) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {role.isLeaderRole ? (
                        <Crown className="h-3 w-3" />
                      ) : (
                        <Users className="h-3 w-3" />
                      )}
                      {role.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {permissionsError && (
              <div className="bg-gray-50 border p-3 rounded text-sm text-gray-600">
                Error: {permissionsError}
              </div>
            )}
            
            {eligibilityError && (
              <div className="bg-gray-50 border p-3 rounded text-sm text-gray-600">
                Eligibility Error: {eligibilityError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- NEW: derive selected pod meta for header ---
  const selectedPodId =
    selectedChatGroup?.id?.startsWith('pod-') ? selectedChatGroup.id.slice(4) : null;
  const selectedPodMeta = selectedPodId ? podsMeta[selectedPodId] : null;
  // --- /NEW ---

  // Main chat interface
  return (
    <Card className="chat-shell flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="chat-title-row">
          {selectedPodMeta?.image_url ? (
            <img
              src={selectedPodMeta.image_url}
              alt=""
              className="pod-avatar pod-avatar--lg"
            />
          ) : (
            <Shield className="h-5 w-5" style={{ color: '#3F7A5A' }} />
          )}
          <span>
            {selectedPodMeta?.name ?? selectedChatGroup?.name ?? "Chat"}
          </span>
          {selectedChatGroup?.required_token && (
            <Badge variant="outline" className="ml-2">
              HAT Gated
            </Badge>
          )}
        </CardTitle>

        {chatGroups.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {chatGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedChatGroup(group)}
                className={`group-pill ${selectedChatGroup?.id === group.id ? 'group-pill--active' : ''}`}
              >
                {group.id.startsWith('pod-') && podsMeta[group.id.slice(4)]?.image_url ? (
                  <img
                    src={podsMeta[group.id.slice(4)]!.image_url!}
                    alt=""
                    className="pod-avatar pod-avatar--sm"
                  />
                ) : null}
                {group.id.startsWith('pod-') && podsMeta[group.id.slice(4)]?.name
                  ? podsMeta[group.id.slice(4)]!.name
                  : group.name}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <div className="flex-1 overflow-hidden">
          <MessageList 
            messages={messages} 
            users={users} 
            currentUser={currentUser} 
          />
        </div>
        
        <div className="border-t p-4">
          <ChatInput 
            onSendMessage={handleSendMessage}
            disabled={!selectedChatGroup || accessDenied}
          />
        </div>
      </CardContent>
    </Card>
  );
};
