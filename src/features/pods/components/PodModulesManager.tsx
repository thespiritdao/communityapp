// Pod Modules Manager - Enable/disable features for your pod
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient'; // still needed for realtime subscription
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
  BookOpen,
  GitBranch,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Bot,
} from 'lucide-react';
import PodChatManager from './PodChatManager';
import PodForumManager from './PodForumManager';
import PodKnowledgeManager from './PodKnowledgeManager';

interface PodModulesManagerProps {
  podId: string;
  podName: string;
  isManager: boolean;
  managementHatId?: string;
  membershipHatId?: string;
  /** Called when a module that creates a dedicated tab is toggled */
  onModuleToggle?: (moduleKey: string, enabled: boolean) => void;
}

interface PodModules {
  chat_enabled: boolean;
  forum_enabled: boolean;
  treasury_enabled: boolean;
  events_enabled: boolean;
  bounties_enabled: boolean;
  marketplace_enabled: boolean;
  knowledge_base_enabled: boolean;
  sub_pods_enabled: boolean;
  surveys_enabled: boolean;
  community_agent_enabled: boolean;
  chat_config?: any;
  forum_config?: any;
  treasury_config?: any;
  events_config?: any;
  bounties_config?: any;
  marketplace_config?: any;
  knowledge_base_config?: any;
  sub_pods_config?: any;
  surveys_config?: any;
  community_agent_config?: any;
}

interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  configComponent: string | null;
  /** When true, enabling this module creates a dedicated tab in the pod management menu */
  createsTab?: boolean;
}

const CORE_MODULES: ModuleInfo[] = [
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
    configComponent: 'forum',
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
  {
    key: 'knowledge_base_enabled',
    label: 'Knowledge Base',
    description: 'Create a library of instructional videos and documents',
    icon: BookOpen,
    color: '#2F5D50',
    bgColor: '#E8F1EE',
    configComponent: 'knowledge',
  },
  {
    key: 'sub_pods_enabled',
    label: 'Sub-Pods',
    description: 'Allow pod leaders to create and approve sub-pods within this pod',
    icon: GitBranch,
    color: '#3F7A5A',
    bgColor: '#D1E6DC',
    configComponent: null,
  },
];

const ADDON_MODULES: ModuleInfo[] = [
  {
    key: 'surveys_enabled',
    label: 'Surveys',
    description: 'Create and distribute surveys to your pod members and sub-pods',
    icon: ClipboardCheck,
    color: '#6A5F7A',
    bgColor: '#EDEAF0',
    configComponent: null,
    createsTab: true,
  },
];

const PAID_MODULES: ModuleInfo[] = [
  {
    key: 'community_agent_enabled',
    label: 'Community AI Agent',
    description: 'AI-powered agent that posts daily discussions, replies to mentions, and generates events',
    icon: Bot,
    color: '#7A6E8F',
    bgColor: '#EDEAF0',
    configComponent: null,
    createsTab: true,
  },
];

