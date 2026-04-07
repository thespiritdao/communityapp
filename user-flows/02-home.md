# Flow 02 — Home Dashboard

## Who This Is For
All logged-in users. This is the landing screen after sign-in.

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOME SCREEN                              │
│                                                                 │
│   👤 Welcome back, [Name]                    🔔 Notifications   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  YOUR PODS                                               │  │
│  │  Quick access to communities you belong to               │  │
│  │  [ Pod A ]  [ Pod B ]  [ + Join a Pod ]                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  UPCOMING EVENTS                                         │  │
│  │  Events you're registered for                            │  │
│  │  [ Event Card ]  [ Event Card ]                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ACTIVE PROPOSALS                                        │  │
│  │  Votes you can participate in right now                  │  │
│  │  [ Proposal Card → Cast Vote ]                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  RECENT FORUM ACTIVITY                                   │  │
│  │  Threads from your communities                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   🏠 Home    💎 Claims    🗳 Govern    🔔 Alerts                │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Actions from Home

```
From HOME, user can:
       │
       ├──→  Tap a Pod card  ──────────→  Go to Pod page
       │
       ├──→  Tap an Event card  ────────→  Go to Event details
       │
       ├──→  Tap a Proposal  ──────────→  Go to Vote
       │
       ├──→  Tap Forum thread  ─────────→  Go to Forum thread
       │
       ├──→  Tap 🔔 Bell icon  ─────────→  Notifications center
       │
       └──→  Tap Bottom Nav  ──────────→  Navigate to any section
```

---

## Demo Highlight

- Home gives a **personalized snapshot** — only shows things relevant to the user
- Everything is one tap away from the home screen
- Bottom navigation is always visible throughout the entire app
