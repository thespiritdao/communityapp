// Pod Chat Manager - Allows pods to create and manage their chat channels
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { useAuthContext } from '@/features/identity';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EnhancedToggle } from '@/components/ui/enhanced-toggle';
import { MessageCircle, Plus, Settings, Trash2 } from 'lucide-react';

interface PodChatManagerProps {
  podId: string;
  podName: string;
  managementHatId: string;
  membershipHatId?: string;
  isManager: boolean;
}

interface ChatGroup {
  id: string;
  title: string;
  required_token: string;
  pod_id: string;
  is_active: boolean;
  access_level: 'managers' | 'members' | 'both';
  created_at: string;
}

export default function PodChatManager({
  podId,
  podName,
  managementHatId,
  membershipHatId,
  isManager,
}: PodChatManagerProps) {
  const { session } = useAuthContext();
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [accessLevel, setAccessLevel] = useState<
    'managers' | 'members' | 'both'
  >('both');

  // Load existing chat groups for this pod
  useEffect(() => {
    loadPodChats();
  }, [podId]);

  const loadPodChats = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_groups')
        .select('*')
        .eq('pod_id', podId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setChatGroups(data || []);
    } catch (error) {
      console.error('Error loading pod chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const createChatGroup = async () => {
    if (!newChatName.trim() || !isManager) return;

    setCreating(true);
    try {
      // Determine which token to use based on access level
      let requiredToken = managementHatId;
      if (accessLevel === 'members' && membershipHatId) {
        requiredToken = membershipHatId;
      } else if (accessLevel === 'both') {
        // For 'both', we might need to create two chat groups or use a different approach
        // For now, use management token as primary
        requiredToken = managementHatId;
      }

      const { data, error } = await supabase
        .from('chat_groups')
        .insert({
          title: newChatName,
          pod_id: podId,
          required_token: requiredToken,
          access_level: accessLevel,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setChatGroups([data, ...chatGroups]);
      setNewChatName('');

      // If access level is 'both', create a second chat group for members
      if (accessLevel === 'both' && membershipHatId) {
        const { data: memberChat } = await supabase
          .from('chat_groups')
          .insert({
            title: `${newChatName} (Members)`,
            pod_id: podId,
            required_token: membershipHatId,
            access_level: 'members',
            is_active: true,
          })
          .select()
          .single();

        if (memberChat) {
          setChatGroups((prev) => [memberChat, ...prev]);
        }
      }
    } catch (error) {
      console.error('Error creating chat group:', error);
    } finally {
      setCreating(false);
    }
  };

  const toggleChatStatus = async (chatId: string, currentStatus: boolean) => {
    if (!isManager) return;

    try {
      const { error } = await supabase
        .from('chat_groups')
        .update({ is_active: !currentStatus })
        .eq('id', chatId);

      if (error) throw error;

      setChatGroups(
        chatGroups.map((chat) =>
          chat.id === chatId ? { ...chat, is_active: !currentStatus } : chat,
        ),
      );
    } catch (error) {
      console.error('Error toggling chat status:', error);
    }
  };

  const deleteChatGroup = async (chatId: string) => {
    if (
      !isManager ||
      !confirm(
        'Are you sure you want to delete this chat? This action cannot be undone.',
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('chat_groups')
        .delete()
        .eq('id', chatId);

      if (error) throw error;

      setChatGroups(chatGroups.filter((chat) => chat.id !== chatId));
    } catch (error) {
      console.error('Error deleting chat group:', error);
    }
  };

  const getAccessLevelLabel = (level: string) => {
    switch (level) {
      case 'managers':
        return 'Leaders';
      case 'members':
        return 'Members';
      case 'both':
        return 'All';
      default:
        return level;
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" style={{ color: '#2F5D50' }} />
          <h4 className="text-lg font-medium">Chat Channels</h4>
        </div>
        {isManager && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreating(!creating)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Channel
          </Button>
        )}
      </div>

      {/* Create New Chat Form */}
      {creating && isManager && (
        <Card
          className="p-4"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="chatName" className="text-sm font-medium">
                Channel Name
              </Label>
              <Input
                id="chatName"
                placeholder={`${podName} Discussion`}
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="accessLevel" className="text-sm font-medium">
                Access Level
              </Label>
              <select
                id="accessLevel"
                className="w-full px-3 py-2 border border-gray-300 rounded-md mt-1 text-sm"
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as any)}
              >
                <option value="both">All</option>
                <option value="managers">Leaders</option>
                {membershipHatId && <option value="members">Members</option>}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={createChatGroup}
                disabled={!newChatName.trim()}
                size="sm"
              >
                Create Channel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  setNewChatName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Chat Groups Table */}
      <div className="space-y-2">
        {chatGroups.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No chat channels created yet</p>
            {isManager && (
              <p className="text-xs mt-1">Click "Add Channel" to create one</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {chatGroups.map((chat) => (
              <Card
                key={chat.id}
                className={`p-3 ${chat.is_active ? 'bg-white' : 'opacity-60 bg-gray-50'} border`}
              >
                <div className="space-y-2">
                  {/* First row: Title and Access Level */}
                  <div className="flex items-center gap-2">
                    <h5 className="font-medium text-sm truncate">
                      {chat.title}
                    </h5>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600 whitespace-nowrap">
                      {getAccessLevelLabel(chat.access_level)}
                    </span>
                  </div>

                  {/* Second row: Status, Toggle, and Delete */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {chat.is_active ? 'Active' : 'Inactive'}
                    </p>

                    {isManager && (
                      <div className="flex items-center gap-2">
                        <EnhancedToggle
                          checked={chat.is_active}
                          onCheckedChange={() =>
                            toggleChatStatus(chat.id, chat.is_active)
                          }
                          size="sm"
                          variant="button"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteChatGroup(chat.id)}
                          className="h-6 w-6 p-0"
                          style={{ color: '#8B3A3A' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#5C1F1F';
                            e.currentTarget.style.backgroundColor = '#F5E6E6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#8B3A3A';
                            e.currentTarget.style.backgroundColor =
                              'transparent';
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      {isManager && chatGroups.length > 0 && (
        <div
          className="p-3 border rounded-md"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <div className="flex gap-2">
            <Settings
              className="h-4 w-4 mt-0.5 flex-shrink-0"
              style={{ color: '#2F5D50' }}
            />
            <div className="text-xs" style={{ color: '#1F453A' }}>
              <p className="font-medium">Tips:</p>
              <p>• Toggle channels on/off instead of deleting them</p>
              <p>• Create separate channels for different access levels</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
