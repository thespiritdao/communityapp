'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Clock,
  Calendar,
  Brain,
  CheckCircle,
  XCircle,
  Play,
  FileText,
  Loader2,
  Users,
  Activity,
  Target,
  Plus,
  Zap,
  ArrowRight,
  AlertCircle,
  Newspaper,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { UserGuideModal } from '@/components/executive/UserGuideModal';
import {
  OverviewTab,
  BrainDumpTab,
  ProposalsTab,
  SquadTab,
  ArtifactsTab,
  ActivityTab,
  HistoryTab,
  MarketingTab,
} from '@/components/executive/UnifiedTabComponents';

export default function UnifiedDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1920px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Zap className="h-8 w-8 text-yellow-500" />
              Executive Operating System
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <UserGuideModal />
            <Badge variant="outline" className="text-sm px-3 py-1">
              🔒 Founder Only
            </Badge>
          </div>
        </div>

        {/* Unified Stats Bar */}
        <UnifiedStats />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <QuickActionButton
            icon={<Clock className="h-4 w-4" />}
            label="Daily Pulse"
            onClick={() => handleRunCycle('daily')}
            color="blue"
          />
          <QuickActionButton
            icon={<Calendar className="h-4 w-4" />}
            label="Weekly Cycle"
            onClick={() => handleRunCycle('weekly')}
            color="purple"
          />
          <QuickActionButton
            icon={<CheckCircle className="h-4 w-4" />}
            label="Approve All A"
            onClick={handleApproveAllA}
            color="green"
          />
          <QuickActionButton
            icon={<Play className="h-4 w-4" />}
            label="Execute"
            onClick={handleExecute}
            color="orange"
          />
          <QuickActionButton
            icon={<Users className="h-4 w-4" />}
            label="Init Squad"
            onClick={handleInitializeSquad}
            color="cyan"
          />
          <CreateTaskButton />
          <QuickActionButton
            icon={<Brain className="h-4 w-4" />}
            label="Brain Dump"
            onClick={() => setActiveTab('brain-dump')}
            color="pink"
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="overview">
              <Zap className="h-4 w-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="brain-dump">
              <Brain className="h-4 w-4 mr-1" />
              Brain Dump
            </TabsTrigger>
            <TabsTrigger value="proposals">
              <Target className="h-4 w-4 mr-1" />
              Proposals
            </TabsTrigger>
            <TabsTrigger value="squad">
              <Users className="h-4 w-4 mr-1" />
              Squad
            </TabsTrigger>
            <TabsTrigger value="artifacts">
              <FileText className="h-4 w-4 mr-1" />
              Artifacts
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity className="h-4 w-4 mr-1" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="h-4 w-4 mr-1" />
              History
            </TabsTrigger>
            <TabsTrigger value="marketing">
              <Newspaper className="h-4 w-4 mr-1" />
              Marketing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="brain-dump" className="space-y-4">
            <BrainDumpTab onProcessed={() => setActiveTab('proposals')} />
          </TabsContent>

          <TabsContent value="proposals" className="space-y-4">
            <ProposalsTab />
          </TabsContent>

          <TabsContent value="squad" className="space-y-4">
            <SquadTab />
          </TabsContent>

          <TabsContent value="artifacts" className="space-y-4">
            <ArtifactsTab />
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <ActivityTab />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <HistoryTab />
          </TabsContent>

          <TabsContent value="marketing" className="space-y-4">
            <MarketingTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function UnifiedStats() {
  const [stats, setStats] = useState({
    pendingProposals: 0,
    approvedProposals: 0,
    activeAgents: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    activeArtifacts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const [proposalsRes, agentsRes, tasksRes, artifactsRes] = await Promise.all([
        fetch('/api/executive/proposals'),
        fetch('/api/squad/agents'),
        fetch('/api/squad/tasks'),
        fetch('/api/executive/artifacts'),
      ]);

      const proposalsData = await proposalsRes.json();
      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();
      const artifactsData = await artifactsRes.json();

      if (proposalsData.success && agentsData.success && tasksData.success && artifactsData.success) {
        const proposals = proposalsData.data || [];
        const agents = agentsData.data || [];
        const tasks = tasksData.data || [];
        const artifacts = artifactsData.data || [];

        setStats({
          pendingProposals: proposals.filter((p: any) => p.status === 'pending').length,
          approvedProposals: proposals.filter((p: any) => p.status === 'approved').length,
          activeAgents: agents.filter((a: any) => a.status === 'active').length,
          pendingTasks: tasks.filter((t: any) => t.status === 'assigned').length,
          inProgressTasks: tasks.filter((t: any) => t.status === 'in_progress').length,
          activeArtifacts: artifacts.filter((a: any) => !a.published).length,
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="p-3 h-20 animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <StatCard
        icon={<CheckCircle className="h-5 w-5" />}
        label="Approved Proposals"
        value={stats.approvedProposals}
        color="green"
      />
      <StatCard
        icon={<Target className="h-5 w-5" />}
        label="Pending Review"
        value={stats.pendingProposals}
        color="yellow"
      />
      <StatCard
        icon={<Users className="h-5 w-5" />}
        label="Active Agents"
        value={`${stats.activeAgents}/4`}
        color="blue"
      />
      <StatCard
        icon={<Clock className="h-5 w-5" />}
        label="Pending Tasks"
        value={stats.pendingTasks}
        color="orange"
      />
      <StatCard
        icon={<Activity className="h-5 w-5" />}
        label="In Progress"
        value={stats.inProgressTasks}
        color="purple"
      />
      <StatCard
        icon={<FileText className="h-5 w-5" />}
        label="Active Artifacts"
        value={stats.activeArtifacts}
        color="cyan"
      />
    </div>
  );
}

function StatCard({ icon, label, value, color }: any) {
  const colorClasses: Record<string, string> = {
    yellow: 'text-yellow-600 bg-yellow-500/10',
    green: 'text-green-600 bg-green-500/10',
    blue: 'text-blue-600 bg-blue-500/10',
    orange: 'text-orange-600 bg-orange-500/10',
    purple: 'text-purple-600 bg-purple-500/10',
    cyan: 'text-cyan-600 bg-cyan-500/10',
  };

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function QuickActionButton({ icon, label, onClick, color }: any) {
  const [loading, setLoading] = useState(false);

  const colorClasses: Record<string, string> = {
    blue: 'hover:bg-blue-500/10 hover:border-blue-500/20',
    purple: 'hover:bg-purple-500/10 hover:border-purple-500/20',
    green: 'hover:bg-green-500/10 hover:border-green-500/20',
    orange: 'hover:bg-orange-500/10 hover:border-orange-500/20',
    cyan: 'hover:bg-cyan-500/10 hover:border-cyan-500/20',
    pink: 'hover:bg-pink-500/10 hover:border-pink-500/20',
  };

  return (
    <Card
      className={`p-3 cursor-pointer transition-all ${colorClasses[color]}`}
      onClick={async () => {
        setLoading(true);
        try {
          await onClick();
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="p-2 bg-primary/10 rounded-lg">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        </div>
        <span className="font-medium text-xs">{label}</span>
      </div>
    </Card>
  );
}

// I'll continue with the tab implementations in the next message due to length
// This establishes the framework and core components

async function handleRunCycle(mode: 'daily' | 'weekly') {
  const endpoint = mode === 'daily' ? '/api/executive/daily' : '/api/executive/weekly';

  toast.loading(`Running ${mode} cycle...`);
  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.dismiss();
      toast.success(`${mode} cycle complete! Check proposals.`, { duration: 4000 });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      toast.dismiss();
      toast.error(data.error || 'Failed to run cycle');
    }
  } catch (err: any) {
    toast.dismiss();
    toast.error(err.message);
  }
}

async function handleApproveAllA() {
  toast.loading('Approving all A-category...');
  try {
    const res = await fetch('/api/executive/approve-all-a', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.dismiss();
      toast.success(data.message);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      toast.dismiss();
      toast.error(data.error);
    }
  } catch (err: any) {
    toast.dismiss();
    toast.error(err.message);
  }
}

async function handleExecute() {
  toast.loading('Executing approved proposals...');
  try {
    const res = await fetch('/api/executive/execute', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.dismiss();
      toast.success(data.message);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      toast.dismiss();
      toast.error(data.error);
    }
  } catch (err: any) {
    toast.dismiss();
    toast.error(err.message);
  }
}

async function handleInitializeSquad() {
  toast.loading('Initializing agent squad...');
  try {
    const res = await fetch('/api/squad/agents/init', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      toast.dismiss();
      toast.success(`${data.message}!`);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      toast.dismiss();
      toast.error(data.error);
    }
  } catch (err: any) {
    toast.dismiss();
    toast.error(err.message);
  }
}

function CreateTaskButton() {
  return (
    <Card className="p-3 cursor-pointer hover:bg-accent">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Plus className="h-4 w-4" />
        </div>
        <span className="font-medium text-xs">Create Task</span>
      </div>
    </Card>
  );
}
