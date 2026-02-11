# SpiritDAO Agent System - User Guide

**Last Updated:** February 5, 2026
**Access:** Founder-only at `/executive` and `/executive/squad`

---

## 🎯 What This System Does

You have **two AI systems** working together to run SpiritDAO operations:

1. **Chief-of-Staff** - Your strategic brain (plans, prioritizes, decides)
2. **Agent Squad** - Your execution team (researches, writes, publishes)

Think of it like this:
- **You** → Set vision and make key decisions
- **Chief-of-Staff** → Organizes your thoughts, proposes actions
- **Agent Squad** → Does the work (marketing, content, research)

---

## 🗺️ System Architecture

```
┌─────────────────────────────────────────────────┐
│  YOU (Founder)                                  │
│  - Brain dumps                                  │
│  - Approves/rejects proposals                   │
│  - Reviews artifacts                            │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  CHIEF-OF-STAFF (/executive)                    │
│  - Daily Pulse (5-10 min check-in)             │
│  - Weekly Cycle (strategic planning)            │
│  - Generates A/B/C proposals                    │
│  - Creates artifacts (drafts, plans)            │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  AGENT SQUAD (/executive/squad)                 │
│  - Atlas: Strategy Coordinator 🗺️              │
│  - Lyric: Content Writer ✍️                    │
│  - Scout: Research Specialist 🔍               │
│  - Beacon: Social Publisher 📢                 │
└─────────────────────────────────────────────────┘
```

---

## 📅 Daily Workflow (10 Minutes Every Morning)

### **Step 1: Run Daily Pulse**

1. Go to `http://localhost:3000/executive`
2. Click **"Daily Pulse"** card (top left)
3. Wait 30-60 seconds for AI to analyze org state
4. Review the output:
   - Top 3-5 priorities
   - Any urgent flags
   - Proposed actions

### **Step 2: Review Proposals**

1. Click **"Proposals"** tab
2. You'll see actions categorized as:
   - **A (Green)** - Internal prep (drafts, research) - Safe to auto-approve
   - **B (Yellow)** - Public actions (posts, emails) - **Review carefully**
   - **C (Blue)** - Informational only (observations, alerts)

### **Step 3: Approve Work**

**For A-category (internal):**
- Click **"Approve All A"** button (top right)
- This approves all internal prep work at once

