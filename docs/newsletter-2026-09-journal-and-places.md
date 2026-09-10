# Newsletter — September 2026: Journal, Places, and a Stronger Front Door

*Draft for Paragraph. 2026-09-10. Do not publish until commits `2376611b`
through `fa0a23de` are deployed to production. Supersedes the standalone
login blurb (`newsletter-2026-09-login-verification.md`), which is folded in
below as the last section.*

---

## Where you are, and where you are going

One of our communities asked a good question this month: could the app hold a
shared map of the places that matter to them, the land they steward, the
partners they work with, the sites where they gather, and a shared journal
for the vision they are building toward? Could they call it a *journal*
rather than a *forum*?

Yes. Both shipped this week.

## Journal: the forum, the way a community actually uses it

Any pod forum category can now be switched to **journal mode**. Nothing
changes about who can read it or write in it. What changes is how it reads:
entries newest first, grouped by month, each with a cover photo, the author,
the date and a short excerpt. Writing an entry uses the formatting editor by
default, so headings, lists and images come naturally.

Pair it with the Pod Faces feature from last month, rename the **Forum**
button to **Journal**, and your community sees that word everywhere it
looks, including the page heading.

Pod leaders: **Manage → Forum**, create a category and choose *Journal*, or
switch an existing one.

## Places: a members-only map of your community

A new **Places** add-on puts a map on your pod's page. Pin your land and
assets, your partner organisations, gathering sites, shared resources, and
the places you are still envisioning. Each pin carries a description, a
photo, and connections: to journal entries, to the people who steward it,
and to other pins, drawn as a line between them.

A few choices we made on purpose:

- **Members only.** Nobody outside the pod sees the map, and photos on it
  are served only to members. There is no public mode.
- **Ideas look like ideas.** A pin marked *Proposed* draws with a dashed
  outline, so a vision never passes for a fact.
- **Vagueness is a feature.** Any pin can be *Approximate*, shown as a
  shaded circle rather than a point. Use it for anything sensitive.
- **Managing pins is a role.** Every member can view. Adding and editing is
  the new **Places Manage** permission, which pod leaders hold by default
  and can grant to any role.

Pod leaders: **Manage → Modules → Add-Ons → Places**. Rename the section to
whatever fits your community.

## Put yourself on the map, if you want to

From **Identity → Location**, you can choose to appear on your pods' maps.
It is off unless you turn it on. By default we store your location
approximately, to about a kilometre, and show it as a shaded circle. Only
people who share a pod with you can see it, only while sharing is on, and
you can remove it any time. Nothing about your location is ever public.

## Under the hood: a stronger front door

Alongside the new features we finished a top-to-bottom review of the app.
The architecture holds together the way we say it does, and pod treasuries
cannot be touched by anyone without the pod's management role, verified
against the live contracts.

The review also found one thing we fixed immediately. When you sign in,
Coinbase verifies who you are and holds your keys; that part was always
solid. But our own server did not independently confirm that the browser
talking to it held that Coinbase session. It took the wallet address on
faith. It no longer does: every sign-in now carries a short-lived proof from
Coinbase that our server checks before opening your session, and the same
standard now applies to onboarding, invites, device linking, and a set of
older routes that act on your behalf. Nothing on-chain was ever exposed, and
we have no indication this was misused. "We trusted it" is not the same as
"we checked it", and a community built on verified participation should hold
its own sign-in to that standard.

## What's next

Events on the map, a "proposed" pin that opens a pod proposal with one tap,
and the Community Agent learning what your places are. As always, the best
ideas come from the communities using this. Tell us what you need.

— The SpiritDAO Team
