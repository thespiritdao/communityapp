# SpiritDAO MVP Beta Launch Plan

**Date:** November 25, 2025
**Goal:** Launch closed beta testing environment for SpiritDAO
**Timeline:** 2-3 weeks to beta launch

---

## 📋 Executive Summary

You've built for a year on **Base Mainnet** with real transactions. Now it's time to launch a **closed MVP beta** for community testing. This plan outlines the transition strategy, deployment automation, and publishing process.

---

## 🎯 Recommended Approach: **Dual Environment Strategy**

### Strategy Overview

**Keep Mainnet** (Production-Ready) + **Deploy Testnet** (Beta Testing)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  BASE MAINNET (Current)                            │
│  - Keep existing contracts deployed                │
│  - Preserve database (backup first!)               │
│  - Use for production launch later                 │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                                                     │
│  BASE SEPOLIA (Testnet) - NEW FOR BETA             │
│  - Deploy all contracts fresh                      │
│  - Separate testnet database                       │
│  - Free transactions for testers                   │
│  - Auto-airdrop test tokens                        │
│  - Relaxed permissions for exploration             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Why This Approach?

| Factor | Testnet (Recommended) | Mainnet Only |
|--------|----------------------|--------------|
| **Cost for Testers** | ✅ Free (testnet ETH) | ❌ Requires real money |
| **Token Airdrops** | ✅ Unlimited test tokens | ❌ Costly ($SYSTEM/$SELF) |
| **Safety** | ✅ No financial risk | ❌ Real money at stake |
| **Reset Ability** | ✅ Can redeploy anytime | ❌ Mainnet is permanent |
| **Beta Testing** | ✅ Industry standard | ❌ Not recommended |
| **Production Readiness** | ⚠️ Need to redeploy later | ✅ Already deployed |

**Recommendation:** Use **Base Sepolia (testnet)** for closed beta, then migrate to mainnet for production launch.

---

## 📅 Phase-by-Phase Implementation

### ⏰ Phase 1: Testnet Deployment Setup (Week 1)

**Goal:** Automate contract deployment to Base Sepolia

#### 1.1 Create Deployment Automation

**Tasks:**
- ✅ Create automated deployment script (`scripts/deploy-testnet.mjs`)
- ✅ Deploy all contracts in correct dependency order
- ✅ Save contract addresses to `.env.testnet`
- ✅ Verify contracts on Basescan Sepolia
- ✅ Set up contract relationships/permissions

**Contracts to Deploy (In Order):**

1. **Tokens**
   - `$SYSTEM` token (ERC20)
   - `$SELF` token (ERC20 with expiration)

2. **Governance**
   - DAOTimelock
   - DAOGovernor
   - Governance contracts

3. **Events**
   - EventManager
   - Event NFT Factories (Registration + Completion)
   - EventEscrow

4. **Pods (Hats Protocol)**
   - Pod creation system
   - Treasury factories
   - Authorization contracts
   - Eligibility modules
   - Toggle modules

5. **Marketplace & Bounties**
   - PurchaseRouter
   - BountyManager
   - Treasury contracts

6. **Utilities**
   - SimplePodRegistry
   - Purchase/Burn contracts

**Deployment Script Features:**
```javascript
// Auto-deployment with verification
✅ Deploy contracts in dependency order
✅ Save addresses to .env file
✅ Verify on Basescan automatically
✅ Set up permissions and roles
✅ Fund initial contracts (if needed)
✅ Generate deployment report
```

#### 1.2 Database Strategy

**Option A: Separate Testnet Database (Recommended)**
```
Mainnet Database (Keep)          Testnet Database (New)
├─ Production data               ├─ Empty/fresh start
├─ Real user profiles            ├─ Test user profiles
├─ Real transactions             ├─ Test transactions
└─ Preserve for production       └─ For beta testing
```

**Steps:**
1. Create new Supabase project for testnet
2. Run database migrations
3. Update `.env.testnet` with testnet database URL
4. Keep mainnet database untouched

