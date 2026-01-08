# PodApplicationVoting Contract Deployment Guide

**Date:** January 5, 2026
**Type:** Smart Contract Deployment (Gasless Voting System)
**Network:** Base Mainnet
**Status:** Ready for Deployment

---

## 📋 Overview

This guide walks through deploying the `PodApplicationVoting` contract to enable gasless on-chain voting for pod membership applications.

### What This Solves

**Problem:** Self-send transactions for voting require Smart Account to have ETH balance, even with paymaster enabled.

**Solution:** Contract call pattern that is properly sponsored by Coinbase paymaster (whitelisted contract calls are gasless).

### Benefits

✅ **Truly Gasless** - No ETH required in Smart Account
✅ **HAT-Verified** - Only pod leaders with correct HAT can vote
✅ **On-Chain Record** - Permanent blockchain record of votes
✅ **Database Sync** - Transaction hashes stored in `pod_application_votes` table
✅ **Double-Vote Prevention** - Contract prevents voting twice on same application

---

## 🔧 Prerequisites

### 1. Required Tools

- **Foundry** (for deployment)
- **Base RPC URL** (Alchemy/Infura/Public)
- **Deployer Wallet** with ETH on Base mainnet (~$5 for gas)

### 2. Required Environment Variables

Add to `.env` file:

```bash
# PodApplicationVoting Contract (will be set after deployment)
NEXT_PUBLIC_POD_APPLICATION_VOTING=

# Already configured (verify these exist)
NEXT_PUBLIC_HATS_PROTOCOL=0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
NEXT_PUBLIC_EXECUTIVE_POD_LEADER=0x0000008800010000000000000000000000000000000000000000000000000000

# Deployment wallet (add private key for deployment only)
DEPLOYER_PRIVATE_KEY=<your_private_key>
```

---

## 📦 Step 1: Compile the Contract

### Using Foundry

```bash
cd C:\Users\PC\Documents\DAO\App\commapp

# Install Foundry if not already installed
# https://book.getfoundry.sh/getting-started/installation

# Compile the contract
forge build --contracts src/contracts/PodApplicationVoting.sol
```

**Expected Output:**
```
[⠊] Compiling...
[⠒] Compiling 1 files with 0.8.20
[⠢] Solc 0.8.20 finished in 1.23s
Compiler run successful!
```

### Verify ABI Matches

The compiled ABI should match `src/abis/PodApplicationVotingABI.json`. If there are differences, update the ABI file.

---

## 🚀 Step 2: Deploy the Contract

### Option A: Deploy with Foundry (Recommended)

```bash
# Deploy to Base Mainnet
forge create \
  --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  src/contracts/PodApplicationVoting.sol:PodApplicationVoting \
  --constructor-args 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
```

**Constructor Arguments:**
- `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137` = Hats Protocol address on Base

**Expected Output:**
```
Deployer: 0xYourAddress
Deployed to: 0x... (← SAVE THIS ADDRESS!)
Transaction hash: 0x...
```

### Option B: Deploy with Remix (Alternative)

1. Go to https://remix.ethereum.org
2. Create new file: `PodApplicationVoting.sol`
3. Copy contract code from `src/contracts/PodApplicationVoting.sol`
4. Compile with Solidity 0.8.20
5. Deploy to "Injected Provider - MetaMask" (connect to Base mainnet)
6. Constructor parameter: `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137`
7. Confirm transaction in MetaMask
8. Copy deployed contract address

---

## 🔐 Step 3: Verify Contract on BaseScan

If not using `--verify` flag with Foundry:

1. Go to https://basescan.org/verifyContract
2. Enter contract address
3. Select compiler version: `0.8.20`
4. Select optimization: `Yes` (200 runs)
5. Paste contract code
6. Constructor ABI: `0x0000000000000000000000003bc1a0ad72417f2d411118085256fc53cbdd137`
7. Submit for verification

---

## ⚙️ Step 4: Configure Environment Variables

Add the deployed contract address to `.env`:

