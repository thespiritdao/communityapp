# Flow 04 — Pods: Creation

## Who This Is For
Pod leaders or members with permission to start a new pod/working group.

---

## Pod Creation Flow

```
USER TAPS "+ Create a Pod" on the Pods page
                │
                ▼
        Permission check:
        Does user hold a Pod Leader role?
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
   Authorized       Not authorized
        │               │
        ▼               │
  Continue             Show "You need a
                        Pod Leader credential
                        to create pods"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — POD BASICS
┌─────────────────────────────────────────────────────────────────┐
│  Name your pod:          [ _________________________ ]          │
│  Description:            [ _________________________ ]          │
│  Upload pod image:       [ 📷 Choose image ]                    │
└─────────────────────────────────────────────────────────────────┘
                            [ Next → ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 2 — POD LEADERS
┌─────────────────────────────────────────────────────────────────┐
│  Add pod leaders (at least 1):                                  │
│                                                                 │
│  [ + Add leader wallet address ]                                │
│                                                                 │
│  👤 @you  (auto-added as creator)                               │
│  👤 Enter another leader address...                             │
└─────────────────────────────────────────────────────────────────┘
                            [ Next → ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 3 — MEMBERSHIP REQUIREMENTS
┌─────────────────────────────────────────────────────────────────┐
│  Who can join this pod?                                         │
│                                                                 │
│  ○ Anyone with a TN Member credential (open)                    │
│  ○ Application-only (leaders approve each member)               │
│  ○ Token-gated (must hold minimum $SYSTEM tokens)               │
│                                                                 │
│  Enable accountability agreement?  [ Yes / No ]                │
└─────────────────────────────────────────────────────────────────┘
                            [ Next → ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 4 — OPTIONAL FEATURES
┌─────────────────────────────────────────────────────────────────┐
│  Enable for this pod:                                           │
│                                                                 │
│  ☐ Sub-pods (allow nested working groups)                       │
│  ☐ Pod Treasury (manage shared funds)                           │
│  ☐ Bounties (post tasks with rewards)                           │
│  ☐ Claims (members can claim role-based tokens)                 │
└─────────────────────────────────────────────────────────────────┘
                            [ Next → ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 5 — REVIEW & SUBMIT
┌─────────────────────────────────────────────────────────────────┐
│  Review your pod:                                               │
│                                                                 │
│  Name:     Nature Pod                                           │
│  Leaders:  @you, @alex                                          │
│  Joining:  Application-only                                     │
│  Features: Treasury, Bounties                                   │
│                                                                 │
│  [ ← Edit ]           [ Create Pod ]                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                  SIGN TRANSACTION
                  (gasless — no cost to you)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              POD SUBMITTED FOR REVIEW                           │
│                                                                 │
│   ✅ Your pod proposal has been submitted!                      │
│                                                                 │
│   What happens next:                                            │
│   1. Executive pod reviews your proposal                        │
│   2. 48-hour review window                                      │
│   3. If approved → your pod goes LIVE                           │
│   4. You'll be notified when it's active                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Executive Review Flow (Parallel)

```
Pod submitted as "Pending Review"
                │
                ▼
Executive member receives notification
                │
                ▼
        Reviews pod proposal
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
    APPROVE            VETO
        │               │
        ▼               ▼
   Pod goes LIVE    Pod rejected
   Creator notified Creator notified
```

---

## Demo Highlights

- **Guided step-by-step form** — no confusion about what's needed
- **Flexible configuration** — pods can be open, gated, or by-application
- **On-chain + gasless** — transaction happens invisibly in background
- **Executive oversight** — pods go through a human review before going live
- **48-hour window** — democratic, transparent review process
