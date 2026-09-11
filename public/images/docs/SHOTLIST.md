# Documentation screenshot shot list

*Generated from `public/images/docs/manifest.json` by `scripts/docs-screenshots.mjs plan`. Edit the manifest, not this file.*

**88 shots** — 43 P1, 33 P2, 12 P3. Do P1 first across all guides; the docs are useful with P1 alone.

## Capture standard

- **viewport**: Phone width, 393 x 852 CSS px (Chrome DevTools > Device toolbar > iPhone 14 Pro) at 2x device pixel ratio, or a real phone. Desktop only where an entry says so (1280 px wide).
- **format**: PNG. Viewport-height capture unless an entry says 'full page'. No browser chrome, no DevTools panel.
- **account**: Use your own account on the Temporal Naturalism pod or a throwaway 'Demo Pod'. Never capture another member's DMs, email, or full wallet address; the app shows truncated addresses, which is fine.
- **state**: Light theme, no Pod Face applied (classic SpiritDAO look) unless the entry is about faces. Dismiss toasts and the guided tour before capturing.
- **naming**: Keep the exact file names below. Save straight into the matching folder under public/images/docs/.

Save each file into `public/images/docs/<folder>/` with the exact name shown. "Reuse" points at an existing capture that may already match; open it, compare to the live screen, and copy it into place if it is current.

Placement: *before-body* = the image goes directly under the heading; *after-body* = at the end of that section, just before the next heading.

---

## Getting Started  `01-getting-started.md` → folder `getting-started/`

### ⬜ `01-sign-in.png` — P1 — must have

- **Where in the doc:** before-body of `### Step 1: Connect Your Wallet`
- **Caption:** The sign-in screen: email code or Google, no wallet app needed.
- **Screen:** `/` as *logged out (private window)*
- **What to show:** The Coinbase embedded-wallet sign-in card with the email field and Google button visible. Skip the invite-code step if it appears, or capture the invite modal as a second frame only if you want it.
- **Crop:** Viewport.

### ⬜ `02-edit-profile.png` — P1 — must have

- **Where in the doc:** after-body of `### Step 2: Set Up Your Identity`
- **Caption:** Identity → Edit Profile: name, picture, bio, interests, and openness to connect.
- **Screen:** `/identity` as *member*
- **What to show:** Edit Profile open with all fields filled with sample values and the Openness to Connect selector visible.
- **Crop:** Viewport, scrolled so the form starts at the top.

### ⬜ `03-home-screen.png` — P1 — must have

- **Where in the doc:** before-body of `## Navigation`
- **Caption:** The home screen: your modules on top, community modules below.
- **Screen:** `/home` as *member*
- **What to show:** Both icon grids fully visible; tour dismissed; no toasts.
- **Crop:** Full page.

### ⬜ `04-bottom-nav.png` — P2 — should have

- **Where in the doc:** after-body of `### Bottom Mobile Nav`
- **Caption:** The bottom bar: Home, Claims, Govern, Alerts.
- **Screen:** `/home` as *member*
- **What to show:** Any page; the four bottom-nav items visible.
- **Crop:** Tight crop of the bottom bar only, about 393 x 90.

### ⬜ `05-credentials-gallery.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 3: Get Advocate (Optional)`
- **Caption:** Credentials and accreditations on the Identity page, Advocate included.
- **Screen:** `/identity` as *member with Advocate*
- **What to show:** Scrolled to the Credentials / Accreditations galleries showing Proof of Curiosity and Advocate.
- **Crop:** Viewport.

### ⬜ `06-guided-tour.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Guided Tour`
- **Caption:** The guided tour highlights each module in turn.
- **Screen:** `/home` as *member*
- **What to show:** Tour running, first or second step highlighted.
- **Crop:** Viewport.

---

## Pods  `02-pod-management.md` → folder `pods/`

### ⬜ `01-pods-directory.png` — P1 — must have

