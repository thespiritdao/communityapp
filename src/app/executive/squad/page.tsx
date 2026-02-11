'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Users,
  CheckCircle,
  Clock,
  Loader2,
  Plus,
  Activity,
  MessageSquare,
  Target,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function AgentSquadDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/executive" className="text-muted-foreground hover:text-foreground">
                ← Chief-of-Staff
              </Link>
              <span className="text-muted-foreground">/</span>
              <h1 className="text-3xl font-bold">Agent Squad</h1>
            </div>
            <p className="text-muted-foreground">Autonomous Marketing Team</p>
          </div>
          <div className="flex items-center gap-3">
            <InitializeSquadButton />
            <Badge variant="outline" className="text-sm">
              🤖 4 Agents
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <QuickStats />

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <TasksTab />
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <ActivityTab />
          </TabsContent>

          <TabsContent value="agents" className="space-y-4">
            <AgentsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickStats() {
  const [stats, setStats] = useState({
    activeAgents: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    completedToday: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [agentsRes, tasksRes] = await Promise.all([
        fetch('/api/squad/agents'),
        fetch('/api/squad/tasks'),
      ]);

      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();

      if (agentsData.success && tasksData.success) {
        const agents = agentsData.data || [];
        const tasks = tasksData.data || [];

        setStats({
          activeAgents: agents.filter((a: any) => a.status === 'active').length,
          pendingTasks: tasks.filter((t: any) => t.status === 'assigned').length,
          inProgressTasks: tasks.filter((t: any) => t.status === 'in_progress').length,
          completedToday: tasks.filter(
            (t: any) =>
              t.status === 'done' &&
              new Date(t.updated_at).toDateString() === new Date().toDateString()
          ).length,
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active Agents</p>
            <p className="text-2xl font-bold">{stats.activeAgents}/4</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <Target className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pending Tasks</p>
            <p className="text-2xl font-bold">{stats.pendingTasks}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold">{stats.inProgressTasks}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Activity className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Done Today</p>
            <p className="text-2xl font-bold">{stats.completedToday}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function OverviewTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    try {
      const [agentsRes, tasksRes] = await Promise.all([
        fetch('/api/squad/agents'),
        fetch('/api/squad/tasks?status=assigned'),
      ]);

      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();

      if (agentsData.success) setAgents(agentsData.data || []);
      if (tasksData.success) setTasks(tasksData.data || []);
    } catch (err) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Agent Status Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Agent Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentStatusCard key={agent.id} agent={agent} compact />
          ))}
        </div>
      </div>

      {/* Pending Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Pending Tasks</h3>
          <CreateTaskButton onTaskCreated={loadOverview} />
        </div>
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <Card className="p-6">
              <p className="text-center text-muted-foreground">
                No pending tasks. Create one to get started!
              </p>
            </Card>
          ) : (
            tasks.slice(0, 5).map((task) => (
              <TaskCard key={task.id} task={task} onUpdate={loadOverview} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AgentsTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    try {
      const res = await fetch('/api/squad/agents');
      const data = await res.json();
      if (data.success) setAgents(data.data || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {agents.map((agent) => (
        <AgentStatusCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}

function AgentStatusCard({ agent, compact = false }: { agent: any; compact?: boolean }) {
  const statusColors = {
    active: 'bg-green-500/10 text-green-600 border-green-500/20',
    idle: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  };

  const agentIcons: Record<string, string> = {
    Atlas: '🗺️',
    Lyric: '✍️',
    Scout: '🔍',
    Beacon: '📢',
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

        {!compact && (
          <>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Heartbeat:</span>
                <span>
                  {agent.last_heartbeat
                    ? new Date(agent.last_heartbeat).toLocaleTimeString()
                    : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heartbeat Count:</span>
                <span>{agent.heartbeat_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Session:</span>
                <span className="text-xs font-mono">{agent.session_key}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function TasksTab() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [statusFilter]);

  async function loadTasks() {
    setLoading(true);
    try {
      const url = statusFilter === 'all'
        ? '/api/squad/tasks'
        : `/api/squad/tasks?status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setTasks(data.data || []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
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
        <CreateTaskButton onTaskCreated={loadTasks} />
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <Card className="p-6">
            <p className="text-center text-muted-foreground">
              No tasks found for this filter.
            </p>
          </Card>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} onUpdate={loadTasks} />)
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onUpdate }: { task: any; onUpdate: () => void }) {
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
    cancelled: 'bg-gray-500/10 text-gray-600',
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{task.title}</h4>
            <Badge className={statusColors[task.status]}>
              {task.status}
            </Badge>
            <Badge variant="outline">Priority: {task.priority}</Badge>
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Created {new Date(task.created_at).toLocaleDateString()}
            {task.agents && ` by ${task.agents.name}`}
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

function ActivityTab() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, []);

  async function loadActivity() {
    try {
      const res = await fetch('/api/squad/activity?limit=50');
      const data = await res.json();
      if (data.success) setActivities(data.data || []);
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="space-y-2">
      {activities.length === 0 ? (
        <Card className="p-6">
          <p className="text-center text-muted-foreground">No activity yet.</p>
        </Card>
      ) : (
        activities.map((activity) => (
          <Card key={activity.id} className="p-4">
            <div className="flex items-start gap-3">
              <Activity className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {activity.agents && (
                    <span className="font-medium">{activity.agents.name}</span>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {activity.activity_type}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{activity.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(activity.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function InitializeSquadButton() {
  const [loading, setLoading] = useState(false);

  async function initializeSquad() {
    setLoading(true);
    try {
      const res = await fetch('/api/squad/agents/init', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        toast.success(`${data.message}! ${data.data.existing.length > 0 ? `(${data.data.existing.length} already existed)` : ''}`);
        window.location.reload();
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
    <Button onClick={initializeSquad} disabled={loading} variant="outline" size="sm">
      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
      Initialize Squad
    </Button>
  );
}

function CreateTaskButton({ onTaskCreated }: { onTaskCreated: () => void }) {
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
          <DialogDescription>Assign a task to one or more agents</DialogDescription>
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
            <label className="text-sm font-medium">Assign to (select multiple)</label>
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
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
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
