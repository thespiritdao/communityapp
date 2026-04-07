# Flow 15 — User Roles & Access Map

## Overview
SpiritDAO uses an on-chain credentialing system (HATS Protocol) combined with pod-level permissions to control what each user can see and do.

---

## Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPIRITDAO ROLE HIERARCHY                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  🏛 EXECUTIVE POD LEADER                  │ │
│  │  The highest community role. Oversees DAO-wide decisions, │ │
│  │  reviews new pod proposals, accesses executive dashboard. │ │
│  └───────────────────────────┬───────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐ │
│  │                    🌿 TN MEMBER                           │ │
│  │  Full community member. Holds Temporal Naturalism         │ │
│  │  Member credential. Can join pods, vote, participate.     │ │
│  └───────────────────────────┬───────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐ │
│  │                  👥 POD MEMBER                            │ │
│  │  Member of a specific pod. Access to pod's chat,          │ │
│  │  forum, events, treasury view, and governance.            │ │
│  └───────────────────────────┬───────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐ │
│  │                  🔑 POD LEADER                            │ │
│  │  Manages a specific pod. Can approve members,             │ │
│  │  manage treasury, configure settings, review claims.      │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Each Role Can Do

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FEATURE               │ New User │ TN Member │ Pod Member │ Pod Leader │ Exec │
│  ─────────────────────────────────────────────────────────────────────────── │
│  View home dashboard   │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Browse pods           │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Apply to pods         │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Create a pod          │   ─      │    ─      │    ─       │    ✓       │  ✓  │
│  Manage pod members    │   ─      │    ─      │    ─       │    ✓       │  ✓  │
│  View pod treasury     │   ─      │    ─      │    ✓       │    ✓       │  ✓  │
│  Manage pod treasury   │   ─      │    ─      │    ─       │    ✓       │  ✓  │
│  Access pod forum      │   ─      │    ─      │    ✓       │    ✓       │  ✓  │
│  Access general forum  │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Vote (DAO-wide)       │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Vote (pod-level)      │   ─      │    ─      │    ✓       │    ✓       │  ✓  │
│  Create proposal       │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Attend events         │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Create events         │   ─      │    ─      │    ─       │  (perm)    │  ✓  │
│  Submit claims         │   ─      │    ─      │    ✓       │    ✓       │  ✓  │
│  Approve claims        │   ─      │    ─      │    ─       │    ✓       │  ✓  │
│  Shop marketplace      │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Manage orders         │   ─      │    ─      │    ─       │    ─       │  ✓  │
│  Post bounties         │   ─      │    ─      │    ─       │  (perm)    │  ✓  │
│  Apply for bounties    │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Use Sensemaker AI     │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Chat (pod channels)   │   ─      │    ─      │    ✓       │    ✓       │  ✓  │
│  Direct messages       │   ─      │    ✓      │    ✓       │    ✓       │  ✓  │
│  Review pod proposals  │   ─      │    ─      │    ─       │    ─       │  ✓  │
│  Executive dashboard   │   ─      │    ─      │    ─       │    ─       │  ✓  │
└─────────────────────────────────────────────────────────────────────────────┘

(perm) = requires specific permission enabled for that pod
```

---

## How Roles Are Granted

```
TN MEMBER CREDENTIAL
  └── Automatically minted during onboarding
       (sign 1 transaction — gasless)

POD MEMBER
  └── Apply to join a pod → pod leader approves
       OR pod leader adds you directly

POD LEADER
  └── Assigned by existing pod leader
       OR granted at pod creation (as founding leader)

EXECUTIVE POD LEADER
  └── Assigned by the DAO
       (highest-trust credential, manually granted)
```

---

## On-Chain vs. Database Permissions

```
ON-CHAIN (HATS Protocol)
  Credential lives on Base blockchain
  Cannot be forged or transferred
  Verified by the app on every sensitive action
  ├── TN Member Hat
  ├── Executive Pod Leader Hat
  └── Community Pods Parent Hat

DATABASE (Per-Pod Permissions)
  Fine-grained feature toggles per pod
  Set by pod leaders in pod settings
  ├── bountyManagement
  ├── treasuryManagement
  ├── eventManagement
  ├── claimsManagement
  ├── forumModeration
  └── knowledgeBaseManage
```

---

## New User → Full Member Journey

```
STEP 1 → Enter invite code
STEP 2 → Create wallet (email OTP)
STEP 3 → Mint TN Member credential (on-chain)
STEP 4 → Land on home dashboard
STEP 5 → Explore community, join pods, participate

At this point: full TN Member access across all community features
```

---

## Demo Highlights

- **Credentials are on-chain** — can't be faked, always verifiable
- **Roles are earned** — meaningful progression from new user to leader
- **Granular control** — pod leaders configure their own permission sets
- **Transparent** — anyone can see what roles exist and how to get them
