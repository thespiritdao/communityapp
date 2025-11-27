# SpiritDAO Testnet Deployment Guide

**Complete step-by-step guide to deploy your contracts to Base Sepolia testnet and launch your beta**

---

## 📋 Prerequisites

Before you begin, ensure you have:

- [x] Node.js 18+ installed
- [x] A wallet with a private key (for deployment)
- [x] Base Sepolia testnet ETH (from faucet)
- [x] Supabase account (for testnet database)
- [x] Basic familiarity with command line

---

## 🚀 Quick Start (3 Steps to Beta)

```bash
# Step 1: Get testnet ETH and set up environment
# Step 2: Deploy contracts
npm run deploy:testnet

# Step 3: Test locally
npm run dev:testnet
```

**That's it!** Your contracts are deployed and app is running locally on testnet.

---

## 📝 Detailed Step-by-Step Guide

### Step 1: Get Testnet ETH

**You need testnet ETH to deploy contracts (it's FREE!)**

1. Visit Base Sepolia Faucet:
   - Coinbase Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Alternative: https://www.alchemy.com/faucets/base-sepolia

2. Enter your wallet address (the one you'll use for deployment)

3. Request testnet ETH (usually 0.5-1 ETH)

4. Wait 1-2 minutes for confirmation

5. Verify you received it:
   - Check on Basescan Sepolia: https://sepolia.basescan.org/
   - Search your address
   - Should show ~0.5-1 ETH balance

---

### Step 2: Set Up Testnet Environment

**2.1 Create Testnet Database (Supabase)**

**Why separate database?**
- Keeps test data separate from production
- Can reset/delete without affecting mainnet data
- Better organization

**Steps:**
1. Go to https://supabase.com
2. Click "New Project"
3. Name it: `spiritdao-testnet`
4. Choose a strong database password
5. Select closest region
6. Click "Create new project"
7. Wait ~2 minutes for setup

**2.2 Get Database Credentials**

Once project is created:

1. Click "Project Settings" (gear icon)
2. Click "API" in sidebar
3. Copy these values:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key

**2.3 Run Database Migrations**

```bash
# Option A: Use Supabase CLI (recommended)
npx supabase link --project-ref your-testnet-project-ref
npx supabase db push

# Option B: Manual SQL (if CLI doesn't work)
# Copy all migration files from supabase/migrations/
# Paste into Supabase SQL Editor
# Run each migration in order
```

**Important:** Also run the airdrop table migration:

```sql
-- In Supabase SQL Editor, run this:
CREATE TABLE IF NOT EXISTS testnet_airdrops (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  system_amount TEXT NOT NULL,
  self_amount TEXT NOT NULL,
  transaction_hash TEXT,
  airdropped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_testnet_airdrops_wallet ON testnet_airdrops(wallet_address);
CREATE INDEX idx_testnet_airdrops_created ON testnet_airdrops(created_at);

ALTER TABLE testnet_airdrops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to airdrops"
  ON testnet_airdrops FOR SELECT
  USING (true);

CREATE POLICY "Allow service role to insert airdrops"
  ON testnet_airdrops FOR INSERT
  WITH CHECK (true);
```

**2.4 Create .env.testnet File**

```bash
# Copy the example file
cp .env.testnet.example .env.testnet

# Edit .env.testnet with your values
# Use your favorite text editor (VS Code, Notepad++, etc.)
```

**Fill in these CRITICAL values:**

```bash
# Your deployer wallet private key
TESTNET_DEPLOYER_PRIVATE_KEY=0x...  # From MetaMask/Coinbase Wallet export
PRIVATE_KEY=0x...  # Same as above

# Testnet database from Step 2.2
NEXT_PUBLIC_SUPABASE_URL=https://your-testnet-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # service role secret key

# Faucet account (for airdrops)
# Can be same as deployer or create a new wallet
TESTNET_FAUCET_PRIVATE_KEY=0x...
TESTNET_FAUCET_ADDRESS=0x...
```

**Other values can stay as default for testing.**

---

### Step 3: Deploy Contracts to Testnet

**IMPORTANT: Compile contracts first**

```bash
# If using Hardhat
npx hardhat compile

# If using Foundry
forge build

# This creates the contract artifacts needed for deployment
```

**Now deploy:**

```bash
npm run deploy:testnet
```

**What happens:**
1. Script checks your ETH balance
2. Deploys contracts in correct order:
   - SYSTEM and SELF tokens
   - Governance (Governor + Timelock)
   - Purchase/Marketplace contracts
   - Event contracts
   - Pod management contracts
   - Bounty contracts
   - Hats modules
3. Saves all addresses to `.env.testnet`
4. Generates deployment report

**Expected output:**

```
╔═══════════════════════════════════════════════════════════════╗
║         SpiritDAO Testnet Deployment Script                   ║
║         Deploying to Base Sepolia                             ║
╚═══════════════════════════════════════════════════════════════╝

💰 Deployer balance: 0.95 ETH

🚀 Starting deployment sequence...

═══════════════════════════════════════════════════════════════
PHASE 1: Token Contracts
═══════════════════════════════════════════════════════════════

📦 Deploying SystemToken...
  ⏳ Transaction hash: 0x123...
  ⏳ Waiting for confirmation...
  ✅ SystemToken deployed to: 0xABC...
  ⛽ Gas used: 1234567

📦 Deploying SelfToken...
  ✅ SelfToken deployed to: 0xDEF...

... (all other contracts)

✅ Contract addresses saved to .env.testnet
📄 Full report saved to: deployment-report-testnet.txt
```

**Deployment takes ~5-10 minutes**

---

### Step 4: Fund the Faucet Account

**Your faucet needs tokens to airdrop to users:**

**Option A: Transfer from deployment wallet**

```bash
# The deployment wallet now has all the initial token supply
# Transfer some to your faucet wallet using MetaMask/Coinbase Wallet

# Or use this script:
node scripts/fund-faucet.mjs  # We can create this if needed
```

**Option B: Use the same wallet for both**

Just set `TESTNET_FAUCET_PRIVATE_KEY` to same as `TESTNET_DEPLOYER_PRIVATE_KEY`

**How much to fund:**
- SYSTEM: 50,000+ tokens (50 users × 1,000 each)
- SELF: 25,000+ tokens (50 users × 500 each)

---

### Step 5: Test Locally

```bash
npm run dev:testnet
```

**What to test:**

1. **Wallet Connection**
   - Connect Coinbase Smart Wallet
   - Should auto-switch to Base Sepolia
   - Should show testnet banner

2. **Auto-Airdrop**
   - First-time wallet connection should trigger airdrop
   - Check wallet balance (should show SYSTEM and SELF tokens)
   - Try with a fresh wallet to verify

3. **Pod Creation**
   - Should only need 1 person (relaxed permissions)
   - Lower token requirement

4. **Governance**
   - Create a proposal
   - Voting period should be 1 hour (not 1 week)

5. **Events**
   - Create an event
   - Lower deposit requirement

6. **Bounties**
   - Create a bounty
   - Single person approval

**If everything works locally, proceed to Vercel deployment!**

---

## 🔧 Troubleshooting

### "Module not found" Error

**Problem:** Deployment script can't find compiled contracts

**Solution:**
```bash
# Hardhat:
npx hardhat clean
npx hardhat compile

# Foundry:
forge clean
forge build

# Then retry deployment
npm run deploy:testnet
```

---

### "Insufficient Funds" Error

**Problem:** Not enough testnet ETH

**Solution:**
1. Check balance: https://sepolia.basescan.org/address/YOUR_ADDRESS
2. Get more from faucet (wait 24h if limit reached)
3. Try a different faucet

---

### "Transaction Reverted" Error

**Problem:** Contract deployment failed

**Solution:**
1. Check the error message in console
2. Common issues:
   - Constructor arguments incorrect
   - Contract already deployed to same address (unlikely)
   - Gas limit too low

3. Fix and retry:
```bash
npm run deploy:testnet
```

---

### Airdrop Not Working

**Problem:** Users not receiving tokens

**Checklist:**
- [ ] `NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true` in .env.testnet
- [ ] `TESTNET_FAUCET_PRIVATE_KEY` is set
- [ ] Faucet wallet has SYSTEM and SELF tokens
- [ ] `testnet_airdrops` table exists in database
- [ ] Check console logs for error messages

**Test airdrop manually:**
```typescript
import { airdropToUser } from '@/utils/testnetAirdrop';

const result = await airdropToUser('0xUSER_ADDRESS');
console.log(result);
```

---

### Wrong Network

**Problem:** App connects to mainnet instead of testnet

**Solution:**
1. Verify `.env.testnet` has:
   ```bash
   NEXT_PUBLIC_CHAIN_ID=84532
   NEXT_PUBLIC_IS_TESTNET=true
   ```

2. Make sure you're using testnet scripts:
   ```bash
   npm run dev:testnet  # NOT just "npm run dev"
   ```

3. Clear Next.js cache:
   ```bash
   npm run clean
   npm run dev:testnet
   ```

---

## 📊 Verification

### Verify Contracts on Basescan

**Why verify?**
- Users can read contract code
- Builds trust
- Easier debugging

**Steps:**

1. Go to https://sepolia.basescan.org/

2. Search for your contract address (from `.env.testnet`)

3. Click "Contract" tab

4. Click "Verify and Publish"

5. Fill in details:
   - Compiler: Solidity
   - Version: (check your contract)
   - License: MIT
   - Optimization: Yes (if you used it)

6. Paste contract code

7. Submit

**Or use Hardhat plugin:**

```bash
npx hardhat verify --network baseSepolia CONTRACT_ADDRESS "constructor" "args"
```

---

## 🎯 Next Steps

Once local testing is complete:

1. **Deploy to Vercel** - See `VERCEL_SETUP.md`
2. **Invite beta testers** - Share the Vercel URL
3. **Collect feedback** - Use Discord/Telegram
4. **Iterate and improve**
5. **Prepare for mainnet** - When ready, deploy to Base Mainnet

---

## 📝 Checklist: Ready for Beta?

Before inviting testers, verify:

- [ ] All contracts deployed successfully
- [ ] `.env.testnet` has all contract addresses
- [ ] Local testing shows testnet banner
- [ ] Auto-airdrop works for new wallets
- [ ] Pods can be created with 1 person
- [ ] Governance proposals have 1-hour voting period
- [ ] Events have lower deposit requirements
- [ ] Database migrations run successfully
- [ ] Faucet wallet has sufficient token balance

**If all checked, you're ready to deploy to Vercel!**

---

## 💡 Tips for Beta Testing

1. **Start Small**
   - Invite 5-10 trusted users first
   - Fix critical issues
   - Then expand to 25-50 users

2. **Provide Clear Instructions**
   - How to get testnet ETH (if needed)
   - How to connect wallet
   - What features to test

3. **Monitor Closely**
   - Check Supabase logs
   - Monitor Basescan for transactions
   - Watch for error messages

4. **Gather Feedback**
   - Create Discord/Telegram channel
   - Use Google Forms for structured feedback
   - Fix bugs promptly

5. **Iterate Quickly**
   - Testnet allows fast iteration
   - Can redeploy contracts if needed
   - No financial risk

---

## 🚨 Important Reminders

**Security:**
- ✅ `.env.testnet` is gitignored (already set up)
- ✅ Never share private keys
- ✅ Testnet only - no real money

**Network:**
- ✅ Always use Base Sepolia (Chain ID: 84532)
- ✅ Verify network before transactions
- ✅ Show testnet banner to users

**Tokens:**
- ✅ Testnet tokens have NO real value
- ✅ Unlimited free airdrops for testing
- ✅ When switching to mainnet, deploy new token contracts

---

**Need help?** Check the troubleshooting section or reach out to the team!

**Ready to deploy to Vercel?** See `VERCEL_SETUP.md` for hosting instructions.