**For B-category (public):**
- Read each one carefully
- Click ✓ (checkmark) to approve
- Click ✗ (X) to reject
- If unsure, skip it (won't execute)

### **Step 4: Execute Approved Items**

1. Click **"Execute"** button (top right)
2. System generates artifacts (drafts, plans, documents)
3. Takes 30-60 seconds

### **Step 5: Review Artifacts**

1. Click **"Artifacts"** tab
2. View generated content:
   - LinkedIn posts
   - Email drafts
   - Strategic plans
   - Research reports
3. Click **"View"** on any artifact
4. Click **"Copy to Clipboard"** to use it
5. After posting manually, click **"Mark as Published"**

**Total time:** 5-10 minutes

---

## 🧠 Brain Dump (Use Anytime You're Overwhelmed)

### **When to Use:**
- Ideas hitting you randomly
- Feeling paralyzed by options
- Too many things in your head
- Can't decide what to work on

### **How to Use:**

1. Go to `/executive`
2. Click **"Brain Dump"** tab
3. Type **everything** on your mind:
   - Ideas
   - Concerns
   - Half-formed thoughts
   - Questions
   - Tasks you're worried about

**Don't filter. Don't organize. Just dump.**

Example:
```
worried about user retention dropping last week
need to post more on LinkedIn but haven't had time
should we do a Twitter Spaces event?
Atlas hasn't been active lately, is the heartbeat working?
we need better onboarding flow
also need to update the website copy
governance proposal sitting there for 2 weeks...
```

4. Click **"Process Brain Dump"**
5. AI extracts:
   - Actionable proposals (prioritized)
   - Themes/patterns
   - Urgent items
   - Questions for you

6. Switch to **"Proposals"** tab to see results

---

## 🤖 Agent Squad Management

### **The Four Agents**

| Agent | Role | What They Do |
|-------|------|--------------|
| 🗺️ **Atlas** | Marketing Strategy | Coordinates campaigns, sets priorities |
| ✍️ **Lyric** | Content Writer | Writes posts, emails, documentation |
| 🔍 **Scout** | Research | Analyzes trends, competitor research |
| 📢 **Beacon** | Social Publisher | Manages social media posting |

### **Accessing the Squad**

1. Go to `/executive`
2. Click **"Agent Squad"** button (top right)
3. You're now at `/executive/squad`

### **Agent Squad Dashboard Tabs**

#### **Overview Tab**
- See all 4 agents and their status (active/idle)
- View pending tasks
- Quick stats

#### **Tasks Tab**
- Create tasks for agents
- Update task status (assigned → in_progress → done)
- Filter by status

#### **Activity Tab**
- Real-time feed of what agents are doing
- See all agent actions chronologically

#### **Agents Tab**
- Detailed view of each agent
- Last heartbeat time
- Heartbeat count
- Session keys

---

## ✅ Creating Tasks for Agents

### **When to Create Tasks:**
- Chief-of-Staff proposes something that needs research
- You want a specific piece of content written
- Need competitive analysis
- Want social media posts drafted

### **How to Create a Task:**

1. Go to `/executive/squad`
2. Click **"Create Task"** button
3. Fill in:
   - **Title**: "Research competitors' social media strategy"
   - **Description**: Details about what you need
   - **Assign to**: Check Atlas + Scout (can assign multiple)
   - **Priority**: 1-10 (10 = urgent, 1 = backlog)
4. Click **"Create Task"**

### **Task Lifecycle:**

```
Inbox → Assigned → In Progress → Review → Done
```

You can update status by:
1. Finding task in **Tasks** tab
2. Using dropdown to change status
3. Clicking **"Update"**

---

## 📊 Understanding Priorities

### **Chief-of-Staff Proposal Priorities:**

- **10**: Critical, do today
- **7-9**: Important, do this week
- **4-6**: Valuable, do when capacity allows
- **1-3**: Nice-to-have, backlog

### **A/B/C Categories:**

| Category | Meaning | Action |
|----------|---------|--------|
| **A** | Internal prep (drafts, plans, research) | Auto-approve with "Approve All A" |
| **B** | Public-facing (posts, emails, events) | **Review manually before approving** |
| **C** | Informational only (alerts, observations) | No action needed, just FYI |

---

## 🔄 Weekly Planning (Sunday, 30 Minutes)

### **Step 1: Update Context**

1. Go to `/executive`
2. Click **"Weekly Cycle"** card
3. Wait 2-3 minutes for comprehensive analysis

### **Step 2: Review Strategic Output**

You'll get:
- Week priorities (8-12 items)
- Risks identified
- Opportunities surfaced
- Narrative guidance (the "story" of this week)
- Meta observations (patterns agent is seeing)

### **Step 3: Review All Proposals**

1. Click **"Proposals"** tab
2. Use filters:
   - Status: Pending
   - Category: All
3. Approve strategically:
   - Focus on high-priority items
   - Align with weekly narrative
   - Reject misaligned proposals with reason

### **Step 4: Execute Week's Work**

1. Click **"Execute"** button
2. Check **"Artifacts"** tab for deliverables
3. Go to `/executive/squad` to see agent assignments

---

## 🚨 Common Workflows

### **Workflow 1: "I Need a LinkedIn Post Today"**

1. Go to `/executive`
2. Click **"Brain Dump"** tab
3. Type: "Need 3 LinkedIn post ideas about our pod system, emphasizing trust and transparency"
4. Click **"Process Brain Dump"**
5. Go to **"Proposals"** tab
6. Find the B-category proposal for LinkedIn posts
7. Approve it (✓)
8. Click **"Execute"**
9. Go to **"Artifacts"** tab
10. Click **"View"** on the LinkedIn post artifact
11. Click **"Copy to Clipboard"**
12. Paste into LinkedIn, edit if needed, post
13. Click **"Mark as Published"**

**Time:** 3-4 minutes

---

### **Workflow 2: "I Want Agents to Research Something"**

1. Go to `/executive/squad`
2. Click **"Create Task"**
3. Title: "Research how other DAOs handle onboarding"
4. Description: "Look at 5-7 established DAOs, document their onboarding flow, identify what we can learn"
5. Assign to: **Scout** (research) + **Atlas** (strategy)
6. Priority: 7
7. Click **"Create Task"**

Agents will see the task on their next heartbeat (runs every 15 minutes).

---

### **Workflow 3: "What Should I Focus On Today?"**

1. Go to `/executive`
2. Click **"Daily Pulse"**
3. Wait for analysis
4. Read "Top Priorities" section
5. Check "Urgent Flags" if any
6. That's your todo list for the day

**Time:** 2 minutes

---

### **Workflow 4: "I Approved Something by Mistake"**

**For Chief-of-Staff proposals:**
1. Go to `/executive` → **"Proposals"** tab
2. Find the proposal (use Status: Approved filter)
3. Click **"X"** to reject it
4. It won't execute

**For Agent Squad tasks:**
1. Go to `/executive/squad` → **"Tasks"** tab
2. Find the task
3. Change status to "Cancelled"
4. Click **"Update"**

---

## 📈 Measuring Success

### **You're using it well if:**

✅ Fewer "what should I do today?" moments
✅ Publishing content consistently (2-3x/week)
✅ Less decision fatigue
✅ Important tasks aren't slipping through cracks
✅ Clear weekly narrative guiding actions
✅ Agents are completing tasks (check Activity feed)

### **Red flags:**

❌ Approving everything blindly (especially B-category)
❌ Never using Brain Dump (it's your relief valve)
❌ Ignoring C-category observations (they're insights)
❌ Not checking Artifacts tab (wasted work)
❌ Creating tasks but never updating status

---

## 🎯 Best Practices

### **DO:**
- ✅ Run Daily Pulse **every morning**
- ✅ Always provide rejection reasons (helps AI learn)
- ✅ Review B-category carefully (public = high stakes)
- ✅ Use Brain Dump when overwhelmed (it's therapy + productivity)
- ✅ Mark artifacts as published after using them
- ✅ Update task status as work progresses

### **DON'T:**
- ❌ Skip the review step (don't execute blindly)
- ❌ Ignore B-category warnings (if flagged, there's a reason)
- ❌ Execute proposals you don't understand
- ❌ Forget to check Artifacts tab (content is there!)
- ❌ Create tasks and abandon them (agents need feedback)

---

## 🔧 First-Time Setup

### **Initial Setup (One Time):**

1. **Initialize Agent Squad:**
   - Go to `/executive/squad`
   - Click **"Initialize Squad"** button
   - Creates all 4 agents in database

2. **Run First Daily Pulse:**
   - Go to `/executive`
   - Click **"Daily Pulse"**
   - Review output to understand the system

3. **Create a Test Task:**
   - Go to `/executive/squad`
   - Click **"Create Task"**
   - Assign to any agent
   - See how task management works

4. **Try Brain Dump:**
   - Go to `/executive` → **"Brain Dump"** tab
   - Type random thoughts
   - See how AI extracts structure

---

## 📞 Troubleshooting

### **"No agents found"**
→ Go to `/executive/squad` and click **"Initialize Squad"**

### **"No proposals showing up"**
→ Run **"Daily Pulse"** or **"Weekly Cycle"** first

### **"Artifacts not generating"**
→ Make sure you approved proposals first, then clicked **"Execute"**

### **"Agents showing as idle"**
→ Normal if no tasks assigned. Create a task to activate them.

### **"Task status not updating"**
→ Refresh the page. Background heartbeat runs every 15 minutes.

---

## 🎓 Advanced Usage

### **Customizing Agent Behavior:**

Edit agent "souls" in `ActiveAgent/souls/`:
- `strategy-agent.md` - Atlas's personality
- `content-agent.md` - Lyric's writing style
- `research-agent.md` - Scout's analysis approach
- `social-agent.md` - Beacon's posting voice

### **Running CLI Commands:**

```bash
cd C:\Users\PC\Documents\DAO\App\ActiveAgent

# Check agent status
npm run squad:status

# Create task via CLI
npm run task:create --title "Task name" --assign agent:strategy:main

# View activity feed
npm run activity
```

---

## 📚 The Mental Model

Think of this system as:

**Chief-of-Staff** = Your external brain
- Remembers context
- Sequences priorities
- Filters noise
- Proposes actions

**Agent Squad** = Your junior team
- Follows instructions
- Does research
- Writes drafts
- Reports back

**You** = The decision maker
- Approve/reject proposals
- Set direction
- Review outputs
- Delegate work

---

## 🚀 Quick Reference Card

### **Daily (10 min):**
1. `/executive` → Daily Pulse
2. Approve All A
3. Review B-category
4. Execute
5. Check Artifacts

### **Weekly (30 min):**
1. `/executive` → Weekly Cycle
2. Review all proposals
3. Approve strategically
4. Execute
5. Check `/executive/squad` for agent tasks

### **Anytime:**
- Overwhelmed? → Brain Dump
- Need content? → Create proposal or task
- Check progress? → Activity tab

---

## 🎯 Success Metrics

After **1 week:**
- You should have 5-10 artifacts generated
- Agents should have completed 3-5 tasks
- You should feel less decision fatigue

After **1 month:**
- Consistent weekly rhythm established
- Publishing 2-3x/week
- Clear priorities every morning
- 10+ hours/week saved

---

**Remember:** This system is about **externalization**, not automation. It doesn't replace your judgment—it amplifies it.

**Questions?** Check the Activity feed to see what the system is doing behind the scenes.

**Version:** 1.0.0
**Last Updated:** February 5, 2026
