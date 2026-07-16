# Newsletter — Quietly Making Things More Trustworthy

*Draft. High-level, plain-language, member-facing. Companion to the
`newsletter-*` series.*

---

## A round of care under the hood

Not every improvement is something you see. This update was mostly the quiet
kind — tightening how the platform protects your permissions, your $SELF, and
your calls, so the things you *do* see just work and stay trustworthy.

Here's what changed, in plain terms.

### Permissions that mean what they say

We went through the ways the platform decides *who can do what* and made them
stricter and more honest. A few examples:

- **Forum access is now verified properly.** Access to gated forums and
  moderation tools is checked against what you actually hold, not assumed — and
  when something can't be verified, we now err on the side of *not* granting
  access rather than granting it.
- **Sensitive actions are locked to the right people.** We closed a couple of
  places where a control could be reached by someone who shouldn't have it. If a
  button is meant for pod leaders, it's for pod leaders.

None of this changes your day-to-day — it just means the guardrails are real.

### Smoother $SELF checkout

When you spend $SELF — on a marketplace item or an event ticket — its value is
always gently shifting as it ages. Occasionally that timing could cause a payment
to be rejected at the last second. We added a small cushion to how $SELF payments
are prepared, so those payments go through cleanly instead of failing on a
technicality. You'll just notice checkout working the first time.

### More reliable video calls

We laid the groundwork for one-to-one video calls to connect for more people,
including those on stricter office or mobile networks where calls sometimes
couldn't establish before. (This one activates once a bit of server setup is in
place — more soon.)

### Why we sweat these details

A community that holds its members' data, tokens, and governance has to be
*trustworthy in the boring places* — the permission check nobody sees, the
payment that quietly succeeds, the call that connects. That reliability is what
lets the visible parts — the pods, the votes, the gatherings — carry real weight.

As always: if something feels off, tell us. Every report makes the next fix
faster.

*With gratitude,*
*The SpiritDAO team*
