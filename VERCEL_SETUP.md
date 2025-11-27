# Spirit DAO Vercel Setup Guide

**Complete guide to publish your testnet app for beta testers using Vercel (FREE hosting)**

---

## 🎯 Why Vercel?

- ✅ **FREE** for personal/open-source projects
- ✅ **Made for Next.js** - zero configuration needed
- ✅ **Auto-deploy** from GitHub - push code = instant deployment
- ✅ **Custom domains** - use your own domain (spiritdao.app)
- ✅ **Environment variables** - easy testnet/mainnet switching
- ✅ **Preview deployments** - test before going live
- ✅ **Automatic HTTPS** - secure by default
- ✅ **Global CDN** - fast worldwide
- ✅ **Analytics** - track usage

---

## 🚀 Quick Start (10 Minutes to Live)

```
1. Push code to GitHub           → 2 minutes
2. Connect Vercel to GitHub      → 3 minutes
3. Add environment variables     → 3 minutes
4. Deploy                        → 2 minutes
═══════════════════════════════════════════
TOTAL: 10 minutes to beta launch!
```

---

## 📋 Prerequisites

Before starting:

- [x] Contracts deployed to Base Sepolia (see `DEPLOYMENT_GUIDE.md`)
- [x] `.env.testnet` file filled with contract addresses
- [x] Local testing successful (`npm run dev:testnet`)
- [x] GitHub account (free at https://github.com)
- [x] Vercel account (free at https://vercel.com)

---

## Step 1: Push to GitHub

### 1.1 Verify .gitignore (Already Done!)

Your `.gitignore` is already configured to NEVER upload:
- `.env` files (any variation)
- Private keys
- Secrets

**Double-check it's working:**

```bash
# See what would be committed
git status

# Should NOT show:
# - .env
# - .env.testnet
# - .env.local
# - Any files with "private" or "secret" in name

# If you see any .env files, STOP and fix .gitignore first!
```

---

### 1.2 Commit Your Changes

```bash
# Add all files (except .env - gitignore blocks it)
git add .

# Commit with message
git commit -m "Testnet deployment ready - contracts deployed to Base Sepolia"

# Push to GitHub
git push origin main
```

**Verify on GitHub:**
1. Go to https://github.com/thespiritdao/communityapp
2. Check recent commits
3. **CRITICAL:** Verify no `.env` files are visible
4. Click on a file to make sure it uploaded

---

### 1.3 Repository Privacy (Optional)

**For closed beta, you might want a private repo:**

**To make repo private:**
1. Go to repo settings (gear icon)
2. Scroll to "Danger Zone"
3. Click "Change visibility"
4. Select "Make private"
5. Confirm

**Note:** Private repos work fine with Vercel!

---

## Step 2: Set Up Vercel Account

### 2.1 Create Vercel Account

1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub" (recommended)
4. Authorize Vercel to access GitHub
5. Complete registration (FREE plan is perfect)

---

### 2.2 Import Your Project

**Once logged into Vercel:**

1. Click "Add New" → "Project"

2. Find "Import Git Repository"
   - You should see `thespiritdao/communityapp`
   - If not, click "Adjust GitHub App Permissions"

3. Click "Import" next to your repo

4. **Configure Project:**
   ```
   Framework Preset: Next.js (auto-detected)
   Root Directory: ./  (leave as is)
   Build Command: npm run build (auto-filled)
   Output Directory: .next (auto-filled)
   Install Command: npm install (auto-filled)
   ```

5. **STOP!** Don't click "Deploy" yet!
   - We need to add environment variables first

---

## Step 3: Add Environment Variables

### 3.1 Prepare Your Variables

**Open your `.env.testnet` file**

You'll copy most values from here to Vercel.

**Which variables to add:**

✅ **Add these (PUBLIC - safe to share):**
- `NEXT_PUBLIC_*` variables
- These are sent to the browser, so they're public anyway

❌ **DO NOT add (PRIVATE - keep secret):**
- `TESTNET_DEPLOYER_PRIVATE_KEY`
- `PRIVATE_KEY`
- `TESTNET_FAUCET_PRIVATE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (only if needed server-side)

---

### 3.2 Add Variables to Vercel

**In Vercel project setup:**

1. Scroll to "Environment Variables" section

2. Add each variable:
   - Name: `NEXT_PUBLIC_CHAIN_ID`
   - Value: `84532`
   - Environment: Select all (Production, Preview, Development)
   - Click "Add"

3. Repeat for ALL `NEXT_PUBLIC_*` variables:

**CRITICAL VARIABLES (must add):**

```bash
# Network
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_IS_TESTNET=true
NEXT_PUBLIC_APP_NAME=SpiritDAO

# Database (Testnet)
NEXT_PUBLIC_SUPABASE_URL=https://your-testnet-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Coinbase
NEXT_PUBLIC_CDP_API_CLIENT=your_cdp_client_id
NEXT_PUBLIC_PAYMASTER=https://api.developer.coinbase.com/rpc/v1/base-sepolia/...

# Testnet Features
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM=1000
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF=500
NEXT_PUBLIC_MIN_POD_LEADERS=1
NEXT_PUBLIC_GOVERNANCE_VOTING_PERIOD=3600
NEXT_PUBLIC_PROPOSAL_THRESHOLD=100

# Hats Protocol
NEXT_PUBLIC_HATS_CONTRACT=0x3bc1a0ad72417f2d411118085256fc53cbddd137
NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS=0xfE661c01891172046feE16D3a57c3Cf456729efA

# All your deployed contract addresses
NEXT_PUBLIC_SYSTEM_TOKEN=0x...
NEXT_PUBLIC_SELF_TOKEN=0x...
NEXT_PUBLIC_DAO_GOVERNOR=0x...
# ... (copy from .env.testnet)
```

**SERVER-SIDE VARIABLES (if needed for airdrop):**

If you want server-side airdrop (API route):

```bash
TESTNET_FAUCET_PRIVATE_KEY=0x...
TESTNET_FAUCET_ADDRESS=0x...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Tip:** Use "Paste" mode:
- Click "Paste Multiple"
- Copy/paste all variables at once
- Format: `KEY=VALUE` (one per line)

---

### 3.3 Verify Variables

**Before deploying, double-check:**

- [ ] All `NEXT_PUBLIC_*` variables added
- [ ] Testnet chain ID (84532)
- [ ] Testnet RPC URL
- [ ] All contract addresses from `.env.testnet`
- [ ] Database URL and keys
- [ ] Testnet features enabled

---

## Step 4: Deploy!

### 4.1 Initial Deployment

**Now click "Deploy"!**

Vercel will:
1. Install dependencies (2-3 minutes)
2. Build your app (3-5 minutes)
3. Deploy to production
4. Generate a URL

**Expected output:**

```
Installing dependencies...
✓ Completed in 2m 15s

Building...
✓ Compiled successfully (4m 32s)

Deploying...
✓ Deployment ready!

https://spiritdao-communityapp.vercel.app
```

**Total time: 5-10 minutes**

---

### 4.2 Visit Your Site

**Once deployed:**

1. Click the generated URL
2. Should see your app!
3. **VERIFY:**
   - Shows testnet banner (🧪 TESTNET MODE)
   - Wallet connect works
   - Switches to Base Sepolia (Chain ID: 84532)
   - Auto-airdrop triggers on first connection

---

## Step 5: Custom Domain (Optional)

### 5.1 Add Your Domain

**If you have spiritdao.app or beta.spiritdao.app:**

1. In Vercel project, click "Settings"
2. Click "Domains"
3. Click "Add"
4. Enter your domain: `beta.spiritdao.app`
5. Click "Add"

---

### 5.2 Configure DNS

**Vercel will show DNS settings:**

**For subdomain (beta.spiritdao.app):**
- Type: `CNAME`
- Name: `beta`
- Value: `cname.vercel-dns.com`
- TTL: Auto

**Go to your domain registrar (Namecheap, GoDaddy, etc.):**
1. Find DNS settings
2. Add CNAME record
3. Save

**Wait 10-60 minutes for DNS propagation**

---

### 5.3 Enable HTTPS

**Vercel automatically:**
- Issues SSL certificate
- Enables HTTPS
- Redirects HTTP to HTTPS

**No configuration needed!**

---

## Step 6: Automatic Deployments

### 6.1 How It Works

**Every time you push to GitHub:**

```bash
git add .
git commit -m "Fixed bug"
git push origin main
```

**Vercel automatically:**
1. Detects the push
2. Builds your app
3. Deploys new version
4. Your site updates in ~5 minutes!

**No manual re-deployment needed!**

---

### 6.2 Preview Deployments

**For testing before going live:**

1. Create a new branch:
   ```bash
   git checkout -b feature-new-ui
   ```

2. Make changes and push:
   ```bash
   git push origin feature-new-ui
   ```

3. **Vercel creates preview deployment:**
   - URL: `spiritdao-communityapp-git-feature-new-ui.vercel.app`
   - Test it before merging
   - Share with team for review

4. When ready, merge to main:
   ```bash
   git checkout main
   git merge feature-new-ui
   git push origin main
   ```

5. **Production auto-updates!**

---

## Step 7: Share With Beta Testers

### 7.1 Your Beta URL

**Primary URL (Vercel-generated):**
```
https://spiritdao-communityapp.vercel.app
```

**Or custom domain:**
```
https://beta.spiritdao.app
```

---

### 7.2 Beta Tester Instructions

**Share this with your testers:**

```
🎉 Welcome to SpiritDAO Beta!

📱 Access the app:
https://beta.spiritdao.app

🔧 Setup (2 minutes):
1. Install Coinbase Wallet browser extension
   https://www.coinbase.com/wallet/downloads

2. Create/import wallet

3. Connect to app (will auto-switch to Base Sepolia testnet)

4. Get welcome bonus!
   - Automatically receive 1,000 SYSTEM + 500 SELF tokens
   - Happens on first connection (one-time only)

5. Start testing!
   - Create pods
   - Vote on proposals
   - Join events
   - Complete bounties

⚠️ This is TESTNET:
- All tokens are test tokens (no real value)
- Transactions are FREE
- You can't lose money
- Feel free to experiment!

🐛 Found a bug? Report it in Discord: [your-discord-link]

💬 Feedback? Fill out: [your-form-link]
```

---

### 7.3 Beta Access Control (Optional)

**Option A: Public (Anyone with link can access)**
- Just share the URL
- Anyone can test
- Good for open beta

**Option B: Private (Invite-only)**

Add this to your app:

```typescript
// src/middleware.ts or in your pages

const BETA_TESTERS = [
  '0x123...',  // Wallet addresses
  '0x456...',
  // Add more
];

export function middleware(request: NextRequest) {
  // Check if user's wallet is in beta list
  // Redirect to waitlist if not
}
```

**Option C: Password protection**

Use Vercel's built-in password protection:
1. Project Settings → "Deployment Protection"
2. Enable "Password Protection"
3. Share password with beta testers

---

## Step 8: Monitor & Iterate

### 8.1 Vercel Analytics

**Enable analytics (FREE):**

1. Project Settings → "Analytics"
2. Enable Web Analytics
3. View metrics:
   - Page views
   - Unique visitors
   - Popular pages
   - Device/browser breakdown

---

### 8.2 Error Tracking

**See errors in Vercel:**

1. Go to project "Deployments"
2. Click latest deployment
3. View "Functions" → "Logs"
4. See runtime errors

**Or integrate Sentry:**

```bash
npm install @sentry/nextjs
npx @sentry/wizard --integration nextjs
```

---

### 8.3 Database Monitoring

**Monitor Supabase:**

1. Go to your testnet Supabase project
2. Click "Database" → "Logs"
3. See all queries
4. Monitor for errors

---

### 8.4 Iterate Quickly

**To update your app:**

```bash
# Make changes locally
# Test: npm run dev:testnet

# Commit and push
git add .
git commit -m "Fixed proposal voting bug"
git push origin main

# Vercel auto-deploys in ~5 min
# Testers see update automatically
```

---

## 🔧 Troubleshooting

### "Application Error" on Vercel

**Problem:** Site shows error page

**Solutions:**

1. Check build logs:
   - Vercel Dashboard → Deployments → Click deployment
   - View "Build Logs"
   - Look for errors

2. Common issues:
   - Missing environment variables
   - Build command failed
   - Import errors

3. Fix and redeploy:
   ```bash
   git push origin main
   ```

---

### Environment Variables Not Working

**Problem:** App uses wrong values

**Solutions:**

1. Verify variables in Vercel:
   - Project Settings → Environment Variables
   - Check spelling (case-sensitive!)
   - Ensure "Production" is selected

2. **Redeploy after adding variables:**
   - Settings → Deployments
   - Click "..." on latest
   - "Redeploy"

---

### Build Timeout

**Problem:** Build takes > 15 minutes and fails

**Solutions:**

1. Check package.json dependencies
   - Remove unused packages
   - Use `npm prune`

2. Optimize build:
   ```json
   {
     "scripts": {
       "build": "next build --no-lint"
     }
   }
   ```

3. Upgrade Vercel plan (if needed)

---

### Wrong Network on Production

**Problem:** Site connects to mainnet instead of testnet

**Solutions:**

1. Verify environment variables:
   ```bash
   NEXT_PUBLIC_CHAIN_ID=84532  ← Must be 84532
   NEXT_PUBLIC_IS_TESTNET=true  ← Must be true
   ```

2. Clear Next.js cache and rebuild:
   - Vercel Dashboard → Deployments
   - "..." → "Redeploy" → Check "Use existing Build Cache: No"

3. Check config in browser:
   - Open DevTools → Console
   - Type: `console.log(process.env.NEXT_PUBLIC_CHAIN_ID)`
   - Should show "84532"

---

## 🎯 Beta Testing Checklist

Before inviting testers:

- [ ] App deployed successfully to Vercel
- [ ] Custom domain configured (if using)
- [ ] Testnet banner visible on site
- [ ] Wallet connection works
- [ ] Auto-airdrop triggers for new wallets
- [ ] All contract interactions work
- [ ] Database saves data correctly
- [ ] Error tracking enabled
- [ ] Analytics enabled
- [ ] Beta tester instructions prepared
- [ ] Feedback channel ready (Discord/Forms)

---

## 💡 Pro Tips

**1. Use Vercel Preview URLs for Testing**
- Create feature branches
- Get preview deployments
- Test before merging to main

**2. Enable Deployment Protection**
- Vercel Settings → "Deployment Protection"
- Require preview URL authentication
- Prevents accidental public access

**3. Set Up Webhooks**
- Get notified on Discord/Slack when deployed
- Project Settings → "Git" → "Deploy Hooks"

**4. Use Environment-Specific Builds**
- Different env vars for preview vs production
- Vercel supports this natively

**5. Monitor Performance**
- Vercel Analytics shows page load times
- Optimize slow pages
- Better beta tester experience

---

## 🚀 Next Steps

Your app is now live for beta testing!

**Week 1-2: Closed Beta**
- Invite 5-10 trusted testers
- Fix critical bugs
- Gather feedback

**Week 3-4: Expanded Beta**
- Invite 25-50 testers
- Test at scale
- Optimize based on usage

**Week 5+: Production Prep**
- Plan mainnet deployment
- Audit contracts (if needed)
- Prepare marketing

**When ready for mainnet:**
- Deploy contracts to Base Mainnet
- Update environment variables
- Switch domain to production

---

## 📊 Cost Summary

**Vercel (Hobby Plan):**
- ✅ **FREE**
- 100GB bandwidth/month
- Unlimited deployments
- Perfect for beta testing

**If you need more:**
- Pro Plan: $20/month (commercial use, more bandwidth)

**Domain:**
- $10-15/year (optional, can use Vercel URL)

**Total Cost for Beta: $0-15/year**

---

## ✅ Success!

**Your app is now live for beta testing!**

Share this URL with your community:
```
https://beta.spiritdao.app
```

**Monitor, iterate, and prepare for mainnet launch!**

---

**Questions?** Check Vercel docs: https://vercel.com/docs

**Need help?** Reach out to the team or check the troubleshooting section.

**Ready to scale?** When your beta is successful, we'll help you deploy to mainnet!
