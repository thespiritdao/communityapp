# Newsletter Update — Pod Roles, Refined

*Draft for community newsletter. Goes alongside the Password Vault
announcement if shipping together, or stands alone as a follow-up.*

---

## Headline options

- **"Pod roles, finally fit for purpose."**
- **"You asked for it: real per-role permissions."**
- **"Pods grow up: a marketing manager who can manage marketing."**

## TL;DR

Pod role permissions just got a lot more useful. You can now give a
single member a specific capability — like "manage the password vault"
or "configure the AI agent" — without making them a full pod leader.
The permission editor is reorganized into Core, Add-ons, and Paid
sections so it actually scales as the platform grows.

---

## What was broken

The old setup looked like this:

> *Are you a pod leader? Yes → you can do everything. No → you can do
> nothing administrative.*

This was fine when pods had one or two leaders and every member just
needed to read, post, and vote. It stopped working the moment we
started shipping features where a pod might want **one person** to
own that feature — not a leader, just a specialist.

Concretely: when we shipped the Password Vault, a pod leader could
have created a "Marketing Manager" role and given them the
`passwordsManage` permission. The system would have accepted it. But
nothing in the UI would have changed. The marketing manager would
have stared at the same pod page as any other member, with no way to
reach the vault they were supposed to be managing.

The flags existed. The UI didn't know about them. So they did nothing.

## What changed

Three things, working together.

### 1. The gear icon now shows up for anyone who has work to do

Used to be: gear icon = "you're a pod leader."

Now: gear icon = "you have at least one management permission in this
pod."

If your role has `passwordsManage`, you see the gear. If your role has
`bountyManagement`, you see the gear. You don't have to be a leader.
You just have to have something to manage.

### 2. The pod management page only shows tabs you can use

Click the gear, and you land on the pod's management page. The tabs
you see correspond to the permissions you actually hold:

- A pod leader sees everything (Members, Applications, Modules,
  Treasury, Surveys, Passwords, AI Agent, etc.).
- A marketing manager with `passwordsManage` sees the **Passwords**
  tab and nothing else.
- A treasury viewer with `treasuryViewing` sees the **Treasury** tab
  in read-only mode (balances + history, no Send button).
- A community steward with `agentManage` sees the **AI Agent** tab and
  can configure the agent's behavior — without being able to touch
  billing.

It's the same page, but each role's view of it is shaped by their
actual capabilities. No more clicking around looking for a feature
you have permission for but can't find.

### 3. The permission editor mirrors how the platform is built

When a pod leader edits a role, the permission checkboxes are now
grouped into three sections:

**Core** — the always-on stuff. Chat, forum, governance, treasury,
events, bounties, marketplace, knowledge base, sub-pods, members,
roles. Sixteen permissions, every pod has them.

**Add-ons** — optional modules a pod has turned on. Surveys and
Password Vault, today. The "Survey Manage" checkbox doesn't appear
unless your pod has the Surveys module enabled, because what would it
mean? The system hides what isn't relevant.

**Paid** — modules with billing implications. Community AI Agent,
today. Same hiding logic.

When a leader toggles a module **off**, the corresponding permission
flags get zeroed on every role automatically. Turning the module back
on restores the defaults (leaders get manage; members get access).
This means leaders don't accidentally leave dangling permissions on
features that aren't active.

## Why this matters beyond "the UI is nicer"

Pod governance is becoming more sophisticated. Real pods at real
scale don't have one person doing everything — they have specialists.
The infrastructure has to match.

The old model said *trust someone fully, or not at all.* The new one
says *trust them with exactly the parts they're responsible for.*

This is the same principle behind every well-designed permissioning
system — Linux file permissions, Slack workspace roles, Notion
workspace permissions, GitHub team permissions. It's not new. But it
took us building a few features past the easy "leader vs. member"
divide to feel why it mattered, and to get it right.

## What this unlocks

A few examples of what's now cleanly expressible:

- **"Marketing Manager"** role: holds `passwordsManage` and
  `marketplaceManage`. Can manage shared marketing logins and
  marketplace listings. Cannot see treasury, manage members, or
  configure the AI agent.

- **"Steward"** role: holds `agentManage` and `forumModeration`. Can
  shape the AI agent's behavior and moderate forum discussions. Has no
  control over money or membership.

- **"Auditor"** role: holds `treasuryViewing` and nothing else. Can
  see balances and transaction history but cannot send. Useful for
  external accountants, board observers, or pods that want
  transparency without exposing keys.

- **"Survey Lead"** role: holds `surveyManage`. Can build and ship
  surveys; everything else is invisible to them.

None of these required us to write new code per role. They're all
combinations of existing flags. The change was that **the UI now
honors them.**

## What didn't change

A few things on purpose:

- **Billing for paid modules stays leader-only.** A non-leader with
  `agentManage` can configure the agent's persona, channels, and
  posting cadence — but they can't pause the subscription or top it
  up. Spend authority belongs to leaders.
- **Core features still have their own homes.** Chat is at /chat.
  Forum is at /forum. Events are at /events. Those routes still exist
  and still work the same way. The pod management surface is for
  administrating the pod, not for replacing the global feature pages.
- **The "Pod Leader" role still exists and still has everything.**
  Nothing about this update removes leader power. It just makes it
  possible to delegate slices without delegating the whole hat.

## How to try it

If you lead a pod:

1. Open your pod's manage page.
2. Click **Modules** and turn on any features you want — Password
   Vault, Surveys, AI Agent — that aren't already enabled.
3. Click **Manager Controls** → find the role you want to extend, or
   create a new one.
4. Click **Configure** on the role.
5. Look at the **Permissions** tab. Notice that Add-ons and Paid
   sections only show up if you've enabled their modules.
6. Toggle the permissions you want. Save.
7. The member holding that role will now see the corresponding tabs
   on the pod's manage page the next time they reload.

## Closing

We started with the password vault. We realized the permission system
couldn't actually deliver on the feature it was supposed to enable.
We fixed the foundation — not just the vault.

Pods can now grow into real organizational structures. Specialist
roles, narrow access, careful delegation of capability without full
keys. That's what this update is.

Worth noting: nothing about this is "scary new tech." This is just
the platform finally doing what good permissioning has always done.
It only feels new because we'd been getting away with the binary
version for so long.
