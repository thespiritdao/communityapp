# CDP Smart Wallet Migration Plan

**Status:** Ready for Review
**Created:** December 17, 2025
**Estimated Effort:** 2-3 days (surgical changes only)

---

## 🎯 Executive Summary

**Goal:** Migrate transaction patterns from incompatible wagmi/OnchainKit to CDP-native `useSendUserOperation`

**Scope:** **MINIMAL CHANGES ONLY** - Your app was 100% functional before. We're ONLY changing transaction execution, not architecture.

**Success Proof:** Faucet page working with gasless transactions (user operation hash: `0x8488...5031`)

---

## 📊 App Audit Results

### Total Files Analyzed: 189

| Category | Count | Action Required |
|----------|-------|----------------|
| **Frontend Transaction Components** | ~30 | ✅ Migrate to `useSendUserOperation` |
| **Backend Services (viem)** | ~40 | ⚠️ Review (may need server-side solutions) |
| **OnchainKit UI Components** | ~15 | ✅ Keep (display only) |
| **wagmi Read Operations** | ~50 | ✅ Keep (reads are fine) |
| **Test/Documentation Files** | ~54 | ⏭️ Skip (no changes needed) |

---

## ⚠️ CRITICAL UNDERSTANDING

### What MUST Change ✅
- Frontend components using `<Transaction>` from OnchainKit
- Hooks calling `useSendEvmTransaction()`
- Components using `writeContract()` from wagmi hooks

### What MUST NOT Change ❌
- Contract read operations (`usePublicClient`, `publicClient.readContract`)
- OnchainKit UI components (`<Avatar>`, `<Name>`, `<Identity>`)
- Backend services (API routes, server actions)
- wagmi provider configuration (reads only)

### What to Review Carefully ⚠️
- Backend services using `writeContract()` - may need alternative patterns
- Complex transaction flows (multi-sig, batching)
- Server-side operations

---

## 📋 Detailed Migration Plan

### **PHASE 1: LOW-RISK UI MIGRATIONS** (Day 1)

These are straightforward component updates with no business logic changes.

#### 1.1 Shopping Cart / Marketplace 🛒
**Files:**
- `src/features/shopping-cart/components/Cart/Cart.tsx`
- `src/features/shopping-cart/components/TransactionWrapper.tsx`
- `src/features/marketplace/components/ProductManagement/ProductManagement.tsx`

**Current Pattern:**
```typescript
<Transaction
  contracts={[...]}
  chainId={8453}
  onStatus={handleStatus}
/>
```

**New Pattern:**
```typescript
const { sendUserOperation } = useSendUserOperation();
const { currentUser } = useCurrentUser();

const handlePurchase = async () => {
  await sendUserOperation({
    evmSmartAccount: currentUser.evmSmartAccounts[0],
    network: 'base',
    calls: contracts.map(c => ({
      to: c.address,
      value: 0n,
      data: encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args }),
    })),
    useCdpPaymaster: true,
  });
};
```

**Estimated Time:** 2-3 hours

---

#### 1.2 Governance / Voting 🗳️
**Files:**
- `src/features/governance/components/VoteButton.tsx`
- `src/features/governance/components/CreateProposalForm.tsx`
- `src/features/governance/components/ProposalVoteForm.tsx`

**Current Pattern:**
```typescript
const hash = await walletClient.writeContract({
  address: GOVERNOR_ADDRESS,
  abi: GOVERNOR_ABI,
  functionName: 'castVote',
  args: [proposalId, support],
});
```

**New Pattern:**
```typescript
await sendUserOperation({
  evmSmartAccount: smartAccount,
  network: 'base',
  calls: [{
    to: GOVERNOR_ADDRESS,
    value: 0n,
    data: encodeFunctionData({
      abi: GOVERNOR_ABI,
      functionName: 'castVote',
      args: [proposalId, support],
    }),
  }],
  useCdpPaymaster: true,
});
```

**Estimated Time:** 2-3 hours

---

#### 1.3 Events / Registration 📅
**Files:**
- `src/features/events/components/EventRegistrationButton.tsx`
- `src/features/events/components/EventCheckInSystem.tsx`
- `src/features/events/components/EventManagementDashboard.tsx`

**Pattern:** Same as governance (simple contract calls)

**Estimated Time:** 2 hours

---

#### 1.4 NFT Minting 🎨
**Files:**
- `src/nft/components/NFTMintCardGeneral.tsx`
- `src/nft/components/AdvocateMintCardOnchainKit.tsx`

**Current Pattern:**
```typescript
<Transaction
  contracts={[{
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: 'mint',
    args: [recipient],
  }]}
/>
```

