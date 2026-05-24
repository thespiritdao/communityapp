# Automated Community Digest — Feature Spec

**Date:** 2026-04-23
**App:** SpiritDAO Community App (commapp)
**Author:** Engineering
**Status:** Future spec (not yet scheduled)

---

## 1. Overview

An automated system that generates weekly community digests from platform activity — governance votes, bounty completions, event happenings, forum highlights, pod updates — and publishes them to the website blog and YouTube descriptions. Eliminates the need for manual content creation while maintaining a regular publishing cadence.

**Why this matters:**
- Regular content signals an active, living community (critical for onboarding)
- SEO value from consistent blog publishing on spiritdao.org
- Social media content pipeline without manual writing
- Transparency — community members can see what happened across pods
- Founder bandwidth is fully consumed; content creation must be automated

**What this does NOT do:**
- Replace intentional long-form writing (philosophy, mission essays)
- Auto-post to social media without review (generates drafts for approval)
- Require new smart contracts or blockchain changes
- Change any existing app functionality

---

## 2. Current State

### Content Sources Available in DB

| Source | Table | Data Available |
|--------|-------|---------------|
| Governance votes | `pod_level_proposals`, `governance_votes` | Proposals created, vote results, status changes |
| Bounties | `bounties`, `work_submissions` | New bounties, assignments, completions |
| Events | `events`, `event_attendees` | Events created, registrations, completions |
| Forum | `forum_threads`, `forum_posts` | New threads, reply counts, popular discussions |
| Pod activity | `pods`, `pod_members`, `pod_applications` | New pods, new members, applications |
| Donations | `pending_donations`, `burn_requests` | Donation amounts, burn events |
| Token activity | `treasury_snapshots`, `system_supply_metadata` | Supply changes, treasury movements |

### Publishing Channels

| Channel | Current State | Integration |
|---------|--------------|-------------|
| spiritdao.org blog | No blog exists | Would need new page or subdomain |
| YouTube | Channel exists (@SpiritDAO) | Video descriptions, community posts |
| Newsletter | Paragraph.xyz signup exists | Email delivery |
| Discord | 92 members | Bot post |

---

## 3. Design

### 3.1 Architecture

```
Weekly Cron Job (Sunday night)
         ↓
Query all activity tables for past 7 days
         ↓
Aggregate into structured activity summary (JSON)
         ↓
Send to Claude API with digest prompt template
         ↓
Claude generates:
  1. Blog post (markdown, 300-500 words)
  2. Newsletter snippet (150 words)
  3. Social media posts (2-3 short posts)
         ↓
Save as draft in digest_posts table
         ↓
Notify admin (Ron) for review/approval
         ↓
On approval → publish to configured channels
```

### 3.2 Activity Aggregation

The aggregation query collects weekly metrics:

```typescript
interface WeeklyActivity {
  period: { start: Date; end: Date };

  governance: {
    proposalsCreated: number;
    proposalsPassed: number;
    proposalsRejected: number;
    totalVotesCast: number;
    highlights: { title: string; outcome: string; pod: string }[];
  };

  bounties: {
    newBounties: number;
    completedBounties: number;
    totalValueDistributed: number;
    highlights: { title: string; pod: string; status: string }[];
  };

  events: {
    eventsCreated: number;
    eventsCompleted: number;
    totalAttendees: number;
    highlights: { title: string; attendees: number; pod: string }[];
  };

  forum: {
    newThreads: number;
    totalPosts: number;
    mostActiveThreads: { title: string; replies: number; pod: string }[];
  };

  community: {
    newMembers: number;
    newPodApplications: number;
    newPods: number;
  };

  economy: {
    donationsReceived: number;
    tokensBurned: number;
    supplyChange: { system: number; self: number };
  };
}
```

### 3.3 AI Generation Prompt

```
You are the community digest writer for SpiritDAO, a 501(c)(3) nonprofit
building infrastructure for self-sovereign communities.

Write a weekly digest based on the following community activity data.

Tone: Warm, transparent, community-focused. Not corporate. Not hype.
Avoid: Crypto jargon, price references, speculative language.
Include: What happened, who contributed, what's coming next.
Length: 300-500 words for the blog post.

Format the output as:
1. BLOG_POST: Full markdown blog post with title
2. NEWSLETTER: 150-word email summary
3. SOCIAL_POSTS: 2-3 short posts (under 280 chars each)

Activity data:
{activityJSON}
```

### 3.4 Approval Flow

