# Deployment Not Updating - Troubleshooting Guide

**Issue**: Code pushed to GitHub, Vercel shows "successful deployment", but changes don't appear on the live site.

**Specifically**:
- "Clear Draft" button not appearing
- Poll toggle still showing old checkbox instead of new button
- "tr" and "gg" still pre-populating form

---

## Step 1: Verify Latest Code is on GitHub ✅

**Check commits:**
```bash
git log --oneline -5
```

**Expected output:**
```
fa1c5c00 debug: Add version markers to verify deployments
bd126382 fix: Mobile poll toggle + add Clear Draft button
80ee6025 fix: Replace checkbox with button for mobile poll toggle
```

✅ **CONFIRMED**: Latest code IS on GitHub

---

## Step 2: Verify Vercel is Building Latest Commit

### A. Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Select your project: `communityapp`  (or whatever it's called)
3. Click **"Deployments"** tab

### B. Check Latest Deployment
Look for the most recent deployment and verify:

**✅ Checklist:**
- [ ] Status = **"Ready"** (green checkmark)
- [ ] Commit hash = **`fa1c5c00`** or later
- [ ] Branch = **`main`**
- [ ] Timestamp = Recent (within last few minutes)

**❌ If commit hash is OLD:**
- Vercel might not be auto-deploying from GitHub
- Solution: Manual deployment (see Step 3)

---

## Step 3: Force Fresh Deployment (No Cache)

### Option A: Via Vercel Dashboard (RECOMMENDED)

1. Go to **Deployments** tab
2. Find the LATEST deployment (top of list)
3. Click **three dots (•••)** on the right
4. Select **"Redeploy"**
5. **CRITICAL**: **UNCHECK** "Use existing Build Cache"
6. Click **"Redeploy"**

**Wait 2-3 minutes** for build to complete.

### Option B: Via Vercel CLI

```bash
npm i -g vercel
vercel login
cd C:\Users\PC\Documents\DAO\App\commapp
vercel --prod --force --yes
```

The `--force` flag skips cache.

---

## Step 4: Verify Deployment Has New Code

### A. Visual Check (Easiest)

1. **Go to** `/forum/create-thread` on your deployed URL
2. **Look for** a small **green "v3" badge** next to "Create New Thread" title
3. **Scroll down** and look for **red "Clear Draft" button** (if form has content)
4. **Look at poll toggle** - should be a full-width button, not a small checkbox

**If you see:**
- ✅ **Green "v3" badge** = Latest code is deployed!
- ❌ **No badge** = Old code (caching issue - go to Step 5)

### B. Console Check (More Reliable)

1. **Open browser DevTools** (F12 or right-click → Inspect)
2. Go to **Console** tab
3. **Refresh the page**
4. **Look for**:
   ```
   🔍 [NewThreadForm] Version: NewThreadForm_v3_MOBILE_POLL_CLEAR_DRAFT
   ```

**If you see this log:**
- ✅ Latest code IS deployed
- Problem is browser cache (Step 5)

**If you DON'T see this log:**
- ❌ Old code still deployed
- Check Vercel build logs for errors (Step 6)

---

## Step 5: Clear ALL Caches

### A. Mobile Browser Cache (MOST IMPORTANT)

#### iOS Safari:
1. Settings app → Safari
2. **Clear History and Website Data**
3. Confirm

#### Android Chrome:
1. Chrome → Settings → Privacy
2. **Clear browsing data**
3. Select **"Cached images and files"** + **"Cookies and site data"**
4. **Time range**: "All time"
5. Clear data

### B. Hard Refresh in Browser

**Desktop:**
- Chrome/Edge: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Firefox: `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)
- Safari: `Cmd + Option + R` (Mac)

**Mobile:**
- Close browser app completely
- Reopen and navigate to site
- Or use "Request Desktop Site" mode (forces refresh)

### C. Test in Incognito/Private Mode

**Desktop:**
- Chrome/Edge: `Ctrl + Shift + N`
- Firefox: `Ctrl + Shift + P`
- Safari: `Cmd + Shift + N`

**Mobile:**
- Open browser menu → New Incognito/Private tab

**If it works in incognito but not normal mode** = Browser cache issue (clear cache again)

---

## Step 6: Check Vercel Build Logs

### A. Access Build Logs

1. Vercel Dashboard → Deployments
2. Click on latest deployment
3. Click **"Building"** or **"View Function Logs"**
4. Look for errors in red

### B. Common Build Issues

**Issue**: "Module not found"
```
Error: Cannot find module '@/components/VersionChecker'
```
**Solution**: Make sure you ran `git push` to upload all files

**Issue**: "Build exceeded maximum duration"
```
Error: Command "npm run build" timed out after 600s
```
**Solution**: next.config.mjs has `minimize: false` - this slows builds. Re-enable minification:

```javascript
// next.config.mjs line 24
// Change:
config.optimization.minimize = false;
// To:
config.optimization.minimize = true;
```

**Issue**: TypeScript errors
```
Error: Type 'X' is not assignable to type 'Y'
```
**Solution**: Run locally to see full error:
```bash
npm run build
```

---

## Step 7: Verify Vercel Environment

### A. Check Deployment URL

**Are you checking the right URL?**

Vercel has multiple URLs:
- **Production**: `your-app.vercel.app` or custom domain
- **Preview**: `your-app-git-main-youruser.vercel.app`
- **Deployment-specific**: `your-app-abc123.vercel.app`

**✅ Make sure you're testing** the **Production URL** (or the specific deployment URL you want to test)

### B. Check if Auto-Deploy is Enabled

1. Vercel Dashboard → Settings → Git
2. Verify **"Production Branch"** = `main`
3. Verify **"Deploy on Push"** = Enabled

**If disabled:**
- Vercel won't auto-deploy when you push to GitHub
- You must manually deploy each time

---

## Step 8: Nuclear Option - Delete .next and Rebuild

**If nothing else works**, there might be corrupted cache in Vercel's infrastructure.

### A. Add a Rebuild Trigger

Create an empty file to force Vercel to rebuild:

```bash
cd C:\Users\PC\Documents\DAO\App\commapp
echo "" > .rebuild-$(date +%s)
git add .
git commit -m "chore: force rebuild"
git push origin main
```

### B. Or Redeploy from Scratch

1. Vercel Dashboard → Settings
2. **Delete** the project
3. Re-import from GitHub
4. Fresh deployment with no cached state

---

## Step 9: Compare Local vs Production

### A. Run Build Locally

```bash
cd C:\Users\PC\Documents\DAO\App\commapp
npm run build
npm run start
```

Visit `http://localhost:3000/forum/create-thread`

