'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle,
  XCircle,
  Play,
  FileText,
  Loader2,
  Users,
  Activity,
  Target,
  Plus,
  ArrowRight,
  Clock,
  Brain,
  MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Overview Tab
export function OverviewTab() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    try {
      const [proposalsRes, agentsRes, tasksRes, artifactsRes] = await Promise.all([
        fetch('/api/executive/proposals?status=approved'),
        fetch('/api/squad/agents'),
        fetch('/api/squad/tasks?status=assigned'),
        fetch('/api/executive/artifacts'),
      ]);

      const proposalsData = await proposalsRes.json();
      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();
      const artifactsData = await artifactsRes.json();

      if (proposalsData.success) setProposals((proposalsData.data || []).slice(0, 8));
      if (agentsData.success) setAgents(agentsData.data || []);
      if (tasksData.success) setTasks((tasksData.data || []).slice(0, 8));
      if (artifactsData.success) {
        setArtifacts((artifactsData.data || []).filter((a: any) => !a.published).slice(0, 6));
      }
    } catch (err) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6 h-[600px] animate-pulse bg-muted" />
        <Card className="p-6 h-[600px] animate-pulse bg-muted" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Strategic Layer */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold">Strategic Layer</h2>
          <Badge variant="outline" className="ml-auto">Chief-of-Staff</Badge>
        </div>

        {/* Approved Proposals */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Approved Proposals</h3>
            <Badge>{proposals.length}</Badge>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No approved proposals. Review and approve proposals in the Proposals tab.
              </p>
            ) : (
              proposals.map((proposal) => (
                <ProposalCardCompact key={proposal.id} proposal={proposal} onUpdate={loadOverview} />
              ))
            )}
          </div>
        </Card>

        {/* Active Artifacts */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Active Artifacts</h3>
            <Badge>{artifacts.length}</Badge>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {artifacts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No active artifacts. Execute approved proposals.
              </p>
            ) : (
              artifacts.map((artifact) => (
                <ArtifactCardCompact key={artifact.id} artifact={artifact} onUpdate={loadOverview} />
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Tactical Layer */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-purple-600" />
          <h2 className="text-2xl font-bold">Tactical Layer</h2>
          <Badge variant="outline" className="ml-auto">Agent Squad</Badge>
        </div>

        {/* Agent Status */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Agent Status</h3>
          <div className="grid grid-cols-2 gap-3">
            {agents.map((agent) => (
              <AgentStatusCompact key={agent.id} agent={agent} />
            ))}
          </div>
        </Card>

        {/* Pending Tasks */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Pending Tasks</h3>
            <Badge>{tasks.length}</Badge>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No pending tasks. Approve B-category proposals to create tasks automatically.
              </p>
            ) : (
              tasks.map((task) => (
                <TaskCardCompact key={task.id} task={task} onUpdate={loadOverview} />
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Brain Dump Tab
export function BrainDumpTab({ onProcessed }: { onProcessed: () => void }) {
  const [brainDump, setBrainDump] = useState('');
  const [loading, setLoading] = useState(false);

  async function processBrainDump() {
    if (!brainDump.trim()) {
      toast.error('Please enter some thoughts first');
      return;
    }

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
        setTimeout(() => onProcessed(), 1000);
      } else {
        toast.error(data.error || 'Failed to process');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8 text-pink-600" />
          <div>
            <h2 className="text-2xl font-bold">Brain Dump</h2>
            <p className="text-sm text-muted-foreground">
              Dump all your thoughts here. AI will extract actionable items.
            </p>
          </div>
        </div>

        <div className="bg-muted/50 p-4 rounded-lg space-y-2">
          <p className="text-sm font-medium">How to use:</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>Don't filter</strong> - type everything, even half-formed thoughts</li>
            <li><strong>Don't organize</strong> - AI does that for you</li>
            <li><strong>Mix topics freely</strong> - fundraising + product + personal all in one</li>
            <li><strong>Include context</strong> - "worried about X because Y"</li>
          </ul>
        </div>

        <Textarea
          placeholder="Type everything on your mind here... ideas, concerns, tasks, questions, anything..."
          value={brainDump}
          onChange={(e) => setBrainDump(e.target.value)}
          className="min-h-[300px] text-base"
        />

        <div className="flex items-center gap-3">
          <Button
            onClick={processBrainDump}
            disabled={loading || !brainDump.trim()}
            size="lg"
            className="flex-1"
          >
            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {loading ? 'Processing...' : 'Process Brain Dump'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setBrainDump('')}
            disabled={!brainDump}
          >
            Clear
          </Button>
        </div>

        {brainDump.trim() && (
          <p className="text-sm text-muted-foreground">
            {brainDump.trim().split(/\s+/).length} words • {brainDump.trim().split(/\n/).length} lines
          </p>
        )}
      </div>
    </Card>
  );
}

// Proposals Tab
export function ProposalsTab() {
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
        const sorted = [...(data.data || [])].sort((a, b) => {
          const priorityDiff = (b.priority || 0) - (a.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;
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

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4 h-24 animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {['pending', 'approved', 'executed', 'all'].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s as any)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Category:</span>
          {['all', 'A', 'B', 'C'].map((f) => (
            <Button
              key={f}
              variant={categoryFilter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(f as any)}
            >
              {f === 'all' ? 'All' : f}
            </Button>
          ))}
        </div>
      </div>

      {/* Proposals List */}
      <div className="space-y-3">
        {proposals.length === 0 ? (
          <Card className="p-8">
            <p className="text-center text-muted-foreground">
              No proposals found. {statusFilter === 'pending' ? 'Run a cycle to generate actions.' : 'Try a different filter.'}
            </p>
          </Card>
        ) : (
          proposals.map((proposal) => (
            <ProposalCardFull key={proposal.id} proposal={proposal} onUpdate={loadProposals} />
          ))
        )}
      </div>
    </div>
  );
}

// Compact Component Implementations
function ProposalCardCompact({ proposal, onUpdate }: any) {
  const [loading, setLoading] = useState(false);

  const categoryColors: Record<string, string> = {
    A: 'bg-green-500/10 text-green-600',
    B: 'bg-yellow-500/10 text-yellow-600',
    C: 'bg-blue-500/10 text-blue-600',
  };

  async function approve() {
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/proposals/${proposal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createTask: true }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.data?.taskCreated) {
          toast.success('Proposal approved and task created for Squad!', { duration: 4000 });
        } else {
          toast.success('Proposal approved');
        }
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

  return (
    <div className="border rounded-lg p-3 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`${categoryColors[proposal.category]} text-xs`}>
              {proposal.category}
            </Badge>
            <span className="text-sm font-medium truncate">{proposal.title}</span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{proposal.rationale}</p>
        </div>
        {proposal.status === 'pending' && (
          <Button size="sm" variant="ghost" onClick={approve} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProposalCardFull({ proposal, onUpdate }: any) {
  const [loading, setLoading] = useState(false);

  const categoryColors: Record<string, string> = {
    A: 'bg-green-500/10 text-green-600 border-green-500/20',
    B: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    C: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    approved: 'bg-green-500/10 text-green-600 border-green-500/20',
    executed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-500/10 text-red-600 border-red-500/20';
    if (priority >= 5) return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
  };

  async function approve() {
    setLoading(true);
    try {
      const res = await fetch(`/api/executive/proposals/${proposal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createTask: true }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.data?.taskCreated) {
          toast.success('✅ Proposal approved and task created for Squad!', { duration: 4000 });
        } else {
          toast.success('Proposal approved');
        }
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
        if (data.taskCreated) {
          toast.success('✅ Artifact generated and task assigned to Squad!', { duration: 5000 });
        } else {
          toast.success('✅ Artifact generated!', { duration: 5000 });
        }
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

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={categoryColors[proposal.category as keyof typeof categoryColors]}>
              {proposal.category}
            </Badge>
            <Badge variant="outline" className={statusColors[proposal.status as keyof typeof statusColors]}>
              {proposal.status}
            </Badge>
            <Badge variant="outline" className={getPriorityColor(proposal.priority || 0)}>
              Priority: {proposal.priority || 0}
            </Badge>
            <h4 className="font-semibold">{proposal.title}</h4>
          </div>

          <p className="text-sm text-muted-foreground">{proposal.rationale}</p>

          {proposal.steps && proposal.steps.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Steps:</p>
              {proposal.steps.slice(0, 3).map((step: string, i: number) => (
                <div key={i}>• {step}</div>
              ))}
              {proposal.steps.length > 3 && (
                <div className="text-muted-foreground">+ {proposal.steps.length - 3} more...</div>
              )}
            </div>
          )}

          {proposal.deliverable && (
            <p className="text-xs text-muted-foreground">
              📦 <strong>Deliverable:</strong> {proposal.deliverable}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {proposal.status === 'pending' && (
            <>
              <Button size="sm" onClick={approve} disabled={loading}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={reject} disabled={loading}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </>
          )}
          {proposal.status === 'approved' && (
            <Button size="sm" onClick={executeOne} disabled={loading}>
              <Play className="h-4 w-4 mr-1" />
              Execute
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ArtifactCardCompact({ artifact, onUpdate }: any) {
  return (
    <div className="border rounded-lg p-3 hover:bg-accent/50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{artifact.title}</p>
          <p className="text-xs text-muted-foreground">{artifact.artifact_type}</p>
        </div>
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

function AgentStatusCompact({ agent }: any) {
  const agentIcons: Record<string, string> = {
    Atlas: '🗺️',
    Lyric: '✍️',
    Scout: '🔍',
    Beacon: '📢',
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600 border-green-500/20',
    idle: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  };

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{agentIcons[agent.name] || '🤖'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{agent.name}</p>
          <Badge className={`${statusColors[agent.status]} text-xs mt-1`}>
            {agent.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function TaskCardCompact({ task, onUpdate }: any) {
  return (
    <div className="border rounded-lg p-3 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">Priority: {task.priority}</Badge>
            {task.metadata?.source === 'chief_of_staff' && (
              <Badge className="text-xs bg-blue-500/10 text-blue-600">From CoS</Badge>
            )}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

// Squad Tab - Full Implementation
export function SquadTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSquadData();
  }, [statusFilter]);

  async function loadSquadData() {
    setLoading(true);
    try {
      const [agentsRes, tasksRes] = await Promise.all([
        fetch('/api/squad/agents'),
        statusFilter === 'all'
          ? fetch('/api/squad/tasks')
          : fetch(`/api/squad/tasks?status=${statusFilter}`),
      ]);

      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();

      if (agentsData.success) setAgents(agentsData.data || []);
      if (tasksData.success) setTasks(tasksData.data || []);
    } catch (err) {
      console.error('Failed to load squad data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center p-8">Loading squad data...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Agent Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Agent Status</h3>
        <div className="space-y-3">
          {agents.map((agent) => (
            <AgentCardFull key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* Right: Tasks */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tasks</h3>
          <CreateTaskDialog onTaskCreated={loadSquadData} />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'assigned', 'in_progress', 'review', 'done', 'blocked'].map((status) => (
            <Button
              key={status}
              size="sm"
              variant={statusFilter === status ? 'default' : 'outline'}
              onClick={() => setStatusFilter(status)}
            >
              {status.replace('_', ' ')}
            </Button>
          ))}
        </div>

        {/* Tasks List */}
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <Card className="p-8">
              <p className="text-center text-muted-foreground">
                No tasks found. Create one or approve B-category proposals.
              </p>
            </Card>
          ) : (
            tasks.map((task) => (
              <TaskCardFull key={task.id} task={task} onUpdate={loadSquadData} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Artifacts Tab - Full Implementation
export function ArtifactsTab() {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [showPublished, setShowPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);

  useEffect(() => {
    loadArtifacts();
  }, []);

  async function loadArtifacts() {
    try {
      const res = await fetch('/api/executive/artifacts');
      const data = await res.json();
      if (data.success) setArtifacts(data.data || []);
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

  if (loading) {
    return <div className="text-center p-8">Loading artifacts...</div>;
  }

  const filteredArtifacts = showPublished
    ? artifacts.filter((a) => a.published)
    : artifacts.filter((a) => !a.published);

  return (
    <div className="space-y-4">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={!showPublished ? 'default' : 'outline'}
            onClick={() => setShowPublished(false)}
          >
            Active ({artifacts.filter((a) => !a.published).length})
          </Button>
          <Button
            size="sm"
            variant={showPublished ? 'default' : 'outline'}
            onClick={() => setShowPublished(true)}
          >
            Published ({artifacts.filter((a) => a.published).length})
          </Button>
        </div>
      </div>

      {/* Artifacts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredArtifacts.length === 0 ? (
          <Card className="p-8 col-span-full">
            <p className="text-center text-muted-foreground">
              {showPublished
                ? 'No published artifacts yet.'
                : 'No active artifacts. Execute approved proposals.'}
            </p>
          </Card>
        ) : (
          filteredArtifacts.map((artifact) => (
            <Card key={artifact.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  {artifact.published && (
                    <Badge variant="secondary" className="text-xs">Published</Badge>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-sm line-clamp-2">{artifact.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {artifact.artifact_type} • {new Date(artifact.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setSelectedArtifact(artifact)}
                    >
                      View Content
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{artifact.title}</DialogTitle>
                      <DialogDescription>
                        {artifact.artifact_type} • {new Date(artifact.created_at).toLocaleString()}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg max-h-[400px] overflow-y-auto">
                        {artifact.content}
                      </div>
                      <div className="flex gap-2 justify-between pt-4 border-t">
                        <Button
                          variant={artifact.published ? 'outline' : 'default'}
                          onClick={() => togglePublished(artifact.id, artifact.published)}
                        >
                          {artifact.published ? 'Mark as Active' : 'Mark as Published'}
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => copyToClipboard(artifact.content)}
                          >
                            Copy
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
    </div>
  );
}

// Activity Tab - Full Implementation
export function ActivityTab() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
    const interval = setInterval(loadActivity, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadActivity() {
    try {
      const res = await fetch('/api/squad/activity?limit=100');
      const data = await res.json();
      if (data.success) setActivities(data.data || []);
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center p-8">Loading activity feed...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Unified Activity Feed</h3>
        <Badge variant="outline">{activities.length} events</Badge>
      </div>

      {activities.length === 0 ? (
        <Card className="p-8">
          <p className="text-center text-muted-foreground">No activity yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => (
            <Card key={activity.id} className="p-4">
              <div className="flex items-start gap-3">
                <Activity className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activity.agents && (
                      <span className="font-medium text-sm">{activity.agents.name}</span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {activity.activity_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{activity.message}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// History Tab - Full Implementation
export function HistoryTab() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const res = await fetch('/api/executive/history');
      const data = await res.json();
      if (data.success) setRuns(data.data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center p-8">Loading history...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Run History</h3>
        <Badge variant="outline">{runs.length} runs</Badge>
      </div>

      {runs.length === 0 ? (
        <Card className="p-8">
          <p className="text-center text-muted-foreground">
            No history yet. Run Daily Pulse or Weekly Cycle to start.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {runs.map((run) => (
            <Card key={run.id} className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{run.mode}</Badge>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">
                  {new Date(run.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(run.created_at).toLocaleTimeString()}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{run.duration_ms}ms</span>
                  <span>{run.tokens_used} tokens</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Supporting Components
function AgentCardFull({ agent }: any) {
  const agentIcons: Record<string, string> = {
    Atlas: '🗺️',
    Lyric: '✍️',
    Scout: '🔍',
    Beacon: '📢',
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600 border-green-500/20',
    idle: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  };

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agentIcons[agent.name] || '🤖'}</span>
            <div>
              <h4 className="font-semibold">{agent.name}</h4>
              <p className="text-xs text-muted-foreground">{agent.role}</p>
            </div>
          </div>
          <Badge className={statusColors[agent.status as keyof typeof statusColors]}>
            {agent.status}
          </Badge>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Heartbeat:</span>
            <span>{agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'Never'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Count:</span>
            <span>{agent.heartbeat_count || 0}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TaskCardFull({ task, onUpdate }: any) {
  const [loading, setLoading] = useState(false);
  const [newStatus, setNewStatus] = useState(task.status);

  async function updateStatus() {
    if (newStatus === task.status) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/squad/tasks/${task.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Task updated');
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

  const statusColors: Record<string, string> = {
    inbox: 'bg-gray-500/10 text-gray-600',
    assigned: 'bg-yellow-500/10 text-yellow-600',
    in_progress: 'bg-blue-500/10 text-blue-600',
    review: 'bg-purple-500/10 text-purple-600',
    done: 'bg-green-500/10 text-green-600',
    blocked: 'bg-red-500/10 text-red-600',
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold">{task.title}</h4>
            <Badge className={statusColors[task.status as keyof typeof statusColors]}>
              {task.status}
            </Badge>
            <Badge variant="outline">Priority: {task.priority}</Badge>
            {task.metadata?.source === 'chief_of_staff' && (
              <Badge className="bg-blue-500/10 text-blue-600">From Chief-of-Staff</Badge>
            )}
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">{task.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Created {new Date(task.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inbox">Inbox</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          {newStatus !== task.status && (
            <Button size="sm" onClick={updateStatus} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function CreateTaskDialog({ onTaskCreated }: { onTaskCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignees: [] as string[],
    priority: 5,
  });

  useEffect(() => {
    if (open) loadAgents();
  }, [open]);

  async function loadAgents() {
    try {
      const res = await fetch('/api/squad/agents');
      const data = await res.json();
      if (data.success) setAgents(data.data || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  }

  async function createTask() {
    if (!formData.title || formData.assignees.length === 0) {
      toast.error('Title and at least one assignee required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/squad/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          assigneeSessionKeys: formData.assignees,
          priority: formData.priority,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Task created!');
        setOpen(false);
        setFormData({ title: '', description: '', assignees: [], priority: 5 });
        onTaskCreated();
      } else {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Create Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Assign work to the agent squad</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Task title..."
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Task details..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Assign to</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {agents.map((agent) => (
                <label key={agent.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.assignees.includes(agent.session_key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          assignees: [...formData.assignees, agent.session_key],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          assignees: formData.assignees.filter((s) => s !== agent.session_key),
                        });
                      }
                    }}
                  />
                  <span className="text-sm">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Priority (1-10)</label>
            <Input
              type="number"
              min="1"
              max="10"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 5 })}
            />
          </div>

          <Button onClick={createTask} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create Task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
