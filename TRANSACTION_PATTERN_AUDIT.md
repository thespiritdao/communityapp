# Transaction Pattern Audit - CDP Smart Account Refactoring

## Executive Summary

**Problem**: 47 files across bounty and pods features use OnchainKit Transaction components that are incompatible with CDP Embedded Wallets.

**Root Cause**: OnchainKit's `<Transaction>` and `<TransactionButton>` components internally check for wagmi connectors, but CDP Embedded Wallets don't use wagmi connectors (`connectors: []`).

**Solution**: Refactor all transaction code to use the **standardized faucet pattern** with:
- `useSendUserOperation()` from `@coinbase/cdp-hooks`
- `currentUser.evmSmartAccounts[0]` for Smart Account
- `useCdpPaymaster: true` for gas sponsorship

---

## Audit Results

### ❌ Files Using INCORRECT Pattern (OnchainKit Transaction Components)

#### **Priority 1: Critical Bounty Transactions** (8 files)

| File | Contract | Function | Impact |
|------|----------|----------|--------|
| `BountyFormV2.tsx` | BountyManager | `createBounty` | **CRITICAL** - Cannot create bounties |
| `BountyAssignmentTransaction.tsx` | BountyManager | `assignBounty` | **CRITICAL** - Cannot assign bounties to workers |
| `BountyPaymentTransaction.tsx` | BountyManager | `releaseFunds` | **CRITICAL** - Cannot pay completed work |
| `BountyTreasuryFundingTransaction.tsx` | TreasuryProxy | `transferFunds` | **HIGH** - Cannot fund bounties from pod treasury |
| `MilestonePaymentTransaction.tsx` | BountyManager | `releaseMilestone` | **HIGH** - Milestone bounties broken |
| `BountyCancellationDialog.tsx` | BountyManager | `cancelBounty` | **MEDIUM** - Cannot cancel bounties |
| `BidForm.tsx` | BountyManager | `submitBid` | **HIGH** - Cannot submit bids |
| `BidApprovalFlow.tsx` | BountyManager | Various | **HIGH** - Bid approval workflow broken |

**Current State**: Lines 6-12 in these files:
```typescript
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction';
```

**Required Change**: Replace with faucet pattern:
```typescript
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';
```

---

#### **Priority 2: Critical Pods Member Management** (4 files)

| File | Contract | Function | Impact |
|------|----------|----------|--------|
| `ApproveApplicationButton.tsx` | HatsProtocol | `mintHat` | **CRITICAL** - Cannot approve pod applications |
| `RemoveMemberButton.tsx` | HatsProtocol | `setHatStatus` | **CRITICAL** - Cannot remove pod members |
| `VoteOnApplicationButton.tsx` | PodGovernance | `voteOnApplication` | **HIGH** - Governance voting broken |
| `ClaimManagementHATButton.tsx` | HatsProtocol | `mintHat` | **MEDIUM** - Cannot claim management hats |

**Current State**: All use OnchainKit Transaction components
**Required Change**: Convert to faucet pattern with HatsProtocol contract calls

---

#### **Priority 3: Pods Treasury Operations** (6 files)

| File | Contract | Function | Impact |
|------|----------|----------|--------|
| `TreasuryManagement.tsx` | TreasuryProxy | `distribute`, `transfer` | **CRITICAL** - Cannot distribute treasury funds |
| `PodSpecificTreasuryManager.tsx` | TreasuryProxy | Various | **HIGH** - Treasury operations broken |
| `ConsolidatedTreasuryDeployer.tsx` | TreasuryFactory | `deployTreasury` | **HIGH** - Cannot deploy pod treasuries |
| `ConsolidatedTreasuryDeployerV2.tsx` | TreasuryFactory | `deployTreasury` | **HIGH** - V2 treasury deployment broken |
| `PodTreasurySync.tsx` | TreasuryProxy | `syncTreasury` | **MEDIUM** - Treasury sync issues |
| `RegisterPodButton.tsx` | PodFactory | `registerPod` | **MEDIUM** - Pod registration broken |

---

#### **Priority 4: Pods Advanced Features** (17 files)

