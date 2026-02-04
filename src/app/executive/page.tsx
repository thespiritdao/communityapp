'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Clock,
  Calendar,
  Brain,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  FileText,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExecutiveDashboard() {
  const [brainDump, setBrainDump] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Chief-of-Staff</h1>
            <p className="text-muted-foreground">Executive Operating System</p>
          </div>
          <div className="flex items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Best Practices
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Chief-of-Staff Agent - Best Practices</DialogTitle>
                  <DialogDescription>
                    Learn how to use this agent effectively to externalize your executive function
                  </DialogDescription>
                </DialogHeader>
                <BestPracticesContent />
              </DialogContent>
            </Dialog>
            <Badge variant="outline" className="text-sm">
              🔒 Founder Only
            </Badge>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <QuickActionCard
            icon={<Clock className="h-5 w-5" />}
            title="Daily Pulse"
            description="5-min priorities"
            onClick={() => handleRunCycle('daily')}
          />
          <QuickActionCard
            icon={<Calendar className="h-5 w-5" />}
            title="Weekly Cycle"
            description="Strategic planning"
            onClick={() => handleRunCycle('weekly')}
          />
          <QuickActionCard
            icon={<CheckCircle className="h-5 w-5" />}
            title="Approve All A"
            description="Auto-approve internal"
            onClick={handleApproveAllA}
          />
          <QuickActionCard
            icon={<Play className="h-5 w-5" />}
            title="Execute"
            description="Run approved items"
            onClick={handleExecute}
          />
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="brain-dump">Brain Dump</TabsTrigger>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <DashboardView />
          </TabsContent>

          <TabsContent value="brain-dump" className="space-y-4">
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  <h3 className="text-lg font-semibold">Brain Dump</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Dump all your thoughts, ideas, and concerns here. The agent will process them,
                  extract actionable items, and categorize by priority.
                </p>
                <Textarea
                  placeholder="Type everything on your mind here... ideas, concerns, tasks, questions, anything..."
                  value={brainDump}
                  onChange={(e) => setBrainDump(e.target.value)}
                  className="min-h-[200px]"
                />
                <Button
                  onClick={async () => {
                    if (!brainDump.trim()) return;
                    setLoading(true);
                    try {
                      const res = await fetch('/api/executive/brain-dump', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ thoughts: brainDump }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        toast.success('Brain dump processed! Check Proposals tab.');
                        setBrainDump('');
                        setActiveTab('proposals');
                      } else {
                        toast.error(data.error || 'Failed to process');
                      }
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || !brainDump.trim()}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Processing...' : 'Process Brain Dump'}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="proposals" className="space-y-4">
            <ProposalsView />
          </TabsContent>

          <TabsContent value="artifacts" className="space-y-4">
            <ArtifactsView />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <HistoryView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickActionCard({ icon, title, description, onClick }: any) {
  const [loading, setLoading] = useState(false);

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-all"
      onClick={async () => {
        setLoading(true);
        try {
          await onClick();
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </Card>
  );
}

function DashboardView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const res = await fetch('/api/executive/dashboard');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="space-y-4">
      {stats?.last_run && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Last Run</h3>
          <div className="space-y-2">
            <Badge>{stats.last_run.mode}</Badge>
            <p className="text-sm text-muted-foreground">
              {new Date(stats.last_run.created_at).toLocaleString()}
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Pending" count={stats?.pending_count || 0} variant="warning" />
        <StatCard title="Approved" count={stats?.approved_count || 0} variant="success" />
        <StatCard title="Executed" count={stats?.executed_count || 0} variant="default" />
      </div>
    </div>
  );
}

function ProposalsView() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'executed' | 'all'>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposals();
  }, [categoryFilter, statusFilter]);

  async function loadProposals() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const url = `/api/executive/proposals${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        // Sort by priority (highest first), then by created_at (newest first)
        const sorted = [...data.data].sort((a, b) => {
          // Primary sort: priority (descending - higher priority first)
          const priorityDiff = (b.priority || 0) - (a.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;

          // Secondary sort: created_at (descending - newest first)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setProposals(sorted);
      }
    } catch (err) {
      console.error('Failed to load proposals:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        <div className="text-sm font-medium mr-2 flex items-center">Status:</div>
        {[
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'executed', label: 'Executed' },
          { value: 'all', label: 'All' }
        ].map((s) => (
          <Button
            key={s.value}
            variant={statusFilter === s.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s.value as any)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <div className="text-sm font-medium mr-2 flex items-center">Category:</div>
        {['all', 'A', 'B', 'C'].map((f) => (
          <Button
            key={f}
            variant={categoryFilter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter(f as any)}
          >
            {f === 'all' ? 'All' : `${f} - ${f === 'A' ? 'Internal' : f === 'B' ? 'Needs Approval' : 'Info'}`}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {proposals.length === 0 ? (
          <Card className="p-6">
            <p className="text-center text-muted-foreground">
              No proposals found. {statusFilter === 'pending' ? 'Run a cycle to generate actions.' : 'Try a different filter.'}
            </p>
          </Card>
        ) : (
          proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} onUpdate={loadProposals} />
          ))
        )}
      </div>
    </div>
  );
}

function ProposalCard({ proposal, onUpdate }: { proposal: any; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false);

  const categoryColors = {
    A: 'bg-green-500/10 text-green-600 border-green-500/20',
    B: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    C: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  async function approve() {
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/proposals/${proposal.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Proposal approved');
        onUpdate();
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/proposals/${proposal.id}/reject`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Proposal rejected');
        onUpdate();
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function executeOne() {
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/proposals/${proposal.id}/execute`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('✅ Artifact generated! View it in the Artifacts tab', { duration: 5000 });
        onUpdate();
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    approved: 'bg-green-500/10 text-green-600 border-green-500/20',
    executed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  // Priority color coding
  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500/10 text-red-600 border-red-500/20'; // High priority
    if (priority >= 5) return 'bg-orange-500/10 text-orange-600 border-orange-500/20'; // Medium priority
    return 'bg-gray-500/10 text-gray-600 border-gray-500/20'; // Low priority
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 8) return '🔴 High';
    if (priority >= 5) return '🟡 Med';
    return '⚪ Low';
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={categoryColors[proposal.category as keyof typeof categoryColors]}>
              {proposal.category}
            </Badge>
            <Badge variant="outline" className={statusColors[proposal.status as keyof typeof statusColors]}>
              {proposal.status}
            </Badge>
            <Badge variant="outline" className={getPriorityColor(proposal.priority || 0)}>
              {getPriorityLabel(proposal.priority || 0)} ({proposal.priority || 0})
            </Badge>
            <h4 className="font-semibold">{proposal.title}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{proposal.rationale}</p>
          {proposal.steps && (
            <div className="text-xs text-muted-foreground space-y-1">
              {proposal.steps.slice(0, 2).map((step: string, i: number) => (
                <div key={i}>• {step}</div>
              ))}
            </div>
          )}
          {proposal.deliverable && (
            <p className="text-xs text-muted-foreground">
              📦 {proposal.deliverable}
            </p>
          )}
        </div>
        {proposal.status === 'pending' && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={approve} disabled={loading}>
              <CheckCircle className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={reject} disabled={loading}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}
        {proposal.status === 'approved' && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="default" onClick={executeOne} disabled={loading}>
              <Play className="h-4 w-4 mr-1" />
              Execute
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ArtifactsView() {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);
  const [showPublished, setShowPublished] = useState(false);

  useEffect(() => {
    loadArtifacts();
  }, []);

  async function loadArtifacts() {
    try {
      const res = await fetch('/api/executive/artifacts');
      const data = await res.json();
      if (data.success) setArtifacts(data.data);
    } catch (err) {
      console.error('Failed to load artifacts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function togglePublished(artifactId: string, currentStatus: boolean) {
    try {
      const res = await fetch(`/api/executive/artifacts/${artifactId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !currentStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(currentStatus ? 'Moved back to active' : '✅ Marked as published!');
        loadArtifacts();
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  const filteredArtifacts = showPublished
    ? artifacts.filter(a => a.published)
    : artifacts.filter(a => !a.published);

  return (
    <div className="space-y-3">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={!showPublished ? 'default' : 'outline'}
            onClick={() => setShowPublished(false)}
          >
            Active ({artifacts.filter(a => !a.published).length})
          </Button>
          <Button
            size="sm"
            variant={showPublished ? 'default' : 'outline'}
            onClick={() => setShowPublished(true)}
          >
            Published ({artifacts.filter(a => a.published).length})
          </Button>
        </div>
      </div>

      {filteredArtifacts.length === 0 ? (
        <Card className="p-6">
          <p className="text-center text-muted-foreground">
            {showPublished
              ? 'No published artifacts yet. Mark artifacts as published after using them.'
              : 'No active artifacts. Execute approved proposals to generate content.'}
          </p>
        </Card>
      ) : (
        filteredArtifacts.map((artifact) => (
          <Card key={artifact.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{artifact.title}</h4>
                    {artifact.published && (
                      <Badge variant="secondary" className="text-xs">
                        Published
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {artifact.artifact_type} • {new Date(artifact.created_at).toLocaleDateString()}
                    {artifact.published && artifact.published_at && (
                      <> • Published {new Date(artifact.published_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedArtifact(artifact)}
                  >
                    View
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{artifact.title}</DialogTitle>
                    <DialogDescription>
                      {artifact.artifact_type} • Generated {new Date(artifact.created_at).toLocaleString()}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg">
                        {artifact.content}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-between pt-4 border-t">
                      <Button
                        variant={artifact.published ? 'outline' : 'default'}
                        onClick={() => togglePublished(artifact.id, artifact.published)}
                      >
                        {artifact.published ? (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Mark as Active
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Mark as Published
                          </>
                        )}
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => copyToClipboard(artifact.content)}
                        >
                          Copy to Clipboard
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            const blob = new Blob([artifact.content], { type: 'text/markdown' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${artifact.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast.success('Downloaded!');
                          }}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function HistoryView() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const res = await fetch('/api/executive/history');
      const data = await res.json();
      if (data.success) setRuns(data.data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <Card key={run.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="outline">{run.mode}</Badge>
              <p className="text-sm mt-1">{new Date(run.created_at).toLocaleString()}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              {run.duration_ms}ms | {run.tokens_used} tokens
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BestPracticesContent() {
  return (
    <div className="space-y-6 text-sm">
      {/* Daily Loop */}
      <section>
        <h3 className="font-semibold text-base mb-2">🌅 The Core Loop (Daily)</h3>
        <p className="text-muted-foreground mb-2">Morning routine (5 minutes):</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
          <li>Click <strong>Daily Pulse</strong> - agent analyzes overnight data</li>
          <li>Review proposals → Click <strong>Approve All A</strong> for internal prep</li>
          <li>Manually review B-category items (public/external actions)</li>
          <li>Click <strong>Execute</strong> to generate drafts/documents</li>
          <li>Check <strong>Artifacts tab</strong> for ready-to-use content</li>
        </ol>
        <p className="text-muted-foreground mt-2">
          <strong>Throughout the day:</strong> Use Brain Dump whenever ideas/concerns hit you - don't organize, just type stream-of-consciousness.
        </p>
      </section>

      {/* A/B/C System */}
      <section>
        <h3 className="font-semibold text-base mb-2">🎯 The A/B/C System</h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">A</Badge>
            <div>
              <p className="font-medium">Internal preparation</p>
              <p className="text-muted-foreground">Research, drafts, analysis. Safe to auto-approve with "Approve All A"</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">B</Badge>
            <div>
              <p className="font-medium">Needs your approval</p>
              <p className="text-muted-foreground">Public posts, external comms, budget decisions. <strong>Always review manually</strong></p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">C</Badge>
            <div>
              <p className="font-medium">Informational</p>
              <p className="text-muted-foreground">Observations, alerts, things to monitor. No action required.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Brain Dump Best Practices */}
      <section>
        <h3 className="font-semibold text-base mb-2">🧠 Brain Dump Best Practices</h3>
        <div className="space-y-2 text-muted-foreground">
          <p><strong>When to use:</strong> Ideas hit randomly, feeling overwhelmed, can't decide what to tackle first</p>
          <p><strong>How to use:</strong></p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Don't filter</strong> - type everything, even half-formed thoughts</li>
            <li><strong>Don't organize</strong> - agent does that for you</li>
            <li><strong>Include context</strong> - "worried about X because Y"</li>
            <li><strong>Mix topics freely</strong> - fundraising + product + personal all in one</li>
          </ul>
          <p className="mt-2"><strong>Agent will:</strong> Extract 3-6 actionable proposals, identify themes, flag urgent items, and prioritize by impact</p>
        </div>
      </section>

      {/* Priority Scores */}
      <section>
        <h3 className="font-semibold text-base mb-2">📊 Trust the Priority Scores</h3>
        <ul className="space-y-1 text-muted-foreground ml-2">
          <li><strong>10:</strong> Urgent, high-impact (do today)</li>
          <li><strong>7-9:</strong> Important, do this week</li>
          <li><strong>4-6:</strong> Valuable, do when capacity allows</li>
          <li><strong>1-3:</strong> Nice-to-have, backlog</li>
        </ul>
      </section>

      {/* Weekly Planning */}
      <section>
        <h3 className="font-semibold text-base mb-2">📅 Weekly Planning (Sunday/Monday, 30 min)</h3>
        <p className="text-muted-foreground">
          Click <strong>Weekly Cycle</strong> for comprehensive strategic analysis with risks, opportunities, week priorities,
          and 8-12 strategic actions. This sets your week - review carefully.
        </p>
      </section>

      {/* What NOT to Do */}
      <section>
        <h3 className="font-semibold text-base mb-2 text-red-600">❌ What NOT to Do</h3>
        <ul className="space-y-1 text-muted-foreground ml-2">
          <li>Don't skip the review step - always approve/reject, don't execute blindly</li>
          <li>Don't ignore B-category warnings - if flagged, there's a reason</li>
          <li>Don't execute proposals you don't understand - read rationale first</li>
          <li>Don't forget to check artifacts - agent generates usable content</li>
        </ul>
      </section>

      {/* Success Signals */}
      <section>
        <h3 className="font-semibold text-base mb-2">✅ Success Signals</h3>
        <p className="text-muted-foreground mb-2">You're using it well if:</p>
        <ul className="space-y-1 text-muted-foreground ml-2">
          <li>Fewer "what should I do today?" moments</li>
          <li>Publishing content consistently (artifacts → LinkedIn/email)</li>
          <li>Less decision fatigue</li>
          <li>Important tasks aren't slipping through cracks</li>
          <li>Clear weekly narrative guiding actions</li>
        </ul>
      </section>

      {/* The Goal */}
      <section className="border-t pt-4">
        <h3 className="font-semibold text-base mb-2">🎯 The Goal</h3>
        <p className="text-muted-foreground">
          This agent <strong>externalizes your executive function</strong>. It's not about replacing your judgment -
          it's about sequencing (what order?), memory (what did I commit to?), translation (worried → actionable steps),
          and narrative (coherent story of this week/month).
        </p>
        <p className="text-muted-foreground mt-2">
          <strong>Use it like a Chief-of-Staff:</strong> They don't make decisions for you, but they organize information,
          propose options, track follow-through, and keep you focused on high-leverage actions.
        </p>
      </section>
    </div>
  );
}

function StatCard({ title, count, variant }: any) {
  const colors = {
    default: 'bg-blue-500/10 text-blue-600',
    success: 'bg-green-500/10 text-green-600',
    warning: 'bg-yellow-500/10 text-yellow-600',
  };

  return (
    <Card className="p-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className={`text-2xl font-bold ${colors[variant]}`}>{count}</p>
      </div>
    </Card>
  );
}

async function handleRunCycle(mode: 'daily' | 'weekly') {
  const endpoint = mode === 'daily' ? '/api/executive/daily' : '/api/executive/weekly';

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.success(`${mode} cycle complete! Check proposals.`);
      window.location.reload(); // Refresh to show new data
    } else {
      toast.error(data.error || 'Failed to run cycle');
    }
  } catch (err: any) {
    toast.error(err.message);
  }
}

async function handleApproveAllA() {
  try {
    const res = await fetch('/api/executive/approve-all-a', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.success(data.message);
      window.location.reload();
    } else {
      toast.error(data.error);
    }
  } catch (err: any) {
    toast.error(err.message);
  }
}

async function handleExecute() {
  try {
    const res = await fetch('/api/executive/execute', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.success(data.message);
      window.location.reload();
    } else {
      toast.error(data.error);
    }
  } catch (err: any) {
    toast.error(err.message);
  }
}
