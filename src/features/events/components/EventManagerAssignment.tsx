'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { User, Check, X, AlertTriangle } from 'lucide-react';
import UserTagging from '../../../components/UserTagging';
import { EventService } from '../lib/supabase';
import { supabase } from '../../../utils/supabaseClient';
import type { Event } from '../types/event';

interface EventManagerAssignmentProps {
  event: Event;
  onManagerUpdate?: () => void;
}

export const EventManagerAssignment: React.FC<EventManagerAssignmentProps> = ({
  event,
  onManagerUpdate,
}) => {
  const [managerInput, setManagerInput] = useState('');
  const [assignedManager, setAssignedManager] = useState<string | null>(
    event.manager_address || null,
  );
  const [managerProfile, setManagerProfile] = useState<{
    first_name?: string;
    last_name?: string;
    profile_picture?: string;
    wallet_address: string;
  } | null>(null);
  const [validationStatus, setValidationStatus] = useState<
    'idle' | 'checking' | 'valid' | 'invalid'
  >('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Load existing manager profile on component mount
  useEffect(() => {
    const loadManagerProfile = async () => {
      if (assignedManager) {
        try {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('wallet_address, first_name, last_name, profile_picture')
            .eq('wallet_address', assignedManager.toLowerCase())
            .single();

          setManagerProfile(profileData);
        } catch (error) {
          console.error('Error loading manager profile:', error);
        }
      }
    };

    loadManagerProfile();
  }, [assignedManager]);

  const validateManager = async (walletAddress: string): Promise<boolean> => {
    try {
      setValidationStatus('checking');
      setValidationMessage('Checking manager qualifications...');

      // Get user's token balances
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('wallet_address, first_name, last_name')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      if (!profileData) {
        setValidationMessage('User not found in our system');
        setValidationStatus('invalid');
        return false;
      }

      // Check if user has required event tokens
      const hasRequiredTokens = await checkUserTokens(
        walletAddress,
        event.required_tokens,
      );

      // Check if user has event manager token/hat
      const hasManagerToken = await checkManagerToken(walletAddress);

      if (!hasRequiredTokens) {
        setValidationMessage('Manager does not have the required event tokens');
        setValidationStatus('invalid');
        return false;
      }

      if (!hasManagerToken) {
        setValidationMessage(
          'Manager does not have event management permissions',
        );
        setValidationStatus('invalid');
        return false;
      }

      setValidationMessage(
        `${profileData.first_name} ${profileData.last_name} is qualified to manage this event`,
      );
      setValidationStatus('valid');
      return true;
    } catch (error) {
      console.error('Error validating manager:', error);
      setValidationMessage('Error checking manager qualifications');
      setValidationStatus('invalid');
      return false;
    }
  };

  const checkUserTokens = async (
    walletAddress: string,
    requiredTokens: string[],
  ): Promise<boolean> => {
    // This would integrate with your token checking logic
    // For now, assuming a service exists
    try {
      // Placeholder for actual token checking logic
      // You would check if the user has the required tokens here
      return true; // Simplified for now
    } catch (error) {
      console.error('Error checking user tokens:', error);
      return false;
    }
  };

  const checkManagerToken = async (walletAddress: string): Promise<boolean> => {
    // Check for event manager token/hat
    try {
      // This would check for a specific "Event Manager" token or HAT
      // Placeholder implementation
      return true; // Simplified for now
    } catch (error) {
      console.error('Error checking manager token:', error);
      return false;
    }
  };

  const extractWalletAddress = (mentionText: string): string | null => {
    // Extract wallet address from mention format: @[Display Name](wallet_address)
    const match = mentionText.match(/@\[.*?\]\((.*?)\)/);
    return match ? match[1] : null;
  };

  const handleMentionsChange = async (
    mentions: Array<{ id: string; display: string }>,
  ) => {
    if (mentions.length === 0) {
      setValidationStatus('idle');
      setValidationMessage('');
      return;
    }

    const latestMention = mentions[mentions.length - 1];
    await validateManager(latestMention.id);
  };

  const assignManager = async () => {
    const walletAddress = extractWalletAddress(managerInput);

    if (!walletAddress) {
      setValidationMessage('Please select a valid user from the suggestions');
      setValidationStatus('invalid');
      return;
    }

    try {
      setAssigning(true);

      await EventService.updateEvent(event.id, {
        manager_address: walletAddress,
      });

      setAssignedManager(walletAddress);

      // Fetch manager profile for display
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('wallet_address, first_name, last_name, profile_picture')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      setManagerProfile(profileData);
      setManagerInput('');
      setValidationStatus('idle');
      setValidationMessage('');
      setShowAssignModal(false);

      // Send notification to the assigned manager
      try {
        const { unifiedNotificationService } = await import(
          '@/services/unifiedNotificationService'
        );
        await unifiedNotificationService.createNotification({
          recipient_address: walletAddress,
          sender_address: event.creator_address,
          notification_type: 'bounty_update', // Using existing valid type
          title: 'Event Manager Assignment',
          message: `You have been assigned as a manager for the event "${event.title}".`,
          context_type: 'marketplace',
          context_id: event.id,
          context_url: `/events/manage/${event.id}`,
        });
        console.log('✅ Manager assignment notification sent');
      } catch (notificationError) {
        console.error(
          'Failed to send manager assignment notification:',
          notificationError,
        );
      }

      if (onManagerUpdate) {
        onManagerUpdate();
      }
    } catch (error) {
      console.error('Error assigning manager:', error);
      setValidationMessage('Failed to assign manager');
      setValidationStatus('invalid');
    } finally {
      setAssigning(false);
    }
  };

  const removeManager = async () => {
    try {
      setAssigning(true);

      await EventService.updateEvent(event.id, {
        manager_address: null,
      });

      setAssignedManager(null);
      setManagerProfile(null);

      if (onManagerUpdate) {
        onManagerUpdate();
      }
    } catch (error) {
      console.error('Error removing manager:', error);
    } finally {
      setAssigning(false);
    }
  };

  const getValidationIcon = () => {
    switch (validationStatus) {
      case 'checking':
        return (
          <div
            className="animate-spin w-4 h-4 rounded-full"
            style={{
              border: '2px solid #2F5D50',
              borderTopColor: 'transparent',
            }}
          />
        );
      case 'valid':
        return <Check className="w-4 h-4" style={{ color: '#3F7A5A' }} />;
      case 'invalid':
        return <X className="w-4 h-4" style={{ color: '#8B3A3A' }} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="w-5 h-5 mr-2" />
            Event Managers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignedManager ? (
            <div
              className="flex items-center justify-between p-3 border rounded-lg"
              style={{ backgroundColor: '#E8F1EE' }}
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                  {managerProfile?.profile_picture ? (
                    <img
                      src={managerProfile.profile_picture}
                      alt="Manager"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div>
                  <span className="text-sm font-medium block">
                    {managerProfile?.first_name || managerProfile?.last_name
                      ? `${managerProfile.first_name || ''} ${managerProfile.last_name || ''}`.trim()
                      : `${assignedManager.substring(0, 6)}...${assignedManager.substring(38)}`}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={removeManager}
                disabled={assigning}
              >
                <X className="w-4 h-4 mr-1" />
                Remove
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                No manager assigned to this event.
              </p>
              <Button
                onClick={() => setShowAssignModal(true)}
                className="w-full"
              >
                Add Manager
              </Button>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p>
              <strong>Requirements:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Must have required Pod tokens</li>
              <li>Must have Pod Event Manager token</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Add Manager Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Event Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Assign Event Manager
              </label>
              <p className="text-xs text-gray-600">
                Type @ to mention a user. They must have the required event
                tokens and manager permissions.
              </p>
              <div className="relative">
                <UserTagging
                  value={managerInput}
                  onChange={setManagerInput}
                  placeholder="@mention a user to assign as manager..."
                  onMentionsChange={handleMentionsChange}
                  contextType="events"
                  contextId={event.id}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                  style={
                    { '--tw-ring-color': '#2F5D50' } as React.CSSProperties
                  }
                />
                {validationStatus !== 'idle' && (
                  <div className="absolute right-2 top-2">
                    {getValidationIcon()}
                  </div>
                )}
              </div>
            </div>

            {validationMessage && (
              <div
                className="flex items-center space-x-2 text-sm p-2 rounded"
                style={{
                  backgroundColor:
                    validationStatus === 'valid'
                      ? '#E8F1EE'
                      : validationStatus === 'invalid'
                        ? '#F5E6E6'
                        : '#E8F1EE',
                  color:
                    validationStatus === 'valid'
                      ? '#3F7A5A'
                      : validationStatus === 'invalid'
                        ? '#8B3A3A'
                        : '#2F5D50',
                }}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{validationMessage}</span>
              </div>
            )}

            <div className="text-xs text-gray-500 space-y-1">
              <p>
                <strong>Requirements:</strong>
              </p>
              <ul className="list-disc list-inside">
                <li>Must have all required event tokens</li>
                <li>Must have event manager permissions</li>
                <li>Must be registered in our user system</li>
              </ul>
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowAssignModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={assignManager}
                disabled={validationStatus !== 'valid' || assigning}
                className="flex-1"
              >
                {assigning ? 'Assigning...' : 'Assign Manager'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
