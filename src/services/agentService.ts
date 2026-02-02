/**
 * Agent Service - Server-side wrapper for Chief-of-Staff Agent
 *
 * This imports the ActiveAgent code and exposes it for API routes
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { GoogleDriveService } from './googleDriveService';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Agent configuration
const AGENT_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8000;

// Load prompts (we'll inline them for now)
const CONSTITUTION = `You are the Chief-of-Staff for SpiritDAO. Your role is to externalize judgment, memory, and sequencing for the founder. You operate with conservative, grounded analysis based on real data. Never invent facts. Categorize all actions as A (internal prep), B (needs approval), or C (informational). Maintain organizational memory and narrative coherence.`;

const SYSTEM_PROMPT = `You are running operating cycles for SpiritDAO's founder. Provide structured, actionable output in JSON format. Be concrete, specific, and direct. Cite data sources. Focus on high-leverage actions given constraints: low cash, solo founder, post-beta launch stage.`;

export class AgentService {
  /**
   * Run daily pulse cycle
   */
  static async runDaily() {
    const context = await this.loadContext();

    const prompt = `Generate a Daily Pulse following this JSON schema.

CRITICAL: Return ONLY valid JSON with no markdown formatting. Do not wrap in code blocks. Start directly with { and end with }.

Schema:
{
  "pulse_summary": "1-2 sentence snapshot of org state",
  "top_priorities": ["priority 1", "priority 2", "priority 3"],
  "actions": [
    {
      "id": "D1",
      "category": "A|B|C",
      "title": "Clear action title",
      "rationale": "Why this matters today",
      "steps": ["Step 1", "Step 2"],
      "deliverable": "What gets produced",
      "priority": 1-10
    }
  ],
  "urgent_flags": ["anything urgent"]
}

Current Context:
${JSON.stringify(context, null, 2)}

Keep it focused - founder has limited time. 3-5 actions max.`;

    const result = await this.callClaude(prompt);

    // Save run
    const runId = await this.saveRun('daily', context, result.output);

    // Save proposals
    if (result.output.actions) {
      await this.saveProposals(runId, result.output.actions);
    }

    return result.output;
  }

  /**
   * Run weekly cycle
   */
  static async runWeekly() {
    const context = await this.loadContext();

    const prompt = `Generate a Weekly Operating Cycle following this JSON schema.

CRITICAL: Return ONLY valid JSON with no markdown formatting. Do not wrap in code blocks. Start directly with { and end with }.

Schema:
{
  "state_summary": "Comprehensive snapshot",
  "week_priorities": ["Priority 1", "Priority 2", "Priority 3"],
  "risks": [
    {
      "severity": "low|medium|high|critical",
      "description": "What could go wrong",
      "mitigation": "Proposed action"
    }
  ],
  "opportunities": [
    {
      "potential": "high|medium|low",
      "description": "What we could capture",
      "requirements": "What it would take"
    }
  ],
  "narrative_guidance": "Coherent story for this week",
  "actions": [/* 8-12 actions with A/B/C categories */],
  "meta_observations": ["Pattern insights"]
}

Current Context:
${JSON.stringify(context, null, 2)}

Be strategic and comprehensive. This is the main planning session.`;

    const result = await this.callClaude(prompt);

    // Save run
    const runId = await this.saveRun('weekly', context, result.output);

    // Save proposals
    if (result.output.actions) {
      await this.saveProposals(runId, result.output.actions);
    }

    return result.output;
  }

  /**
   * Process brain dump
   */
  static async processBrainDump(thoughts: string) {
    const context = await this.loadContext();

    const prompt = `Process this brain dump from the founder:

BRAIN DUMP:
${thoughts}

CRITICAL: Return ONLY valid JSON with no markdown formatting. Do not wrap in code blocks. Start directly with { and end with }.

Return JSON:
{
  "summary": "What you heard in 1-2 sentences",
  "themes": ["theme 1", "theme 2"],
  "urgent_items": ["urgent things"],
  "proposed_actions": [
    {
      "id": "BD1",
      "category": "A|B|C",
      "title": "Action title",
      "rationale": "Why this matters",
      "steps": ["Step 1", "Step 2"],
      "deliverable": "What gets produced",
      "priority": 1-10
    }
  ],
  "questions_for_clarification": ["any questions"]
}

Current organizational context:
${JSON.stringify(context, null, 2)}`;

    const result = await this.callClaude(prompt);

    // Save run
    const runId = await this.saveRun('query', { brain_dump: thoughts, ...context }, result.output);

    // Save proposals
    if (result.output.proposed_actions) {
      await this.saveProposals(runId, result.output.proposed_actions);
    }

    return result.output;
  }

  /**
   * Get pending proposals
   */
  static async getPendingProposals(category?: string) {
    let query = supabase
      .from('agent_proposals')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get proposals with optional filters
   */
  static async getProposals(status?: string, category?: string) {
    let query = supabase
      .from('agent_proposals')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Approve proposal
   */
  static async approveProposal(proposalId: string, reason?: string) {
    const { error: updateError } = await supabase
      .from('agent_proposals')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: 'founder',
      })
      .eq('id', proposalId);

    if (updateError) throw updateError;

    // Save decision
    const { error: decisionError } = await supabase
      .from('agent_decisions')
      .insert({
        proposal_id: proposalId,
        decision: 'approved',
        reason: reason || null,
        decided_by: 'founder',
      });

    if (decisionError) throw decisionError;
  }

  /**
   * Reject proposal
   */
  static async rejectProposal(proposalId: string, reason?: string) {
    const { error: updateError } = await supabase
      .from('agent_proposals')
      .update({ status: 'rejected' })
      .eq('id', proposalId);

    if (updateError) throw updateError;

    // Save decision
    const { error: decisionError } = await supabase
      .from('agent_decisions')
      .insert({
        proposal_id: proposalId,
        decision: 'rejected',
        reason: reason || null,
        decided_by: 'founder',
      });

    if (decisionError) throw decisionError;
  }

  /**
   * Approve all A-category
   */
  static async approveAllA() {
    const proposals = await this.getPendingProposals('A');

    for (const proposal of proposals) {
      await this.approveProposal(proposal.id, 'Auto-approved: Category A (internal preparation)');
    }

    return proposals.length;
  }

  /**
   * Reset executed proposal back to approved status for re-execution
   */
  static async resetProposalForReexecution(proposalId: string) {
    // Get the proposal
    const { data: proposal, error: fetchError } = await supabase
      .from('agent_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError) throw fetchError;
    if (!proposal) throw new Error('Proposal not found');

    // Delete old artifact if exists
    if (proposal.execution_result?.artifact_id) {
      await supabase
        .from('agent_artifacts')
        .delete()
        .eq('id', proposal.execution_result.artifact_id);
    }

    // Reset proposal to approved status
    const { error: updateError } = await supabase
      .from('agent_proposals')
      .update({
        status: 'approved',
        executed_at: null,
        execution_result: null,
      })
      .eq('id', proposalId);

    if (updateError) throw updateError;

    return { success: true, message: 'Proposal reset to approved status. Ready for re-execution.' };
  }

  /**
   * Execute approved proposals
   */
  static async executeApproved() {
    const { data: proposals, error } = await supabase
      .from('agent_proposals')
      .select('*')
      .eq('status', 'approved');

    if (error) throw error;
    if (!proposals || proposals.length === 0) return [];

    // Get Google access token if available
    const googleAccessToken = await this.getGoogleAccessToken();

    const executed = [];

    for (const proposal of proposals) {
      try {
        // Generate artifact based on proposal (with optional Google Drive access)
        const artifact = await this.generateArtifact(proposal, googleAccessToken);

        // Mark as executed
        await supabase
          .from('agent_proposals')
          .update({
            status: 'executed',
            executed_at: new Date().toISOString(),
            execution_result: { artifact_id: artifact?.id },
          })
          .eq('id', proposal.id);

        executed.push(proposal);
      } catch (err) {
        // Mark as failed
        await supabase
          .from('agent_proposals')
          .update({
            status: 'failed',
            execution_result: { error: String(err) },
          })
          .eq('id', proposal.id);
      }
    }

    return executed;
  }

  /**
   * Execute single approved proposal
   */
  static async executeSingleProposal(proposalId: string) {
    // Get proposal
    const { data: proposal, error: fetchError } = await supabase
      .from('agent_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError) throw fetchError;
    if (!proposal) throw new Error('Proposal not found');
    if (proposal.status !== 'approved') throw new Error('Proposal must be approved first');

    // Get Google access token if available
    const googleAccessToken = await this.getGoogleAccessToken();

    try {
      // Generate artifact (with optional Google Drive access)
      const artifact = await this.generateArtifact(proposal, googleAccessToken);

      // Mark as executed
      await supabase
        .from('agent_proposals')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          execution_result: { artifact_id: artifact?.id },
        })
        .eq('id', proposalId);

      return artifact;
    } catch (err) {
      // Mark as failed
      await supabase
        .from('agent_proposals')
        .update({
          status: 'failed',
          execution_result: { error: String(err) },
        })
        .eq('id', proposalId);

      throw err;
    }
  }

  /**
   * Get artifacts
   */
  static async getArtifacts(limit = 20) {
    const { data, error } = await supabase
      .from('agent_artifacts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Get run history
   */
  static async getHistory(limit = 10) {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Get dashboard stats
   */
  static async getDashboardStats() {
    const [pending, approved, executed, lastRun] = await Promise.all([
      supabase.from('agent_proposals').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('agent_proposals').select('id', { count: 'exact' }).eq('status', 'approved'),
      supabase.from('agent_proposals').select('id', { count: 'exact' }).eq('status', 'executed'),
      supabase.from('agent_runs').select('*').order('created_at', { ascending: false }).limit(1).single(),
    ]);

    return {
      pending_count: pending.count || 0,
      approved_count: approved.count || 0,
      executed_count: executed.count || 0,
      last_run: lastRun.data,
    };
  }

  // ===== PRIVATE HELPERS =====

  private static async callClaude(prompt: string) {
    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: MAX_TOKENS,
      system: `${CONSTITUTION}\n\n${SYSTEM_PROMPT}`,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    let output: any;
    try {
      // Strip markdown code blocks if present
      let cleaned = textContent.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      output = JSON.parse(cleaned);
    } catch (e) {
      output = { raw_response: textContent, error: 'Invalid JSON' };
    }

    return {
      output,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      duration: Date.now() - startTime,
    };
  }

  private static async loadContext() {
    // Load organizational metrics from Supabase
    const [users, pods, forum, governance] = await Promise.all([
      this.getUserMetrics(),
      this.getPodMetrics(),
      this.getForumMetrics(),
      this.getGovernanceMetrics(),
    ]);

    return {
      org_state: {
        name: 'SpiritDAO',
        stage: 'post-beta launch',
        constraints: {
          cash: 'very low',
          team: 'founder-led',
          board: 'none',
        },
      },
      metrics: { users, pods, forum, governance },
      timestamp: new Date().toISOString(),
    };
  }

  private static async getUserMetrics() {
    const { count } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact' });
    return { total: count || 0 };
  }

  private static async getPodMetrics() {
    const { count } = await supabase
      .from('pods')
      .select('id', { count: 'exact' });
    return { total: count || 0 };
  }

  private static async getForumMetrics() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: posts } = await supabase
      .from('forum_posts')
      .select('id', { count: 'exact' })
      .gte('created_at', weekAgo);
    const { count: comments } = await supabase
      .from('forum_comments')
      .select('id', { count: 'exact' })
      .gte('created_at', weekAgo);
    return { posts_this_week: posts || 0, comments_this_week: comments || 0 };
  }

  private static async getGovernanceMetrics() {
    const { count } = await supabase
      .from('governance_proposals')
      .select('id', { count: 'exact' });
    return { total: count || 0 };
  }

  private static async saveRun(mode: string, context: any, output: any) {
    const { data, error } = await supabase
      .from('agent_runs')
      .insert({
        mode,
        input_context: context,
        output,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  private static async saveProposals(runId: string, actions: any[]) {
    const proposals = actions.map((action) => ({
      run_id: runId,
      category: action.category,
      title: action.title,
      rationale: action.rationale,
      steps: action.steps,
      deliverable: action.deliverable || null,
      status: 'pending',
      priority: action.priority || 5,
    }));

    const { error } = await supabase
      .from('agent_proposals')
      .insert(proposals);

    if (error) throw error;
  }

  /**
   * Get Google Drive access token from Supabase
   */
  private static async getGoogleAccessToken(): Promise<string | undefined> {
    try {
      const { data, error } = await supabase
        .from('agent_context')
        .select('data')
        .eq('context_type', 'google_oauth')
        .single();

      if (error || !data) return undefined;

      return data.data.access_token;
    } catch (e) {
      console.log('No Google OAuth token found');
      return undefined;
    }
  }

  private static async generateArtifact(proposal: any, googleAccessToken?: string) {
    // Determine artifact type
    let artifactType = 'document';
    const titleLower = proposal.title.toLowerCase();

    if (titleLower.includes('linkedin') || titleLower.includes('post') || titleLower.includes('social')) {
      artifactType = 'social_post';
    } else if (titleLower.includes('email')) {
      artifactType = 'email_draft';
    } else if (titleLower.includes('plan')) {
      artifactType = 'plan';
    } else if (titleLower.includes('report')) {
      artifactType = 'report';
    } else if (titleLower.includes('presentation') || titleLower.includes('deck') || titleLower.includes('slides')) {
      artifactType = 'presentation';
    }

    // Load context for artifact generation (with optional Google Drive access)
    const context = await this.loadArtifactContext(artifactType, googleAccessToken);

    // Generate actual artifact content using Claude
    const content = await this.generateArtifactWithClaude(proposal, artifactType, context);

    const { data, error } = await supabase
      .from('agent_artifacts')
      .insert({
        proposal_id: proposal.id,
        artifact_type: artifactType,
        title: proposal.title,
        content,
        published: false,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  private static async loadArtifactContext(artifactType: string, accessToken?: string): Promise<any> {
    // Load organizational context from DAO directory
    const daoBasePath = 'C:\\Users\\PC\\Documents\\DAO';

    // Always include core org context
    const orgContext = {
      org_name: 'SpiritDAO',
      mission: 'Mobile-first community platform for DAOs and onchain communities',
      stage: 'post-beta launch',
      constraints: {
        cash: 'very low',
        team: 'founder-led',
        board: 'none',
      },
      tech_stack: {
        frontend: 'Next.js, React, TypeScript',
        backend: 'Supabase (PostgreSQL)',
        blockchain: 'Coinbase Embedded Wallets (previously OnchainKit)',
        roles: 'Hats Protocol (ERC-1155)',
      },
      key_features: [
        'Pods (community groups)',
        'Forum discussions',
        'Governance proposals',
        'Bounties',
        'Role-based permissions via Hats',
      ],
      approved_channels: ['LinkedIn', 'X', 'TikTok'],
    };

    // Load additional context based on artifact type
    let additionalContext: any = {};

    try {
      // For social posts, load recent content themes
      if (artifactType === 'social_post') {
        additionalContext.content_guidelines = {
          tone: 'authentic, grounded, community-focused',
          avoid: 'hype, buzzwords, unsubstantiated claims',
          focus: 'real user value, spiritual community building, decentralized governance',
        };

        // Load recent social posts for style consistency
        const recentArtifacts = await this.getArtifacts(5);
        const recentPosts = recentArtifacts.filter(a => a.artifact_type === 'social_post');
        if (recentPosts.length > 0) {
          additionalContext.recent_posts = recentPosts.map(p => ({
            title: p.title,
            preview: p.content.substring(0, 200),
          }));
        }
      }

      // For presentations, include grant/pitch context
      if (artifactType === 'presentation') {
        additionalContext.presentation_context = {
          grant_history: 'Applied to Artizen Fund, Google AI Grant, OSV Fellowship, philanthropic foundations',
          value_props: [
            'Spiritual communities lack modern coordination tools',
            'DAOs need human-centered governance',
            'Mobile-first approach increases accessibility',
          ],
        };

        // Load grant documents from Google Drive if access token available
        if (accessToken) {
          try {
            const grantDocs = await GoogleDriveService.loadGrantDocuments(accessToken);
            if (grantDocs.length > 0) {
              additionalContext.grant_documents = grantDocs.map(doc => ({
                name: doc.name,
                excerpt: doc.content.substring(0, 1000),
                modified: doc.modifiedTime,
              }));
            }
          } catch (error) {
            console.log('Could not load Google Drive grant documents:', error);
          }
        }
      }

      // For email drafts, load relevant Google Docs templates
      if (artifactType === 'email_draft' && accessToken) {
        try {
          const emailDocs = await GoogleDriveService.searchDocuments('email', accessToken, 3);
          if (emailDocs.length > 0) {
            additionalContext.email_templates = emailDocs.map(doc => ({
              name: doc.name,
              excerpt: doc.content.substring(0, 800),
            }));
          }
        } catch (error) {
          console.log('Could not load email templates from Google Drive:', error);
        }
      }

      // For plans, include current metrics
      if (artifactType === 'plan') {
        const metrics = await this.loadContext();
        additionalContext.current_metrics = metrics.metrics;
      }
    } catch (e) {
      console.log('Could not load additional context:', e);
    }

    return { ...orgContext, ...additionalContext };
  }

  private static async generateArtifactWithClaude(
    proposal: any,
    artifactType: string,
    context: any
  ): Promise<string> {
    // Build artifact-specific prompt
    const prompt = this.buildArtifactPrompt(proposal, artifactType, context);

    // Call Claude to generate the artifact (raw text, not JSON)
    const result = await this.callClaudeRaw(prompt);

    return result.content;
  }

  /**
   * Call Claude API for raw text output (not JSON)
   */
  private static async callClaudeRaw(prompt: string) {
    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: MAX_TOKENS,
      system: `You are the Chief-of-Staff for SpiritDAO. Generate high-quality, production-ready work products. Be specific, detailed, and grounded in real context. Return content in markdown format.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content
      .filter((block) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    return {
      content: textContent,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      duration: Date.now() - startTime,
    };
  }

  private static buildArtifactPrompt(proposal: any, artifactType: string, context: any): string {
    const baseContext = `# ORGANIZATIONAL CONTEXT
${JSON.stringify(context, null, 2)}

# PROPOSAL TO EXECUTE
**Title**: ${proposal.title}
**Category**: ${proposal.category}
**Rationale**: ${proposal.rationale}
**Deliverable**: ${proposal.deliverable || 'Not specified'}

**Implementation Steps**:
${proposal.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}
`;

    // Artifact-specific instructions
    const artifactPrompts: Record<string, string> = {
      social_post: `${baseContext}

# YOUR TASK
Generate a complete, ready-to-publish social media post based on the proposal above.

## Requirements
- Write actual post copy, not a description of what to post
- Include a compelling hook in the first line
- Keep it authentic and grounded (avoid hype)
- Include a clear call-to-action
- Format for the specified platform (LinkedIn, X, or TikTok)
- If multiple posts requested, create complete drafts for each

## Output Format
Provide the post content in markdown with clear sections:

---
[PLATFORM NAME]

[Full post text here, ready to copy/paste]

[Hashtags if appropriate]

[CTA]
---

Generate substantial, production-ready content. This should save the founder significant time.`,

      email_draft: `${baseContext}

# YOUR TASK
Write a complete email draft based on the proposal above.

## Requirements
- Write the full email, not an outline
- Include a compelling subject line
- Clear, scannable body copy
- Specific call-to-action
- Professional but warm tone
- Personalization placeholders where appropriate

## Output Format
---
**Subject**: [Subject line]

**To**: [Recipient placeholder]

**Body**:
[Full email copy]

**Signature**:
[Appropriate closing]
---

Generate production-ready content that requires minimal editing.`,

      presentation: `${baseContext}

# YOUR TASK
Create a complete presentation deck outline with detailed slide content.

## Requirements
- Full slide-by-slide breakdown
- Talking points for each slide
- Specific data points and examples
- Visual suggestions
- Opening hook and closing CTA
- Designed for the specified audience (churches, grantors, etc.)

## Output Format
Provide as structured markdown:

# [Presentation Title]

## Slide 1: [Title]
**Visual**: [Description]
**Talking Points**:
- Point 1
- Point 2

**Speaker Notes**: [What to say]

[Continue for all slides...]

Generate a comprehensive deck that's ready to build in slides software.`,

      plan: `${baseContext}

# YOUR TASK
Create a detailed, actionable plan based on the proposal above.

## Requirements
- Specific, time-bound actions
- Dependencies and sequencing
- Success metrics
- Risk mitigation strategies
- Resource requirements
- Timeline with milestones

## Output Format
Provide as structured markdown with clear sections:

# [Plan Title]

## Executive Summary
[2-3 sentence overview]

## Objectives
- [Specific, measurable objective 1]
- [Specific, measurable objective 2]

## Timeline
[Detailed breakdown with dates/weeks]

## Action Items
[Comprehensive list with owners and deadlines]

## Success Metrics
[How we measure success]

## Risks & Mitigation
[What could go wrong and how to prevent it]

Generate a plan that's detailed enough to execute immediately.`,

      report: `${baseContext}

# YOUR TASK
Generate a comprehensive report/analysis based on the proposal.

## Requirements
- Data-driven analysis
- Clear findings and insights
- Actionable recommendations
- Visual data representations (described)
- Executive summary

## Output Format
Provide as structured markdown:

# [Report Title]

## Executive Summary
[Key findings in 3-5 bullets]

## Methodology
[How data was gathered/analyzed]

## Findings
[Detailed analysis with data]

## Insights
[What the data means]

## Recommendations
[Specific, actionable next steps]

## Appendix
[Supporting data/charts described]

Generate a report that provides genuine strategic value.`,

      document: `${baseContext}

# YOUR TASK
Create comprehensive documentation/content based on the proposal.

## Requirements
- Complete, production-ready content
- Well-structured and scannable
- Specific and actionable
- Ready to publish/share with minimal editing

## Output Format
Generate the full document in appropriate markdown formatting.

Focus on creating substantial, useful content that saves the founder significant time and mental energy.`,
    };

    const promptTemplate = artifactPrompts[artifactType] || artifactPrompts.document;

    return `${promptTemplate}

---

CRITICAL INSTRUCTIONS:
- Generate ACTUAL WORK PRODUCT, not a summary or outline
- Be specific, detailed, and production-ready
- This artifact should save the founder hours of work
- Focus on quality over quantity
- Ground everything in the organizational context provided
- Do not invent facts or metrics not provided

Return the artifact content directly, formatted in markdown.`;
  }
}