- **Where in the doc:** after-body of `### Browse Pods`
- **Caption:** The Pods directory.
- **Screen:** `/pods` as *member*
- **What to show:** At least three pods listed with images and descriptions.
- **Crop:** Viewport.

### ⬜ `02-pod-page.png` — P1 — must have

- **Where in the doc:** after-body of `### View Pod Details`
- **Caption:** A pod page: name, status, description, funding, and the sections below.
- **Screen:** `/pods/<pod-id>` as *member of the pod*
- **What to show:** Top of a pod page with the Fund button and description visible.
- **Crop:** Viewport.

### ⬜ `03-apply-for-membership.png` — P1 — must have

- **Where in the doc:** after-body of `### Apply for Membership`
- **Caption:** Applying to a pod: pick a role, answer the prompts, sign.
- **Screen:** `/pods/<pod-id>/applications/apply` as *member NOT in the pod*
- **What to show:** Application form with a role selected and a short statement typed.
- **Crop:** Viewport.

### ⬜ `04-create-pod-basics.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 2: Fill Basic Information`
- **Caption:** Create a pod: name, description, image.
- **Screen:** `/pods/create-with-modules` as *member with Proof of Curiosity*
- **What to show:** Step with name and description filled and an image chosen.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/createpod.png (check it matches the current form)

### ⬜ `05-create-pod-leaders.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 3: Add Pod Leaders`
- **Caption:** Add leaders by wallet or by member search.
- **Screen:** `/pods/create-with-modules` as *same*
- **What to show:** Leaders step with one leader added.
- **Crop:** Viewport.

### ⬜ `06-create-pod-eligibility.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Step 4: Set Eligibility Criteria (Optional)`
- **Caption:** Eligibility: token holdings, agreements, or other-pod membership.
- **Screen:** `/pods/create-with-modules` as *same*
- **What to show:** Eligibility step with one criterion added.
- **Crop:** Viewport.

### ⬜ `07-create-pod-modules.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 5: Enable Modules (Optional)`
- **Caption:** Choose the modules your pod starts with.
- **Screen:** `/pods/create-with-modules` as *same*
- **What to show:** Modules step with a few toggled on.
- **Crop:** Viewport.

### ⬜ `08-create-pod-review.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 6: Review and Create`
- **Caption:** Review, then create. The on-chain step is gasless.
- **Screen:** `/pods/create-with-modules` as *same*
- **What to show:** Review step before pressing Create.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/podcreate.png (check)

### ⬜ `09-manage-tabs.png` — P1 — must have

- **Where in the doc:** before-body of `### Pod Management Dashboard`
- **Caption:** Manage: the tab strip across the top of pod management.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Manage page top with the tab strip visible (Members & Roles, Agreements, Modules, Agents, Treasury, Settings).
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/podmanage.png (check)

### ⬜ `10-members-roles.png` — P1 — must have

- **Where in the doc:** after-body of `### Managing Permissions`
- **Caption:** Members & Roles: each role carries granular permissions.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Members & Roles tab with a role expanded showing the permission toggles (Core group open).
- **Crop:** Viewport.
- **Reuse:** public/images/appimages/modpermissions.png (check)

### ⬜ `11-agreements-tab.png` — P2 — should have

- **Where in the doc:** after-body of `### Creating Agreement`
- **Caption:** Agreements tab: create an agreement and attach it to a role.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Agreements tab with the create form open.
- **Crop:** Viewport.

### ⬜ `12-modules-tab.png` — P1 — must have

- **Where in the doc:** before-body of `## Pod Modules in Detail`
- **Caption:** Modules tab: Core, Add-Ons, and Paid.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Modules tab with the Core group expanded and Add-Ons visible below.
- **Crop:** Full page.
- **Reuse:** public/images/appimages/podmods.PNG (check)

### ⬜ `13-treasury-tab.png` — P2 — should have

- **Where in the doc:** after-body of `### Treasury Module`
- **Caption:** Treasury tab: balances, distribution, approvals.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Treasury tab on a pod with a deployed treasury.
- **Crop:** Viewport.
- **Reuse:** public/images/appimages/treasurysettings.PNG (check)

