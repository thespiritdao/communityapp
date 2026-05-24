# Competitive Analysis — Feature Roadmap

*Generated 2026-05-14 from analysis of CiviCRM and GlassFrog*

---

## High Priority

### 1. Tension Inbox (from GlassFrog / Holacracy)

**What it is:** A structured way for pod members to flag problems, ideas, or gaps ("tensions") before they become formal governance proposals. Tensions get triaged into proposals, bounties, or discussion threads.

**Why it matters:** Currently members jump straight to governance proposals, which creates friction for smaller issues. A tension inbox gives members a low-barrier way to surface issues and lets leaders route them appropriately — some become proposals, some become bounties, some just need a forum thread.

**Implementation scope:** New "Tensions" section within pods. Simple form (title, description, suggested action). Leaders can convert tensions into proposals, bounties, or dismiss with a note. Track resolution status.

---

### 2. Persistent Task/Project Boards (from GlassFrog / GTD)

**What it is:** Ongoing task lists and project tracking within pods, separate from bounties. Role-based action items that persist across time with status tracking.

**Why it matters:** Bounties cover one-off compensated tasks, but pods also have recurring operational work (update the website, review applications, prepare meeting notes) that doesn't warrant a bounty. There's currently no way to track this work.

**Implementation scope:** Kanban-style board per pod (To Do / In Progress / Done). Tasks assigned to members by role. Optional due dates. Distinct from bounties — these are internal operational items, not compensated work.

---

### 3. Role Clarity — Purpose, Accountabilities, Domains (from GlassFrog)

**What it is:** Extend pod roles beyond leader/member with explicit definitions: what each role exists to do (purpose), what it's responsible for (accountabilities), and what it controls exclusively (domains).

**Why it matters:** As pods grow, the leader/member binary becomes insufficient. Members don't know what's expected of them or what authority they have. Explicit role definitions reduce confusion and duplicate effort.

**Implementation scope:** Add optional fields to pod roles: purpose (text), accountabilities (list), domains (list). Display on member profiles within the pod. Leaders can define custom roles beyond the default two.

---

## Medium Priority

### 4. Fundraising/Donation Workflows (from CiviCRM)

**What it is:** Structured donation management — recurring contributions, one-time gifts, peer-to-peer fundraising campaigns, and donor communication workflows.

**Why it matters:** The current treasury handles crypto flows but doesn't support traditional fundraising patterns. Communities that need to raise funds (for events, projects, causes) lack structured tools for soliciting, tracking, and acknowledging donations.

**Implementation scope:** Donation page per pod with configurable goals. Support for recurring contributions. Automated thank-you notifications. Donation tracking dashboard for leaders. Could integrate with existing treasury for crypto donations or add fiat payment processing.

---

### 5. Dynamic Org Chart / Pod Visualization (from GlassFrog)

**What it is:** A visual, interactive map showing pod hierarchy, sub-pod relationships, member roles, and cross-pod connections. Updates in real-time as structure changes.

**Why it matters:** As the DAO grows with nested sub-pods, text lists become hard to navigate. A visual map helps new members understand the organizational structure and find where they fit.

**Implementation scope:** Tree/graph visualization on the pods overview page. Clickable nodes that navigate to pod detail pages. Show member counts, active status, and parent/child relationships. Could use D3.js or React Flow.

---

### 6. Membership Lifecycle Automation (from CiviCRM)

**What it is:** Automated workflows around membership status — renewal reminders, onboarding sequences, re-engagement for inactive members, and expiration handling.

**Why it matters:** NFT-based membership currently has no lifecycle management. Members who go inactive get no outreach. New members get no structured onboarding beyond the initial flow. There's no automated way to manage membership tiers or renewals.

**Implementation scope:** Configurable triggers: X days after join (onboarding drip), X days inactive (re-engagement), membership approaching expiration (renewal reminder). Leverage existing notification infrastructure. Pod leaders can customize sequences.

---

### 7. Meeting Templates and Agendas (from GlassFrog)

**What it is:** Pre-built meeting structures for pods — tactical meetings (status updates, blockers) and governance meetings (structural changes, role updates). Includes agenda builders, recurring checklists, and auto-generated notes.

**Why it matters:** Pod meetings currently have no built-in structure. Leaders create ad-hoc agendas or skip them entirely. Structured templates improve meeting efficiency and create a record of decisions.

**Implementation scope:** Template library (tactical, governance, retrospective). Agenda builder within pod management. Integration with existing chat/forum for distributing notes. Optional integration with LiveKit conference scheduling.

---

### 8. Email Marketing / Automated Sequences (from CiviCRM)

**What it is:** Segmented email campaigns, welcome series, drip sequences, and automated communications beyond in-app notifications.

**Why it matters:** Current notifications are in-app and push only. Email remains the most reliable channel for reaching members who aren't actively using the app. Automated sequences (welcome series, weekly digests) keep members engaged.

**Implementation scope:** Email template builder. Segment audiences by pod membership, role, activity level. Automated sequences triggered by events (join pod, complete bounty, inactivity). Could integrate with existing Paragraph newsletter subscription or add dedicated email service (Resend, SendGrid).

---

## Lower Priority

### 9. Grant Application Tracking (from CiviCRM)

**What it is:** Track grant applications — submitted, pending, approved, rejected — with amounts, deadlines, and deliverable requirements.

**Why it matters:** DAOs and community organizations frequently apply for grants. Currently there's no structured way to track the pipeline or report on grant outcomes.

**Implementation scope:** Grant tracker within treasury or as a standalone module. Fields: funder, amount, status, deadline, deliverables. Reporting on success rates and total funding secured.

---

### 10. Pod-Level OKRs / Goals (from GlassFrog)

**What it is:** Objective and Key Results framework at the pod level. Strategic goals cascade from the DAO level down to individual pods, with progress tracked against bounty completion and task milestones.

**Why it matters:** Pods currently operate without explicit strategic alignment. OKRs would connect daily work (bounties, tasks) to higher-level objectives and make progress measurable.

**Implementation scope:** Goal-setting interface per pod. Link bounties and tasks to OKRs. Progress dashboards. Quarterly review cadence.

---

## Not Recommended

- **Jitsi as LiveKit replacement** — Mobile browser support is fundamentally limited by design. LiveKit is the better fit for a browser-based community app.
- **May First integration** — Philosophically and technically incompatible. No actionable features to adopt.
- **Volunteer shift scheduling** (from CiviCRM) — Bounties already cover task-based work. Shift scheduling is more relevant to traditional nonprofits with physical locations.
- **Petition/advocacy tools** (from CiviCRM) — Governance proposals serve the same function for members. Public petitions could expand reach but aren't aligned with the current member-only governance model.
- **Case management** (from CiviCRM) — Too specialized for general community use. Only relevant if pods begin providing direct constituent support services.
