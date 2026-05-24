# Video Content Guide — SpiritDAO Knowledge Base

## 1. Where Videos Are Stored

**Local source files:** `public/guides/Instructional/` — organized by feature subfolder
**Production hosting:** `https://files.spiritdao.org/videos/Instructional/...`
**DB seed file:** `supabase/migrations/20260225000002_seed_knowledge_base.sql`
**DB table:** `knowledge_items` — each row has `content_url` pointing to the hosted mp4, `thumbnail_url` (currently null on all items), and `content_type = 'video'`

The `content_url` in the database points to `files.spiritdao.org`. The local mp4 files in `public/guides/Instructional/` are the source recordings. When adding new videos, upload the mp4 to the same hosting location and add a row to `knowledge_items` in Supabase (or add to the seed migration).

---

## 2. Current Video Inventory (21 videos)

### Getting Started (2 videos)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | App Walkthrough | `AppWalkthough.mp4` | Full platform overview |
| 2 | Claiming Tokens | `ClaimingTokens.mp4` | $SELF and $SYSTEM token claims |

### Identity & Profile (3 videos)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | Profile Setup | `identity/ProfileSetup.mp4` | Name, picture, bio, interests |
| 2 | Identity Editor | `identity/Editor.mp4` | Profile customization |
| 3 | Video Chat Guide | `identity/videochat.mp4` | Video chat and conferencing |

### Events (3 videos)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | Creating Events | `events/CreateEvents.mp4` | Event creation, role gating, fund distribution |
| 2 | Attendance Credentials | `events/EventsAttendanceCredentials.mp4` | Proof-of-participation NFTs |
| 3 | Conference Rooms Guide | `events/conferences.mp4` | Creating and joining conference rooms |

### Bounties (6 videos)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | Intro to Bounties | `bounties/IntroToBounties.mp4` | System overview |
| 2 | Applying to a Bounty | `bounties/ApplyToBounty.mp4` | Finding and applying |
| 3 | Submitting Work | `bounties/SubmittingWork.mp4` | Delivering completed work |
| 4 | Creating Bounties | `bounties/CreatingBounties.mp4` | Pod leader bounty creation |
| 5 | Reviewing & Approving Applications | `bounties/ReviewApproveBounty.mp4` | Applicant review |
| 6 | Reviewing Work & Paying Out | `bounties/ReviewWorkPayBounty.mp4` | Work review and payment release |

### Pods (5 videos)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | Applying to a Pod | `pods/ApplyToPod.mp4` | Finding and joining pods |
| 2 | Creating a Pod | `pods/CreatingPods.mp4` | Pod creation with treasury and governance |
| 3 | Pod Treasury | `pods/PodCreateTreasury.mp4` | Deploying and managing treasury |
| 4 | Pod Chat & Forum Modules | `pods/PodModulesChatForum.mp4` | Chat and forum usage |
| 5 | Role Creation & Permissions | `pods/RoleCreationandPermissions.mp4` | Roles and permission assignment |

### Governance (1 video)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | Voting on Proposals | `governance/VotingProposals.mp4` | Casting votes on DAO proposals |

### Marketplace (1 video)
| # | Title | File | Covers |
|---|-------|------|--------|
| 1 | Using the Marketplace | `marketplace/Marketplace.mp4` | Buying and selling artifacts |

---

## 3. Missing Videos — Features Not Yet Covered

### High Priority (core features with zero coverage)

| Category | Proposed Title | What to Cover |
|----------|---------------|---------------|
| **Donations** | Making a Donation | Stripe flow, card vs ACH, fee breakdown display, expected timeline for token minting |
| **Donations** | Understanding the Fee Structure | Operations 4%, Dignities 4%, Stripe processing, net $SYSTEM received |
| **Forum** | Navigating the Forum | Finding categories, reading threads, posting replies |
| **Forum** | Creating a Forum Thread | Starting a new discussion, pod-specific vs global forums |
| **Pulse (Explorer)** | Reading the Activity Feed | Filtering by type (pods, governance, treasury, etc.), understanding event cards |
| **Sensemaker AI** | Using the AI Assistant | Asking questions, switching between DAO Support and Philosophy modes, voice input |
| **Knowledge Base** | Finding Help in the Knowledge Base | Searching, filtering by category, pod-specific content |
| **Members** | Using the Members Directory | Search, filter by pod/availability, starting a DM |
| **Chat** | Direct Messaging | Starting a DM, pod chat rooms, sending messages |
| **Onboarding** | Creating Your Account | Email/Google/Apple auth, wallet creation, Proof of Curiosity |