---

## Governance & Voting  `03-governance-voting.md` → folder `governance/`

### ⬜ `01-proposals-list.png` — P1 — must have

- **Where in the doc:** after-body of `### Browse All Proposals`
- **Caption:** Governance: proposals grouped by status.
- **Screen:** `/governance` as *member*
- **What to show:** List with at least one active and one closed proposal.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/governanceapp.PNG (check)

### ⬜ `02-proposal-detail.png` — P1 — must have

- **Where in the doc:** after-body of `### View Proposal Details`
- **Caption:** A proposal: description, tier, tallies, and the vote buttons.
- **Screen:** `/governance/<proposal-id>` as *eligible voter*
- **What to show:** Active proposal with vote counts and For / Against / Abstain visible.
- **Crop:** Viewport.

### ⬜ `03-cast-vote.png` — P1 — must have

- **Where in the doc:** after-body of `### Cast Your Vote`
- **Caption:** Casting a vote. On-chain votes are gasless.
- **Screen:** `/governance/<proposal-id>` as *eligible voter*
- **What to show:** Right after pressing a vote button: the confirming state or the 'You voted' badge.
- **Crop:** Tight crop around the vote controls.

### ⬜ `04-delegation.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Delegate to Someone Else (Optional)`
- **Caption:** Delegating DAO-wide voting power.
- **Screen:** `/governance` as *Advocate holder*
- **What to show:** The delegation control with your current delegate shown.
- **Crop:** Tight crop.

### ⬜ `05-create-proposal.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 3: Fill Proposal Form`
- **Caption:** Create proposal: title, description, tier.
- **Screen:** `/governance` as *member allowed to propose*
- **What to show:** Create Proposal form with tier selector visible and fields filled.
- **Crop:** Viewport.

### ⬜ `06-governance-settings.png` — P2 — should have

- **Where in the doc:** after-body of `### Proposal Thresholds`
- **Caption:** Per-pod governance settings: quorum, approval, and voting window.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Settings or Governance tab showing quorum %, approval %, duration.
- **Crop:** Viewport.
- **Reuse:** public/images/appimages/goverencesettings.PNG (check)

---

## Bounties  `04-bounties-system.md` → folder `bounties/`

### ⬜ `01-bounty-board.png` — P1 — must have

- **Where in the doc:** after-body of `### View All Bounties`
- **Caption:** The bounty board.
- **Screen:** `/bounty` as *member*
- **What to show:** Public tab with two or more open bounties.
- **Crop:** Viewport.

### ⬜ `02-bounty-detail.png` — P1 — must have

- **Where in the doc:** after-body of `### View Bounty Details`
- **Caption:** A bounty: value, deadline, requirements, and Apply.
- **Screen:** `/bounty` as *member*
- **What to show:** A bounty expanded with its details and the Apply button.
- **Crop:** Viewport.

### ⬜ `03-apply-form.png` — P1 — must have

- **Where in the doc:** after-body of `### Submit Application`
- **Caption:** Applying: experience, plan, deliverables, proposed amount.
- **Screen:** `/bounty` as *member*
- **What to show:** Bid form partially filled.
- **Crop:** Viewport.

### ⬜ `04-application-status.png` — P2 — should have

- **Where in the doc:** after-body of `### Application Status`
- **Caption:** Your applications and their status.
- **Screen:** `/bounty` as *member with a pending bid*
- **What to show:** The applicant's view with a Pending badge.
- **Crop:** Viewport.

### ⬜ `05-submit-work.png` — P2 — should have

- **Where in the doc:** after-body of `### Submitting Work`
- **Caption:** Submitting work for review.
- **Screen:** `/bounty` as *assigned worker*
- **What to show:** Work submission form with title, description, and a link added.
- **Crop:** Viewport.

### ⬜ `06-review-work.png` — P2 — should have

