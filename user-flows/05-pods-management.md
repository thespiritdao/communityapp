# Flow 05 — Pods: Management (Pod Leaders)

## Who This Is For
Pod leaders managing their community — members, treasury, settings, and approvals.

---

## Access Point

```
USER is a Pod Leader → navigates to their Pod → taps [ Manage Pod ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POD MANAGEMENT HUB                           │
│                                                                 │
│  🌿 Nature Pod — Management                                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Members │ Settings │ Treasury │ Modules │ Applications  │  │
│  │          │          │          │         │  Sub-Pods │   │  │
│  │          │          │          │         │  Claims       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab 1 — Members

```
MEMBERS TAB
┌─────────────────────────────────────────────────────────────────┐
│  Pod Members (12)                          [ + Add Member ]     │
│                                                                 │
│  👤 @alex        Leader    [ Promote │ Remove ]                 │
│  👤 @sam         Member    [ Promote │ Remove ]                 │
│  👤 @jordan      Member    [ Promote │ Remove ]                 │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘

Actions:
  Promote Member → becomes Leader (on-chain role update)
  Remove Member  → loses pod access
  Add Member     → enter wallet address, assign role
```

---

## Tab 2 — Settings

```
SETTINGS TAB
┌─────────────────────────────────────────────────────────────────┐
│  Pod Name:         [ Nature Pod _____________ ]                 │
│  Description:      [ ________________________ ]                 │
│  Pod Image:        [ 📷 Change image ]                          │
│                                                                 │
│  Accountability Agreement:                                      │
│  [ Edit statement text ________________________ ]               │
│                                                                 │
│                        [ Save Changes ]                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab 3 — Treasury

```
TREASURY TAB
┌─────────────────────────────────────────────────────────────────┐
│  Pod Treasury                                                   │
│                                                                 │
│  Status: ● Active     Balance: 1,240 $SYSTEM                    │
│                                                                 │
│  Recent transactions:                                           │
│  ├ +500  Donation received         Mar 10                       │
│  ├ -120  Bounty paid to @jay       Mar 8                        │
│  └ +860  Initial funding           Mar 1                        │
│                                                                 │
│  [ View Full History ]    [ Fund Treasury ]                     │
└─────────────────────────────────────────────────────────────────┘

If Treasury not yet deployed:
┌─────────────────────────────────────────────────────────────────┐
│  No treasury yet                                                │
│  [ Deploy Pod Treasury ]  ← one-click setup                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab 4 — Modules (Feature Toggles)

```
MODULES TAB
┌─────────────────────────────────────────────────────────────────┐
│  Optional Features for Your Pod                                 │
│                                                                 │
│  ☑ Sub-Pods enabled        ← Members can create child pods     │
│  ☑ Treasury enabled        ← Shared pod wallet                  │
│  ☐ Bounties                ← Toggle ON to enable                │
│  ☐ Claims                  ← Toggle ON to enable                │
│  ☐ Knowledge Base          ← Pod-specific articles              │
│                                                                 │
│  Each toggle updates pod configuration                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab 5 — Applications

```
APPLICATIONS TAB
┌─────────────────────────────────────────────────────────────────┐
│  Pending Applications (3)                                       │
│                                                                 │
│  👤 @new_user_1         Applied Mar 9                           │
│     "I'm interested in..."                                      │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
│                                                                 │
│  👤 @new_user_2         Applied Mar 8                           │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
│                                                                 │
│  👤 @new_user_3         Applied Mar 7                           │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
└─────────────────────────────────────────────────────────────────┘

Approve → user gets notification, added to pod
Reject  → user gets notification, can reapply
```

---

## Tab 6 — Sub-Pod Review (if Sub-Pods enabled)

```
SUB-POD REVIEW TAB
┌─────────────────────────────────────────────────────────────────┐
│  Child pods waiting for your approval                           │
│                                                                 │
│  📁 Nature Study Group        Proposed by @ali    Mar 10        │
│     3 leaders, open membership                                  │
│     [ ✅ Activate ]  [ ❌ Veto ]                                │
│                                                                 │
│  📁 Field Research Team       Proposed by @ben    Mar 9         │
│     [ ✅ Activate ]  [ ❌ Veto ]                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tab 7 — Claims (if Claims enabled)

```
CLAIMS TAB
┌─────────────────────────────────────────────────────────────────┐
│  Pending Claims for Approval (2)                                │
│                                                                 │
│  👤 @sam        Claims: 50 $SYSTEM (Member role)    Mar 10      │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
│                                                                 │
│  👤 @jordan     Claims: 50 $SYSTEM (Member role)    Mar 9       │
│     [ ✅ Approve ]  [ ❌ Reject ]                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Demo Highlights

- **Single hub for all pod admin** — everything in one place via tabs
- **Leaders stay in control** — approve/reject members, applications, claims
- **Modular** — pods only show tabs for features they've enabled
- **Transparent** — every action is logged and members are notified