**New Pattern:** Use `useSendUserOperation` with mint call

**Estimated Time:** 1-2 hours

---

### **PHASE 2: MEDIUM-RISK POD OPERATIONS** (Day 2)

Pod operations are complex but follow similar patterns.

#### 2.1 Pod Creation / Management
**Files:** (20+ files in `src/features/pods/components/`)
- `HatsModulePodCreationForm.tsx`
- `PodRegistrationManager.tsx`
- `UnifiedMembershipManager.tsx`
- `ClaimManagementHATButton.tsx`
- etc.

**Strategy:**
1. Identify distinct transaction types (create pod, register, claim hat, etc.)
2. Create reusable helper functions for each type
3. Replace `<Transaction>` / `writeContract` calls systematically
4. Test each pod operation type before moving to next

**Estimated Time:** 6-8 hours (methodical, one type at a time)

---

#### 2.2 Bounty System
**Files:** (`src/features/bounty/components/`)
- `BountyFormV2.tsx`
- `BountyPaymentTransaction.tsx`
- `BidApprovalFlow.tsx`
- `MilestonePaymentTransaction.tsx`

**Note:** These use OnchainKit `<Transaction>` extensively
**Strategy:** Same as pods - systematic replacement

**Estimated Time:** 4-6 hours

---

### **PHASE 3: HIGH-RISK / REVIEW ONLY** (Day 3)

#### 3.1 Backend Services (API Routes) ⚠️

**Files:** (`src/services/`, `src/app/api/`)
- `hatConfigurationService.ts`
- `eligibilityModuleService.ts`
- `onboarding/mint-hat/route.ts`
- `products/set-destination/route.ts`

**Current Pattern:**
```typescript
const hash = await walletClient.writeContract({...});
```

**Problem:** These run **server-side**, not client-side
- No CDP session available
- No Smart Account context
- Likely using admin/service account

**Options:**
1. **Keep as-is** (if using server wallet)
2. **Move to client** (if should be user-initiated)
3. **Use backend wallet service** (Coinbase Wallet SDK for servers)

**Action:** **REVIEW ONLY - DO NOT AUTO-MIGRATE**

**Estimated Time:** 4 hours review + strategic decisions

---

### **PHASE 4: CLEANUP** (End of Day 3)

#### 4.1 Remove Deprecated Files
- `src/utils/cdpTransaction.ts` (replaced by direct `useSendUserOperation`)
- `src/app/cdp-test/page.tsx` (test page no longer needed)

#### 4.2 Update Documentation
- Mark old patterns as deprecated
- Add working examples to each feature
- Update README with new transaction pattern

**Estimated Time:** 2 hours

---

## 🚨 FILES TO LEAVE UNTOUCHED

### ✅ Keep These As-Is:

1. **Contract Read Operations**
   - All files using `usePublicClient()`
   - All files using `publicClient.readContract()`
   - Token balance fetching
   - Contract state queries

2. **UI Display Components**
   - `<Avatar>`, `<Name>`, `<Identity>` from OnchainKit
   - Styling/CSS files
   - Layout components

3. **Provider Configuration**
   - `src/app/providers.tsx` (already correct)
   - `src/config/wagmi.client.ts` (reads only, no connectors)

4. **Swap Functionality** ⚠️
   - `src/swap/` directory uses OnchainKit swap components
   - **Decision needed:** Keep OnchainKit swap or migrate?
   - **Recommendation:** Test if OnchainKit swap works with Smart Accounts
   - If yes: keep; if no: complex migration needed

---

## 🛠️ Implementation Strategy

### Step-by-Step Approach (SURGICAL)

```
Day 1 Morning:  Shopping Cart (most critical for revenue)
Day 1 Afternoon: Governance + Events
Day 2 Morning:  Pod Creation/Management (20% of files)
Day 2 Afternoon: Pod Creation/Management (continue)
Day 3 Morning:  Bounty System
Day 3 Afternoon: Backend services review + cleanup
```

### Testing Strategy

After each migration:
1. ✅ Test happy path (transaction succeeds)
2. ✅ Test error handling (transaction fails gracefully)
3. ✅ Test gasless functionality (no ETH needed)
4. ✅ Verify UI feedback (loading states, success/error messages)

---

## 📝 Migration Template

### For Each Component:

**Before:**
```typescript
import { Transaction, TransactionButton } from '@coinbase/onchainkit/transaction';

<Transaction
  contracts={[{
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'functionName',
    args: [arg1, arg2],
  }]}
  chainId={8453}
  onStatus={handleStatus}
>
  <TransactionButton text="Submit" />
</Transaction>
```