**Option B: Same Database with Network Flag**
```sql
-- Add network column to tables
ALTER TABLE pods ADD COLUMN network VARCHAR DEFAULT 'mainnet';
ALTER TABLE users ADD COLUMN network VARCHAR DEFAULT 'mainnet';
-- Filter by network in queries
```

**Recommendation:** Use **Separate Database** for cleaner separation and easier testing.

#### 1.3 Environment Configuration

**Create `.env.testnet` file:**
```bash
# Network
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_IS_TESTNET=true
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true

# Testnet Database (separate Supabase project)
NEXT_PUBLIC_SUPABASE_URL=https://your-testnet-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_testnet_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_testnet_service_key

# Testnet Contract Addresses (auto-populated by deployment script)
NEXT_PUBLIC_SYSTEM_TOKEN=0x...  # Deployed on Sepolia
NEXT_PUBLIC_SELF_TOKEN=0x...
NEXT_PUBLIC_DAO_GOVERNOR=0x...
# ... (all other contracts)

# Testnet-Only Features
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM=1000
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF=500
NEXT_PUBLIC_MIN_POD_LEADERS=1  # Relaxed for testing
NEXT_PUBLIC_GOVERNANCE_VOTING_PERIOD=3600  # 1 hour (vs 1 week)
NEXT_PUBLIC_PROPOSAL_THRESHOLD=100  # Lower threshold

# Faucet
TESTNET_FAUCET_PRIVATE_KEY=0x...  # Account with SYSTEM/SELF to airdrop
```

**Create environment switcher:**
```json
// package.json scripts
"scripts": {
  "dev": "next dev",  // Uses .env (mainnet)
  "dev:testnet": "cp .env.testnet .env.local && next dev",
  "build": "next build",
  "build:testnet": "cp .env.testnet .env.local && next build",
  "deploy:testnet": "node scripts/deploy-testnet.mjs"
}
```

---

### ⏰ Phase 2: Testnet-Specific Features (Week 1)

**Goal:** Add features that only work on testnet for easier beta testing

#### 2.1 Auto-Airdrop System

**Feature:** Automatically give new users test tokens on account creation

**Implementation:**
```typescript
// src/utils/testnetAirdrop.ts
// Only runs when NEXT_PUBLIC_IS_TESTNET=true

async function airdropToNewUser(walletAddress: string) {
  if (!process.env.NEXT_PUBLIC_IS_TESTNET) return;

  // Airdrop SYSTEM tokens
  await transferSystemTokens(
    walletAddress,
    process.env.NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM
  );

  // Airdrop SELF tokens
  await transferSelfTokens(
    walletAddress,
    process.env.NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF
  );

  console.log(`✅ Airdropped test tokens to ${walletAddress}`);
}
```

**Trigger Points:**
- On wallet connection (first time)
- On user registration
- Manual "Get Test Tokens" button in UI

#### 2.2 Relaxed Permissions (Testnet Only)

**Configuration Changes for Testing:**

```typescript
// src/config/testnetConfig.ts
export const getConfig = () => {
  const isTestnet = process.env.NEXT_PUBLIC_IS_TESTNET === 'true';

  return {
    // Pod Creation
    minPodLeaders: isTestnet ? 1 : 3,  // 1 person can create pod
    podCreationTokenRequirement: isTestnet ? 10 : 1000,

    // Governance
    proposalThreshold: isTestnet ? 100 : 10000,  // Lower to create proposals
    votingPeriod: isTestnet ? 3600 : 604800,  // 1 hour vs 1 week
    votingDelay: isTestnet ? 300 : 86400,  // 5 min vs 1 day

    // Bounties
    bountyApprovalRequired: isTestnet ? 1 : 2,  // 1 person approval

    // Treasury
    treasuryWithdrawalThreshold: isTestnet ? 1 : 3,  // 1 signature

    // Events
    eventCreationDeposit: isTestnet ? 1 : 100,  // Lower deposit
  };
};
```

#### 2.3 Testnet Faucet (Optional)

**UI Feature:** "Get Test Tokens" button

