# Gasless On-Chain Voting - Testing Guide

## Status: ✅ Ready to Test

**Contract:** `0x218770E85b8938879677388D05D78BF76587ED7A`
**Network:** Base Mainnet (Chain ID: 8453)
**CDP:** Whitelisted ✅
**Database:** Migration Applied ✅
**Code:** Updated to V2 ✅

---

## What You'll Be Testing

The new V2 architecture:
1. User signs vote with EIP-712 (in wallet)
2. Vote saved to database (real-time tallies)
3. Vote submitted to blockchain (gasless via CDP)
4. Vote permanently recorded on-chain
5. **User pays $0.00 in gas**

---

## Testing Steps

### Step 1: Navigate to Governance Page

1. Open app: http://localhost:3000/governance (or your deployed URL)
2. Connect your wallet (make sure you have Advocate NFT)
3. Ensure you're on Base Mainnet (Chain ID: 8453)

**Expected:**
- Wallet connected successfully
- See list of proposals

---

### Step 2: Find a Pod-Level Proposal

Look for proposals with type `pod_level` or `pod_creation`:
- These use the new gasless voting system
- Should show "Vote For", "Vote Against", "Vote Abstain" buttons

**If no proposals exist:**
1. Create a test proposal for "Temporal Naturalism" pod
2. Make sure "Governance Participation" toggle is ON for your role

---

### Step 3: Open Browser Console

Press `F12` (or `Cmd+Option+I` on Mac) to open DevTools

**You'll see detailed logs:**
```
🔵 [COMPONENT LOADED] EnhancedVoteButton mounted with V2 signature system
🔐 [VOTE V2] Starting gasless on-chain vote...
```

---

### Step 4: Click "Vote For" Button

Click the "Vote For" button on a pod-level proposal

### What You'll See:

#### Console Logs (Step-by-Step):
```
🔐 [VOTE V2] Starting gasless on-chain vote...
  proposalType: "pod_level"
  proposalId: "abc-123..."
  vote: "for"
  podId: "pod-uuid..."

📝 [VOTE V2] Step 1: Getting nonce...
✅ [VOTE V2] Nonce: 0

🔏 [VOTE V2] Step 2: Signing vote with EIP-712...
```

#### Wallet Popup (EIP-712 Signature):
Your wallet will show:
```
Signature Request

SpiritDAO Governance

Message:
  proposalId: 0xabc123...
  podId: 0xdef456...
  support: 1 (For)
  nonce: 0
  deadline: 1234567890

[Sign] [Reject]
```

**IMPORTANT:** This is **NOT** a transaction, it's just a signature!
- No gas fee shown
- No ETH required
- Just cryptographic proof you're voting

---

### Step 5: Sign the Message

Click **"Sign"** in your wallet

#### Console Logs Continue:
```
✅ [VOTE V2] Signature generated:
  v: 27
  r: "0x1234abcd..."
  s: "0x5678efgh..."
  deadline: "1234567890"

💾 [VOTE V2] Step 3: Saving to database...
✅ [VOTE V2] Vote saved to database

⛓️ [VOTE V2] Step 4: Submitting to blockchain (gasless via CDP)...
```

#### Wallet Popup (Transaction Submission):
Your wallet may show:
```
Confirm Transaction

To: 0x218770...ED7A (PodGovernance V2)
Function: recordVote

Gas Fee: Sponsored by Paymaster ✅
OR
Gas Fee: $0.00

[Confirm] [Reject]
```

**KEY INDICATORS OF SUCCESS:**
- ✅ "Sponsored by Paymaster"
- ✅ Gas fee shows $0.00
- ✅ OR no gas fee section at all

**FAILURE INDICATORS:**
- ❌ Gas fee shows actual cost (e.g., "$0.02")
- ❌ "Insufficient funds" error
- ❌ Asks you to pay gas

---

### Step 6: Confirm Transaction

Click **"Confirm"** in wallet

#### Final Console Logs:
```
✅ [VOTE V2] Vote recorded on-chain!
  transactionHash: "0x789..."
  blockNumber: 12345678
  gasUsed: "75234"

📊 [VOTE V2] Step 5: Updating database with on-chain status...
```

#### Success Toast:
```
✅ Vote Recorded On-Chain ⛓️

Your for vote has been permanently recorded
on Base blockchain (gasless via CDP)
```

