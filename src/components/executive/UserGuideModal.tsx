'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Clock, Brain, Target, Users, CheckCircle, XCircle } from 'lucide-react';

export function UserGuideModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HelpCircle className="h-4 w-4 mr-2" />
          User Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Executive Operating System - User Guide</DialogTitle>
          <DialogDescription>
            Complete guide to using Chief-of-Staff + Agent Squad
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {/* System Overview */}
          <section>
            <h3 className="font-semibold text-base mb-2">🎯 System Overview</h3>
            <p className="text-muted-foreground mb-3">
              You have two AI systems working together:
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold">Chief-of-Staff</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your strategic brain - plans, prioritizes, generates proposals
                </p>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Daily/Weekly cycles</li>
                  <li>• Brain Dump processing</li>
                  <li>• A/B/C proposals</li>
                  <li>• Artifact generation</li>
                </ul>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold">Agent Squad</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your execution team - researches, writes, publishes
                </p>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Atlas: Strategy 🗺️</li>
                  <li>• Lyric: Content ✍️</li>
                  <li>• Scout: Research 🔍</li>
                  <li>• Beacon: Social 📢</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Daily Workflow */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Daily Workflow (10 Minutes Every Morning)
            </h3>
            <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">1.</span>
                <div>
                  <p className="font-medium">Run Daily Pulse</p>
                  <p className="text-xs text-muted-foreground">Click "Daily Pulse" → Wait 30-60 seconds for AI analysis</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">2.</span>
                <div>
                  <p className="font-medium">Review Proposals</p>
                  <p className="text-xs text-muted-foreground">Check "Proposals" tab → See A/B/C categorized actions</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">3.</span>
                <div>
                  <p className="font-medium">Approve Work</p>
                  <p className="text-xs text-muted-foreground">Click "Approve All A" for internal prep → Manually review B-category</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">4.</span>
                <div>
                  <p className="font-medium">Execute</p>
                  <p className="text-xs text-muted-foreground">Click "Execute" button → Generates artifacts + creates Squad tasks</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">5.</span>
                <div>
                  <p className="font-medium">Check Artifacts</p>
                  <p className="text-xs text-muted-foreground">View "Artifacts" tab → Copy content → Use it → Mark as published</p>
                </div>
              </div>
            </div>
          </section>

          {/* A/B/C System */}
          <section>
            <h3 className="font-semibold text-base mb-2">🎯 Understanding A/B/C Categories</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3 border-l-4 border-green-500 pl-3 py-2">
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">A</Badge>
                <div>
                  <p className="font-medium">Internal Preparation</p>
                  <p className="text-xs text-muted-foreground">
                    Drafts, research, plans, analysis. <strong>Safe to auto-approve</strong> with "Approve All A"
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 border-l-4 border-yellow-500 pl-3 py-2">
                <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">B</Badge>
                <div>
                  <p className="font-medium">Needs Your Approval</p>
                  <p className="text-xs text-muted-foreground">
                    Public posts, emails, events. <strong>Always review manually.</strong> Auto-creates Squad tasks when approved.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 border-l-4 border-blue-500 pl-3 py-2">
                <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">C</Badge>
                <div>
                  <p className="font-medium">Informational Only</p>
                  <p className="text-xs text-muted-foreground">
                    Observations, alerts, patterns. No action required, just awareness.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Brain Dump */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Brain Dump (Your Relief Valve)
            </h3>
            <div className="space-y-2">
              <p className="text-muted-foreground">
                <strong>When to use:</strong> Overwhelmed, ideas hitting randomly, can't decide what to focus on
              </p>
              <p className="text-muted-foreground">
                <strong>How to use:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-3">
                <li>Type <strong>everything</strong> on your mind (don't filter)</li>
                <li>Mix topics freely (product + marketing + personal concerns)</li>
                <li>Include context ("worried about X because Y")</li>
                <li>Click "Process Brain Dump"</li>
              </ul>
              <div className="bg-muted/50 p-3 rounded text-xs">
                <p className="font-medium mb-1">Example:</p>
                <p className="text-muted-foreground italic">
                  "worried about user retention dropping, need more LinkedIn posts but no time,
                  should we do Twitter Spaces?, governance proposal sitting there 2 weeks,
                  website copy needs update..."
                </p>
              </div>
              <p className="text-muted-foreground">
                <strong>Agent will:</strong> Extract actionable proposals, identify themes, flag urgent items, prioritize by impact
              </p>
            </div>
          </section>

          {/* Workflow Integration */}
          <section>
            <h3 className="font-semibold text-base mb-2">🔄 How Integration Works</h3>
            <div className="space-y-3">
              <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20">
                <p className="font-medium mb-2">When you approve a B-category proposal:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>System automatically creates a task for the right agent</li>
                  <li>Agent gets notification on next heartbeat (every 15 min)</li>
                  <li>Task appears in "Squad" tab with status "assigned"</li>
                  <li>You can track progress in Activity feed</li>
                </ol>
              </div>
              <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
                <p className="font-medium mb-2">When agent completes a task:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>System creates artifact in "Artifacts" tab</li>
                  <li>Original proposal marked as "executed"</li>
                  <li>You can view, copy, or download the artifact</li>
                  <li>Mark as published when you use it</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h3 className="font-semibold text-base mb-2">⚡ Quick Actions Reference</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border rounded p-2">
                <p className="font-medium">Daily Pulse</p>
                <p className="text-muted-foreground">5-10 min strategic check-in</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium">Weekly Cycle</p>
                <p className="text-muted-foreground">30-45 min planning session</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium">Approve All A</p>
                <p className="text-muted-foreground">Auto-approve internal prep</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium">Execute</p>
                <p className="text-muted-foreground">Run approved proposals</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium">Initialize Squad</p>
                <p className="text-muted-foreground">Create 4 agents (first time)</p>
              </div>
              <div className="border rounded p-2">
                <p className="font-medium">Create Task</p>
                <p className="text-muted-foreground">Assign work to agents manually</p>
              </div>
            </div>
          </section>

          {/* Best Practices */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Do This
            </h3>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>✅ Run Daily Pulse every morning</li>
              <li>✅ Use Brain Dump when overwhelmed</li>
              <li>✅ Review B-category carefully (public = high stakes)</li>
              <li>✅ Mark artifacts as published after using</li>
              <li>✅ Check Activity feed to see what's happening</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Don't Do This
            </h3>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>❌ Don't skip reviewing B-category proposals</li>
              <li>❌ Don't execute proposals you don't understand</li>
              <li>❌ Don't forget to check Artifacts tab</li>
              <li>❌ Don't create tasks and abandon them</li>
              <li>❌ Don't ignore C-category observations (insights!)</li>
            </ul>
          </section>

          {/* Success Metrics */}
          <section className="border-t pt-4">
            <h3 className="font-semibold text-base mb-2">📈 You're Doing It Right If:</h3>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>• Fewer "what should I do today?" moments</li>
              <li>• Publishing content consistently (2-3x/week)</li>
              <li>• Less decision fatigue</li>
              <li>• Important tasks aren't slipping through cracks</li>
              <li>• Clear weekly narrative guiding actions</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
