# Apple App Store Readiness Plan

**Date:** 2026-08-05
**Status:** Capacitor route chosen; iOS project scaffolded 2026-08-05.
Done: `capacitor.config.ts` (remote-URL mode → app.spiritdao.org),
`ios/` Xcode project generated (push/splash/status-bar plugins wired),
Info.plist camera/mic/photo usage strings, `codemagic.yaml` cloud-macOS
build pipeline, `.well-known/apple-app-site-association` (TEAMID
placeholder), manifest `id` field.
**Blocking next step:** Apple Developer Program enrollment as the nonprofit
(D-U-N-S) — start now, longest lead time. Then: Codemagic signing setup,
APNs bridge for notifications, TestFlight.

## Where we stand

Android (Play Store) was prepped via the TWA route: PWA manifest +
`.well-known/assetlinks.json` (`org.spiritdao.app`). **Apple has no TWA
equivalent** — the App Store requires a native iOS shell, built in Xcode,
submitted through App Store Connect.

PWA base is in good shape: complete `manifest.json` (with `id`), full icon set
(72–512px incl. maskable), service worker, `apple-touch-icon`, `appleWebApp`
metadata, `viewport-fit: cover` + safe-area handling, and the 2026-08 mobile
keyboard fixes.

## Hard prerequisites (no way around these)

1. **Apple Developer Program** — $99/year. Enroll as the **nonprofit
   organization** (needs a D-U-N-S number), NOT as an individual. This matters
   for review: Apple's donation and crypto guidelines are friendlier to apps
   published by the verified organization itself.
2. **A Mac with Xcode** — required to build, sign, and upload. Alternatives if
   no Mac is available: a macOS CI service (Codemagic free tier, GitHub Actions
   macOS runners) can build and upload; a Mac is still strongly recommended for
   first-time provisioning and debugging. A cheap M1 Mac mini or a
   rent-a-Mac service (MacStadium, AWS EC2 Mac) also works.
3. **App Store Connect assets** — 1024px marketing icon, screenshots for
   6.7" and 6.5" iPhones (and iPad if iPad is supported), privacy policy URL,
   App Privacy "nutrition label" declarations (wallet address, email, chat
   messages, notifications — all must be declared).

## Packaging route options

| | A. Capacitor (recommended) | B. PWABuilder iOS | C. Safari PWA only (no store) |
|---|---|---|---|
| What it is | Native shell (WKWebView) + plugin bridge, loads the deployed app | Auto-generated Swift/WKWebView wrapper | Users "Add to Home Screen" from Safari |
| Effort | ~2–4 days initial | ~half a day | Zero (already works) |
| Push notifications | ✅ Native APNs via plugin (web push does NOT work inside iOS webview wrappers) | ⚠️ Experimental | ✅ Web push works (iOS 16.4+, installed PWAs only) |
| Review risk (4.2 minimum functionality) | Lower — native push, splash, deep links make it feel like an app | Higher — thin wrappers are the classic 4.2 rejection | N/A |
| Camera/QR (event check-in) | ✅ Native plugin | ⚠️ getUserMedia in wrapper is finicky | ✅ Works in Safari |
| Cost | $99/yr + Mac access | $99/yr + Mac access | $0 |
| Bonus | Can later replace the Android TWA too → one codebase, both stores, native push on both | — | — |

**Recommendation: Capacitor.** The app's push notifications (VAPID web push
today) will NOT work inside any iOS webview wrapper — Capacitor's APNs plugin
is the clean fix, and native push is also the single strongest signal to App
Review that this isn't just a website. Route C is a legitimate interim: iOS
users can install the PWA from Safari today and receive web push on iOS 16.4+.

## Apple-specific review risks to resolve BEFORE submission

1. **Stripe donations in-app (3.2.1(vi) / 3.1.1).** Apple permits approved
   nonprofits to collect donations, but the rules around non-IAP payment flows
   are picky. Mitigations: enroll as the verified nonprofit; if review pushes
   back, donations can open in the system browser (allowed) rather than
   in-webview. Flag: `src/app/api/donations/*`, Stripe checkout components.
2. **Marketplace (3.1.3(e), 3.1.5).** Physical-goods sales via Stripe are
   explicitly exempt from IAP. Confirm listings at review time are physical
   goods; digital goods/unlocks would trigger the IAP requirement.
3. **Crypto features (3.1.5(iii)).** Wallets and token transactions are
   allowed for apps published by the organization. Strengths to state in
   review notes: tokens are non-monetary governance/participation credits,
   all transactions are gasless (no purchase required), no ICO/speculation.
   NFT rules: viewing/minting owned NFTs is fine; *selling* NFTs for fiat
   in-app would require IAP — avoid.
4. **Account deletion (5.1.1(v)).** Apps with accounts MUST offer in-app
   account deletion. ✅ Already exists (`DeleteAccountSection`), verify it
   fully deletes.
5. **Sign-in (4.8).** If any third-party login is offered, Sign in with Apple
   may be required. CDP embedded wallet uses email auth — likely fine, but
   verify no Google/Facebook login buttons exist.

## Work plan (Capacitor route)

- [ ] Decide route + confirm Mac access and Apple Developer enrollment (org)
- [ ] `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/push-notifications`
- [ ] `capacitor.config.ts` with `server.url = https://app.spiritdao.org`
      (remote-URL mode — no Next.js static export needed; same live app)
- [ ] `npx cap add ios` → commit the `ios/` Xcode project
- [ ] APNs: enable Push capability, create APNs key in developer portal,
      bridge `unifiedNotificationService` to register APNs tokens alongside
      VAPID subscriptions (server sends via APNs for iOS devices)
- [ ] Deep links: associated domains (`applinks:app.spiritdao.org`) — the iOS
      analog of assetlinks.json
- [ ] Native splash + status bar plugins (cheap review-quality wins)
- [ ] LiveKit check: video conferencing in WKWebView requires
      `allowsInlineMediaPlayback` + camera/mic permission strings in Info.plist
      (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`)
- [ ] App Store Connect listing: screenshots, privacy labels, review notes
      (explain crypto = governance, donations = nonprofit, marketplace = physical)
- [ ] TestFlight build → internal test → submit

## Interim (available today, no store)

iOS users can already install from Safari: Share → Add to Home Screen. Web
push works on iOS 16.4+ for installed PWAs. Consider an iOS-aware install
prompt in `InstallPrompt.tsx` as a zero-cost stopgap while the store build is
in progress.
