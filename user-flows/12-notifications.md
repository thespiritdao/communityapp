# Flow 12 — Notifications & Alerts

## Who This Is For
All users — notifications keep everyone informed across all app activity.

---

## Notification Center

```
USER TAPS 🔔 in bottom nav or top bar
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  NOTIFICATIONS                                       🔔 (5 new) │
│                                                                 │
│  [ All ]  [ Governance ]  [ Pods ]  [ Claims ]  [ Events ]      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🟢 NEW                                                         │
│  🗳 "Vote on: Allocate 1,000 $SYSTEM to events fund"            │
│     Voting closes in 2 days  ·  2h ago                          │
│  [ View Proposal ]                                              │
│                                                                 │
│  🟢 NEW                                                         │
│  ✅ "Your claim was approved! 50 $SYSTEM sent to your wallet"   │
│     Nature Pod  ·  5h ago                                       │
│  [ View Claims ]                                                │
│                                                                 │
│  🟢 NEW                                                         │
│  👥 "Your application to Arts Pod was approved!"                │
│     You're now a member  ·  1d ago                              │
│  [ Go to Arts Pod ]                                             │
│                                                                 │
│  🟢 NEW                                                         │
│  💬 "@sam replied to your thread in Nature Pod forum"           │
│     "Monthly check-in — March 2026"  ·  1d ago                 │
│  [ View Thread ]                                                │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  EARLIER                                                        │
│                                                                 │
│  🎟 "Spring Equinox Gathering — Tomorrow!"                      │
│     You're registered  ·  2d ago                                │
│                                                                 │
│  🏷 "Bounty assigned: Design a banner for Spring event"         │
│     Arts Pod  ·  3d ago                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Triggers a Notification?

```
GOVERNANCE
  ├── New proposal open for voting (all eligible members)
  ├── Proposal you voted on has passed / failed
  └── You created a proposal → status update

PODS
  ├── Your pod application was approved / rejected
  ├── Someone applied to your pod (leaders)
  ├── You were removed from a pod
  ├── New member joined your pod (leaders)
  └── Pod went live after executive review (creator)

CLAIMS
  ├── Your claim was approved → tokens sent
  └── Your claim was rejected

EVENTS
  ├── Event reminder (24h before)
  └── Event you manage has new registrations

FORUM
  ├── Someone replied to your thread
  └── Your thread was pinned / removed by a moderator

BOUNTIES
  ├── Your bounty application was approved / rejected
  ├── Bounty work was accepted → tokens sent
  └── Someone applied to your bounty (managers)

MARKETPLACE
  └── Your order status changed (processing → shipped → delivered)
```

---

## Notification Badge on Bottom Nav

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   🏠 Home    💎 Claims    🗳 Govern    🔔 Alerts                │
│                                           ╭──╮                  │
│                                           │5 │← unread count    │
│                                           ╰──╯                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Demo Highlights

- **Everything in one place** — one center for all app activity
- **Filterable** — users can view by type (governance, pods, claims, etc.)
- **Deep-linked** — every notification taps directly to the relevant screen
- **Real-time** — notifications appear immediately as events happen
- **Badge count** — always visible reminder of unread items
