# Next Steps After Deployment

**Status:** Contracts deployed and whitelisted ✅
**Code:** Frontend updated ✅
**Ready for:** .env update → Testing

---

## ✅ COMPLETED (Just Now)

### 1. Contracts Deployed
- ✅ TreasuryProxy deployed
- ✅ PodTreasuryFactory deployed
- ✅ Proxy connected to factory (updateTreasuryFactory called)

### 2. Coinbase Paymaster Whitelisted
- ✅ TreasuryProxy address whitelisted
- ✅ All 11 functions whitelisted

### 3. Frontend Code Updated
- ✅ `src/config/contracts.ts` - Added TREASURY_PROXY constant
- ✅ `ConsolidatedTreasuryDeployerV2.tsx` - Updated ABI + function call
- ✅ `ConsolidatedTreasuryDeployer.tsx` - Updated ABI + function call
- ✅ `PodSpecificTreasuryManager.tsx` - Updated ABI + function call

**All treasury deployment components now pass `testingMode` parameter!**

---

## 🎯 IMMEDIATE NEXT STEPS

### Step 1: Update Your .env File ⚠️ REQUIRED

Open: `C:\Users\PC\Documents\DAO\App\commapp\.env`

Add these lines (replace with your actual deployed addresses):

```bash
# Treasury System - NEW DEPLOYMENTS
NEXT_PUBLIC_TREASURY_PROXY=0x...YourTreasuryProxyAddress
NEXT_PUBLIC_POD_TREASURY_FACTORY=0x...YourPodTreasuryFactoryAddress

# Testing Mode - Set to true for development
NEXT_PUBLIC_PODS_TESTING=true
```