| File | Contract | Function | Impact |
|------|----------|----------|--------|
| `PodDeletionApprovalFlow.tsx` | PodGovernance | `approveDelete` | **MEDIUM** - Cannot delete pods |
| `HatsModulePodCreationForm.tsx` | HatsProtocol | `createHat` | **HIGH** - Advanced pod creation broken |
| `RoleCreationModal.tsx` | HatsProtocol | `createHat` | **HIGH** - Cannot create pod roles |
| `UnifiedMembershipManager.tsx` | HatsProtocol | Various | **HIGH** - Member management UI broken |
| `OnChainAgreementSigningModal.tsx` | AgreementContract | `signAgreement` | **MEDIUM** - Agreement signing broken |
| `PodContractCreator.tsx` | Various | Various | **MEDIUM** - Contract creation tools broken |
| `ProxyHatIdFixer.tsx` | HatsProtocol | `updateHatId` | **LOW** - Admin tool |
| `PodManagerControlPanel.tsx` | Various | Various | **MEDIUM** - Admin panel broken |
| `PodRegistrationManager.tsx` | PodFactory | `registerPod` | **MEDIUM** - Registration UI broken |
| `TreasuryRegistrationTool.tsx` | TreasuryFactory | `registerTreasury` | **MEDIUM** - Treasury registration broken |
| `PodBlockchainSync.tsx` | Various | Various | **LOW** - Sync operations |
| `PodFactorySync.tsx` | PodFactory | `syncPod` | **LOW** - Factory sync |
| `PodDeletionManager.tsx` | PodGovernance | `deletePod` | **MEDIUM** - Deletion UI broken |
| `RepairHatModulesButton.tsx` | HatsProtocol | `repairModule` | **LOW** - Admin tool |

**Services with Transactions** (7 files):
- `HatCreationService.ts` - Uses `writeContract`
- `ProxyAdminHatService.ts` - Uses `writeContract`
- `PodProxyDeletionService.ts` - Uses `writeContract`
- `hatToggleService.ts` - Uses `writeContract`
- `HatsModuleDeploymentService.ts` - Uses `writeContract`
- `hatDeactivationService.ts` - Uses `writeContract`
- `EligibilityService.ts` - Uses `writeContract`

---

## Standardized Pattern (From Working Faucet)

### ✅ CORRECT Pattern Template

```typescript
// 1. Imports
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';

// 2. Component hooks
const { address } = useEvmAddress();
const { sendUserOperation } = useSendUserOperation();
const { currentUser } = useCurrentUser();

// 3. Transaction handler
const handleTransaction = useCallback(async () => {
  // Validation
  if (!address || !currentUser?.evmSmartAccounts?.[0]) {
    console.error('❌ Smart Wallet not configured');
    return;
  }

  const smartAccount = currentUser.evmSmartAccounts[0];
  setLoading(true);

  try {
    console.log('🚀 Building Smart Account User Operation...');

    // Encode call data
    const callData = encodeFunctionData({
      abi: CONTRACT_ABI,
      functionName: 'functionName',
      args: [...],
    });

    console.log('📝 Encoded call data:', callData);

    // Send user operation
    const result = await sendUserOperation({
      evmSmartAccount: smartAccount,  // ← Smart Account from CDP
      network: 'base',                 // ← Base mainnet
      calls: [{
        to: CONTRACT_ADDRESS,          // ← Target contract
        value: 0n,                     // ← ETH value (bigint)
        data: callData,                // ← Encoded function call
      }],
      useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP
    });

    console.log('✅ Transaction successful!', result);

    // Handle success (DB updates, notifications, etc.)
  } catch (err: any) {
    console.error('❌ Transaction failed:', err);
    // Handle error
  } finally {
    setLoading(false);
  }
}, [address, currentUser, sendUserOperation]);
```

---

## Refactoring Checklist

For each file:

### Phase 1: Update Imports
- [ ] Remove OnchainKit Transaction imports
- [ ] Add CDP hooks: `useEvmAddress, useSendUserOperation, useCurrentUser`
- [ ] Add viem: `encodeFunctionData`
- [ ] Keep contract ABI imports

### Phase 2: Update Component Hooks
- [ ] Replace `useAccount()` with `useEvmAddress()` (if using for address)
- [ ] Add `useSendUserOperation()` hook
- [ ] Add `useCurrentUser()` hook
- [ ] Remove `useWalletClient()` if only used for transactions

### Phase 3: Create Transaction Handler
- [ ] Replace `<Transaction>` component with handler function
- [ ] Validate Smart Account exists: `currentUser?.evmSmartAccounts?.[0]`
- [ ] Get Smart Account: `const smartAccount = currentUser.evmSmartAccounts[0]`
- [ ] Encode call data using `encodeFunctionData()`
- [ ] Call `sendUserOperation()` with proper structure
- [ ] Add error handling matching faucet pattern
- [ ] Update loading state in `finally` block

### Phase 4: Update UI
- [ ] Replace `<TransactionButton>` with regular `<Button>`
- [ ] Add `onClick={handleTransaction}` handler
- [ ] Use component-level loading state
- [ ] Add loading spinner when `isLoading` true
- [ ] Keep success/error messages