### Medium Priority (expanding existing categories)

| Category | Proposed Title | What to Cover |
|----------|---------------|---------------|
| **Governance** | Creating a Proposal | Drafting, selecting tier (constitutional vs pod-level vs operational), submitting |
| **Governance** | Pod-Level Governance | How pod voting differs from DAO-wide votes, operational vs binding proposals |
| **Pods** | Managing Pod Members | Approving applications, removing members, viewing member roles |
| **Pods** | Pod Module Configuration | Enabling/disabling forum, chat, bounties, events, knowledge base, marketplace |
| **Pods** | Sub-Pods (Nested Groups) | Creating and managing child pods under a parent |
| **Events** | Registering for an Event | Browsing, token-gating eligibility check, registration and payment |
| **Events** | Event Check-In | QR code scanning, manual entry, receiving completion NFT |
| **Bounties** | Milestone Bounties | Multi-stage bounties with partial payments |
| **Marketplace** | Order Fulfillment (Managers) | Processing orders, updating status, adding tracking |
| **Identity** | Linking Wallets & Account Recovery | How email-based cross-wallet linking works |

### Lower Priority (advanced / niche)

| Category | Proposed Title | What to Cover |
|----------|---------------|---------------|
| **Governance** | Understanding the 3-Tier Model | Constitutional vs Treasury Binding vs Operational — when to use each |
| **Pods** | Pod Treasury Proposals | Creating and voting on pod spending proposals |
| **Tokens** | Understanding $SYSTEM vs $SELF | What each token is for, how they're earned, where they're spent |
| **Tokens** | Reading Your Token Balances | Where balances appear, Pulse supply display |

---

## 4. Video Production Format Decision

### Current format: Screen-only with voiceover
All 21 existing videos show only the app screen with a voiceover narration. No human face visible.

### Recommendation: Keep screen-only as the primary format, add face-cam for select videos

**Keep screen-only for:**
- All how-to/tutorial videos (the 21 existing + most new ones above)
- These are instructional — viewers need to see exactly what to click
- Screen-only is faster to produce, easier to re-record when UI changes, and more accessible (works for any narrator)
- Keeps the library visually consistent

**Add face-cam (picture-in-picture or intro/outro) for:**
- **Welcome / Onboarding video** — a face builds trust for new members entering the community. Record a 15-30 second intro of a human (founder, community lead) welcoming the viewer, then cut to screen recording for the walkthrough.
- **Philosophy / Mission videos** (if you create them) — explaining the Eight Dignities, Temporal Naturalism, or "why SpiritDAO exists" benefits from a human presence.
- **Community update / digest videos** — if you implement the automated blog digest spec, a face-cam intro adds personality.

**Format spec for face-cam videos:**
- PiP (picture-in-picture): small circle or rectangle in bottom-right corner showing face while screen is main content
- Resolution: 1080p minimum
- Lighting: well-lit face, neutral background
- Audio: external mic preferred (not laptop mic)

**Bottom line:** Don't re-record the existing 21 videos. For new tutorials, stick with screen-only. Reserve face-cam for the 2-3 community/welcome videos where a human presence actually matters.

---

## 5. Thumbnail / Cover Images

### Current state
The `thumbnail_url` column exists in `knowledge_items` but is **null for every video**. The `KnowledgeGrid.tsx` component already checks for `item.thumbnail_url` and will render it as a background image if present (line 44-46, 98-100). When no thumbnail is set, it falls back to a solid `#2F5D50` green background — which is what you're seeing now.

**The infrastructure is already built. You just need to create and upload the images, then update the DB rows.**

### How to add thumbnails

