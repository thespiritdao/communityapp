// Pod Modules Manager - Enable/disable features for your pod
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { EnhancedToggle } from '@/components/ui/enhanced-toggle';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Users,
  DollarSign,
  Calendar,
  Trophy,
  ShoppingBag,
  Settings,
  Info,
} from 'lucide-react';
import PodChatManager from './PodChatManager';

interface PodModulesManagerProps {
  podId: string;
  podName: string;
  isManager: boolean;
  managementHatId?: string;
  membershipHatId?: string;
}

interface PodModules {
  chat_enabled: boolean;
  forum_enabled: boolean;
  treasury_enabled: boolean;
  events_enabled: boolean;
  bounties_enabled: boolean;
  marketplace_enabled: boolean;
  chat_config?: any;
  forum_config?: any;
  treasury_config?: any;
  events_config?: any;
  bounties_config?: any;
  marketplace_config?: any;
}

const MODULE_INFO = [
  {
    key: 'chat_enabled',
    label: 'Chat Channels',
    description: 'Enable real-time chat for your pod members',
    icon: MessageCircle,
    color: '#2F5D50',
    bgColor: '#E8F1EE',
    configComponent: 'chat',
  },
  {
    key: 'forum_enabled',
    label: 'Discussion Forum',
    description: 'Create threaded discussions and announcements',
    icon: Users,
    color: '#6A5F7A',
    bgColor: '#EDEAF0',
    configComponent: null,
  },
  {
    key: 'treasury_enabled',
    label: 'Treasury',
    description: 'Manage pod funds and financial operations',
    icon: DollarSign,
    color: '#3F7A5A',
    bgColor: '#D1E6DC',
    configComponent: null,
  },
  {
    key: 'events_enabled',
    label: 'Events',
    description: 'Organize and manage pod events',
    icon: Calendar,
    color: '#C6933F',
    bgColor: '#FAF4EC',
    configComponent: null,
  },
  {
    key: 'bounties_enabled',
    label: 'Bounties',
    description: 'Create and manage bounties for tasks',
    icon: Trophy,
    color: '#C6933F',
    bgColor: '#FAF4EC',
    configComponent: null,
  },
  {
    key: 'marketplace_enabled',
    label: 'Marketplace',
    description: 'Create and sell products in the pod marketplace',
    icon: ShoppingBag,
    color: '#6A5F7A',
    bgColor: '#EDEAF0',
    configComponent: null,
  },
];

