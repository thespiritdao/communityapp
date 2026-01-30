# PWA Testing Guide

## ✅ Installation Complete!

Your SpiritDAO app is now a fully functional Progressive Web App (PWA)! Users can install it to their home screen on both iOS and Android devices.

---

## What Was Implemented

### 1. PWA Icons ✓
- Generated 8 icon sizes (72px to 512px) from your Observable Infinities logo
- Added Apple Touch Icon (180x180) for iOS
- Created favicon.ico for browser tabs
- Location: `/public/icons/`

### 2. Web App Manifest ✓
- Fixed manifest.json with proper icon references
- Configured standalone display mode
- Set theme color (#2F5D50 - your primary green)
- Location: `/public/manifest.json`

### 3. Service Worker ✓
- Offline caching for critical pages (/, /dashboard, /forum)
- Network-first strategy with cache fallback
- Image caching for faster loads
- Push notification support (ready for backend integration)
- Background sync capability
- Location: `/public/sw.js`

### 4. PWA Manager ✓
- Automatically registers service worker
- Checks for updates hourly
- Prompts user to reload when new version available
- Location: `/src/components/PWAManager.tsx`

### 5. Install Prompt ✓
- Beautiful install banner appears after 5 seconds
- Shows app icon and benefits
- "Not now" dismisses for 7 days
- Special iOS instructions included
- Location: `/src/components/InstallPrompt.tsx`

### 6. Metadata & SEO ✓
- Added PWA metadata to root layout
- Apple-specific meta tags for iOS
- Viewport configuration
- Theme color for status bar

---

## How to Test PWA Installation

### Testing on Desktop (Chrome/Edge)

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Open in Chrome:**
   - Navigate to http://localhost:3000
   - Open DevTools (F12)
   - Go to "Application" tab → "Manifest"
   - Verify manifest loads correctly
   - Check all icons display

3. **Test Service Worker:**
   - In DevTools → "Application" → "Service Workers"
   - Should see service worker registered
   - Check "Offline" checkbox
   - Refresh page - should still load (cached)

4. **Test Installation:**
   - Look for install icon in address bar (⊕ or install icon)
   - Click it to install as desktop app
   - OR wait 5 seconds for install prompt banner

5. **Test Installed App:**
   - Open installed app from Start Menu/Applications
   - Should open in standalone window (no browser UI)
   - Try going offline - cached pages still work

### Testing on Android

1. **Deploy to production or use ngrok for HTTPS:**
   ```bash
   # Option 1: Deploy to Vercel/Netlify
   npm run build
   vercel --prod

   # Option 2: Use ngrok for local testing
   ngrok http 3000
   ```

2. **Open in Chrome Mobile:**
   - Navigate to your URL (must be HTTPS!)
   - Wait 5 seconds - install banner appears
   - Tap "Install App"

3. **Alternative Installation:**
   - Tap Chrome menu (⋮)
   - Select "Add to Home screen"
   - Tap "Add"

4. **Test Installed App:**
   - Find "SpiritDAO" icon on home screen
   - Tap to open - should open in fullscreen (no browser UI)
   - Try airplane mode - cached pages still work

### Testing on iOS (iPhone/iPad)

**IMPORTANT:** iOS requires HTTPS. Use production deployment or ngrok.

1. **Open in Safari:**
   - Navigate to your URL (must be HTTPS!)
   - iOS install prompt banner will appear
   - **Note:** On iOS, the native "Add to Home Screen" is used

2. **Manual Installation (If banner doesn't appear):**
   - Tap Share button (□↑)
   - Scroll down, tap "Add to Home Screen"
   - Tap "Add"

3. **Test Installed App:**
   - Find "SpiritDAO" icon on home screen
   - Tap to open - should open fullscreen
   - Status bar color should be green (#2F5D50)
   - Try airplane mode - cached pages still work

---

## Testing Checklist

### Visual Tests
- [ ] App icon displays correctly on home screen
- [ ] App opens in fullscreen (no browser UI)
- [ ] Status bar/theme color is correct (#2F5D50)
- [ ] Install prompt banner appears after 5 seconds
- [ ] Install prompt can be dismissed
- [ ] Icons in banner are correct

### Functional Tests
- [ ] Service worker registers successfully (check DevTools)
- [ ] Offline mode works (cached pages load)
- [ ] Navigation works offline
- [ ] Images load from cache
- [ ] Online → Offline → Online transitions smoothly
- [ ] App updates when new version deployed

### Platform-Specific
- [ ] **Desktop:** Install icon in address bar works
- [ ] **Android:** Native install prompt appears
- [ ] **iOS:** Safari "Add to Home Screen" works
- [ ] **iOS:** Special iOS instructions show in banner

---

## Debugging PWA Issues

### Service Worker Not Registering

**Check Console:**
```javascript
// Open DevTools Console, run:
navigator.serviceWorker.getRegistration().then(reg => console.log(reg));
```

**Common Fixes:**
- Must be served over HTTPS (or localhost)
- Check `public/sw.js` exists
- Clear browser cache and hard reload (Ctrl+Shift+R)

### Install Prompt Not Showing

**Reasons:**
1. App already installed
2. User dismissed within last 7 days (check localStorage)
3. Not on HTTPS
4. Manifest invalid

**Clear and Retry:**
```javascript
// Open Console, run:
localStorage.removeItem('pwa-install-dismissed');
// Then refresh page
```

### Icons Not Loading

**Check:**
1. Icons exist in `/public/icons/`
2. Manifest paths are correct (`/icons/icon-192.png` not `icons/icon-192.png`)
3. Run `npm run pwa:icons` to regenerate

### Offline Mode Not Working

**Check:**
1. Service worker registered (DevTools → Application → Service Workers)
2. Files cached (DevTools → Application → Cache Storage)
3. Network requests going through SW (DevTools → Network → Size column shows "(ServiceWorker)")

---

## Testing on Real Devices

### Get HTTPS URL for Mobile Testing

**Option 1: Deploy to Vercel (Recommended)**
```bash
npm install -g vercel
npm run build
vercel --prod
# Copy the https://... URL
```

**Option 2: Use ngrok (Local Testing)**
```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000
# Copy the https://... URL
```

**Option 3: Use Your Domain**
```bash
# Deploy to your production server
# PWA requires HTTPS!
```

### Mobile Testing Steps

1. **Get HTTPS URL** (from above)
2. **Open on mobile device**
3. **Wait 5 seconds** - install prompt appears
4. **Install app**
5. **Open from home screen**
6. **Test offline** (airplane mode)

---

## Performance Metrics

### PWA Score

Test your PWA score at: https://www.pwa-builder.com/

**Target Scores:**
- ✅ Manifest: 100%
- ✅ Service Worker: 100%
- ✅ HTTPS: 100%
- ✅ Installable: 100%

### Lighthouse Audit

Run in Chrome DevTools → Lighthouse tab:

**Target Scores:**
- Performance: 80+
- Accessibility: 90+
- Best Practices: 90+
- **PWA: 100** ✓
- SEO: 90+

---

## Next Steps

### Phase 2: Push Notifications (Optional)

To enable push notifications:

1. **Choose Provider:**
   - Firebase Cloud Messaging (Free)
   - OneSignal (Easier, Free tier)

2. **Install Dependencies:**
   ```bash
   npm install firebase
   # OR
   npm install react-onesignal
   ```

3. **Request Permission:**
   - Add notification permission request to your app
   - Store push subscription

4. **Send from Backend:**
   - Integrate with your API routes
   - Send push on bounty creation, forum replies, etc.

**See:** `MOBILE_APP_TRANSFORMATION_GUIDE.md` for full push notification setup

### Phase 3: Google Play Store (Optional)

To publish to Google Play:

1. **Use PWABuilder.com:**
   - Enter your production URL
   - Download Android package
   - Sign with keystore

2. **Submit to Google Play:**
   - Create Developer account ($25 one-time)
   - Upload APK
   - Wait 1-3 days for approval

**Cost:** $25 one-time
**Timeline:** 1 day packaging + 1-3 days review

---

## Troubleshooting

### "Add to Home Screen" doesn't appear

1. Make sure you're on HTTPS (or localhost)
2. Manifest must be valid JSON
3. Service worker must register successfully
4. Icons must be at least 192x192 and 512x512
5. Wait at least 30 seconds after page load

### App doesn't work offline

1. Check service worker is registered
2. Visit pages while online first (to cache them)
3. Check cache strategy in `/public/sw.js`
4. Clear cache and retry: DevTools → Application → Clear Storage

### Icons look wrong

1. Check manifest.json icon paths
2. Regenerate icons: `npm run pwa:icons`
3. Clear browser cache
4. Hard reload (Ctrl+Shift+R)

### iOS installation issues

1. **Must use Safari** (not Chrome/Firefox on iOS)
2. Must be HTTPS
3. No native install prompt - use Share → Add to Home Screen
4. Manifest display mode must be "standalone"

---

## Files Changed

### New Files
- `/public/sw.js` - Service worker
- `/public/icons/*.png` - PWA icons (8 sizes)
- `/public/apple-touch-icon.png` - iOS icon
- `/public/favicon.ico` - Browser favicon
- `/src/components/PWAManager.tsx` - SW registration
- `/src/components/InstallPrompt.tsx` - Install banner
- `/scripts/generate-pwa-icons.mjs` - Icon generator
- `PWA_TESTING_GUIDE.md` - This file
- `MOBILE_APP_TRANSFORMATION_GUIDE.md` - Full guide

### Modified Files
- `/public/manifest.json` - Fixed icon references
- `/src/app/layout.tsx` - Added PWA metadata
- `/src/app/providers.tsx` - Added InstallPrompt
- `/package.json` - Added pwa:icons script

---

## Resources

- [PWA Builder](https://www.pwabuilder.com/) - Test your PWA
- [Web.dev PWA Guide](https://web.dev/learn/pwa/)
- [Can I Use PWA](https://caniuse.com/serviceworkers)
- [MDN Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

## Support

**Desktop Testing:** Works in Chrome, Edge, Opera (not Firefox/Safari)
**Android:** Works in Chrome, Edge, Samsung Internet
**iOS:** Works in Safari only (iOS 16.4+)

**Need help?** Check the browser console for errors and see the Troubleshooting section above.