**Step 1: Create thumbnail images**
- Dimensions: 1280x720 (16:9 ratio, matching the `paddingTop: 56.25%` in KnowledgeGrid)
- Format: JPG or PNG (JPG preferred for file size)
- Content: Screenshot of the most recognizable screen in the video, with the video title overlaid in large text
- Style: Use the app's color palette — `#2F5D50` green accent, `#F5F4ED` background tones, white text

**Thumbnail design template:**
```
┌──────────────────────────────────────┐
│  [Screenshot of key app screen]      │
│                                      │
│                                      │
│  ┌────────────────────────────┐      │
│  │  VIDEO TITLE               │      │
│  │  Category                  │      │
│  └────────────────────────────┘      │
│                          ▶ 2:34     │
└──────────────────────────────────────┘
```

Quick method: pause each video at its most representative frame, screenshot, add a semi-transparent dark overlay on the bottom third, overlay the title in white bold text. Any basic image editor (Canva, Figma, even PowerPoint) works.

**Step 2: Host the images**
Upload to `files.spiritdao.org/videos/Instructional/thumbnails/` (same host as the videos), e.g.:
- `https://files.spiritdao.org/videos/Instructional/thumbnails/app-walkthrough.jpg`
- `https://files.spiritdao.org/videos/Instructional/thumbnails/claiming-tokens.jpg`

Or upload to Supabase Storage bucket (see `imageService.ts` patterns in the codebase for how other features handle uploads).

**Step 3: Update the database**
For each video, update `thumbnail_url` in the `knowledge_items` table:

```sql
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/app-walkthrough.jpg'
WHERE title = 'App Walkthrough' AND pod_id IS NULL;
```

Repeat for each video. No code changes needed — the grid component already renders thumbnails when the URL is present.

**Step 4 (optional): Update the seed migration**
To keep the seed file in sync, add `thumbnail_url` to each INSERT in `20260225000002_seed_knowledge_base.sql`. This only matters if you ever re-seed from scratch.

### Batch thumbnail naming convention
Use kebab-case matching the video title:
```
app-walkthrough.jpg
claiming-tokens.jpg
profile-setup.jpg
identity-editor.jpg
video-chat.jpg
creating-events.jpg
attendance-credentials.jpg
conference-rooms.jpg
intro-to-bounties.jpg
applying-to-bounty.jpg
submitting-work.jpg
creating-bounties.jpg
reviewing-approving-applications.jpg
reviewing-work-paying-out.jpg
applying-to-pod.jpg
creating-pod.jpg
pod-treasury.jpg
pod-chat-forum.jpg
role-creation-permissions.jpg
voting-proposals.jpg
marketplace.jpg
```

---

## 6. Suggested Production Order for New Videos

Record in this order to maximize coverage of unrecorded features:

1. **Creating Your Account** — new users need this first, and it's currently missing
2. **Making a Donation** — directly tied to revenue / member progression
3. **Navigating the Forum** — high-usage feature, no coverage
4. **Using the AI Assistant** — unique differentiator, no coverage
5. **Reading the Activity Feed (Pulse)** — helps users understand community activity
6. **Using the Members Directory** — social feature, no coverage
7. **Direct Messaging** — daily-use feature, no coverage
8. **Creating a Proposal** — governance expansion (only voting is covered)
9. **Pod-Level Governance** — governance expansion
10. **Registering for an Event** — attendee perspective (only creator perspective exists)

---

## 7. Recording Checklist

For each new video:

- [ ] Script the walkthrough (bullet points, not a word-for-word script)
- [ ] Use a clean test account or staging environment with realistic data
- [ ] Resolution: 1920x1080 screen capture
- [ ] Audio: clear voiceover, minimal background noise
- [ ] Length target: 1-4 minutes (never exceed 5)
- [ ] Show the full flow start-to-finish (don't skip steps)
- [ ] Export as MP4 (H.264, AAC audio)
- [ ] Create thumbnail image (1280x720)
- [ ] Upload video to `files.spiritdao.org/videos/Instructional/{category}/`
- [ ] Upload thumbnail to `files.spiritdao.org/videos/Instructional/thumbnails/`
- [ ] Add row to `knowledge_items` table in Supabase with both `content_url` and `thumbnail_url`
- [ ] Test playback in the app at `/knowledge`