Digests are never auto-published. The flow:
1. Cron generates draft → saves to `digest_posts` table with `status: 'draft'`
2. Admin notification (email or in-app) with preview link
3. Admin reviews, edits if needed, approves
4. On approval → content pushed to configured channels
5. If no approval within 48 hours → digest expires (skipped that week)

This ensures a human always reviews before publishing.

### 3.5 Quiet Week Handling

If weekly activity is below a minimum threshold (e.g., < 3 total events across all categories), the cron job skips generation and notifies admin: "Quiet week — no digest generated." This prevents publishing empty or artificially padded content.

---

## 4. Database Schema

### New Table: `digest_posts`

```sql
CREATE TABLE digest_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | published | skipped

  -- Generated content
  blog_post TEXT,           -- Full markdown
  blog_title TEXT,
  newsletter_snippet TEXT,
  social_posts JSONB,       -- Array of short posts

  -- Source data
  activity_data JSONB,      -- Raw WeeklyActivity JSON

  -- Publishing
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_channels JSONB, -- Which channels received the content

  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. Implementation Phases

### Phase 1 — Aggregation + Generation

| Step | Work | Files |
|------|------|-------|
| 1 | Migration for `digest_posts` table | `supabase/migrations/xxx_digest_posts.sql` |
| 2 | Activity aggregation service | `src/features/digest/services/activityAggregator.ts` |
| 3 | Claude API integration for digest generation | `src/features/digest/services/digestGenerator.ts` |
| 4 | Cron API route (Vercel cron or Upstash) | `src/app/api/cron/weekly-digest/route.ts` |
| 5 | Admin review page | `src/app/admin/digest/page.tsx` |

### Phase 2 — Publishing Channels

| Step | Work | Files |
|------|------|-------|
| 1 | Blog page on spiritdao.org (static HTML, new page) | `C:\Users\PC\Documents\DAO\website\blog.html` |
| 2 | Blog post detail page template | `C:\Users\PC\Documents\DAO\website\blog-post.html` |
| 3 | Newsletter integration (Paragraph.xyz API or SendGrid) | `src/features/digest/services/newsletterPublisher.ts` |
| 4 | Discord bot post | `src/features/digest/services/discordPublisher.ts` |

### Phase 3 — Video Content Integration

| Step | Work |
|------|------|
| 1 | Auto-transcribe video tutorials (Whisper API or similar) |
| 2 | Generate blog posts from video transcripts |
| 3 | Cross-link YouTube videos with blog posts |

---

## 6. Integration Points

| System | Integration |
|--------|------------|
| **Sensemaker AI** | Uses same Claude API; digest prompt is a specialized use case |
| **Pulse Feed** | Activity aggregator queries same data sources as Pulse |
| **Notifications** | Admin notified of new draft digest |
| **Website** | New blog section on spiritdao.org |
| **Newsletter** | Paragraph.xyz or SendGrid delivery |

---

## 7. Hosting Considerations for Blog

Since spiritdao.org is static HTML on Cloudflare Pages, the blog has two options:

**Option A — Static HTML Generation:**
- Digest approval triggers a build step that generates a new HTML file
- Push to the website repo → Cloudflare auto-deploys
- Pro: No dynamic infrastructure needed
- Con: Requires git automation

**Option B — Blog Subdomain:**
- blog.spiritdao.org hosted separately (e.g., on Vercel as part of commapp)
- Dynamic rendering from `digest_posts` table
- Pro: No build step, instant publishing
- Con: Another subdomain to manage

**Recommendation:** Option B is simpler for a team of one. Add a `/blog` route to the commapp and link to it from the static site.

---

## 8. Open Questions

- [ ] Should digests be publicly accessible or member-gated?
- [ ] Should the blog live on spiritdao.org (static) or app.spiritdao.org (dynamic)?
- [ ] Should video tutorial transcripts feed into the same digest system?
- [ ] Minimum activity threshold before generating a digest?
- [ ] Should community members be able to submit highlights for inclusion?

---

## 9. Verification Checklist

- [ ] Cron job runs weekly and queries all activity tables
- [ ] Activity aggregation produces correct counts for each category
- [ ] Claude generates well-formatted blog post, newsletter, and social posts
- [ ] Draft saved to `digest_posts` with status 'draft'
- [ ] Admin notification fires with preview link
- [ ] Admin can edit and approve digest
- [ ] Approved digest publishes to configured channels
- [ ] Quiet weeks (< threshold) are skipped gracefully
- [ ] Published digests are accessible on the blog
- [ ] No sensitive data (wallet addresses, private pod info) leaks into public digest