```bash
# Add this line with your deployed address
NEXT_PUBLIC_POD_APPLICATION_VOTING=0x... # ← Your deployed address
```

Restart your Next.js development server for env changes to take effect:

```bash
npm run dev
```

---

## 🎯 Step 5: Whitelist Contract with Coinbase Paymaster

**CRITICAL:** The contract must be whitelisted by Coinbase paymaster for gasless transactions to work.

### Submit Whitelisting Request

**Method 1: Coinbase Developer Portal**

1. Go to https://portal.cdp.coinbase.com
2. Navigate to your project settings
3. Find "Paymaster Contracts" section
4. Add contract address: `0x...` (your deployed address)
5. Network: Base Mainnet
6. Contract type: Voting/Governance
7. Submit for review

**Method 2: Email Coinbase Support**

Send email to: developer-support@coinbase.com

```
Subject: Paymaster Whitelisting Request - PodApplicationVoting Contract

Hi Coinbase Team,

We would like to request whitelisting for our Pod Application Voting contract
on Base mainnet to enable gasless transactions via CDP paymaster.

Contract Details:
- Address: 0x... (your deployed address)
- Network: Base Mainnet (Chain ID: 8453)
- Purpose: Pod membership application voting (governance)
- Verified: https://basescan.org/address/0x...

Our contract is similar to the DAOGovernor pattern and calls Hats Protocol
for permission verification. It's already used in production with the following
whitelisted contracts:
- DAOGovernor: 0x838eCf5cF90C31713Ed281Dc4F09DbBADA5e6813
- TimeBasedToggleModule: 0xDABE0119fBC7eA5821283dB666C8701049351D95

Thank you!
```

**Approval Timeline:** Usually 1-3 business days

---

## ✅ Step 6: Test the Integration

### 1. Check Contract is Accessible

```bash
# Verify contract is deployed
cast call 0x... "hatsProtocol()" --rpc-url https://mainnet.base.org
```

**Expected:** Returns Hats Protocol address (`0x3bc1A0Ad72417f2d411118085256fC53CBdDd137`)

### 2. Test Voting Flow (Frontend)

1. Navigate to `/pods/e35c9e25-d29f-4988-b1e8-2902e960b94c/manage`
2. Click **Apps** toggle
3. Find a pending application
4. Click **Approve** or **Reject** button
5. Monitor console logs:

**Expected Logs:**
```
🚀 Building Smart Account User Operation for vote recording...
💼 Smart Account: 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48
🎯 Transaction: PodApplicationVoting.castVote()
📝 Vote Type: approve
🏠 Contract: 0x... (your deployed address)
🎩 Required HAT: 0x0000008800010000000000000000000000000000000000000000000000000000
⛽ Paymaster: ENABLED (gasless transaction)
📋 Application ID (bytes32): 0x...
📝 Encoded call data: 0x...
✅ User operation sent successfully!
✅ Approval vote recorded
📊 approve vote recorded successfully
```

### 3. Verify On-Chain

Go to BaseScan and check for `VoteCast` event:

```
Event: VoteCast(
  applicationId: 0x...,
  voter: 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48,
  podLeaderHatId: 0x0000008800010000...,
  approved: true,
  timestamp: 1736123456
)
```

### 4. Verify Database

Check `pod_application_votes` table:

```sql
SELECT
  id,
  application_id,
  voter_address,
  vote_type,
  transaction_hash,
  block_number,
  voted_at
FROM pod_application_votes
ORDER BY voted_at DESC
LIMIT 5;
```

**Expected:**
- `transaction_hash` matches BaseScan transaction
- `vote_type` is 'approve' or 'reject'
- `voter_address` is your wallet address
- `block_number` is populated

---

## 🔍 Troubleshooting

### Error: "Contract Not Configured"

**Cause:** `NEXT_PUBLIC_POD_APPLICATION_VOTING` not set

**Fix:**
1. Add address to `.env`
2. Restart dev server: `npm run dev`
3. Hard refresh browser: `Ctrl+Shift+R`

---

### Error: "HAT Not Configured"