---

## Verification

### 1. Check Database (Supabase)

Go to: https://supabase.com/dashboard/project/yqgqodofeliuurrmxlks/editor

Query:
```sql
SELECT * FROM governance_votes
WHERE voter_address = '<your_wallet_address>'
ORDER BY timestamp DESC
LIMIT 1;
```

**Expected Columns:**
- `id`: Vote UUID
- `proposal_id`: Proposal UUID
- `voter_address`: Your wallet (lowercase)
- `vote`: "for"
- `signature`: EIP-712 signature (0x...)
- `pod_id`: Pod UUID
- `onchain_recorded_at`: Should be NULL initially, then timestamp after Step 6
- `timestamp`: When you voted

---

### 2. Check Basescan

Go to: https://basescan.org/address/0x218770E85b8938879677388D05D78BF76587ED7A

Click **"Events"** tab

**Look for:**
- Event: `PodVoteRecorded`
- proposalId: (your proposal UUID as bytes32)
- podId: (your pod UUID as bytes32)
- voter: (your wallet address)
- support: 1 (for For vote)
- timestamp: (block timestamp)

**To find your specific vote:**
1. Note your transaction hash from console logs
2. Search Basescan for that transaction
3. Click "Logs" tab
4. See `PodVoteRecorded` event

---

### 3. Check CDP Dashboard

Go to: https://portal.cdp.coinbase.com/

Navigate to **Paymaster** → **Transactions**

**Look for:**
- Contract: `0x218770E85b8938879677388D05D78BF76587ED7A`
- Function: `recordVote`
- Status: Success ✅
- Gas Sponsored: Yes ✅
- Cost: $0.001 - $0.005 (CDP pays this)

---

## Expected Results Summary

| Step | Expected Behavior | Failure Signs |
|------|-------------------|---------------|
| **Wallet Signature** | EIP-712 message, no gas | Shows gas fee |
| **Database Save** | Vote appears immediately | Error message |
| **On-Chain Submit** | "Sponsored by Paymaster" | User pays gas |
| **Transaction** | Confirms without cost | "Insufficient funds" |
| **Basescan** | `PodVoteRecorded` event visible | No event found |
| **CDP Dashboard** | Transaction shows as sponsored | Not listed |

---

## Troubleshooting

### Issue 1: Wallet Shows Gas Fee

**Symptoms:**
- Wallet asks you to pay gas
- Shows cost like "$0.02"

**Causes:**
1. Contract not whitelisted in CDP
2. Wrong network (not Base Mainnet)
3. CDP budget exceeded
4. Paymaster URL misconfigured

**Fix:**
1. Check CDP dashboard: Is contract whitelisted?
2. Check network: Should be Base (8453)
3. Check CDP budget: Is there remaining balance?
4. Check .env: `NEXT_PUBLIC_PAYMASTER` URL correct?

---

### Issue 2: "User Rejected Request"

**Symptoms:**
- Error in console: "User rejected the request"
- No transaction submitted

**This is normal!** Means:
- User clicked "Reject" in wallet
- Voting can be retried

**Fix:**
- Click vote button again
- This time click "Sign" / "Confirm"

---

### Issue 3: Signature Verification Failed

**Symptoms:**
- Console error: "PodGovernance: invalid nonce"
- OR "PodGovernance: signature expired"

**Causes:**
1. Nonce mismatch (voted twice without page refresh)
2. Signature deadline passed (took too long to confirm)

**Fix:**
1. Refresh the page
2. Try voting again
3. Sign/confirm faster (deadline is 1 hour)

---

### Issue 4: Vote Saved to DB But Not On-Chain

**Symptoms:**
- Toast shows: "Vote Saved (DB Only)"
- Console: "On-chain submission failed"

**This is OK!** Means:
- Vote counted in real-time tallies
- On-chain recording will be retried
- Governance still works

**Causes:**
- Network congestion
- CDP temporarily unavailable
- Contract call reverted

**Fix:**
- Vote is still valid (in DB)
- Can be recorded on-chain later via batch service
- Or user can vote again (idempotent)

---

### Issue 5: "Not an Advocate" Error

**Symptoms:**
- Contract revert: "PodGovernance: not an Advocate"