- **Where in the doc:** after-body of `### If You're the Reviewer`
- **Caption:** Reviewing a submission: approve, request revision, or reject.
- **Screen:** `/bounty` as *bounty creator*
- **What to show:** Review panel with a submission open and the three actions visible.
- **Crop:** Viewport.

### ⬜ `07-create-bounty.png` — P1 — must have

- **Where in the doc:** after-body of `### Step 2: Fill Bounty Details`
- **Caption:** Create a bounty: pod, who can apply, title, category, amount.
- **Screen:** `/bounty` as *pod leader or bounty manager*
- **What to show:** Create tab with the form filled.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/bountyapp.PNG (current, reusable)

### ⬜ `08-fund-bounty.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 3: Fund Bounty`
- **Caption:** Funding from your wallet or the pod treasury.
- **Screen:** `/bounty` as *same*
- **What to show:** The funding-source choice and the confirm step.
- **Crop:** Tight crop.

### ⬜ `09-manage-bounties.png` — P2 — should have

- **Where in the doc:** after-body of `### As Bounty Poster`
- **Caption:** Manage tab: applications, assignments, payments.
- **Screen:** `/bounty` as *bounty creator*
- **What to show:** Manage tab with one bounty showing applications.
- **Crop:** Viewport.

---

## Events & Calendar  `05-events-calendar.md` → folder `events/`

### ⬜ `01-events-list.png` — P1 — must have

- **Where in the doc:** after-body of `### Event List View`
- **Caption:** Upcoming events.
- **Screen:** `/events` as *member*
- **What to show:** List with two or more upcoming events.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/eventsapp.PNG (check)

### ⬜ `02-event-detail.png` — P1 — must have

- **Where in the doc:** after-body of `### Event Details`
- **Caption:** An event: when, where, price, and Register.
- **Screen:** `/events/<event-id>` as *member*
- **What to show:** Event page with the Register button visible.
- **Crop:** Viewport.

### ⬜ `03-register-modal.png` — P1 — must have

- **Where in the doc:** after-body of `### Registration Steps`
- **Caption:** Registering: choose $SELF or $SYSTEM for paid events.
- **Screen:** `/events/<event-id>` as *member*
- **What to show:** Registration modal open on a paid event showing the token choice.
- **Crop:** Viewport.

### ⬜ `04-checkin-qr.png` — P2 — should have

- **Where in the doc:** after-body of `### Check-In Process`
- **Caption:** Your check-in QR code.
- **Screen:** `/events/<event-id>` as *registered member*
- **What to show:** The QR code view for a registration.
- **Crop:** Tight crop around the QR card.

### ⬜ `05-create-event.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 2: Fill Event Details`
- **Caption:** Create an event: title, date, location, capacity, price.
- **Screen:** `/events/create` as *member with event creation*
- **What to show:** Form filled with sample values.
- **Crop:** Viewport.

### ⬜ `06-calendar-month.png` — P2 — should have

- **Where in the doc:** after-body of `### Calendar Views`
- **Caption:** The community calendar, month view.
- **Screen:** `/calendar` as *member*
- **What to show:** Month view with a few events.
- **Crop:** Viewport. Desktop width (1280) is fine here.

### ⬜ `07-organizer-manage.png` — P3 — nice to have

- **Where in the doc:** after-body of `### As Event Organizer`
- **Caption:** Organizer tools: attendees, check-in, completion.
- **Screen:** `/events/<event-id>/manage` as *organizer*
- **What to show:** Manage view with the attendee list.
- **Crop:** Viewport.

---

## Forum  `06-forum-discussions.md` → folder `forum/`

### ⬜ `01-categories.png` — P1 — must have

- **Where in the doc:** after-body of `### View All Categories`
- **Caption:** Forum categories, including pod forums you can access.
- **Screen:** `/forum` as *member*
- **What to show:** Category list with thread counts.
- **Crop:** Viewport.

### ⬜ `02-category-threads.png` — P2 — should have

