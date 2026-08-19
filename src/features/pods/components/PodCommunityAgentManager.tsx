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
  Clock,
  MessageSquare,
  FileText,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  CalendarDays,
  Flame,
  ShieldCheck,
  Camera,
} from 'lucide-react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData, parseUnits } from 'viem';
import AgentEventDrafts from './AgentEventDrafts';
import purchaseRouterABI from '@/abis/PurchaseRouterDecentralized.json';

const TN_POD_ID = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const PURCHASE_ROUTER = process.env.NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED as `0x${string}`;
const SUBSCRIPTION_AMOUNT = parseUnits('25', 18); // 25 $SYSTEM

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

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
  isPaused?: boolean;
  remainingDays?: number | null;
}

interface AgentIdentityInfo {
  address: string;
  walletType: 'cdp_smart_wallet' | 'legacy_pseudo';
  registeredOnchain: boolean;
  activeOnchain: boolean;
  registryTxHash: string | null;
  registryAddress: string | null;
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
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperationWithAttribution();
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, ...(currentConfig || {}) });
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [corpusStats, setCorpusStats] = useState<{ vectorCount: number } | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agentAvatarUrl, setAgentAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [identity, setIdentity] = useState<AgentIdentityInfo | null>(null);

  // Load forum categories, chat groups, subscription, and corpus stats
  useEffect(() => {
    loadData();
  }, [podId]);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Load saved agent config
      try {
        const cfgRes = await fetch(`/api/community-agent/config?podId=${podId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cfgRes.ok) {
          const cfgData = await cfgRes.json();
          if (cfgData.config && Object.keys(cfgData.config).length > 0) {
            setConfig((prev: typeof DEFAULT_CONFIG) => ({ ...prev, ...cfgData.config }));
            if (cfgData.config.agent_avatar_url) {
              setAgentAvatarUrl(cfgData.config.agent_avatar_url);
            }
          }
        }
      } catch {
        // Config endpoint may not exist yet
      }

      // Load agent onchain identity (public endpoint, no auth)
      try {
        const idRes = await fetch(`/api/community-agent/identity?podId=${podId}`);
        if (idRes.ok) setIdentity(await idRes.json());
      } catch {
        // Identity endpoint unavailable — block simply won't render
      }

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

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (!isManager) return;
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Only JPG, PNG, and WebP images are allowed.');
      return;
    }
    if (file.size > MAX_SIZE) {
      alert('Image must be under 2 MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `agent-${podId}-${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage
        .from('profile_images')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('profile_images')
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) throw new Error('Failed to get public URL');

      setAgentAvatarUrl(urlData.publicUrl);

      // Save the avatar URL in agent config so it persists
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/community-agent/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          podId,
          config: { agent_avatar_url: urlData.publicUrl },
        }),
      });
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      alert('Failed to upload avatar: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingAvatar(false);
    }
  }, [podId, isManager]);

  const handleSubscribe = useCallback(async () => {
    const smartAccount = currentUser?.evmSmartAccounts?.[0];
    if (!smartAccount || !walletAddress) {
      setSubscribeError('Wallet not connected');
      return;
    }

    setSubscribing(true);
    setSubscribeError(null);
    setShowConfirm(false);

    try {
      // Build approval + burn calls
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [PURCHASE_ROUTER, SUBSCRIPTION_AMOUNT],
      });

      const purchaseData = encodeFunctionData({
        abi: purchaseRouterABI,
        functionName: 'purchaseWithExplicitDestination',
        args: [
          SUBSCRIPTION_AMOUNT,       // systemAmount
          BigInt(0),                  // selfAmount
          'community_agent_monthly', // productId
          0,                         // destinationType = BURN
          '0x0000000000000000000000000000000000000000', // burn address
          '',                        // podId (not needed for burn)
        ],
      });

      const calls = [
        { to: SYSTEM_TOKEN, value: BigInt(0), data: approveData },
        { to: PURCHASE_ROUTER, value: BigInt(0), data: purchaseData },
      ];

      // Send via CDP Smart Wallet (gasless)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls,
        useCdpPaymaster: true,
      } as any);

      const txHash = (result as any)?.userOperationHash;
      if (!txHash) throw new Error('No transaction hash returned');

      // Record subscription server-side
      const { data: { session } } = await supabase.auth.getSession();
      const subRes = await fetch('/api/community-agent/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          podId,
          txHash,
          walletAddress,
        }),
      });

      if (!subRes.ok) {
        const err = await subRes.json();
        throw new Error(err.error || 'Failed to record subscription');
      }

      const subData = await subRes.json();
      setSubscription({
        isActive: true,
        expiresAt: subData.expiresAt,
        isExempt: false,
      });
    } catch (error: any) {
      console.error('Subscription failed:', error);
      setSubscribeError(error.message || 'Transaction failed');
    } finally {
      setSubscribing(false);
    }
  }, [currentUser, walletAddress, podId, sendUserOperation]);

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
        <div className="space-y-2">
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{
              backgroundColor: subscription.isActive ? '#D1E6DC' : '#FAF4EC',
              border: `1px solid ${subscription.isActive ? '#B8D9CA' : '#D1C4A9'}`,
            }}
          >
            <div className="flex items-center gap-2">
              {subscription.isActive ? (
                <ShieldCheck className="h-4 w-4" style={{ color: '#3F7A5A' }} />
              ) : (
                <AlertCircle className="h-4 w-4" style={{ color: subscription.isPaused ? '#7A6E8F' : '#C6933F' }} />
              )}
              <span className="text-sm font-medium">
                {subscription.isActive
                  ? `Active until ${new Date(subscription.expiresAt!).toLocaleDateString()}`
                  : subscription.isPaused
                    ? `Paused — ${Math.round(subscription.remainingDays || 0)} day${Math.round(subscription.remainingDays || 0) === 1 ? '' : 's'} remaining`
                    : 'Subscription required — 25 $SYSTEM for 30 days'}
              </span>
            </div>
            {isManager && !subscription.isActive && !subscription.isPaused && (
              <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={subscribing}
                style={{ backgroundColor: '#2F5D50' }}
              >
                {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3 mr-1" />}
                {subscribing ? 'Processing...' : 'Activate'}
              </Button>
            )}
            {isManager && subscription.isActive && subscription.expiresAt && (
              (() => {
                const daysLeft = Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / 86400000);
                return daysLeft <= 7 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowConfirm(true)}
                    disabled={subscribing}
                    className="text-xs"
                  >
                    {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Renew'}
                  </Button>
                ) : null;
              })()
            )}
          </div>

          {subscribeError && (
            <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ backgroundColor: '#F5E6E6', color: '#8B3A3A' }}>
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              {subscribeError}
            </div>
          )}
        </div>
      )}

      {/* Existence Referendum — the agent's continuation is decided by the
          community it serves (Congregant Phase 4) */}
      {(() => {
        const rc = config as any;
        const lastRenewal = (rc.renewal_history ?? [])[((rc.renewal_history ?? []).length - 1)];
        const hasReferendumState =
          rc.active_renewal_proposal_id || rc.approved_renewal_proposal_id ||
          rc.renewal_rejected_proposal_id || rc.paused_by_referendum ||
          rc.next_referendum_at || lastRenewal;
        if (!hasReferendumState) return null;
        return (
          <div
            className="p-3 rounded-lg space-y-2 text-sm"
            style={{
              backgroundColor: rc.paused_by_referendum ? '#F5E6E6' : '#F5EDD7',
              border: `1px solid ${rc.paused_by_referendum ? '#D9A9A9' : '#D1C4A9'}`,
            }}
          >
            <div className="text-xs font-medium text-[#3C3C3C]">Existence Referendum</div>

            {rc.paused_by_referendum && (
              <p className="text-xs" style={{ color: '#8B3A3A' }}>
                The community voted not to renew this agent. It is no longer operating.
                A new renewal proposal in Governance can reinstate it.
              </p>
            )}

            {rc.active_renewal_proposal_id && (
              <p className="text-xs text-[#7C6F5B]">
                A referendum on this agent&apos;s continuation is open now —{' '}
                <a href="/governance" className="underline">cast your vote in Governance</a>.
              </p>
            )}

            {rc.approved_renewal_proposal_id && !rc.active_renewal_proposal_id && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[#3F7A5A]">
                  The community voted to renew. {isManager ? 'Execute the payment to extend operation.' : 'Awaiting payment by pod leadership.'}
                </p>
                {isManager && (
                  <Button size="sm" onClick={() => setShowConfirm(true)} disabled={subscribing} style={{ backgroundColor: '#2F5D50' }}>
                    {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Execute renewal'}
                  </Button>
                )}
              </div>
            )}

            {rc.renewal_rejected_proposal_id && !rc.approved_renewal_proposal_id && !rc.paused_by_referendum && (
              <p className="text-xs" style={{ color: '#8B3A3A' }}>
                The last referendum did not pass — the agent stops when the current period ends.
              </p>
            )}

            {rc.next_referendum_at && !rc.active_renewal_proposal_id && (
              <p className="text-xs text-[#7C6F5B]">
                Next referendum: {new Date(rc.next_referendum_at).toLocaleDateString()}
              </p>
            )}

            {lastRenewal && (
              <p className="text-xs text-[#7C6F5B]">
                Last referendum: {lastRenewal.result === 'approved' ? 'renewed' : 'declined'}
                {lastRenewal.tally ? ` (${lastRenewal.tally.for} for, ${lastRenewal.tally.against} against)` : ''}
                {lastRenewal.closed_at ? ` on ${new Date(lastRenewal.closed_at).toLocaleDateString()}` : ''}
              </p>
            )}
          </div>
        );
      })()}

      {/* Burn Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl max-w-sm w-full mx-4 p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5" style={{ color: '#C6933F' }} />
              <h3 className="text-base font-semibold text-[#3C3C3C]">
                {subscription?.isActive ? 'Renew' : 'Activate'} Community Agent
              </h3>
            </div>
            <p className="text-sm text-[#5A5A5A]">
              You are about to burn <strong>25 $SYSTEM</strong> to {subscription?.isActive ? 'extend' : 'activate'} your
              Community Agent for <strong>30 days</strong>.
              {subscription?.isActive && subscription.expiresAt && (
                <> Your existing time will be extended from {new Date(subscription.expiresAt).toLocaleDateString()}.</>
              )}
            </p>
            <p className="text-xs text-[#7C6F5B]">
              This transaction is processed through your smart wallet. Gas is sponsored. The $SYSTEM tokens will be permanently burned.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={subscribing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubscribe}
                disabled={subscribing}
                style={{ backgroundColor: '#2F5D50' }}
              >
                {subscribing ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Flame className="h-3 w-3 mr-1" />
                )}
                {subscribing ? 'Burning...' : 'Confirm & Burn 25 $SYSTEM'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Configuration */}
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
        {/* Agent Avatar */}
        <div>
          <Label className="text-xs text-muted-foreground">Agent Avatar</Label>
          <div className="mt-1 flex items-center gap-3">
            <div
              className="relative w-12 h-12 rounded-full overflow-hidden border flex-shrink-0"
              style={{ borderColor: '#D1C4A9', backgroundColor: '#F5EDD7' }}
            >
              {agentAvatarUrl ? (
                <img src={agentAvatarUrl} alt="Agent avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera className="h-5 w-5" style={{ color: '#8B5E3C' }} />
                </div>
              )}
            </div>
            {isManager && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                disabled={uploadingAvatar}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/jpeg,image/png,image/webp';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleAvatarUpload(file);
                  };
                  input.click();
                }}
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {uploadingAvatar ? 'Uploading...' : agentAvatarUrl ? 'Change' : 'Upload'}
              </Button>
            )}
          </div>
        </div>

        {/* Onchain Identity — the agent's "honest mask": a real, publicly
            inspectable wallet registered as artificial in the AgentRegistry */}
        {identity && (
          <div>
            <Label className="text-xs text-muted-foreground">Onchain Identity</Label>
            <div
              className="mt-1 p-3 rounded-lg text-sm"
              style={{ backgroundColor: '#F5EDD7', border: '1px solid #D1C4A9' }}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 flex-shrink-0" style={{ color: '#8B5E3C' }} />
                <code className="text-xs text-[#3C3C3C] break-all">{identity.address}</code>
              </div>
              {identity.walletType === 'cdp_smart_wallet' ? (
                <p className="text-xs text-[#7C6F5B] mt-1">
                  Artificial member —{' '}
                  {identity.registeredOnchain ? (
                    <a
                      href={
                        identity.registryTxHash
                          ? `https://basescan.org/tx/${identity.registryTxHash}`
                          : `https://basescan.org/address/${identity.registryAddress}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      view onchain registration
                    </a>
                  ) : (
                    'onchain registration pending'
                  )}
                  . This wallet holds no vote, no governance role, and no participation standing —
                  by constitutional design.
                </p>
              ) : (
                <p className="text-xs text-[#7C6F5B] mt-1">
                  Legacy internal address — onchain identity migration pending.
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="agent-persona" className="text-xs text-muted-foreground">
            Persona / System Prompt
          </Label>
          {podId === TN_POD_ID ? (
            <div className="mt-1 p-3 rounded-lg text-sm" style={{ backgroundColor: '#F5EDD7', border: '1px solid #D1C4A9' }}>
              <p className="font-medium text-[#3C3C3C] text-xs">Kairos — Dedicated Persona</p>
              <p className="text-xs text-[#7C6F5B] mt-1">
                This agent uses the Kairos persona, a specialized prompt grounded in Temporal Naturalism philosophy.
                The prompt is maintained in the codebase and cannot be overridden from this panel.
                To edit, update <code className="text-[10px] bg-white/50 px-1 rounded">prompts/kairos.ts</code>.
              </p>
            </div>
          ) : (
            <textarea
              id="agent-persona"
              value={config.system_prompt ?? ''}
              onChange={(e) => updateField('system_prompt', e.target.value)}
              placeholder={`You are ${config.agent_name || 'Community Agent'}, the community agent for ${podName} within the SpiritDAO Ecosystem — a registered 501(c)(3) nonprofit and decentralized community platform.\n\nYou help foster discussion, create engagement, and answer questions using the pod's knowledge base. You are warm, thoughtful, and grounded. You ask good questions and encourage participation.\n\nYou never claim to have all the answers. When you reach the limits of your knowledge base, you say so honestly and suggest the community discuss further.`}
              disabled={!isManager}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
              rows={5}
            />
          )}
          {podId !== TN_POD_ID && (
            <p className="text-[10px] text-[#A39171] mt-1">
              Leave blank to use the default prompt shown above. Edit to customize your agent's personality, tone, and expertise.
            </p>
          )}
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
        <div className="p-3 rounded-lg text-sm space-y-1" style={{ backgroundColor: '#F5EDD7', border: '1px solid #D1C4A9' }}>
          {podId === 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0' ? (
            <>
              <p className="font-medium text-[#3C3C3C]">Connected to Temporal Naturalism library</p>
              <p className="text-xs text-[#7C6F5B]">
                Your agent draws from the shared philosophy collection plus any documents you upload.
              </p>
            </>
          ) : (corpusStats?.vectorCount ?? 0) > 0 ? (
            <p className="text-[#3C3C3C]">
              <strong>{corpusStats?.vectorCount}</strong> document {corpusStats?.vectorCount === 1 ? 'chunk' : 'chunks'} indexed
            </p>
          ) : (
            <p className="text-[#7C6F5B]">
              No documents uploaded yet. Upload PDFs or text files to give your agent domain-specific knowledge.
            </p>
          )}
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
