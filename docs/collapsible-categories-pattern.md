# Collapsible Categories — A Reusable Information-Density Pattern

*Last updated: 2026-05-23*

This document captures the pattern we're now using in two places —
Pod Modules and Role Permissions — and the principle behind it. When
you add a new admin surface that's likely to grow, default to this
shape.

## The principle

> **Information density scales with feature count. Visual density
> should not.**

When a feature is new, "show everything in a flat list" works fine.
By feature 5, the list is awkward. By feature 15, it's hostile. The
choice to scroll past unrelated capabilities to find the one you came
for is friction that compounds every visit.

Categories give visitors a quick "is what I want in this group?" pass
without making them scan every item. Collapsibility lets the visitor
choose how much depth to render at any moment. Counts in headers give
a hint of what's inside without expanding.

This isn't novel UX — it's how every settings panel in OS X, every
nested menu in VS Code, and every config screen in Notion works. We'd
just been getting away without it because the platform was small.

## Where this lives today

### 1. Pod Modules

`src/features/pods/components/PodModulesManager.tsx`:

```
Pod Modules
├─ Core         (collapsed)    — chat, forum, treasury, governance, ...
├─ Add-Ons      (collapsed)    — surveys, password vault
└─ Paid         (collapsed)    — community AI agent
```

Each section is gated by a `ChevronDown` / `ChevronUp` toggle. The
section's items render only when expanded. Three independent useState
flags — `coreExpanded`, `addonsExpanded`, `paidExpanded`.

### 2. Role Permissions Editor

`src/features/pods/components/UnifiedMembershipManager.tsx` —
Permissions tab:

```
Role Permissions
├─ Core (16)      (collapsed)  — every always-on permission
├─ Add-Ons (4)    (collapsed)  — surveys, passwords (only if module on)
└─ Paid (1)       (collapsed)  — agent (only if module on)
```

Same chevron pattern. Empty-state copy when a section is empty
because no module of that category is enabled.

### 3. Where it will live next

Any admin surface that today renders a flat list of options that's
likely to grow past ~8 items should adopt this pattern:

- Pod settings (image, name, eligibility, agreements, etc.)
- Treasury distribution recipients / allow-lists
- Knowledge base category management
- Survey template library
- Pod governance parameters (when Layer A grows beyond quorum/threshold)

## Why three categories, specifically

Core / Add-Ons / Paid isn't arbitrary. It encodes three distinct
relationships:

| Category | Meaning | Examples |
|---|---|---|
| **Core** | Infrastructure — every pod has these | Chat, forum, governance, treasury, members |
| **Add-Ons** | Choices — opt in or out per pod | Surveys, Password Vault |
| **Paid** | Commitments — billing implications | Community AI Agent |

A new feature should fit one of these. If a feature genuinely doesn't
fit, that's a sign the category set should expand — not that the
feature should land in a flat list.

This also creates a stable contract between Modules and Permissions:
both render the same three categories, in the same order, with the
same labels. A leader who knows where Surveys lives in Modules knows
where Survey-related permissions live in the editor.

## Implementation contract

Whenever you add a new collapsible-categories surface, follow this
shape so the affordance feels the same everywhere:

```tsx
const [coreExpanded, setCoreExpanded] = useState(false);

<button
  onClick={() => setCoreExpanded(v => !v)}
  className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
>
  <span
    className="text-xs font-semibold uppercase tracking-wider"
    style={{ color: '#5F5A54' }}
  >
    Core ({items.length})
  </span>
  {coreExpanded
    ? <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
    : <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />}
</button>
{coreExpanded && (
  <div className="space-y-2 mt-2">
    {items.map(renderItem)}
  </div>
)}
```

Followed by a `<div className="border-t" style={{ borderColor: '#E8E4DC' }} />`
between sections.

Specifically:
- **All sections collapsed by default.** First-time visitors see the
  shape of the surface, not a wall of content.
- **Counts in headers.** Helps the visitor predict expansion cost
  without committing to it.
- **Uppercase tracking-wider section labels.** Visually subordinate to
  the page title — categories are scaffolding, not content.
- **Same neutral color (`#5F5A54`)** across category headers in both
  Modules and Permissions, so they read as the same kind of element.
- **`hover:bg-gray-50`** on the toggle button so it's discoverable as
  interactive without being loud.
- **Empty-state copy** when a section is empty for a structural reason
  ("no add-on modules enabled" beats a blank section).

## What this isn't

A few things this pattern is explicitly NOT trying to be:

- **Not a search interface.** Categories help with locate-by-recall.
  When the list grows past ~50 items per category, that's a sign to
  add search-within-section, not to subdivide further.
- **Not a permission gate.** Visibility of a section is determined by
  whether its modules are enabled and the caller's role. Collapse
  state is purely visual — it doesn't hide things the caller couldn't
  access.
- **Not persistent across sessions.** Collapse state lives in
  component state, resets on navigation. If a user wants something
  visible every time, the answer is to make that thing its own tab,
  not to remember an expander.

## When NOT to use this pattern

- **Surfaces with one obvious primary action.** If 90% of visits are
  to do one specific thing, surfacing that thing flat beats hiding it
  under a category.
- **Surfaces where comparing across categories is the point.** A
  budget allocation across funds, for instance, needs everything
  visible at once.
- **Lists shorter than ~6 items.** Three collapsible sections of two
  items each is more friction than five flat items.

## Operator guidance

When you ship a new feature with role permissions:

1. Classify it: Core, Add-on, or Paid (see
   `role-permissions-design-philosophy.md` for the framework).
2. Add its module entry to the matching array in `PodModulesManager`
   (`CORE_MODULES`, `ADDON_MODULES`, `PAID_MODULES`).
3. Add its permission definition to the matching array in
   `UnifiedMembershipManager`'s permission editor (`CORE`,
   `ADD_ON_GROUPS`, `PAID_GROUPS`).
4. The collapsible UX is inherited automatically. No new toggle state
   needed.

The discipline of routing every new feature through this same shape
is what keeps the surface coherent over time. Resist the urge to add
a fourth top-level category for a single feature; either it fits the
existing three, or the three need rethinking.

## File map

| File | Role |
|---|---|
| `src/features/pods/components/PodModulesManager.tsx` | Modules tab — original implementation of the pattern |
| `src/features/pods/components/UnifiedMembershipManager.tsx` | Role permissions editor — second adopter |
| `docs/role-permissions-design-philosophy.md` | Why the three categories exist |
| `docs/collapsible-categories-pattern.md` | This document |