**Important:**
- Replace the `0x...` placeholders with your actual contract addresses from Remix
- Set `NEXT_PUBLIC_PODS_TESTING=true` for now (we'll test single-sig first)

### Step 2: Restart Your Dev Server

```bash
# Kill the current dev server (Ctrl+C)
# Then restart:
npm run dev
```

This loads the new environment variables.

### Step 3: Verify Contract Addresses Loaded

Open your app and check the browser console. You should see the new addresses loaded.

---

## 🧪 TESTING CHECKLIST

### Phase 1: Testing Mode (Single-Sig) ✅ Do This First

1. **Create a Test Pod:**
   - Log in to your app
   - Create a new pod
   - Assign yourself as a pod manager
   - Deploy the treasury via the UI

2. **Verify Treasury Deployed:**
   - Check that treasury contract was created
   - Verify `testingMode = true` on the contract
   - Check treasury address saved to database

3. **Test Single-Sig Distribution:**
   - Try distributing tokens using existing UI
   - Should work with just one manager (you)
   - This proves testing mode works

**Expected Result:** All distributions work with single-sig (because `NEXT_PUBLIC_PODS_TESTING=true`)

---

### Phase 2: Production Mode (Multi-Sig) ⚠️ Do This After Phase 1 Works

1. **Update .env:**
   ```bash
   NEXT_PUBLIC_PODS_TESTING=false
   ```

2. **Restart dev server**

3. **Create a Production Test Pod:**
   - Create a new pod (different from testing pod)
   - Add 2-3 managers (you need multiple wallets for this)
   - Deploy the treasury

4. **Test Multi-Sig Proposal Flow:**

   **Manager A (You):**
   ```typescript
   // Create a proposal
   const { getCreateProposalCalls } = useTreasuryProposals();

   const calls = getCreateProposalCalls({
     podId: 'your-pod-id',
     token: '0x1317Ae277266D38C4E492558f8693F14143a6A65', // SYSTEM_TOKEN
     recipients: ['0xRecipientAddress'],
     amounts: ['10'], // 10 tokens
     reason: 'Test multi-sig proposal'
   });

   // Use Transaction component to submit
   ```

   **Manager B (Different Wallet):**
   ```typescript
   // Approve the proposal
   const { getApproveProposalCalls } = useTreasuryProposals();

   const calls = getApproveProposalCalls(podId, proposalId);

   // Use Transaction component to submit
   ```

5. **Verify Auto-Execution:**
   - After majority approval, tokens should auto-distribute
   - Check recipient balance increased
   - Check proposal status = "Executed"

**Expected Result:** Multi-sig works, requires majority approval, auto-executes

---

## 🔍 TESTING NOTES

### How to Test with Multiple Wallets Locally

You mentioned you can test with multiple people locally. Here's the flow:

1. **Setup 2-3 Test Wallets:**
   - Wallet A (You): Primary test wallet
   - Wallet B (Friend/Second Device): Second manager
   - Optional Wallet C: Third manager

2. **Create Test Pod:**
   - Use Wallet A to create pod
   - Assign management hat to all 3 wallets

3. **Deploy Treasury:**
   - Set `NEXT_PUBLIC_PODS_TESTING=false`
   - Deploy treasury via UI
   - Verify `testingMode = false` on contract

4. **Test Proposal:**
   - Wallet A: Create proposal
   - Check that Wallet A is auto-approved (1/2 approvals)
   - Wallet B: Approve proposal
   - Check auto-execution (2/2 approvals reached)
   - Verify tokens were distributed

### What Each Mode Does

**Testing Mode (`NEXT_PUBLIC_PODS_TESTING=true`):**
- Single manager can distribute directly
- No proposals required
- Fast for development
- ⚠️ Less secure

**Production Mode (`NEXT_PUBLIC_PODS_TESTING=false`):**
- All distributions require proposals
- Simple majority (>50%) must approve
- Auto-executes when majority reached
- 🔒 Production-ready security

---

## 📊 VALIDATION CHECKS

### Before You Start Testing

Run these checks to ensure everything is set up:

1. **.env has new addresses:**
   ```bash
   # Check these exist in .env:
   grep NEXT_PUBLIC_TREASURY_PROXY .env
   grep NEXT_PUBLIC_POD_TREASURY_FACTORY .env
   grep NEXT_PUBLIC_PODS_TESTING .env
   ```

2. **Config file has constants:**
   ```typescript
   // Check src/config/contracts.ts exports these:
   import { CONTRACT_ADDRESSES } from '@/config/contracts';
   console.log(CONTRACT_ADDRESSES.TREASURY_PROXY);
   console.log(CONTRACT_ADDRESSES.TREASURY_FACTORY);
   ```

3. **Coinbase Paymaster has all 11 functions:**
   - proxyDistributeTokens
   - proxyDistributeTokensEvenly
   - proxyReceiveTokens
   - proxyEmergencyWithdraw
   - proxyDistributeSingle
   - proxyAddSupportedToken
   - proxySyncTokenBalance
   - proxySetAuthorizedProxy
   - **proxyProposeDistribution** (NEW)
   - **proxyApproveProposal** (NEW)
   - **proxyCancelProposal** (NEW)

---

## 🐛 TROUBLESHOOTING

### "Treasury deployment failed"
- Check `.env` has correct factory address
- Verify Coinbase Paymaster whitelist includes factory functions
- Check management hat ID exists and you hold it

### "Transaction reverted"
- Ensure factory is connected to proxy (Step 3 of deployment)
- Verify proxy address in factory matches deployed proxy
- Check gas limits

### "Proposal creation failed"
- Verify `NEXT_PUBLIC_PODS_TESTING=false` (proposals only work in production mode)
- Check you hold management hat
- Ensure treasury is deployed with `testingMode=false`

### "Can't approve proposal"
- Check you're using a different wallet than proposer
- Verify you hold management hat
- Ensure proposal hasn't already been executed

---

## 🎯 SUCCESS CRITERIA

### Phase 1 Success (Testing Mode):
✅ Pod created successfully
✅ Treasury deployed with `testingMode=true`
✅ Single manager can distribute tokens directly
✅ No proposals required

### Phase 2 Success (Production Mode):
✅ Pod created with multiple managers
✅ Treasury deployed with `testingMode=false`
✅ Proposal created successfully
✅ Proposer auto-approved (1/N approvals)
✅ Second manager can approve
✅ Auto-execution at majority (N/2 + 1)
✅ Tokens distributed correctly

---

## 📝 WHAT HAPPENS AFTER TESTING

### Once Testing Passes:

1. **Production Deployment:**
   - Deploy contracts to Base Mainnet (not Sepolia)
   - Update `.env` with mainnet addresses
   - Set `NEXT_PUBLIC_PODS_TESTING=false`
   - Whitelist mainnet TreasuryProxy on Coinbase Paymaster

2. **Database Preparation:**
   - Wipe Supabase database (as you mentioned)
   - Fresh start for production

3. **Add Validation:**
   - Add contract address validation to app startup
   - See `validateContractAddresses()` in `src/config/contracts.ts`

4. **Launch:**
   - All new pods will use multi-sig by default
   - Simple majority voting enforced
   - Secure treasury operations

---

## 🚀 YOU ARE HERE

```
✅ Pre-production audit complete
✅ Contracts deployed
✅ Frontend updated
✅ Coinbase Paymaster whitelisted

👉 NEXT: Update .env → Test → Deploy to production
```

---

## 📞 QUICK REFERENCE

**Deployed Contracts:**
- TreasuryProxy: [Your deployed address]
- PodTreasuryFactory: [Your deployed address]

**Environment Variables:**
```bash
NEXT_PUBLIC_TREASURY_PROXY=0x...
NEXT_PUBLIC_POD_TREASURY_FACTORY=0x...
NEXT_PUBLIC_PODS_TESTING=true  # or false
```

**Files Updated:**
- `src/config/contracts.ts`
- `src/features/pods/components/ConsolidatedTreasuryDeployerV2.tsx`
- `src/features/pods/components/ConsolidatedTreasuryDeployer.tsx`
- `src/features/pods/components/PodSpecificTreasuryManager.tsx`

**Ready to test!** 🎉