```tsx
// TestnetFaucetButton.tsx
{isTestnet && (
  <button onClick={requestTestnetTokens}>
    🚰 Get Test Tokens
  </button>
)}
```

---

### ⏰ Phase 3: Deployment Automation (Week 2)

**Goal:** One-click deployment of entire contract system

#### 3.1 Master Deployment Script

**Features:**
- Sequential deployment with dependency management
- Automatic address saving
- Contract verification
- Permission setup
- Initial funding
- Deployment report generation

**Usage:**
```bash
# Deploy entire system to testnet
npm run deploy:testnet

# Output:
# ✅ Deploying to Base Sepolia (Chain ID: 84532)
# ✅ Deploying SYSTEM token... 0x123...
# ✅ Deploying SELF token... 0x456...
# ✅ Deploying DAOGovernor... 0x789...
# ... (all contracts)
# ✅ Setting up permissions...
# ✅ Verifying contracts on Basescan...
# ✅ Deployment complete! Addresses saved to .env.testnet
```

#### 3.2 Contract Addresses Export

**Auto-generated after deployment:**
```javascript
// .env.testnet (auto-updated)
NEXT_PUBLIC_SYSTEM_TOKEN=0xABC...
NEXT_PUBLIC_SELF_TOKEN=0xDEF...
NEXT_PUBLIC_DAO_GOVERNOR=0xGHI...
// ... all addresses
```

#### 3.3 No Manual Remix Deployment Needed

**Answer to your question:** You do NOT need to manually deploy via Remix!

The deployment script will:
✅ Deploy all contracts automatically
✅ Set up all relationships
✅ Configure permissions
✅ Verify contracts
✅ Save addresses

You just run: `npm run deploy:testnet`

---

### ⏰ Phase 4: Publishing & Hosting (Week 2-3)

**Goal:** Make the app accessible to beta testers

#### 4.1 Hosting Options

**Recommended: Vercel (Free for Next.js)**

**Why Vercel:**
- ✅ **Free tier** (generous limits)
- ✅ **Made for Next.js** (zero config)
- ✅ **Auto-deploy from GitHub** (push to deploy)
- ✅ **Custom domains** (spiritdao.app)
- ✅ **Environment variables** (easy testnet/mainnet switching)
- ✅ **Preview deployments** (test before going live)
- ✅ **Automatic HTTPS**
- ✅ **Global CDN**

**Alternative Options:**
- **Netlify:** Similar to Vercel, also great for Next.js
- **Railway:** Good for full-stack apps
- **Render:** Free tier available
- **Cloudflare Pages:** Very fast CDN

#### 4.2 GitHub Setup

**Repository Structure:**
```
spiritdao/
├─ .github/
│  └─ workflows/
│     └─ deploy.yml  # Auto-deploy on push
├─ src/
├─ public/
├─ .env.example
├─ .env.testnet.example
├─ package.json
└─ README.md
```

**GitHub Actions (Auto-Deploy):**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [main, testnet]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: vercel/action@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

#### 4.3 Progressive Web App (PWA) Setup

**Make it installable without app stores!**

**Benefits:**
- ✅ Users can "install" from browser
- ✅ Adds to home screen (mobile/desktop)
- ✅ Works offline (optional)
- ✅ Native app experience
- ✅ No App Store/Play Store needed

**Implementation:**
```bash
npm install next-pwa
```

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

