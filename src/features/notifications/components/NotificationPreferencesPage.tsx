'use client';

import { useState, useEffect } from 'react';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { notificationPreferencesService } from '@/services/notificationPreferencesService';
import type { NotificationPreferences } from '@/services/notificationPreferencesService';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Bell,
  BellOff,
  Clock,
  Sun,
  Moon,
  Package,
  Vote,
  Target,
  MessageSquare,
  Calendar,
  ShoppingCart,
  Loader2,
} from 'lucide-react';

export const NotificationPreferencesPage: React.FC = () => {
  const { address, isInitializing } = useCDPStatus();
  const { toast } = useToast();
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (address) {
      loadPreferences();
    }
  }, [address]);

  const loadPreferences = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const prefs =
        await notificationPreferencesService.getPreferences(address);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      toast({
        title: 'Error loading preferences',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!address || !preferences) return;

    setSaving(true);
    try {
      await notificationPreferencesService.updatePreferences(
        address,
        preferences,
      );
      toast({
        title: 'Preferences saved',
        description: 'Your notification preferences have been updated',
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
      toast({
        title: 'Error saving preferences',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!address) return;

    if (!confirm('Are you sure you want to reset all preferences to defaults?'))
      return;

    setSaving(true);
    try {
      const defaults =
        await notificationPreferencesService.resetToDefaults(address);
      setPreferences(defaults);
      toast({
        title: 'Preferences reset',
        description: 'All preferences have been reset to defaults',
      });
    } catch (error) {
      console.error('Failed to reset preferences:', error);
      toast({
        title: 'Error resetting preferences',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (
    key: keyof NotificationPreferences,
    value: boolean | string,
  ) => {
    if (!preferences) return;
    setPreferences({ ...preferences, [key]: value });
  };

  // Show loading while CDP initializes
  if (isInitializing) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
          <p>Connecting wallet...</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
          <BellOff size={48} className="text-gray-400 mb-4" />
          <p className="text-lg">
            Please connect your wallet to manage notification preferences.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
          <p>Loading preferences...</p>
        </div>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[300px]">
          <p>Failed to load preferences. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{
        backgroundImage: "url('/images/chatbg.png')",
        backgroundColor: '#f5f4ed',
      }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={32} />
            <h1 className="text-3xl font-bold">Notification Preferences</h1>
          </div>
        </div>

        {/* Global Settings */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Bell size={20} />
            Global Settings
          </h2>
          <div className="space-y-4">
            <PreferenceToggle
              label="Enable all notifications"
              description="Master toggle for all notifications"
              checked={preferences.enabled}
              onChange={(checked) => updatePreference('enabled', checked)}
            />
            <PreferenceToggle
              label="Desktop notifications"
              description="Show browser notifications"
              checked={preferences.desktop_enabled}
              onChange={(checked) =>
                updatePreference('desktop_enabled', checked)
              }
              disabled={!preferences.enabled}
            />
            <PreferenceToggle
              label="Sound notifications"
              description="Play sound on new notification"
              checked={preferences.sound_enabled}
              onChange={(checked) => updatePreference('sound_enabled', checked)}
              disabled={!preferences.enabled}
            />
          </div>
        </Card>

        {/* Quiet Hours */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock size={20} />
            Quiet Hours
          </h2>
          <div className="space-y-4">
            <PreferenceToggle
              label="Enable quiet hours"
              description="Pause non-urgent notifications during quiet hours"
              checked={preferences.quiet_hours_enabled}
              onChange={(checked) =>
                updatePreference('quiet_hours_enabled', checked)
              }
              disabled={!preferences.enabled}
            />
            {preferences.quiet_hours_enabled && (
              <div className="ml-8 space-y-3 mt-4">
                <div className="flex items-center gap-4">
                  <Moon size={16} className="text-gray-500" />
                  <Label className="w-20">Start:</Label>
                  <input
                    type="time"
                    value={preferences.quiet_hours_start}
                    onChange={(e) =>
                      updatePreference('quiet_hours_start', e.target.value)
                    }
                    className="border rounded px-3 py-2"
                    disabled={!preferences.enabled}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <Sun size={16} className="text-gray-500" />
                  <Label className="w-20">End:</Label>
                  <input
                    type="time"
                    value={preferences.quiet_hours_end}
                    onChange={(e) =>
                      updatePreference('quiet_hours_end', e.target.value)
                    }
                    className="border rounded px-3 py-2"
                    disabled={!preferences.enabled}
                  />
                </div>
                <p className="text-sm text-gray-600 ml-8">
                  Urgent notifications will still be delivered during quiet
                  hours
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Pod Notifications */}
        <NotificationCategoryCard
          title="Pod Notifications"
          icon={<Package size={20} />}
          categoryEnabled={preferences.category_pod}
          onCategoryToggle={(checked) =>
            updatePreference('category_pod', checked)
          }
          globalEnabled={preferences.enabled}
          preferences={[
            {
              key: 'pod_membership_invitation',
              label: 'Pod membership invitations',
              priority: 'Medium',
            },
            {
              key: 'pod_membership_application',
              label: 'Membership applications',
              priority: 'High',
            },
            {
              key: 'pod_application_status',
              label: 'Application status updates',
              priority: 'Medium',
            },
            {
              key: 'pod_member_added',
              label: 'Member added/removed',
              priority: 'Medium',
            },
            {
              key: 'pod_approval_required',
              label: 'Pod approval requests',
              priority: 'High',
            },
            {
              key: 'pod_leadership_invitation',
              label: 'Leadership invitations',
              priority: 'High',
            },
          ]}
          values={preferences}
          onChange={setPreferences}
        />

        {/* Governance Notifications */}
        <NotificationCategoryCard
          title="Governance Notifications"
          icon={<Vote size={20} />}
          categoryEnabled={preferences.category_governance}
          onCategoryToggle={(checked) =>
            updatePreference('category_governance', checked)
          }
          globalEnabled={preferences.enabled}
          preferences={[
            {
              key: 'governance_proposal_created',
              label: 'New proposals created',
              priority: 'Medium',
            },
            {
              key: 'governance_proposal_mentioned',
              label: 'Proposal mentions',
              priority: 'High',
            },
            {
              key: 'governance_voting_reminder_48h',
              label: 'Voting reminders (48h before)',
              priority: 'High',
            },
            {
              key: 'governance_voting_reminder_24h',
              label: 'Voting reminders (24h before)',
              priority: 'High',
            },
            {
              key: 'governance_voting_reminder_6h',
              label: 'Voting reminders (6h before)',
              priority: 'Urgent',
            },
            {
              key: 'governance_voting_reminder_1h',
              label: 'Voting reminders (1h before)',
              priority: 'Urgent',
            },
          ]}
          values={preferences}
          onChange={setPreferences}
        />

        {/* Bounty Notifications */}
        <NotificationCategoryCard
          title="Bounty Notifications"
          icon={<Target size={20} />}
          categoryEnabled={preferences.category_bounty}
          onCategoryToggle={(checked) =>
            updatePreference('category_bounty', checked)
          }
          globalEnabled={preferences.enabled}
          preferences={[
            {
              key: 'bounty_work_submitted',
              label: 'Work submitted',
              priority: 'High',
            },
            {
              key: 'bounty_work_reviewed',
              label: 'Work reviewed',
              priority: 'High',
            },
            {
              key: 'bounty_dispute_filed',
              label: 'Dispute filed',
              priority: 'High',
            },
            {
              key: 'bounty_evidence_submitted',
              label: 'Evidence submitted',
              priority: 'Medium',
            },
            {
              key: 'bounty_dispute_resolved',
              label: 'Dispute resolved',
              priority: 'High',
            },
            {
              key: 'bounty_cancelled',
              label: 'Bounty cancelled',
              priority: 'High',
            },
          ]}
          values={preferences}
          onChange={setPreferences}
        />

        {/* Chat & Forum Notifications */}
        <NotificationCategoryCard
          title="Chat & Forum Notifications"
          icon={<MessageSquare size={20} />}
          categoryEnabled={
            preferences.category_chat && preferences.category_forum
          }
          onCategoryToggle={(checked) => {
            updatePreference('category_chat', checked);
            updatePreference('category_forum', checked);
          }}
          globalEnabled={preferences.enabled}
          preferences={[
            {
              key: 'chat_direct_message',
              label: 'Direct messages',
              priority: 'High',
            },
            {
              key: 'forum_user_mentioned',
              label: 'Forum mentions',
              priority: 'Medium',
            },
            {
              key: 'forum_thread_reply',
              label: 'Replies to my threads',
              priority: 'Medium',
            },
            {
              key: 'forum_participating_reply',
              label: 'Replies to participating threads',
              priority: 'Low',
            },
          ]}
          values={preferences}
          onChange={setPreferences}
        />

        {/* Event Notifications */}
        <NotificationCategoryCard
          title="Event Notifications"
          icon={<Calendar size={20} />}
          categoryEnabled={preferences.category_event}
          onCategoryToggle={(checked) =>
            updatePreference('category_event', checked)
          }
          globalEnabled={preferences.enabled}
          preferences={[
            {
              key: 'event_registration_confirmation',
              label: 'Registration confirmations',
              priority: 'Medium',
            },
            {
              key: 'event_reminder_7d',
              label: 'Event reminders (7 days before)',
              priority: 'Medium',
            },
            {
              key: 'event_reminder_day_of',
              label: 'Event reminders (day of)',
              priority: 'High',
            },
            {
              key: 'event_checkin_prompt',
              label: 'Check-in prompts',
              priority: 'High',
            },
            {
              key: 'event_updated',
              label: 'Event updates',
              priority: 'Medium',
            },
            {
              key: 'event_cancelled',
              label: 'Event cancellations',
              priority: 'High',
            },
            {
              key: 'event_completion_nft',
              label: 'Completion NFT ready',
              priority: 'High',
            },
          ]}
          values={preferences}
          onChange={setPreferences}
        />

        {/* Marketplace Notifications */}
        <NotificationCategoryCard
          title="Marketplace Notifications"
          icon={<ShoppingCart size={20} />}
          categoryEnabled={preferences.category_marketplace}
          onCategoryToggle={(checked) =>
            updatePreference('category_marketplace', checked)
          }
          globalEnabled={preferences.enabled}
          preferences={[
            {
              key: 'marketplace_purchase_fulfillment',
              label: 'Purchase requires fulfillment',
              priority: 'High',
            },
            {
              key: 'marketplace_order_status',
              label: 'Order status updates',
              priority: 'High',
            },
            {
              key: 'marketplace_review_mention',
              label: 'Mentions in reviews',
              priority: 'Medium',
            },
          ]}
          values={preferences}
          onChange={setPreferences}
        />

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Button
            onClick={handleSave}
            disabled={saving || !preferences.enabled}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
};

// Helper component for individual preference toggle
const PreferenceToggle: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ label, description, checked, onChange, disabled = false }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex-1">
      <Label className={disabled ? 'text-gray-400' : ''}>{label}</Label>
      {description && (
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      )}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
  </div>
);

// Helper component for category cards
const NotificationCategoryCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  categoryEnabled: boolean;
  onCategoryToggle: (checked: boolean) => void;
  globalEnabled: boolean;
  preferences: Array<{ key: string; label: string; priority: string }>;
  values: NotificationPreferences;
  onChange: (values: NotificationPreferences) => void;
}> = ({
  title,
  icon,
  categoryEnabled,
  onCategoryToggle,
  globalEnabled,
  preferences,
  values,
  onChange,
}) => {
  const isDisabled = !globalEnabled;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <Switch
          checked={categoryEnabled}
          onCheckedChange={onCategoryToggle}
          disabled={isDisabled}
        />
      </div>
      <div
        className={`space-y-3 ${!categoryEnabled || isDisabled ? 'opacity-50' : ''}`}
      >
        {preferences.map(({ key, label, priority }) => (
          <div key={key} className="flex items-center justify-between py-2">
            <div className="flex-1">
              <Label
                className={
                  !categoryEnabled || isDisabled ? 'text-gray-400' : ''
                }
              >
                {label}
              </Label>
              <span className="text-xs text-gray-500 ml-2">({priority})</span>
            </div>
            <Switch
              checked={(values as any)[key] ?? true}
              onCheckedChange={(checked) =>
                onChange({ ...values, [key]: checked })
              }
              disabled={!categoryEnabled || isDisabled}
            />
          </div>
        ))}
      </div>
    </Card>
  );
};
