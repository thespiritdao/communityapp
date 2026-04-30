'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Info,
  X,
  Sparkles,
  MessageSquare,
  CalendarDays,
  BookOpen,
  Zap,
} from 'lucide-react';
import PodCommunityAgentManager from './PodCommunityAgentManager';

interface PodAgentsPanelProps {
  podId: string;
  podName: string;
  isManager: boolean;
}

export default function PodAgentsPanel({ podId, podName, isManager }: PodAgentsPanelProps) {
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);

  // Check if agent is already enabled for this pod
  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const { supabase } = await import('@/utils/supabaseClient');
        const { data } = await supabase
          .from('pod_modules')
          .select('community_agent_enabled')
          .eq('pod_id', podId)
          .single();
        setAgentEnabled(data?.community_agent_enabled ?? false);
      } catch {
        setAgentEnabled(false);
      }
    };
    checkStatus();
  }, [podId]);

  const handleEnable = useCallback(async () => {
    setEnabling(true);
    try {
      const { supabase } = await import('@/utils/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`/api/pods/${podId}/modules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ community_agent_enabled: true }),
      });

      if (res.ok) {
        setAgentEnabled(true);
      }
    } catch (err) {
      console.error('Failed to enable agent:', err);
    } finally {
      setEnabling(false);
    }
  }, [podId]);

  if (agentEnabled === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-sm text-[#7C6F5B]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#F5EDD7' }}
          >
            <Bot className="h-5 w-5" style={{ color: '#8B5E3C' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#3C3C3C]">AI Agents</h2>
            <p className="text-xs text-[#7C6F5B]">Premium add-ons for your community</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLearnMore(true)}
          className="text-xs gap-1 text-[#8B5E3C]"
        >
          <Info className="h-3.5 w-3.5" />
          Learn More
        </Button>
      </div>

      {/* Learn More Modal */}
      {showLearnMore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#3C3C3C] flex items-center gap-2">
                  <Sparkles className="h-5 w-5" style={{ color: '#C6933F' }} />
                  Community AI Agent
                </h3>
                <button onClick={() => setShowLearnMore(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <p className="text-sm text-[#5A5A5A] mb-5">
                Add an AI-powered community agent to your pod. Your agent posts daily discussion
                prompts, responds to member questions, generates events, and draws from your
                pod&rsquo;s own knowledge base to give contextually rich, on-topic responses.
              </p>

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: '#2F5D50' }} />
                  <div>
                    <p className="text-sm font-medium text-[#3C3C3C]">Daily Discussion Posts</p>
                    <p className="text-xs text-[#7C6F5B]">
                      Your agent generates a fresh discussion prompt every day, tailored to your
                      pod&rsquo;s focus area and recent activity. Posts to your chosen forum category.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: '#2F5D50' }} />
                  <div>
                    <p className="text-sm font-medium text-[#3C3C3C]">Mention-Based Replies</p>
                    <p className="text-xs text-[#7C6F5B]">
                      Members can @mention the agent in forum threads or chat to get thoughtful,
                      context-aware responses. The agent draws from your pod&rsquo;s knowledge base.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CalendarDays className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: '#2F5D50' }} />
                  <div>
                    <p className="text-sm font-medium text-[#3C3C3C]">Weekly Event Generation</p>
                    <p className="text-xs text-[#7C6F5B]">
                      AI-generated event suggestions each week with full details. Events appear
                      as drafts for pod leaders to review, edit, and publish.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: '#2F5D50' }} />
                  <div>
                    <p className="text-sm font-medium text-[#3C3C3C]">Custom Knowledge Base</p>
                    <p className="text-xs text-[#7C6F5B]">
                      Upload documents (PDFs, text files) to train your agent on your pod&rsquo;s
                      specific domain. The agent uses retrieval-augmented generation to ground
                      its responses in your content.
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="p-4 rounded-lg mb-4"
                style={{ backgroundColor: '#FAF4EC', border: '1px solid #D1C4A9' }}
              >
                <p className="text-sm font-medium text-[#3C3C3C] mb-1">Pricing</p>
                <p className="text-xs text-[#5A5A5A]">
                  <strong>25 $SYSTEM for 30 days of usage</strong> &mdash; Revenue supports DAO operations.  Communities can toggle the Agent on/off and retain unused days.
                </p>
              </div>

              <div className="text-[10px] text-[#A39171]">
                Your agent gets its own unique identity and display name. Configure its
                personality, schedule, and knowledge base from the Agents tab after enabling.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Card */}
      <Card className="border border-[#D1C4A9]/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium text-[#3C3C3C] flex items-center gap-2">
              <Bot className="h-4 w-4" style={{ color: '#8B5E3C' }} />
              Community Agent
            </CardTitle>
            {agentEnabled ? (
              <Badge
                className="text-[10px]"
                style={{ backgroundColor: '#D1E6DC', color: '#2F5D50', border: 'none' }}
              >
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-[#7C6F5B]">
                Not Enabled
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {agentEnabled ? (
            <PodCommunityAgentManager
              podId={podId}
              podName={podName}
              isManager={isManager}
            />
          ) : (
            <div className="text-center py-6 space-y-4">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
                style={{ backgroundColor: '#F5EDD7' }}
              >
                <Bot className="h-8 w-8" style={{ color: '#8B5E3C' }} />
              </div>
              <div>
                <p className="text-sm font-medium text-[#3C3C3C]">
                  No AI agent enabled for {podName}
                </p>
                <p className="text-xs text-[#7C6F5B] mt-1">
                  Enable a community agent to automate discussions, respond to members,
                  and generate events.
                </p>
              </div>
              {isManager && (
                <Button
                  onClick={handleEnable}
                  disabled={enabling}
                  className="gap-2"
                  style={{ backgroundColor: '#8B5E3C' }}
                >
                  <Sparkles className="h-4 w-4" />
                  {enabling ? 'Enabling...' : 'Enable Community Agent'}
                </Button>
              )}
              <button
                onClick={() => setShowLearnMore(true)}
                className="block mx-auto text-xs text-[#8B5E3C] underline underline-offset-2 hover:text-[#6B4530]"
              >
                Learn more about what AI agents can do
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