**Cause:** `NEXT_PUBLIC_EXECUTIVE_POD_LEADER` missing

**Fix:**
```bash
# Add to .env
NEXT_PUBLIC_EXECUTIVE_POD_LEADER=0x0000008800010000000000000000000000000000000000000000000000000000
```

---

### Error: "NotAuthorized"

**Cause:** Voter doesn't wear Executive Pod Leader HAT

**Fix:**
1. Verify you wear the correct HAT:
   ```bash
   cast call 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137 \
     "isWearerOfHat(address,uint256)" \
     0xYourAddress \
     0x0000008800010000000000000000000000000000000000000000000000000000 \
     --rpc-url https://mainnet.base.org
   ```
2. If returns `false`, mint the HAT via `/pods/[id]/manage` → Controls

---

### Error: "AlreadyVoted"

**Cause:** You already voted on this application

**Expected Behavior:** Contract prevents double voting

**Solution:** Each voter can only vote once per application. This is correct!

---

### Error: "Insufficient balance" (Paymaster Error)

**Cause:** Contract not whitelisted by Coinbase paymaster yet

**Temporary Workaround:**
1. Visit `/faucet` to get initial ETH
2. Vote will succeed (but not gasless)

**Permanent Fix:**
- Wait for Coinbase to whitelist the contract
- Check whitelisting status with Coinbase support

---

## 📊 Contract Functions Reference

### Write Functions

#### `castVote(bytes32 applicationId, uint256 podLeaderHatId, bool approved)`

Records a vote on a membership application.

**Parameters:**
- `applicationId` - UUID converted to bytes32
- `podLeaderHatId` - HAT ID required to vote (Executive Pod Leader)
- `approved` - `true` for approve, `false` for reject

**Requirements:**
- Caller must wear `podLeaderHatId`
- Caller must not have already voted
- `applicationId` must not be zero

**Emits:** `VoteCast` event

---

### Read Functions

#### `hasVoted(bytes32 applicationId, address voter) → bool`

Check if an address has voted on an application.

#### `getVoteCounts(bytes32 applicationId) → (uint256 approvals, uint256 rejections)`

Get vote counts for an application.

#### `canVote(bytes32 applicationId, address voter, uint256 podLeaderHatId) → bool`

Check if a voter can vote (wears HAT and hasn't voted yet).

---

## 🔒 Security Considerations

### Permission Model

- ✅ **HAT-Based:** Only addresses wearing `podLeaderHatId` can vote
- ✅ **On-Chain Verification:** Hats Protocol contract called for every vote
- ✅ **Immutable:** Contract cannot be paused or upgraded
- ✅ **Double-Vote Prevention:** Mapping prevents voting twice

### Gas Sponsorship

- ✅ **Whitelisted Contracts Only:** Paymaster only sponsors approved contracts
- ✅ **No Self-Sends:** Contract call pattern (not self-send)
- ✅ **Transparent Costs:** All transactions visible on BaseScan

### Database Integrity

- ✅ **Transaction Hash:** Every vote has on-chain proof
- ✅ **Block Number:** Timestamp verification via block
- ✅ **Voter Address:** Cryptographically verified via signature

---

## 📝 Next Steps After Deployment

1. ✅ Deploy contract to Base mainnet
2. ✅ Verify on BaseScan
3. ✅ Configure environment variables
4. ⏳ **Submit paymaster whitelist request** (CRITICAL)
5. ⏳ Test with real applications
6. ⏳ Monitor for any issues
7. ⏳ Update documentation with final contract address

---

## 📞 Support

**Contract Issues:** Check BaseScan transaction logs
**Paymaster Issues:** Contact developer-support@coinbase.com
**Database Issues:** Check Supabase logs

---

**Deployed Contract Address (after deployment):**
`0x...` ← Update this once deployed

**BaseScan Link:**
`https://basescan.org/address/0x...`

**Verification Status:**
⏳ Pending / ✅ Verified

**Paymaster Whitelist Status:**
⏳ Pending / ✅ Approved

---

**Generated with** 🤖 [Claude Code](https://claude.com/claude-code)