- **Where in the doc:** after-body of `### View Category Threads`
- **Caption:** Threads in a category with sort controls.
- **Screen:** `/forum/category/<id>` as *member*
- **What to show:** A category with several threads and the sort control visible.
- **Crop:** Viewport.

### ⬜ `03-new-thread-editor.png` — P1 — must have

- **Where in the doc:** after-body of `### Step 2: Write Thread`
- **Caption:** New thread: title, formatting toolbar, body.
- **Screen:** `/forum/create-thread` as *member*
- **What to show:** Editor with the toolbar visible and a couple of lines typed.
- **Crop:** Viewport.

### ⬜ `04-reply-mention.png` — P2 — should have

- **Where in the doc:** after-body of `### Reply to Thread`
- **Caption:** Replying with an @mention: type @ and pick a member.
- **Screen:** `/forum/thread/<id>` as *member*
- **What to show:** Reply box with the @mention autocomplete dropdown open.
- **Crop:** Tight crop around the reply box.

### ⬜ `05-moderation-menu.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Moderation Actions`
- **Caption:** Moderation actions on a thread.
- **Screen:** `/forum/thread/<id>` as *moderator*
- **What to show:** Moderation menu open (pin, lock, delete).
- **Crop:** Tight crop.

### ⬜ `06-poll.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Polls (If Enabled)`
- **Caption:** A poll inside a thread.
- **Screen:** `/forum/thread/<id>` as *member*
- **What to show:** A thread with a poll and results bars visible.
- **Crop:** Tight crop.

### ⬜ `07-journal-mode.png` — P1 — must have

- **Where in the doc:** after-body of `## Journal Mode`
- **Caption:** A category in journal mode: entries by month with covers.
- **Screen:** `/forum/category/<journal-category-id>` as *member*
- **What to show:** Journal category with the Journal badge, a month header, and at least one entry with a cover image.
- **Crop:** Viewport.

---

## Marketplace  `07-marketplace-shopping.md` → folder `marketplace/`

### ⬜ `01-storefront.png` — P1 — must have

- **Where in the doc:** after-body of `### View Marketplace`
- **Caption:** The Artifacts marketplace.
- **Screen:** `/market` as *member*
- **What to show:** Storefront with several products.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/marketplaceapp.PNG (check)

### ⬜ `02-product-detail.png` — P2 — should have

- **Where in the doc:** after-body of `### Product Details`
- **Caption:** A product: price in $SELF or $SYSTEM, availability, add to cart.
- **Screen:** `/market` as *member*
- **What to show:** Product detail open.
- **Crop:** Viewport.

### ⬜ `03-cart.png` — P1 — must have

- **Where in the doc:** after-body of `### View Cart`
- **Caption:** Your cart.
- **Screen:** `/market` as *member*
- **What to show:** Cart open with one or two items.
- **Crop:** Viewport.

### ⬜ `04-checkout-token.png` — P1 — must have

- **Where in the doc:** after-body of `### Step 2: Select Payment Token`
- **Caption:** Checkout: pay with $SELF (burn) or $SYSTEM.
- **Screen:** `/market` as *member*
- **What to show:** Checkout step with the token selector visible.
- **Crop:** Tight crop.

### ⬜ `05-orders.png` — P2 — should have

- **Where in the doc:** after-body of `### View Your Orders`
- **Caption:** Your orders and their status.
- **Screen:** `/marketplace/my-orders` as *member with an order*
- **What to show:** Orders list with at least one order.
- **Crop:** Viewport.

### ⬜ `06-create-product.png` — P2 — should have

- **Where in the doc:** after-body of `### Step 3: Fill Product Details`
- **Caption:** Creating a product.
- **Screen:** `/market` as *seller with marketplaceManage*
- **What to show:** Product creation form filled.
- **Crop:** Viewport.

### ⬜ `07-order-management.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Order Management Dashboard`
- **Caption:** Order management for fulfilment.
- **Screen:** `/marketplace/orders` as *order manager*
- **What to show:** Dashboard with an order in Processing.
- **Crop:** Viewport.

