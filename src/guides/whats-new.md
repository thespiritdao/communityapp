# What's New

A running record of meaningful changes to SpiritDAO and its documentation. Most
recent first.

---

## November 2026 — SpiritDAO is open source

### The code is public
The software behind SpiritDAO is now published under the AGPL-3.0 license at
[github.com/thespiritdao/communityapp](https://github.com/thespiritdao/communityapp).
Anyone can read it, check how votes are counted and who can see what, and
contribute fixes. The SpiritDAO name, our deployment and member information are
not part of the release.

### Should your community join or run its own copy?
For almost every community, joining is the better path: everything is ready
today, and hosting, security, fiscal sponsorship and the shared economy come
with it. The new [Open Source guide](20-open-source.md) explains when running
your own copy makes sense, and what it involves.

### Safer before it went public
Before publishing we reviewed the whole codebase. Member-written posts are now
cleaned before display, only the uploader can replace or delete a file, event
registrations are visible only to fellow attendees and organisers, and security
reports go to ron@spiritdao.org.

---

## September 2026 — Journal and Places

### A journal, not just a forum
Any pod forum category can now be set to **journal mode**: entries newest
first, grouped by month, with cover photos and excerpts, and the formatting
editor on by default. Pair it with a Pod Face rename of the Forum button and
your community has a *Journal* everywhere it looks. Leaders: Manage → Forum.

### Places: a members-only shared map
A new **Places** add-on (Manage → Modules → Add-Ons) puts a map on your pod's
page. Pin your land and assets, partner organisations, gathering sites,
resources, and the places you are still envisioning. Each pin carries a
description, a photo, and connections to journal entries, people and other
pins. Proposed pins draw dashed; sensitive ones can be approximate. Managing
pins is a delegable role permission (**Places Manage**); every member can
view. Members can also choose, from **Identity → Location**, to appear on
their pods' maps, approximately by default.

See the new [Journal and Places guide](19-journal-and-places.md).

### Under the hood
Sign-in now proves control of your wallet to our server, and a ring of
older API routes require your session before they act on your behalf.

---

## August 2026 — Pod Faces: your community, your look

### Menu renaming (added mid-August)
By community request, faces can now **rename the home-screen menu items** too:
Bounties can become *Quests*, Governance can become *Council* — whatever fits
your community's vocabulary (up to 20 characters per button). Renames live in
the same Face editor, show in the live preview, and travel with the face:
members wearing your look see your names; everyone else sees the standard
ones. Page headings and notifications keep the standard names so guides and
instructions still make sense.

### Communities can now skin the app
Pods can design a **custom appearance** — a color scheme, icon style, and
custom menu names — and publish it as their pod's **face**. Members choose
whether to wear it; nothing is ever forced. Highlights:

- **Leaders design** in the pod's Manage → Modules → **Custom Appearance**
  editor: five starter palettes, per-color fine-tuning, two curated icon sets,
  and a live preview.
- **Members choose** from **Identity → Appearance** or the **"Wear this
  look"** chip on the pod's page. One tap applies it app-wide; one tap
  reverts to the classic SpiritDAO look.
- **Readability is guaranteed** — every face must pass WCAG AA contrast
  checks before it can publish.
- **Same permissioning as everything else** — face design is a delegable role
  permission (**Appearance Manage**), leader-granted by default.

See the new [Pod Faces guide](18-pod-faces.md) for the full walkthrough.

---

## June 2026 — New documentation, a smarter assistant, and the current $SELF model

### Documentation rebuilt
These docs were rewritten from the ground up to match how SpiritDAO actually
works today. Highlights:

- **Two tiers.** Member guides ("how to use it") and developer documentation
  ("how it's built") now live side by side.
- **Current token model throughout.** Every page reflects the soulbound $SELF
  design and the Tenure system (see below), replacing older descriptions of a
  transferable $SELF.
- **One source of truth.** The same content that powers these pages also powers
  the Sensemaker assistant, so they stay in agreement.

### Sensemaker, upgraded
The **Sensemaker** assistant on our website now runs on the same engine as the
in-app assistant. It can answer questions about both **how the platform works**
(pods, governance, tokens, events) and **Temporal Naturalism** philosophy — where
before, the website version only knew the philosophy. Its knowledge has been
refreshed to the current platform.

### The current $SELF & Tenure model, documented
For anyone catching up, the docs now fully describe:

- **$SELF is soulbound** — earned through participation, never bought or
  transferred, spent only by burning ("burn-to-pay") for marketplace items and
  event tickets.
- **It fades gently** over roughly two years, keeping it a measure of *recent*
  participation. Expiring $SELF converts into permanent standing rather than
  being lost.
- **Tenure** is your permanent, ecosystem-wide standing from all the $SELF you've
  ever earned — five bands from **Curious** to **Elder** — and it only ever grows.
- **$SYSTEM** remains the transferable, capital-backed community currency.

> In one line: **$SELF is verified human time, recorded where it was spent, that
> fades unless renewed — and it never becomes money.**