### Phase 5: Testing
- [ ] Verify button is clickable (not greyed out)
- [ ] Check console for Smart Account validation
- [ ] Confirm transaction sends via CDP API
- [ ] Verify gas sponsorship applies (no user gas fees)
- [ ] Test success flow (DB updates, notifications)
- [ ] Test error handling

---

## Contract Addresses to Whitelist

All these contracts must be whitelisted in CDP Dashboard for gas sponsorship:

### Already Whitelisted ✅
- **EventManager**: `0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9`
- **EventEscrow**: `0x9D868cc947e8051369E0e469E14Ef2aEe10f55Be`
- **TokenFaucet**: (working in faucet)

### Need Whitelisting ⚠️
- **BountyManager**: (get from env: `NEXT_PUBLIC_BOUNTY_MANAGER`)
- **HatsProtocol**: `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137` (Base mainnet)
- **TreasuryProxy**: (get from env: `NEXT_PUBLIC_TREASURY_PROXY`)
- **TreasuryFactory**: (get from env: `NEXT_PUBLIC_TREASURY_FACTORY`)
- **PodFactory**: (get from env: `NEXT_PUBLIC_POD_FACTORY`)
- **PodGovernance**: (TBD)

---

## Refactoring Order (Recommended)

### Week 1: Critical Bounty Transactions
1. ✅ **EventCreation** (COMPLETED - reference implementation)
2. **BountyFormV2** - Cannot create bounties
3. **BountyAssignmentTransaction** - Cannot assign work
4. **BountyPaymentTransaction** - Cannot pay workers

### Week 2: Pod Member Management
5. **ApproveApplicationButton** - Cannot approve applications
6. **RemoveMemberButton** - Cannot remove members
7. **VoteOnApplicationButton** - Governance broken

### Week 3: Treasury Operations
8. **TreasuryManagement** - Cannot distribute funds
9. **ConsolidatedTreasuryDeployer** - Cannot deploy treasuries
10. **BountyTreasuryFundingTransaction** - Cannot fund bounties from treasury

### Week 4: Advanced Features
11. Remaining bounty features
12. Remaining pods features
13. Service layer refactoring
14. Admin tools

---

## Testing Strategy

### Unit Testing
- Create test suite for transaction handler pattern
- Mock CDP hooks and Smart Account
- Test validation logic
- Test error handling

### Integration Testing
- Test each refactored component in isolation
- Verify Smart Account creation
- Confirm gas sponsorship applies
- Check DB sync after transactions

### E2E Testing
- Create bounty flow (create → bid → assign → complete → pay)
- Pod lifecycle (create → approve members → distribute funds)
- Treasury operations (deploy → fund → distribute)

---

## Migration Risks

### High Risk
1. **Breaking Changes**: All transaction UIs will break temporarily during migration
2. **Gas Sponsorship**: Must whitelist all contracts before deployment
3. **User Experience**: Users will see different transaction flows

### Medium Risk
1. **Database Sync**: Transaction callbacks may need updates
2. **Error Handling**: Different error messages from CDP vs OnchainKit
3. **Testing Burden**: 47 files to test thoroughly

### Low Risk
1. **Revert Capability**: Can revert specific files if issues arise
2. **Gradual Rollout**: Can enable features incrementally
3. **Reference Implementation**: Event creation provides working pattern

---

## Success Metrics

- [ ] All 47 files refactored to faucet pattern
- [ ] All contracts whitelisted for gas sponsorship
- [ ] 100% of transactions work without gas fees
- [ ] Zero greyed-out transaction buttons
- [ ] All DB sync operations working
- [ ] All notifications sending correctly
- [ ] Performance maintained or improved
- [ ] User satisfaction with gas-free transactions

---

## Next Steps

1. **Immediate**: Start with BountyFormV2.tsx (highest impact)
2. **Get Contract Addresses**: Extract all contract addresses from .env
3. **Whitelist Contracts**: Add to CDP Dashboard on Base mainnet
4. **Refactor Priority 1**: Complete critical bounty transactions
5. **Test & Deploy**: Verify each file before moving to next
6. **Document Patterns**: Update this guide with learnings

---

## Reference Files

- ✅ **Working Pattern**: `src/app/faucet/page.tsx` (lines 200-268)
- ✅ **Event Creation**: `src/features/events/components/SimplifiedEventCreationForm.tsx` (lines 575-630)
- ✅ **Verification Doc**: `FAUCET_PATTERN_VERIFICATION.md`
- 📋 **This Audit**: `TRANSACTION_PATTERN_AUDIT.md`
