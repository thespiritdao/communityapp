# Pod Faces (Custom Appearance)

*Last updated: 2026-08-14*

## What Pod Faces are

Every pod has its own culture — Pod Faces let it have its own look. A **face** is a custom appearance for the app designed by a pod's leadership: a color scheme, an icon style, and custom menu names that reshape the home screen, buttons, and navigation.

The important part: **wearing a face is always the member's choice.** When a pod publishes a face, nobody's app changes automatically. Each member decides whether to wear it, and can switch back to the classic SpiritDAO look at any time. Your community designs the look; you decide whether it's yours.

A face changes colors, main-screen icons, and menu-button names only. Governance, treasury, permissions, and how everything works stay exactly the same.

## Wearing a look (members)

There are two ways to put on a pod's face:

**From the pod's page:**
1. Open the pod's page. If the pod has a published face and you're a member, a **"Wear this look"** chip appears next to the pod's status badge.
2. Tap it. The app re-colors instantly — no reload needed. The chip changes to **"Wearing this look ✓"**.
3. Tap it again anytime to return to the default appearance.

**From your Identity page (the full picker):**
1. Open **Identity** and scroll to the **Appearance** section.
2. You'll see **SpiritDAO default** plus a row for each of your pods that has published a face, each with a small color swatch preview.
3. Tap any row to wear that look. The checkmark shows what's active.

Things to know:

- Your chosen look follows you across the whole app and persists across sessions and reloads.
- You can only wear faces from pods you belong to. If you leave a pod, its face simply stops applying and you return to the default.
- If a pod updates its face, you'll see the new version automatically. If a pod removes its face while you're wearing it, you return to the default — nothing breaks.
- The Appearance section only appears once at least one of your pods has published a face.

![Identity → Appearance: choose a pod's face.](https://app.spiritdao.org/images/docs/pod-faces/01-wear-a-look.png)

## Designing a face (pod leaders)

You need the **appearance management** permission (leaders have it by default once the module is on).

1. Open your pod's **Manage** page → **Modules** tab.
2. Under **Add-On Modules**, toggle on **Custom Appearance** (palette icon). The face editor opens right there.
3. Design your look:
   - **Start from a palette** — five presets (Forest, Ocean, Dusk, Ember, Slate) give you a coherent starting point.
   - **Fine-tune each color** — seven color slots, each labeled with what it controls (buttons and links, background, text, section surfaces, alerts).
   - **Pick an icon set** — keep the SpiritDAO default icons, or apply a curated set (**Linework** for clean outlines, **Cosmos** for playful symbols).
   - **Upload your own icons** — this is where your community's identity really comes through. In the **"Your own icons"** grid, upload your own artwork for any home-screen button, navigation icon, or even the logo. Your icon overrides the icon set for that slot; **Clear** reverts it. Square images look best (128×128px or larger; PNG, JPEG, or WebP, up to 1MB each).
   - **Rename menu items** — give home-screen buttons your community's own words: Bounties can become *Quests*, Governance can become *Council*, Chat can become *Campfire*. Type a new name (up to 20 characters) under any button; leave a field blank to keep the standard name. Only the button label changes — the pages themselves keep their standard titles, so nobody gets lost.
   - The **live preview** shows a miniature home screen and navigation bar updating as you work.
4. **Save draft** as often as you like — drafts are only visible to people who can edit the face, never to members.
5. **Publish** when ready. Members of your pod can now wear the look, and they'll get a one-time notification that it's available.

Things to know:

- **Accessibility is enforced.** The editor continuously shows contrast ratios between your text and background colors. If a combination falls below the WCAG AA readability standard, Publish is disabled until you fix it — a face can be bold, but it must be readable.
- **Publishing never forces the look on anyone.** It just makes it available to choose.
- Editing a published face and saving it as a draft temporarily unpublishes it (members revert to default until you publish again) — the editor warns you before this happens.
- **Remove face** reverts everything: the face disappears from members' pickers and anyone wearing it returns to the default look.
- Like every pod capability, face design can be delegated: grant a role the **Appearance Manage** permission in your pod's role settings, and holders of that role can design and publish without being leaders.

![The face editor: palette, icons, menu names, live preview.](https://app.spiritdao.org/images/docs/pod-faces/02-face-editor.png)

## Frequently asked

**Can I wear a face from a pod I'm not in?** No — faces are a membership perk. Join the pod first.

**I'm in several pods with faces. Can I mix them?** You wear one face at a time (or the default). Switch between them freely in Identity → Appearance.

**Does a face change other members' screens?** Never. Each member's choice is their own.

**Can we use our own logo and icons, not just the built-in sets?** Yes — that's the heart of the feature. Upload your community's own artwork per button in the editor's "Your own icons" grid. The curated sets are just a quick coherent base; your uploads always win for the slots you customize.

**Can we rename the menu items too?** Yes — the "Rename menu items" section of the editor lets you rename any home-screen button (up to 20 characters each). Renames travel with the face: members wearing your look see your names; everyone else sees the standard ones. Page headings and notifications keep the standard names so instructions and guides still make sense.

**Does it work in dark mode?** Faces currently apply to the standard (light) appearance only.

**Something looks unreadable after switching?** That shouldn't happen — contrast is checked at publish — but you can always revert instantly via Identity → Appearance → SpiritDAO default.