**Check:**
- [ ] Do you see "v3" badge locally?
- [ ] Do you see Clear Draft button?
- [ ] Do you see new poll toggle button?

**If YES locally but NO on Vercel:**
- Vercel build is using different code or has cached files

**If NO locally:**
- Code isn't committed properly
- Run `git status` to check uncommitted changes

---

## Step 10: Check for Service Worker Caching

**If your app has a PWA service worker**, it might be caching old JavaScript bundles.

### A. Check for Service Worker

1. DevTools → Application tab
2. Look for "Service Workers" in sidebar
3. If one is registered:
   - Click **"Unregister"**
   - Hard refresh page
   - Re-test

### B. Check for Update on Reload Setting

In DevTools → Application → Service Workers:
- Enable **"Update on reload"** checkbox
- This forces service worker to update every time

---

## Quick Checklist

Run through this checklist in order:

1. [ ] Confirmed latest commit `fa1c5c00` is on GitHub
2. [ ] Vercel shows successful deployment of `fa1c5c00`
3. [ ] Redeployed with **"Use existing Build Cache" UNCHECKED**
4. [ ] Waited 3+ minutes for deployment to complete
5. [ ] Verified deployment status = "Ready" (green)
6. [ ] Cleared mobile browser cache completely
7. [ ] Closed browser app and reopened
8. [ ] Checked in Incognito/Private mode
9. [ ] Checked console for version log
10. [ ] Checked for "v3" badge on page

---

## Expected Result After Fixes

When everything is working, you should see:

**On `/forum/create-thread` page:**
1. ✅ Small green "v3" badge next to title
2. ✅ Red "Clear Draft" button appears when form has content
3. ✅ Poll toggle is a full-width button (not tiny checkbox)
4. ✅ Poll toggle has custom green checkbox visual
5. ✅ Tapping poll toggle on mobile works immediately

**In browser console:**
```
🔍 [NewThreadForm] Version: NewThreadForm_v3_MOBILE_POLL_CLEAR_DRAFT Loaded at: 2025-12-05T...
[Poll Toggle] Button clicked, current state: false  (when you tap it)
```

---

## Still Not Working?

### Share These Details:

1. **Vercel deployment URL you're testing:**
   - Example: `https://your-app.vercel.app`

2. **Screenshot of Vercel deployment page showing:**
   - Commit hash
   - Deployment status
   - Timestamp

3. **Screenshot of `/forum/create-thread` page showing:**
   - Whether "v3" badge appears
   - Whether Clear Draft button appears
   - What the poll toggle looks like

4. **Browser console output:**
   - Copy entire console log after refreshing page
   - Look for `[NewThreadForm]` lines

5. **Device/Browser info:**
   - Device: iPhone 12, Samsung S21, etc.
   - Browser: Safari, Chrome, Firefox
   - OS Version: iOS 17, Android 13, etc.

6. **Have you:**
   - [ ] Cleared cache completely?
   - [ ] Tested in Incognito mode?
   - [ ] Tested on desktop browser?
   - [ ] Checked Vercel build logs for errors?

---

## Most Likely Causes

Based on the symptoms, here are the most likely issues:

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| No "v3" badge on page | Old code deployed | Redeploy without cache |
| No "v3" badge in Incognito | Vercel serving old build | Check build logs, force rebuild |
| "v3" badge in Incognito, not in normal | Browser cache | Clear cache, hard refresh |
| "v3" badge on desktop, not mobile | Mobile browser cache | Clear mobile cache completely |
| Vercel shows old commit hash | Auto-deploy disabled | Enable in Vercel settings or manual deploy |

---

## Contact Info

If you've tried everything above and it's still not working, share:
1. Vercel deployment URL
2. Screenshots from checklist above
3. Console logs
4. Browser/device info

This will help diagnose the exact issue!
