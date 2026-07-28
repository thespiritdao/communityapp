# Google Play Store Listing — Prep Document (2026-07)

Everything below is paste-ready for Play Console once the org account exists.
Artifacts: `C:\Users\PC\Documents\DAO\App\spiritdao-twa\app-release-bundle.aab` (upload this),
`app-release-signed.apk` (sideload testing). Package: `org.spiritdao.app`.

## App details

- **App name** (30 char max): `SpiritDAO Community`
- **Category**: Social
- **Tags**: community, governance, events
- **Contact email**: tech@spiritdao.org
- **Website**: https://spiritdao.org
- **Privacy policy URL**: https://app.spiritdao.org/privacy  (live, verified 200)

## Short description (80 char max)

> Community platform for events, forums, video, governance, and member pods.

(79 chars. Alternative: `Self-governing community: events, forums, video calls, pods, and voting.` — 73)

## Full description (4000 char max)

> SpiritDAO Community is the home for a member-governed community — a single
> place for everything a healthy community needs to organize, decide, and act
> together.
>
> **Connect**
> • Forums organized by pod and topic, with structured deliberation
> • Group chat and direct messages
> • Native video meetings for pods and events — no third-party links
> • A community activity pulse so you always know what's happening
>
> **Participate**
> • Discover and register for community events
> • Join pods — self-organizing working groups with their own membership,
>   forums, and budgets
> • Take on bounties: real community work with transparent, escrowed rewards
> • Earn recognition for participation over time
>
> **Govern**
> • Propose and vote on community decisions with transparent results
> • Pod-level decisions stay with the people doing the work; community-wide
>   decisions involve everyone
> • One person, one vote — governance is about people, not money
>
> **Trust the rails**
> • Transparent treasuries and payments recorded on open infrastructure
> • Role-based permissions that members can inspect
> • Built and operated by SpiritDAO, a 501(c)(3) nonprofit
>
> SpiritDAO Community is free to use. Membership is open to anyone curious
> about building durable, self-governing community.

(Notes: deliberately leads with community features, not crypto. Wallet/token
mechanics are described as "transparent treasuries / open infrastructure" —
accurate without triggering a crypto-exchange first impression. Adjust tone
freely; hard limit 4000 chars, currently ~1400.)

## Graphics checklist

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, <1MB | ✅ have — `public/icons/icon-512.png` |
| Feature graphic | 1024×500 PNG/JPG | ❌ needs design |
| Phone screenshots | min 2, ideally 4–8; 16:9–2:1 portrait; min 320px | ❌ need phone-aspect captures |
| 7" / 10" tablet screenshots | optional | skip for v1 |

Existing `public/images/appimages/*.png` are desktop admin captures
(treasury settings, mod permissions) — wrong aspect and wrong audience for a
store listing. Capture fresh phone screenshots instead: open app.spiritdao.org
in Chrome DevTools device emulation (Pixel 7, 1080×2400) or screenshot the
sideloaded TWA on a real phone. Suggested shots: home/pulse feed, an event
page, a forum thread, a video meeting, a pod page, the vote screen.

## Data safety form (answers to review, then paste)

Collected data — declare YES for:
- **Personal info → Email address**: collected, required, account management. Shared: no.
- **Personal info → Name**: collected (profile), optional. Shared: no.
- **Photos**: collected (profile photo / uploads), optional. Shared: no.
- **Messages**: collected (forum posts, chat), required for function. Shared: no.
- **Financial info → Other financial info**: wallet addresses / transaction
  history (on-chain activity, donations). Shared: no (on-chain data is public
  by nature — mention in free-text if asked).
- **App activity → App interactions**: activity feed / participation tracking.
- **Audio/Video**: voice and video processed during meetings (LiveKit),
  NOT recorded/stored (verify before declaring — if recordings exist, declare stored).

Security section:
- Data encrypted in transit: YES (HTTPS/WSS everywhere).
- Deletion mechanism: verify — if there's no self-serve account deletion flow,
  the answer is "request via tech@spiritdao.org" and Play ALSO requires a
  **data deletion URL** for apps with account creation. TODO: confirm what
  exists; a simple /account-deletion page may need to be added.
- No data sold. No third-party ad SDKs. Analytics: declare if any (check
  whether PostHog/GA/etc. is in the app).

## Content rating questionnaire

- Category: Social/Communication app
- Contains user-generated content: YES (forums, chat, profiles) → moderation
  exists (mod permissions, forum moderation) — answer accordingly
- No gambling, no violence/sexual content, no unrestricted web browsing
- Expected outcome: **Teen** (UGC apps rarely get Everyone)

## Financial features declaration

The embedded CDP wallet + tokens likely triggers Play's financial-features /
crypto declarations:
- Declare: app provides access to a **cryptocurrency wallet** (embedded,
  non-custodial via Coinbase CDP).
- NOT an exchange, NOT lending, NOT trading. Tokens are membership/participation
  credentials; $SYSTEM donations flow through Stripe (fiat), not in-app crypto purchase.
- Answer honestly; misdeclaration is a top rejection cause. If the form asks
  for licenses: none required for non-custodial wallet functionality (US).

## Distribution decisions

- **Countries**: start US-only. Avoids EU DSA "trader" requirements (public
  display of org address + verified contact on the listing). Expand later.
- **Ads**: declare NO ads.
- **Price**: Free.
- **In-app purchases**: NONE declared — donations happen on the website rails
  (Stripe). Do not wire Play Billing for v1; revisit if Google flags the
  in-app donate page (501(c)(3) donations via approved processors are
  generally exempt from Play Billing, same framing as the iOS plan).

## Submission order (once org account verified)

1. Create app → accept **Play App Signing** → upload `app-release-bundle.aab`
   to **internal testing** (org accounts skip the 12-tester requirement for
   production, but do one internal-track install sanity check anyway)
2. After Play App Signing enrollment: Play Console → App integrity — if
   Google's signing cert SHA-256 differs from
   `3F:6D:...:C0:6B`, ADD it to `public/.well-known/assetlinks.json` and
   redeploy (else the store-installed app shows browser chrome)
3. Store listing + data safety + content rating + financial declaration
4. Promote to production → submit for review (expect a few days)