---

## Video & Chat  `08-video-chat-conferencing.md` → folder `video/`

### ⬜ `01-quick-meeting.png` — P1 — must have

- **Where in the doc:** after-body of `### Accessing a Conference`
- **Caption:** Quick Meeting on the pod page: start or join.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** The Quick Meeting section with a live room and Join button.
- **Crop:** Tight crop.
- **Reuse:** public/images/appimages/quickmeeting.PNG (check)

### ⬜ `02-conference-room.png` — P2 — should have

- **Where in the doc:** after-body of `### Conference Controls`
- **Caption:** In a conference: mute, camera, share, leave.
- **Screen:** `/pods/<pod-id>` as *member in a room*
- **What to show:** Conference overlay with controls visible. Use your own camera only, or camera off.
- **Crop:** Viewport. Desktop width fine.

### ⬜ `03-video-call-from-dm.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Accessing Video Chat`
- **Caption:** Starting a 1:1 video call from a direct message.
- **Screen:** `/chat/<dm-id>` as *member*
- **What to show:** A DM with the video-call button highlighted or the incoming-call banner.
- **Crop:** Tight crop.

---

## App Walkthrough  `09-app-walkthrough.md` → folder `walkthrough/`

### ⬜ `01-start-tour.png` — P2 — should have

- **Where in the doc:** after-body of `### From the Home Screen`
- **Caption:** Start the guided tour from the home screen.
- **Screen:** `/home` as *member*
- **What to show:** The tour entry point visible.
- **Crop:** Tight crop.

### ⬜ `02-kb-videos.png` — P2 — should have

- **Where in the doc:** after-body of `## Video Walkthroughs`
- **Caption:** Video walkthroughs in the Knowledge Base.
- **Screen:** `/knowledge` as *member*
- **What to show:** Knowledge Base showing video items.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/kbapp.PNG (check)

---

## Linking External Wallets  `10-linking-external-wallets.md` → folder `linking-wallets/`

### ⬜ `01-linked-wallets.png` — P1 — must have

- **Where in the doc:** after-body of `## How to link a wallet, step by step`
- **Caption:** Identity → Linked Wallets: link an external wallet by signing a message.
- **Screen:** `/identity` as *member*
- **What to show:** Linked Wallets section with the Link button and, if possible, the MetaMask signature prompt.
- **Crop:** Viewport.

### ⬜ `02-linked-list.png` — P3 — nice to have

- **Where in the doc:** after-body of `## Checking that it worked`
- **Caption:** A linked external wallet listed with its type.
- **Screen:** `/identity` as *member with a linked wallet*
- **What to show:** The list showing one external wallet.
- **Crop:** Tight crop.

---

## Surveys  `11-surveys.md` → folder `surveys/`

### ⬜ `01-survey-banner.png` — P1 — must have

- **Where in the doc:** before-body of `## Taking a survey (members)`
- **Caption:** An active survey on the pod page.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** Active Surveys banner visible.
- **Crop:** Tight crop.
- **Reuse:** public/images/appimages/survey.PNG (check)

### ⬜ `02-survey-form.png` — P2 — should have

- **Where in the doc:** after-body of `## Taking a survey (members)`
- **Caption:** Answering a survey.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** Survey form open with a multiple-choice and a rating question.
- **Crop:** Viewport.

### ⬜ `03-create-survey.png` — P2 — should have

- **Where in the doc:** after-body of `## Creating a survey (pod leaders)`
- **Caption:** Creating a survey: audience and questions.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Surveys tab, create form with two questions.
- **Crop:** Viewport.

### ⬜ `04-results.png` — P3 — nice to have

- **Where in the doc:** after-body of `## Reading results (creators)`
- **Caption:** Survey results.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** A closed survey expanded to show results.
- **Crop:** Viewport.

---

## Password Vault  `12-password-vault.md` → folder `password-vault/`

### ⬜ `01-enable-vault.png` — P2 — should have