export default function PodModulesManager({
  podId,
  podName,
  isManager,
  managementHatId,
  membershipHatId,
}: PodModulesManagerProps) {
  const [modules, setModules] = useState<PodModules>({
    chat_enabled: false,
    forum_enabled: false,
    treasury_enabled: true,
    events_enabled: false,
    bounties_enabled: false,
    marketplace_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Load pod modules configuration
  useEffect(() => {
    loadModules();
  }, [podId]);

  const loadModules = async () => {
    try {
      console.log('PodModulesManager: Loading modules for pod:', podId);

      let { data, error } = await supabase
        .from('pod_modules')
        .select('*')
        .eq('pod_id', podId)
        .single();

      console.log('PodModulesManager: Raw database response:', { data, error });

      if (error && error.code === 'PGRST116') {
        // No modules found, create default
        console.log('PodModulesManager: No modules found, creating defaults');
        const { data: newModules, error: insertError } = await supabase
          .from('pod_modules')
          .insert({
            pod_id: podId,
            treasury_enabled: true,
            chat_enabled: false,
            forum_enabled: false,
            events_enabled: false,
            bounties_enabled: false,
            marketplace_enabled: false,
          })
          .select()
          .single();

        if (!insertError && newModules) {
          data = newModules;
          console.log('PodModulesManager: Created new modules:', data);
        } else {
          console.error(
            'PodModulesManager: Error creating modules:',
            insertError,
          );
        }
      } else if (error) {
        console.error('PodModulesManager: Database error:', error);
        throw error;
      }

      if (data) {
        console.log('PodModulesManager: Setting modules from database:', data);
        setModules({
          chat_enabled: data.chat_enabled ?? false,
          forum_enabled: data.forum_enabled ?? false,
          treasury_enabled: data.treasury_enabled ?? true,
          events_enabled: data.events_enabled ?? false,
          bounties_enabled: data.bounties_enabled ?? false,
          marketplace_enabled: data.marketplace_enabled ?? false,
          chat_config: data.chat_config,
          forum_config: data.forum_config,
          treasury_config: data.treasury_config,
          events_config: data.events_config,
          bounties_config: data.bounties_config,
          marketplace_config: data.marketplace_config,
        });
      } else {
        console.warn('PodModulesManager: No data received, using defaults');
        setModules({
          chat_enabled: false,
          forum_enabled: false,
          treasury_enabled: true,
          events_enabled: false,
          bounties_enabled: false,
          marketplace_enabled: false,
        });
      }
    } catch (error) {
      console.error('PodModulesManager: Error loading pod modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    if (!isManager) return;

    console.log('PodModulesManager: Toggling module', {
      moduleKey,
      enabled,
      podId,
    });
    setSaving(true);

    try {
      const updateData: any = {};
      updateData[moduleKey] = enabled;
      updateData['updated_at'] = new Date().toISOString();

      console.log('PodModulesManager: Updating with data:', updateData);

      const { data, error } = await supabase
        .from('pod_modules')
        .update(updateData)
        .eq('pod_id', podId)
        .select();

      if (error) {
        console.error('PodModulesManager: Database error:', error);
        throw error;
      }

      console.log('PodModulesManager: Database updated successfully:', data);

      // Update local state immediately
      setModules((prev) => ({
        ...prev,
        [moduleKey]: enabled,
      }));

      // If enabling chat, expand it to show configuration
      if (moduleKey === 'chat_enabled' && enabled) {
        setExpandedModule('chat');
      }

      console.log('PodModulesManager: Module toggle completed successfully');
    } catch (error) {
      console.error('PodModulesManager: Error updating module:', error);
      // Revert the UI state on error
      setModules((prev) => ({
        ...prev,
        [moduleKey]: !enabled,
      }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Pod Modules
              </CardTitle>
              <CardDescription>
                Enable or disable features for {podName}
              </CardDescription>
            </div>
            {!isManager && <Badge variant="secondary">View Only</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {MODULE_INFO.map((module) => {
            const Icon = module.icon;
            const isEnabled = modules[
              module.key as keyof PodModules
            ] as boolean;
            const isExpanded = expandedModule === module.configComponent;

            return (
              <div key={module.key} className="space-y-3">
                <Card
                  className="p-4"
                  style={{
                    backgroundColor: isEnabled ? module.bgColor : '#f9fafb',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <div
                        className="mt-1"
                        style={{ color: isEnabled ? module.color : '#9ca3af' }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={module.key}
                          className="text-base font-medium cursor-pointer"
                        >
                          {module.label}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {module.description}
                        </p>
                      </div>
                    </div>
                    <EnhancedToggle
                      id={module.key}
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        toggleModule(module.key, checked)
                      }
                      disabled={!isManager || saving}
                      size="md"
                      variant="button"
                    />
                  </div>

                  {/* Show configuration button for enabled modules with config */}
                  {isEnabled && module.configComponent && (
                    <div className="mt-3 pt-3 border-t">
                      <button
                        onClick={() =>
                          setExpandedModule(
                            isExpanded ? null : module.configComponent,
                          )
                        }
                        className="text-sm text-primary hover:underline"
                      >
                        {isExpanded ? 'Hide' : 'Configure'} {module.label}
                      </button>
                    </div>
                  )}
                </Card>

                {/* Expanded configuration panel */}
                {isExpanded &&
                  module.configComponent === 'chat' &&
                  modules.chat_enabled && (
                    <Card className="mt-4 p-4 bg-gray-50">
                      <PodChatManager
                        podId={podId}
                        podName={podName}
                        managementHatId={managementHatId || ''}
                        membershipHatId={membershipHatId}
                        isManager={isManager}
                      />
                    </Card>
                  )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Info card about modules */}
      <Card style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Info
              className="h-5 w-5 mt-0.5 flex-shrink-0"
              style={{ color: '#2F5D50' }}
            />
            <div className="text-sm space-y-2">
              <p className="font-medium" style={{ color: '#1F453A' }}>
                About Pod Modules
              </p>
              <ul className="space-y-1" style={{ color: '#2F5D50' }}>
                <li>• Modules can be enabled or disabled at any time</li>
                <li>• Only pod managers can change module settings</li>
                <li>• Disabling a module doesn't delete its data</li>
                <li>• Some modules may require additional configuration</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
