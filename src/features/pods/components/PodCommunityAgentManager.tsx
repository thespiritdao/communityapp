// Pod Community Agent Manager - Configure AI agent for your pod
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Clock,
  MessageSquare,
  FileText,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  CalendarDays,
} from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import AgentEventDrafts from './AgentEventDrafts';

interface PodCommunityAgentManagerProps {
  podId: string;
  podName: string;
  isManager: boolean;
  currentConfig?: any;
}

interface ForumCategory {
  id: string;
  name: string;
  pod_id: string;
}

interface ChatGroup {
  id: string;
  title: string;
  pod_id: string;
}

interface SubscriptionInfo {
  isActive: boolean;
  expiresAt: string | null;
  isExempt: boolean;
}

const DEFAULT_CONFIG = {
  agent_name: 'Community Agent',
  daily_post_hour_utc: 12,
  daily_category_id: null as string | null,
  events_category_id: null as string | null,
  persona: 'default',
  system_prompt: '',
  auto_publish_events: false,
  chat_group_ids: [] as string[],
};

export default function PodCommunityAgentManager({
  podId,
  podName,
  isManager,
  currentConfig,
}: PodCommunityAgentManagerProps) {
  const evmAddress = useEvmAddress();
  const walletAddress = evmAddress?.evmAddress || '';
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, ...(currentConfig || {}) });
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [corpusStats, setCorpusStats] = useState<{ vectorCount: number } | null>(null);

  // Load forum categories, chat groups, subscription, and corpus stats
  useEffect(() => {
    loadData();
  }, [podId]);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Load forum categories for this pod
      const { data: cats } = await supabase
        .from('forum_categories')
        .select('id, name, pod_id')
        .eq('pod_id', podId)
        .eq('is_active', true);
      if (cats) setCategories(cats);

      // Load chat groups for this pod
      const { data: groups } = await supabase
        .from('chat_groups')
        .select('id, title, pod_id')
        .eq('pod_id', podId)
        .eq('is_active', true);
      if (groups) setChatGroups(groups);

      // Load subscription status
      try {
        const subRes = await fetch(`/api/community-agent/subscribe?podId=${podId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubscription(subData);
        }
      } catch {
        // Subscription endpoint may not exist yet
      }

      // Load corpus stats
      try {
        const corpusRes = await fetch(`/api/community-agent/corpus?podId=${podId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (corpusRes.ok) {
          const corpusData = await corpusRes.json();
          setCorpusStats(corpusData);
        }
      } catch {
        // Corpus endpoint may not exist yet
      }
    } catch (error) {
      console.error('PodCommunityAgentManager: Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = useCallback(async () => {
    if (!isManager) return;
    setSaving(true);
    setSaved(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/community-agent/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ podId, config }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save config');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('PodCommunityAgentManager: Error saving config:', error);
    } finally {
      setSaving(false);
    }
  }, [podId, config, isManager]);

  const updateField = (key: string, value: any) => {
    setConfig((prev: typeof DEFAULT_CONFIG) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Subscription Status */}
      {subscription && !subscription.isExempt && (
        <div
          className="flex items-center justify-between p-3 rounded-lg"
          style={{
            backgroundColor: subscription.isActive ? '#D1E6DC' : '#FDE8E8',
            borderColor: subscription.isActive ? '#3F7A5A' : '#E53E3E',
            borderWidth: 1,
          }}
        >
          <div className="flex items-center gap-2">
            {subscription.isActive ? (
              <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
            ) : (
              <AlertCircle className="h-4 w-4" style={{ color: '#E53E3E' }} />
            )}
            <span className="text-sm font-medium">
              {subscription.isActive
                ? `Active until ${new Date(subscription.expiresAt!).toLocaleDateString()}`
                : 'Subscription required — 25 $SYSTEM/month'}
            </span>
          </div>
          {!subscription.isActive && (
            <Button size="sm" variant="default">
              Activate
            </Button>
          )}
        </div>
      )}

      {/* Agent Identity */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" style={{ color: '#8B5E3C' }} />
          Agent Identity
        </div>
        <div className="space-y-2">
          <div>
            <Label htmlFor="agent-name" className="text-xs text-muted-foreground">
              Agent Name
            </Label>
            <Input
              id="agent-name"
              value={config.agent_name}
              onChange={(e) => updateField('agent_name', e.target.value)}
              placeholder="e.g., Kairos"
              disabled={!isManager}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="agent-persona" className="text-xs text-muted-foreground">
              Persona / System Prompt Override
            </Label>
            <textarea
              id="agent-persona"
              value={config.system_prompt || ''}
              onChange={(e) => updateField('system_prompt', e.target.value)}
              placeholder="Optional: describe your agent's personality, tone, and areas of expertise. Leave blank for default."
              disabled={!isManager}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Schedule Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4" style={{ color: '#8B5E3C' }} />
          Schedule
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="daily-hour" className="text-xs text-muted-foreground">
              Daily Post Hour (UTC)
            </Label>
            <Input
              id="daily-hour"
              type="number"
              min={0}
              max={23}
              value={config.daily_post_hour_utc}
              onChange={(e) => updateField('daily_post_hour_utc', parseInt(e.target.value) || 12)}
              disabled={!isManager}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Auto-Publish Events</Label>
            <div className="mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.auto_publish_events}
                  onChange={(e) => updateField('auto_publish_events', e.target.checked)}
                  disabled={!isManager}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{config.auto_publish_events ? 'Yes' : 'No (draft for review)'}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Forum Category Assignment */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4" style={{ color: '#8B5E3C' }} />
          Forum & Chat Channels
        </div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">
              Daily Post Category
            </Label>
            <select
              value={config.daily_category_id || ''}
              onChange={(e) => updateField('daily_category_id', e.target.value || null)}
              disabled={!isManager}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a forum category...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {chatGroups.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">
                Chat Channels (agent will respond to mentions)
              </Label>
              <div className="mt-1 space-y-1">
                {chatGroups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(config.chat_group_ids || []).includes(group.id)}
                      onChange={(e) => {
                        const ids = config.chat_group_ids || [];
                        if (e.target.checked) {
                          updateField('chat_group_ids', [...ids, group.id]);
                        } else {
                          updateField('chat_group_ids', ids.filter((id: string) => id !== group.id));
                        }
                      }}
                      disabled={!isManager}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{group.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Corpus / Knowledge Base */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" style={{ color: '#8B5E3C' }} />
          Knowledge Base
        </div>
        <div className="p-3 rounded-lg bg-gray-100 text-sm space-y-1">
          <p>
            Namespace: <code className="text-xs bg-gray-200 px-1 rounded">agent-{podId.slice(0, 8)}...</code>
          </p>
          <p>
            Vectors: <strong>{corpusStats?.vectorCount ?? '—'}</strong>
          </p>
        </div>
        {isManager && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              // Corpus upload is handled by a separate API — open file picker
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.pdf,.txt,.md';
              input.multiple = true;
              input.onchange = async (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (!files || files.length === 0) return;

                const formData = new FormData();
                formData.append('podId', podId);
                for (const file of Array.from(files)) {
                  formData.append('files', file);
                }

                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch('/api/community-agent/corpus', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session?.access_token}` },
                    body: formData,
                  });
                  if (res.ok) {
                    loadData(); // Refresh stats
                  }
                } catch (err) {
                  console.error('Upload failed:', err);
                }
              };
              input.click();
            }}
          >
            <Upload className="h-3 w-3" />
            Upload Documents
          </Button>
        )}
      </div>

      {/* Event Drafts Review */}
      {isManager && !config.auto_publish_events && walletAddress && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4" style={{ color: '#8B5E3C' }} />
            Event Drafts
          </div>
          <AgentEventDrafts podId={podId} walletAddress={walletAddress} />
        </div>
      )}

      {/* Save Button */}
      {isManager && (
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={saveConfig}
            disabled={saving}
            className="gap-1"
            style={{ backgroundColor: '#8B5E3C' }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
          {saved && (
            <span className="text-sm flex items-center gap-1" style={{ color: '#3F7A5A' }}>
              <CheckCircle className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