- **Where in the doc:** after-body of `## Turning it on (pod leaders)`
- **Caption:** Modules → Add-Ons → Password Vault.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Modules tab with the Password Vault card toggled on.
- **Crop:** Tight crop.

### ⬜ `02-first-time-setup.png` — P1 — must have

- **Where in the doc:** after-body of `## First-time setup (every member, once)`
- **Caption:** One-time vault setup: sign to create your key.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** The vault setup prompt asking for a signature.
- **Crop:** Viewport.

### ⬜ `03-vault-entries.png` — P1 — must have

- **Where in the doc:** after-body of `## Using the vault (members)`
- **Caption:** Vault entries. Decryption happens in your browser.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** Vault list with two sample entries (fake credentials only).
- **Crop:** Viewport.
- **Reuse:** public/images/appimages/passwordmanager.PNG (check)

---

## Community Agent  `13-community-agent.md` → folder `community-agent/`

### ⬜ `01-agent-reply.png` — P1 — must have

- **Where in the doc:** after-body of `## Talking to it (members)`
- **Caption:** Mention the agent in pod chat and it replies.
- **Screen:** `/chat/<pod-group-id>` as *member of TN pod*
- **What to show:** A message that @mentions Kairos and its reply beneath.
- **Crop:** Viewport.

### ⬜ `02-agent-settings.png` — P1 — must have

- **Where in the doc:** after-body of `## Setting it up (pod leaders)`
- **Caption:** Agents tab: name, avatar, persona, schedule.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Agents tab with the Community Agent card.
- **Crop:** Viewport.
- **Reuse:** src/guides/maps/communityai.PNG (current, reusable)

---

## Chat & Direct Messages  `14-chat-and-messages.md` → folder `chat/`

### ⬜ `01-chat-groups.png` — P1 — must have

- **Where in the doc:** after-body of `## Pod chat`
- **Caption:** Chat: your pod rooms and direct messages.
- **Screen:** `/chat` as *member*
- **What to show:** Group list with two or more rooms.
- **Crop:** Viewport.

### ⬜ `02-direct-message.png` — P2 — should have

- **Where in the doc:** after-body of `## Direct messages`
- **Caption:** A direct message thread.
- **Screen:** `/chat/<dm-id>` as *member*
- **What to show:** A DM with a couple of messages between you and a test account only.
- **Crop:** Viewport.
- **Reuse:** public/images/appimages/directmsg.png (check content is yours)

---

## $SELF & Tenure  `15-self-token-and-tenure.md` → folder `self-tenure/`

### ⬜ `01-self-holdings.png` — P1 — must have

- **Where in the doc:** after-body of `## What $SELF is`
- **Caption:** Your $SELF holdings by epoch.
- **Screen:** `/claims` as *member with $SELF*
- **What to show:** The $SELF holdings card with epochs and decay shown.
- **Crop:** Tight crop.

### ⬜ `02-tenure-band.png` — P2 — should have

- **Where in the doc:** after-body of `## Tenure — your permanent standing`
- **Caption:** Your Tenure band on the Identity page.
- **Screen:** `/identity` as *member*
- **What to show:** The Tenure badge with band name and lifetime hours.
- **Crop:** Tight crop.

---

## AI Agents & the Constitution  `16-ai-agents-and-the-constitution.md` → folder `agent-constitution/`

### ⬜ `01-constitution-monitor.png` — P2 — should have

- **Where in the doc:** after-body of `## Safeguards`
- **Caption:** The public constitution monitor at /constitution.
- **Screen:** `/constitution` as *anyone*
- **What to show:** The exclusion checks table showing the registered agent.
- **Crop:** Viewport.

---

## Pod Agreements  `16-pod-agreements.md` → folder `agreements/`

### ⬜ `01-sign-agreement.png` — P1 — must have

- **Where in the doc:** after-body of `## Signing an agreement (members)`
- **Caption:** Signing a pod agreement.
- **Screen:** `/pods/<pod-id>` as *member with an unsigned agreement*
- **What to show:** Pod Agreements section with a Not signed badge and the signing modal open.
- **Crop:** Viewport.