module.exports = withPWA({
  // ... existing config
});
```

**Add manifest.json:**
```json
{
  "name": "SpiritDAO",
  "short_name": "SpiritDAO",
  "description": "Decentralized community platform",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#2F5D50",
  "theme_color": "#2F5D50",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### 4.4 App Icon & Branding

**What You Need:**

1. **App Icon** (Multiple Sizes)
   - `icon-192.png` (192x192) - For PWA
   - `icon-512.png` (512x512) - For PWA
   - `favicon.ico` - For browser tab
   - `apple-touch-icon.png` (180x180) - For iOS

2. **Social Preview Images**
   - `og-image.png` (1200x630) - For link previews
   - `twitter-card.png` (1200x600) - For Twitter

**Place in:** `public/` directory

#### 4.5 Distribution Strategy

**For Closed Beta:**

**Option 1: Private URL + Access Control**
```typescript
// Middleware to check beta access
const BETA_TESTERS = ['0x123...', '0x456...'];

if (!BETA_TESTERS.includes(walletAddress)) {
  return redirect('/waitlist');
}
```

**Option 2: Password Protection (Simple)**
```typescript
// Beta password gate
const BETA_PASSWORD = process.env.BETA_PASSWORD;

if (enteredPassword !== BETA_PASSWORD) {
  return <BetaAccessDenied />;
}
```

**Option 3: Invitation System**
```sql
-- Database table
CREATE TABLE beta_invites (
  wallet_address TEXT PRIMARY KEY,
  invited_by TEXT,
  invited_at TIMESTAMP,
  status TEXT DEFAULT 'pending'
);
```

**Distribution:**
```
1. Deploy to Vercel → https://beta.spiritdao.app
2. Share link with beta testers
3. They access via browser (no download needed)
4. Optional: "Install App" button for PWA
```

---

### ⏰ Phase 5: Testing & Feedback (Week 3-8)

**Goal:** Collect feedback and iterate

#### 5.1 Beta Testing Checklist

**Invite Strategy:**
- Start with 5-10 trusted users
- Expand to 25-50 after initial fixes
- Monitor Supabase database for issues
- Use Discord/Telegram for feedback

**What to Test:**
- ✅ Pod creation & management
- ✅ Treasury operations
- ✅ Governance voting
- ✅ Events & attendance NFTs
- ✅ Bounties & marketplace
- ✅ Token transactions
- ✅ Mobile responsiveness

#### 5.2 Monitoring

**Tools:**
- Vercel Analytics (built-in)
- Sentry (error tracking)
- Supabase Logs (database queries)
- Discord webhook for critical errors

---

### ⏰ Phase 6: Production Launch

**When ready to go live:**

1. **Deploy Mainnet Contracts**
   - Use same deployment script
   - Change to `.env.production`
   - Use Base Mainnet RPC

2. **Migrate Database**
   - Create production Supabase project
   - Migrate vetted data (if needed)

3. **Remove Testnet Features**
   - Disable auto-airdrop
   - Restore normal permissions
   - Remove testnet-only UI elements

4. **Launch**
   - Deploy to `https://app.spiritdao.org`
   - Announce publicly
   - Monitor closely

---

## 🚀 Quick Start: Get Beta Live in 3 Days

### Day 1: Deploy Testnet Contracts
```bash
# 1. Set up testnet environment
cp .env.testnet.example .env.testnet
# Edit .env.testnet with testnet database and RPC

# 2. Run deployment script
npm run deploy:testnet
# ✅ All contracts deployed and verified

# 3. Test locally with testnet
npm run dev:testnet
# ✅ App running with testnet contracts
```

### Day 2: Set Up Hosting
```bash
# 1. Push to GitHub
git push origin main

# 2. Deploy to Vercel
vercel login
vercel
# ✅ Live at https://spiritdao.vercel.app

# 3. Add environment variables in Vercel dashboard
# Copy from .env.testnet

# 4. Redeploy
vercel --prod
# ✅ Live with testnet contracts
```

### Day 3: Invite Beta Testers
```bash
# 1. Share link: https://beta.spiritdao.app
# 2. Send testnet ETH faucet link
# 3. Auto-airdrop tokens on first connection
# 4. Collect feedback
```

---

## ❓ Answers to Your Specific Questions

### Q1: "Is it possible to write a script to automatically deploy all contracts?"

**Answer:** **YES!** I'll create a comprehensive deployment script that:
- ✅ Deploys all contracts in correct order
- ✅ Handles dependencies automatically
- ✅ Saves addresses to .env file
- ✅ Verifies on Basescan
- ✅ Sets up permissions
- ✅ One command: `npm run deploy:testnet`

### Q2: "Do I need to manually deploy each contract via Remix?"

**Answer:** **NO!** The automated script handles everything. Remix is not needed.

### Q3: "Safe to delete all database info?"

**Answer:** **NO! BACKUP FIRST!**
- Create **new testnet database** (separate Supabase project)
- Keep mainnet database **as backup**
- Use testnet database for beta testing
- Preserve mainnet data for production launch

### Q4: "Can I keep existing setup and redo contracts later?"

**Answer:** **YES!** That's the recommended approach:
- Keep mainnet contracts as-is
- Deploy new testnet contracts for beta
- After beta, either:
  - **Option A:** Use testnet contracts (if happy)
  - **Option B:** Redeploy to mainnet (fresh start)

### Q5: "Keep permissioning with one person consensus?"

**Answer:** **YES!** Use testnet config:
```typescript
minPodLeaders: 1,  // 1 person can approve
treasurySignatures: 1,  // 1 signature needed
proposalThreshold: 100,  // Low threshold
```

### Q6: "Airdrop tokens for test only?"

**Answer:** **YES!** Conditional airdrop:
```typescript
if (process.env.NEXT_PUBLIC_IS_TESTNET === 'true') {
  await airdropTestTokens(walletAddress);
}
```

### Q7: "Non-token solution to simulate transactions?"

**Answer:** **Two options:**

**Option A: Testnet (Recommended)**
- Use Base Sepolia testnet
- Free testnet ETH from faucet
- Real transactions, no cost
- Auto-airdrop test tokens

**Option B: Tenderly Fork Simulation**
- Simulate without actual transactions
- More complex setup
- Not recommended for multi-user testing

**Recommendation:** Stick with **Base Sepolia testnet** - it's free, easy, and perfect for beta testing.

---

## 📊 Cost Analysis

### Testnet (Base Sepolia) - **FREE**
- ✅ Free testnet ETH from faucet
- ✅ Unlimited test token airdrops
- ✅ Vercel hosting: **FREE** (generous limits)
- ✅ Supabase database: **FREE** tier (500MB)
- ✅ Domain (optional): **$12/year**

**Total Cost for Beta: $0-12**

### Mainnet Beta (Your Current Approach)
- ❌ Gas costs: ~$50-100 for deployments
- ❌ Token airdrops: $5-10 per user × 50 users = **$250-500**
- ❌ Testing mistakes cost real money
- ❌ Can't easily reset/redeploy

**Total Cost: $300-600+**

---

## ✅ Next Steps

### This Week:
1. Review this plan
2. Decide: Testnet vs Mainnet beta
3. I'll create deployment scripts
4. Set up testnet database (Supabase)

### Next Week:
1. Run automated deployment
2. Test locally with testnet
3. Deploy to Vercel
4. Invite first 5-10 testers

### Week 3-8:
1. Collect feedback
2. Fix bugs
3. Iterate
4. Expand beta testing

### Production Launch:
1. Deploy final contracts to mainnet
2. Migrate to production database
3. Remove test-only features
4. Launch publicly

---

## 🎯 Recommendation

**For your situation, I strongly recommend:**

1. **Deploy to Base Sepolia (testnet)** for closed beta
2. **Use automated deployment script** (I'll create)
3. **Separate testnet database** (new Supabase project)
4. **Host on Vercel** (free, easy, perfect for Next.js)
5. **Auto-airdrop test tokens** on user registration
6. **Relaxed permissions** for easy testing (1-person approvals)
7. **After successful beta:** Redeploy to mainnet for production

**Timeline:** Beta live in 3-7 days with this approach.

---

## 📝 Files I'll Create Next

1. `scripts/deploy-testnet.mjs` - Automated deployment
2. `.env.testnet.example` - Testnet environment template
3. `src/config/testnetConfig.ts` - Testnet-specific settings
4. `src/utils/testnetAirdrop.ts` - Auto-airdrop system
5. `DEPLOYMENT_GUIDE.md` - Step-by-step deployment instructions
6. `VERCEL_SETUP.md` - Hosting setup guide
7. `BETA_TESTING_GUIDE.md` - For beta testers

**Ready to proceed?** Let me know and I'll start creating these implementation files!
