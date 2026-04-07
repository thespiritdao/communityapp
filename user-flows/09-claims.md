# Flow 09 — Claims

## Who This Is For
Pod members claiming role-based $SYSTEM token rewards, and pod leaders approving them.

---

## What Are Claims?
Members who hold roles within pods can periodically claim $SYSTEM tokens as recognition for their participation and contribution. Pod leaders review and approve these claims.

---

## Member — Submitting a Claim

```
USER TAPS "Claims" in bottom navigation
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CLAIMS                                   │
│                                                                 │
│  Your Eligible Claims                                           │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🌿 Nature Pod — Member Role                             │  │
│  │  Eligible to claim: 50 $SYSTEM                           │  │
│  │  Status: Available                                        │  │
│  │  [ Claim Now ]                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🎨 Arts Pod — Member Role                               │  │
│  │  Eligible to claim: 50 $SYSTEM                           │  │
│  │  Status: ⏳ Pending approval                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Past Claims                                             │  │
│  │  ✅ Nature Pod — 50 $SYSTEM — Approved Mar 5             │  │
│  │  ✅ Arts Pod   — 50 $SYSTEM — Approved Feb 20            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Submitting a Claim

```
USER TAPS [ Claim Now ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLAIM TOKENS                                                   │
│                                                                 │
│  Pod:     🌿 Nature Pod                                         │
│  Role:    Member                                                │
│  Amount:  50 $SYSTEM                                            │
│                                                                 │
│  Your claim will be reviewed by pod leaders before              │
│  tokens are released.                                           │
│                                                                 │
│  [ Submit Claim ]                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  ✅ Claim submitted!         │
              │  Awaiting leader approval    │
              │  You'll be notified          │
              └─────────────────────────────┘
```

---

## Pod Leader — Approving Claims

```
POD LEADER navigates to Pod Management → Claims Tab
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLAIMS MANAGEMENT — 🌿 Nature Pod                              │
│                                                                 │
│  Pending Claims (3)                                             │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  👤 @sam         Member Role    50 $SYSTEM    Mar 10            │
│     Account standing: ✅ Good                                   │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
│                                                                 │
│  👤 @jordan      Member Role    50 $SYSTEM    Mar 9             │
│     Account standing: ✅ Good                                   │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
│                                                                 │
│  👤 @riley       Member Role    50 $SYSTEM    Mar 8             │
│     Account standing: ⚠️ Review notes                          │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Claim Approval Flow

```
LEADER TAPS [ ✅ Approve ]
                │
                ▼
        System verifies on-chain role
                │
                ▼
        Tokens released to member wallet
                │
                ▼
        Member receives notification: "Claim approved! 50 $SYSTEM sent"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LEADER TAPS [ ❌ Reject ]
                │
                ▼
        Leader enters reason (optional)
                │
                ▼
        Member receives notification: "Claim not approved this cycle"
        Member can submit again next period
```

---

## Full Claims Lifecycle

```
MEMBER eligible for claim
        │
        ▼
Member submits claim
        │
        ▼
Status: PENDING APPROVAL
        │
        ├── Leader APPROVES ──→ Tokens sent to member wallet ──→ COMPLETED
        │
        └── Leader REJECTS  ──→ Member notified ──→ Can resubmit
```

---

## Demo Highlights

- **Role-based rewards** — tokens flow to active contributors automatically
- **Leader oversight** — every claim is human-reviewed before release
- **Transparent history** — members can see all past claims and their status
- **Notification loop** — members are never left wondering what happened