### ⬜ `02-create-agreement.png` — P3 — nice to have

- **Where in the doc:** after-body of `## Creating agreements (pod leaders)`
- **Caption:** Attaching an agreement to a role.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Agreements tab create form.
- **Crop:** Viewport.

---

## Inviting People  `17-inviting-people.md` → folder `inviting-people/`

### ⬜ `01-invite-friends.png` — P1 — must have

- **Where in the doc:** after-body of `## Using the Invite Friends panel`
- **Caption:** Identity → Invite Friends: personal link, pod link, email.
- **Screen:** `/identity` as *member*
- **What to show:** Invite Friends panel expanded.
- **Crop:** Viewport.

### ⬜ `02-pod-invite-links.png` — P2 — should have

- **Where in the doc:** after-body of `## Pod invite links, in depth (for pod leaders)`
- **Caption:** Pod invite links and the pending-mint queue.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Invite links manager with one link and its use count.
- **Crop:** Viewport.

---

## Pod Faces  `18-pod-faces.md` → folder `pod-faces/`

### ⬜ `01-wear-a-look.png` — P1 — must have

- **Where in the doc:** after-body of `## Wearing a look (members)`
- **Caption:** Identity → Appearance: choose a pod's face.
- **Screen:** `/identity` as *member of a pod with a published face*
- **What to show:** Appearance section with the default and one pod face listed.
- **Crop:** Tight crop.

### ⬜ `02-face-editor.png` — P1 — must have

- **Where in the doc:** after-body of `## Designing a face (pod leaders)`
- **Caption:** The face editor: palette, icons, menu names, live preview.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Custom Appearance editor with the preview visible.
- **Crop:** Full page.

---

## Journal & Places  `19-journal-and-places.md` → folder `journal-and-places/`

### ⬜ `01-journal-category.png` — P1 — must have

- **Where in the doc:** after-body of `### Turn it on (pod leaders)`
- **Caption:** Manage → Forum: choose Journal as the presentation.
- **Screen:** `/pods/<pod-id>/manage` as *pod leader*
- **What to show:** Forum tab with the Presentation choice set to Journal.
- **Crop:** Tight crop.

### ⬜ `02-places-map.png` — P1 — must have

- **Where in the doc:** after-body of `## Places: your community's shared map`
- **Caption:** The Places section on a pod page.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** Places section in Map view with three or more pins of different kinds, one proposed (dashed), one approximate (circle), and a relationship line.
- **Crop:** Viewport.

### ⬜ `03-place-detail.png` — P1 — must have

- **Where in the doc:** after-body of `### What a place is`
- **Caption:** A pin's detail card: kind, status, description, connections.
- **Screen:** `/pods/<pod-id>` as *member*
- **What to show:** A pin selected with the detail card showing a cover image and two connections.
- **Crop:** Tight crop of the card.

### ⬜ `04-add-place.png` — P1 — must have

- **Where in the doc:** after-body of `### Adding a place (managers)`
- **Caption:** Add a place: search an address or tap the mini map.
- **Screen:** `/pods/<pod-id>` as *manager*
- **What to show:** Editor open with kind, status, the mini map, and address search results visible.
- **Crop:** Full page of the editor sheet.

### ⬜ `05-rename-section.png` — P3 — nice to have

- **Where in the doc:** after-body of `### Naming the section`
- **Caption:** Rename the section for your community.
- **Screen:** `/pods/<pod-id>` as *manager*
- **What to show:** The heading in rename mode with 'Territory' typed.
- **Crop:** Tight crop.

### ⬜ `06-identity-location.png` — P1 — must have

- **Where in the doc:** after-body of `## Sharing your own location (optional)`
- **Caption:** Identity → Location: opt in, approximate by default.
- **Screen:** `/identity` as *member*
- **What to show:** Location section with sharing on, an address found, and Approximate selected.
- **Crop:** Tight crop.

