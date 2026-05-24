# Newsletter Update — A Smaller, Calmer Admin Surface

*Short follow-up to the role permissions newsletter. Could be folded
into the next regular update or kept as a standalone "small things"
note.*

---

## Headline options

- **"Roles & permissions, now folded up."**
- **"Less scrolling, same power."**
- **"The admin page got quieter."**

## What changed

The role permissions editor used to be a flat list of every available
permission, scrolling forever as the platform added features. As of
this week, it's organized like the Modules tab:

```
Role Permissions
├─ Core      (16)   ← click to expand
├─ Add-Ons    (4)   ← click to expand
└─ Paid       (1)   ← click to expand
```

Click a category to see what's inside. Click again to collapse. Each
header tells you how many permissions live there before you commit to
reading them.

By default, everything is collapsed. You see the shape of what's
configurable, not a wall of toggles.

## Why this matters (and why it's a small thing)

Honestly? It's a small change. We're not flagging it because it
unlocks new capabilities — it doesn't. We're flagging it because of
what it reflects.

When a platform grows, every settings page either becomes a
better-organized surface or a worse one. There's no "stays the same."
Today we have ~20 permissions; this time next year we'll have 30+.
A flat list at 30 is hostile to the people who actually have to use
it. A grouped, collapsible list at 30 is the same friction it is at
20, which is the same friction it is at 50.

So this update is less "new feature" and more "we're committing to a
shape that holds up as we grow."

## The matching change in Modules

Pod Modules has used this same Core / Add-Ons / Paid grouping since
last week. The Permissions editor now mirrors it exactly: same
category names, same order, same expand/collapse affordance.

That coupling is intentional. If you know where the Surveys module
lives in Modules, you know where Survey permissions live in the role
editor. They're the same three buckets, by design.

## How to try it

1. Open your pod's manage page.
2. Click **Manager Controls** → pick any role → **Configure**.
3. Look at the Permissions tab. Three category headers.
4. Click any one. The permissions inside expand. Click again to
   collapse.

No data changed. No defaults changed. Same flags, same behavior.
Just easier to find.

## What we're committing to

When we ship the next feature with a new permission — whether it's
content moderation, calendar management, knowledge base curation, or
something we haven't built yet — it lands in one of these three
buckets. No fourth category for one feature. No flat-list
shortcuts. The shape stays the same as the count grows.

That's the deal we're making with you: the platform will get bigger,
and the admin pages will stay calm.