export default function PodModulesManager({
  podId,
  podName,
  isManager,
  managementHatId,
  membershipHatId,
  onModuleToggle,
}: PodModulesManagerProps) {
  const [modules, setModules] = useState<PodModules>({
    chat_enabled: false,
    forum_enabled: false,
    treasury_enabled: true,
    events_enabled: false,
    bounties_enabled: false,
    marketplace_enabled: false,
    knowledge_base_enabled: false,
    sub_pods_enabled: false,
    surveys_enabled: false,
    community_agent_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [coreExpanded, setCoreExpanded] = useState(false);
  const [addonsExpanded, setAddonsExpanded] = useState(false);
  const [paidExpanded, setPaidExpanded] = useState(false);

  // Load pod modules configuration
  useEffect(() => {
    loadModules();
  }, [podId]);

  const loadModules = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/pods/${podId}/modules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const data = json.modules;

      if (data) {
        setModules({
          chat_enabled: data.chat_enabled ?? false,
          forum_enabled: data.forum_enabled ?? false,
          treasury_enabled: data.treasury_enabled ?? true,
          events_enabled: data.events_enabled ?? false,
          bounties_enabled: data.bounties_enabled ?? false,
          marketplace_enabled: data.marketplace_enabled ?? false,
          knowledge_base_enabled: data.knowledge_base_enabled ?? false,
          sub_pods_enabled: data.sub_pods_enabled ?? false,
          surveys_enabled: data.surveys_enabled ?? false,
          community_agent_enabled: data.community_agent_enabled ?? false,
          chat_config: data.chat_config,
          forum_config: data.forum_config,
          treasury_config: data.treasury_config,
          events_config: data.events_config,
          bounties_config: data.bounties_config,
          marketplace_config: data.marketplace_config,
          knowledge_base_config: data.knowledge_base_config,
          sub_pods_config: data.sub_pods_config,
          surveys_config: data.surveys_config,
          community_agent_config: data.community_agent_config,
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/pods/${podId}/modules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [moduleKey]: enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update module');

      console.log('PodModulesManager: Database updated successfully:', json.modules);

      // Update local state immediately
      setModules((prev) => ({
        ...prev,
        [moduleKey]: enabled,
      }));

      // If enabling configurable modules, expand to show configuration
      if (moduleKey === 'chat_enabled' && enabled) {
        setExpandedModule('chat');
      } else if (moduleKey === 'forum_enabled' && enabled) {
        setExpandedModule('forum');
      } else if (moduleKey === 'knowledge_base_enabled' && enabled) {
        setExpandedModule('knowledge');
      }

      // Notify parent when a tab-creating module is toggled
      if (onModuleToggle) {
        onModuleToggle(moduleKey, enabled);
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

  const renderModuleCard = (module: ModuleInfo) => {
    const Icon = module.icon;
    const isEnabled = modules[module.key as keyof PodModules] as boolean;
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

          {/* Hint for modules that create their own tab */}
          {isEnabled && module.createsTab && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs" style={{ color: '#5F5A54' }}>
                A <strong>{module.label}</strong> tab has been added to your pod menu above.
              </p>
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

        {/* Forum configuration panel */}
        {isExpanded &&
          module.configComponent === 'forum' &&
          modules.forum_enabled && (
            <Card className="mt-4 p-4 bg-gray-50">
              <PodForumManager
                podId={podId}
                podName={podName}
                managementHatId={managementHatId || ''}
                membershipHatId={membershipHatId}
                isManager={isManager}
              />
            </Card>
          )}

        {/* Knowledge Base configuration panel */}
        {isExpanded &&
          module.configComponent === 'knowledge' &&
          modules.knowledge_base_enabled && (
            <div className="mt-4">
              <PodKnowledgeManager
                podId={podId}
                podName={podName}
                managementHatId={managementHatId || ''}
                membershipHatId={membershipHatId}
                isManager={isManager}
              />
            </div>
          )}

      </div>
    );
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
          {/* Core Modules Section */}
          <div>
            <button
              onClick={() => setCoreExpanded(!coreExpanded)}
              className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#5F5A54' }}
              >
                Core
              </span>
              {coreExpanded ? (
                <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
              ) : (
                <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />
              )}
            </button>
            {coreExpanded && (
              <div className="space-y-3 mt-2">
                {CORE_MODULES.map(renderModuleCard)}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" style={{ borderColor: '#E8E4DC' }} />

          {/* Add-Ons Section */}
          <div>
            <button
              onClick={() => setAddonsExpanded(!addonsExpanded)}
              className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#5F5A54' }}
              >
                Add-Ons
              </span>
              {addonsExpanded ? (
                <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
              ) : (
                <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />
              )}
            </button>
            {addonsExpanded && (
              <div className="space-y-3 mt-2">
                {ADDON_MODULES.map(renderModuleCard)}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" style={{ borderColor: '#E8E4DC' }} />

          {/* Paid Section */}
          <div>
            <button
              onClick={() => setPaidExpanded(!paidExpanded)}
              className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#5F5A54' }}
              >
                Paid
              </span>
              {paidExpanded ? (
                <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
              ) : (
                <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />
              )}
            </button>
            {paidExpanded && (
              <div className="space-y-3 mt-2">
                {PAID_MODULES.map(renderModuleCard)}
              </div>
            )}
          </div>
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
