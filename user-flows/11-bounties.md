# Flow 11 — Bounties

## Who This Is For
Community members hunting for tasks, and pod managers posting work with rewards.

---

## What Are Bounties?
Pods can post specific tasks or projects with a $SYSTEM token reward. Any eligible member can apply, complete the work, and earn the reward.

---

## Bounty Hunter Journey

```
USER navigates to /bounty
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BOUNTIES                                 │
│                                                                 │
│  [ Public Bounties ]   [ My Pod Bounties ]                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🎨 Design a banner for Spring event                     │  │
│  │  Reward: 100 $SYSTEM  ·  Deadline: Mar 18                │  │
│  │  Posted by: Arts Pod                                      │  │
│  │  Status: 🟢 Open                                         │  │
│  │  [ View & Apply ]                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📝 Write 3 articles for Knowledge Base                  │  │
│  │  Reward: 200 $SYSTEM  ·  Deadline: Mar 25                │  │
│  │  Posted by: TN Pod                                       │  │
│  │  Status: 🟢 Open                                         │  │
│  │  [ View & Apply ]                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  💻 Build onboarding video walkthrough                   │  │
│  │  Reward: 500 $SYSTEM  ·  Deadline: Apr 1                 │  │
│  │  Posted by: Tech Pod                                      │  │
│  │  Status: 🟡 In Progress (1 applicant)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Applying to a Bounty

```
USER TAPS [ View & Apply ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🎨 Design a banner for Spring event                            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Reward:    100 $SYSTEM                                         │
│  Deadline:  March 18, 2026                                      │
│  Posted by: Arts Pod · @maya                                    │
│                                                                 │
│  Description:                                                   │
│  "We need a 1200x400px banner for our Spring Equinox event.     │
│   Should reflect our TN values and community aesthetic..."      │
│                                                                 │
│  Deliverables:                                                  │
│  ✓ PNG file, 1200x400px                                         │
│  ✓ Source file (Figma or Illustrator)                           │
│  ✓ Submitted before deadline                                    │
│                                                                 │
│  [ Apply for This Bounty ]                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  APPLY                                                          │
│                                                                 │
│  Why are you the right fit?                                     │
│  [ _________________________ ]                                  │
│                                                                 │
│  Portfolio / relevant work links (optional):                    │
│  [ _________________________ ]                                  │
│                                                                 │
│  [ Submit Application ]                                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  ✅ Application submitted!   │
              │  Pod manager will review     │
              └─────────────────────────────┘
```

---

## Submitting Completed Work

```
USER completes the work → returns to bounty
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Status: ✅ You're approved to work on this                     │
│                                                                 │
│  Submit your work:                                              │
│  [ Link to file / deliverable _________________ ]               │
│  [ Notes or description ______________________ ]                │
│                                                                 │
│  [ Submit Work ]                                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
        Pod manager reviews submission
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
    ACCEPTED          REVISION NEEDED
        │                │
        ▼                ▼
  100 $SYSTEM sent   Feedback given,
  to your wallet     resubmit work
```

---

## Bounty Manager Journey (Pod Leaders)

```
BOUNTY MANAGER navigates to Bounty page → selects pod
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  MY POD BOUNTIES — 🎨 Arts Pod         [ + Create Bounty ]      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🎨 Design a banner      🟢 Open     2 applicants  Mar 18       │
│  [ Review Applicants ]  [ Edit ]  [ Close ]                     │
│                                                                 │
│  💬 Social media post    ✅ Complete  @user1        Mar 5        │
│  [ View submission ]                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Creating a Bounty

```
MANAGER TAPS [ + Create Bounty ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  CREATE BOUNTY                                                  │
│                                                                 │
│  Title:          [ _________________________ ]                  │
│  Description:    [ _________________________ ]                  │
│  Category:       [ Design / Writing / Dev / Other ▼ ]          │
│  Reward:         [ ___ ] $SYSTEM                                │
│  Deadline:       [ 📅 Pick date ]                               │
│  Visibility:     [ ○ Public  ○ Pod Members Only ]               │
│                                                                 │
│  Deliverables:                                                  │
│  [ + Add requirement ]                                          │
│                                                                 │
│  [ Post Bounty ]                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Bounty Lifecycle

```
CREATED (draft)
    │
    ▼
OPEN (accepting applications)
    │
    ▼
IN PROGRESS (applicant accepted, working)
    │
    ├── Work submitted → UNDER REVIEW
    │        │
    │        ├── Approved  → COMPLETE (tokens paid)
    │        └── Rejected  → Back to IN PROGRESS
    │
    └── Deadline passed with no submission → EXPIRED
```

---

## Demo Highlights

- **Incentivized contribution** — get paid in $SYSTEM for real work
- **Pod-specific or public** — bounties can be targeted or open to all
- **Full review cycle** — apply → get approved → submit → get paid
- **Transparent** — everyone sees open opportunities and past completions