**After:**
```typescript
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';

const { sendUserOperation } = useSendUserOperation();
const { currentUser } = useCurrentUser();
const [loading, setLoading] = useState(false);

const handleSubmit = async () => {
  setLoading(true);
  try {
    const result = await sendUserOperation({
      evmSmartAccount: currentUser.evmSmartAccounts[0],
      network: 'base',
      calls: [{
        to: CONTRACT_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'functionName',
          args: [arg1, arg2],
        }),
      }],
      useCdpPaymaster: true,
    });
    console.log('Success:', result.userOperationHash);
    // Handle success
  } catch (error) {
    console.error('Failed:', error);
    // Handle error
  } finally {
    setLoading(false);
  }
};

<button onClick={handleSubmit} disabled={loading}>
  {loading ? 'Submitting...' : 'Submit (Gasless)'}
</button>
```

---

## 🎯 Success Criteria

### Per-Feature Checklist:

- [ ] Transaction executes successfully
- [ ] User sees "Gasless" confirmation
- [ ] No ETH balance required
- [ ] Loading states work correctly
- [ ] Error handling graceful
- [ ] Console shows `userOperationHash`
- [ ] On-chain state updates confirmed

### Overall Completion:

- [ ] All frontend transactions using `useSendUserOperation`
- [ ] No `<Transaction>` components for user-initiated txns
- [ ] No `useSendEvmTransaction` calls
- [ ] Backend services reviewed and categorized
- [ ] Documentation updated
- [ ] Test suite passes
- [ ] Production deploy successful

---

## 🚨 RISKS & MITIGATIONS

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Test each feature after migration |
| Backend services incompatible | Review before migrating (Phase 3) |
| Complex multi-sig flows | Start with simple flows, escalate complex ones |
| User confusion during transition | Add "Gasless" labels, clear messaging |
| Incomplete migration | Use this checklist systematically |

---

## 📞 Decision Points (Requires User Input)

### 1. Swap Functionality
**Question:** Keep OnchainKit swap or migrate to custom?
**Options:**
- A) Test OnchainKit swap with Smart Accounts (may work)
- B) Build custom swap with `useSendUserOperation`
- C) Disable swap temporarily

**Recommendation:** Option A (test first)

### 2. Backend Services
**Question:** How do server-side transactions work?
**Context:** API routes can't use CDP hooks (no browser session)
**Options:**
- A) Keep server-side transactions as EOA (requires funded wallet)
- B) Move transactions to client (user-initiated)
- C) Use Coinbase Wallet SDK for servers

**Recommendation:** Review each service individually

### 3. Multi-Sig Operations
**Question:** Do you have multi-sig treasury operations?
**Context:** Multi-sig may need special handling
**Action:** Identify multi-sig transactions during Phase 2

---

## 🎯 Minimal Viable Migration (If Time-Constrained)

### MUST MIGRATE (Critical Path):
1. ✅ Shopping Cart / Marketplace (revenue-critical)
2. ✅ Governance voting (core feature)
3. ✅ Pod membership (core feature)

### CAN DEFER:
- Event check-ins
- NFT minting (if not revenue-critical)
- Bounty system (if low usage)
- Backend services (if working)

---

## 📚 Reference Implementation

**Working Example:** `src/app/faucet/page.tsx` (lines 200-268)

Copy this pattern for all migrations:
1. Import `useSendUserOperation` and `useCurrentUser`
2. Get Smart Account from `currentUser.evmSmartAccounts[0]`
3. Encode function data with `encodeFunctionData`
4. Call `sendUserOperation` with `useCdpPaymaster: true`
5. Handle success/error states

---

## 🎉 Expected Outcome

### Before Migration:
- ❌ Transactions fail ("EVM account not found", "Insufficient balance")
- ❌ Users need ETH for gas
- ❌ Wallet popups required
- ❌ Poor UX

### After Migration:
- ✅ Transactions succeed gaslessly
- ✅ No ETH balance needed
- ✅ No wallet popups
- ✅ Seamless UX
- ✅ Cost savings for users

---

## 📋 Final Checklist Before Starting

- [ ] Review this document completely
- [ ] Identify critical features (prioritize those)
- [ ] Back up current code (git commit)
- [ ] Set up feature flags (optional, for gradual rollout)
- [ ] Communicate to team (if applicable)
- [ ] Block time for focused migration (3 days)

---

**Next Step:** Review this plan, make decisions on the 3 decision points, then proceed Phase 1 → Phase 2 → Phase 3 → Phase 4.

---

_Document created based on comprehensive app audit and proven faucet implementation._
