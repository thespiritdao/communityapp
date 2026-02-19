# CDP Paymaster Fix for Governance Voting

## Problem

Governance voting fails with error:
```
APIError: failed to prepare calls: failed to estimate gas for user operation:
useroperation reverted: execution reverted
```

## Root Cause

The `PodGovernanceV3` contract is NOT whitelisted in the CDP Paymaster.

When users try to vote:
1. Frontend calls `sendUserOperation()` with `useCdpPaymaster: true`
2. CDP attempts to estimate gas for the transaction
3. CDP checks if contract is whitelisted in paymaster
4. **Contract is NOT in whitelist → Gas estimation fails**
5. Error returned to user

All contract checks pass correctly:
- ✅ User has Advocate NFT (balance: 1)
- ✅ User hasn't voted yet (hasVoted: false)
- ✅ Vote value is valid (1 = FOR)
- ✅ Contract is deployed and has bytecode
- ✅ Contract Advocate token is configured correctly

**The issue is purely CDP paymaster configuration!**

## Solution

Add PodGovernanceV3 to the CDP Paymaster whitelist.

### Step 1: Go to CDP Dashboard

URL: https://portal.cdp.coinbase.com/

### Step 2: Navigate to Paymaster Settings

- Click on your project (commapp)
- Go to "Paymaster" section in left sidebar
- Click "Contract Allowlist"

### Step 3: Add PodGovernanceV3 Contract

**Contract Address:**
```
0x218770E85b8938879677388D05D78BF76587ED7A
```

**Contract Name:** `PodGovernanceV3`

**Network:** Base Mainnet (8453)

### Step 4: Whitelist recordVote Function

**Function Signature:**
```
recordVote(bytes32,bytes32,uint8)
```

**Why this is needed:** Users vote on pod-level proposals by calling this function gaslessly.

### Step 5: Optional - Whitelist Other Functions

If you plan to use these features later, also whitelist:

```
aggregateVotes(bytes32,string,uint256)
finalizeProposal(bytes32,string,uint256,uint256,uint256)
```

## Verification After Whitelisting

### Wait for Propagation

⏳ **Wait 5-10 minutes** for the whitelist changes to propagate through CDP's infrastructure.

### Test Voting

1. Go to https://your-app-url.com/governance
2. Find a pod-level proposal
3. Click "For", "Against", or "Abstain"
4. Vote should succeed without errors!

Expected console logs:
```
🔐 [VOTE V3] Starting gasless on-chain vote (CDP)...
💾 [VOTE V3] Step 1: Saving to database...
✅ [VOTE V3] Vote saved to database
⛓️ [VOTE V3] Submitting to blockchain (background, non-blocking)...
✅ [VOTE V3] Vote recorded on-chain!
```

### Check On-Chain

Verify vote was recorded on Base:
```bash
# Check if user voted on proposal
cast call 0x218770E85b8938879677388D05D78BF76587ED7A \
  "hasVoted(bytes32,address)(bool)" \
  <PROPOSAL_ID_BYTES32> \
  <USER_WALLET_ADDRESS> \
  --rpc-url https://mainnet.base.org
```

Should return `true` after voting.

## Troubleshooting

### Still getting "execution reverted"

**Possible causes:**
1. Whitelist hasn't propagated yet (wait 10 minutes)
2. Function signature doesn't match exactly
3. Contract address was entered incorrectly

**Debug steps:**
1. Double-check contract address in CDP dashboard
2. Verify function signature matches exactly (no spaces)
3. Try re-adding the whitelist entry
4. Contact CDP support if issue persists

### Error: "Contract not found"

**Cause:** CDP can't find contract at that address on Base.

**Fix:**
1. Verify contract is deployed: https://basescan.org/address/0x218770E85b8938879677388D05D78BF76587ED7A
2. Ensure you selected "Base Mainnet" (not Base Sepolia)

### Voting works but no on-chain record

**Cause:** Database save succeeded but on-chain failed silently.

**Fix:**
1. Check browser console for errors
2. Verify whitelist is active
3. Check user's smart account has been initialized

## Important Notes

⚠️ **Do NOT remove the database save** - it provides real-time vote tallies while on-chain finalizes

⚠️ **Gas sponsorship is optional** - votes work without paymaster but users pay gas

⚠️ **Smart account required** - EOA wallets cannot use gasless transactions

## After Fixing

Once the whitelist is updated:

1. ✅ Revert the "database-only" commits
2. ✅ Restore the full on-chain voting flow
3. ✅ Deploy the fixed code
4. ✅ Test voting end-to-end
5. ✅ Verify votes appear on-chain at BaseScan

## Contract Details

**Contract:** `PodGovernanceV3.sol`
**Address:** `0x218770E85b8938879677388D05D78BF76587ED7A`
**Network:** Base Mainnet (Chain ID: 8453)
**Explorer:** https://basescan.org/address/0x218770E85b8938879677388D05D78BF76587ED7A
**Deployed:** 2024-2026 (check BaseScan for exact date)

**Function to whitelist:**
- `recordVote(bytes32 proposalId, bytes32 podId, uint8 support)`

**Requirements to call:**
- Caller must own Advocate NFT
- Caller must not have voted on this proposal yet
- Support value must be 0 (AGAINST), 1 (FOR), or 2 (ABSTAIN)

---

**Priority:** 🔴 CRITICAL - Users cannot vote until this is fixed

**Impact:** Governance is completely blocked for all pod-level proposals

**Estimated Time:** 15 minutes (5 min to whitelist + 10 min propagation)