**Cause:**
- Voter doesn't hold Advocate NFT

**Fix:**
- Check Advocate NFT: `0x3Ad7e51578294366035ea41aAf0A15f6037a3789`
- Mint Advocate NFT if needed
- Verify ownership on Basescan

---

### Issue 6: "Already Voted" Error

**Symptoms:**
- Contract revert: "PodGovernance: already voted"

**Cause:**
- User already voted on this proposal
- On-chain record prevents double voting

**This is CORRECT behavior!**
- Cannot vote twice on same proposal
- Governance integrity enforced on-chain

---

## Test Checklist

Use this checklist to verify everything works:

### Pre-Flight Checks
- [ ] Wallet connected
- [ ] On Base Mainnet (Chain ID: 8453)
- [ ] Have Advocate NFT
- [ ] Have governance permission for test pod
- [ ] Browser console open (F12)

### Signing Test
- [ ] Click "Vote For" button
- [ ] Wallet shows EIP-712 signature request
- [ ] Message shows correct proposal/pod/vote data
- [ ] NO gas fee shown for signature
- [ ] Click "Sign"
- [ ] Console logs: "✅ Signature generated"

### Database Test
- [ ] Console logs: "💾 Saving to database"
- [ ] Console logs: "✅ Vote saved to database"
- [ ] Check Supabase: Vote record exists
- [ ] Vote has `signature` field populated
- [ ] Vote has `pod_id` field populated

### On-Chain Test
- [ ] Console logs: "⛓️ Submitting to blockchain (gasless via CDP)"
- [ ] Wallet shows transaction confirmation
- [ ] Gas fee is $0.00 OR "Sponsored by Paymaster"
- [ ] Click "Confirm"
- [ ] Console logs: "✅ Vote recorded on-chain!"
- [ ] Transaction hash logged
- [ ] Toast shows: "Vote Recorded On-Chain ⛓️"

### Verification Test
- [ ] Check Basescan: Transaction appears
- [ ] Basescan shows `PodVoteRecorded` event
- [ ] Event has correct proposalId, voter, support
- [ ] Check CDP Dashboard: Transaction listed
- [ ] CDP shows: "Gas Sponsored: Yes"
- [ ] Check Supabase: `onchain_recorded_at` updated

### Permission Test
- [ ] Toggle governance permission OFF in pod settings
- [ ] Refresh governance page
- [ ] Proposal should show: "You do not have governance participation permission"
- [ ] Vote buttons should NOT appear
- [ ] Toggle permission back ON
- [ ] Refresh page
- [ ] Vote buttons should reappear

---

## Success Criteria

✅ **All systems working** if you see:

1. **Wallet Signature:** EIP-712 message, no gas
2. **Transaction:** Gasless (CDP sponsored)
3. **Database:** Vote saved with signature and pod_id
4. **Basescan:** `PodVoteRecorded` event visible
5. **CDP Dashboard:** Transaction listed as sponsored
6. **User Experience:** Zero cost, seamless voting

---

## Next Steps After Testing

Once testing is successful:

### 1. Test Permission System
- Toggle permissions on/off
- Verify vote buttons appear/disappear correctly
- Test with multiple pods

### 2. Test Different Vote Types
- Vote "For"
- Vote "Against"
- Vote "Abstain"
- Verify all work the same way

### 3. Test Edge Cases
- Vote twice on same proposal (should fail on-chain)
- Vote with expired permission (should be blocked by app)
- Vote without Advocate NFT (should fail on-chain)

### 4. Monitor Gas Costs
- Check CDP dashboard for gas usage
- Typical vote costs: $0.001 - $0.005
- Monitor daily/weekly totals

### 5. Test IPFS Aggregation (When Proposal Closes)
- Wait for proposal deadline to pass
- Check if votes aggregate to IPFS
- Verify IPFS hash appears on Pinata
- Check `VotesAggregated` event on Basescan

---

## Support

If testing fails or you have questions:

1. **Check Console Logs:** Most issues show detailed error messages
2. **Check This Guide:** Most issues covered in Troubleshooting section
3. **Check CDP Dashboard:** See if gas is being sponsored
4. **Check Basescan:** See if transaction is reverting

---

**Status:** Ready for comprehensive testing! 🚀

Let me know what you see in the console logs and I can help debug any issues.
