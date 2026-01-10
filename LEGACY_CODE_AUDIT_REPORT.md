# COMPLETE LEGACY CODE AUDIT REPORT
**Generated**: 2026-01-09
**Scope**: All live application code in `src/app/` and `src/features/`
**Excluded**: Test files, story files, old files, documentation

---

## EXECUTIVE SUMMARY

Your application has **35 CRITICAL FILES** using legacy Wagmi/OnchainKit code that need migration to CDP:

- **8 files** using Wagmi's `useAccount()` hook
- **8 files** using Wagmi's `useSignMessage()` hook
- **19 files** using OnchainKit's `Transaction` components

**RISK LEVEL**: HIGH - These legacy integrations may cause failures with CDP embedded wallets.

---

## CATEGORY 1: WAGMI `useAccount()` USAGE (8 FILES)

### Critical Impact Files

#### 1. `src/app/pods/[id]/manage/PodManageClient.tsx` (Line 31)
```typescript
const { address } = useAccount();
```
- **Risk**: Pod management page completely broken if account hook fails
- **Used for**: Passing userAddress to PodManagementContainer
- **Migration**: Replace with `useEvmAddress()` from CDP

#### 2. `src/app/pods/[id]/manage/components/PodDeletionButton.tsx` (Line 49)
```typescript
const { address } = useAccount();
```
- **Risk**: Pod deletion completely broken
- **Used for**: Deletion eligibility checks, HAT deactivation transactions
- **Migration**: Replace with `useEvmAddress()` from CDP

#### 3. `src/features/pods/components/PodTreasurySync.tsx` (Line 122)
```typescript
const { address, isConnected } = useAccount();
```
- **Risk**: Treasury sync broken, uses both address AND isConnected
- **Used for**: Connection checks, pod leader authorization, sync operations
- **Migration**: Replace with `useEvmAddress()` + `useIsSignedIn()` from CDP

### Medium Impact Files

#### 4. `src/features/pods/components/PodBlockchainSync.tsx` (Line 24)
- **Used for**: Wallet connection verification before sync
- **Migration**: Replace with `useEvmAddress()` from CDP

#### 5. `src/features/pods/components/PodFactorySync.tsx` (Line 24)
- **Used for**: Wallet connection verification before factory sync
- **Migration**: Replace with `useEvmAddress()` from CDP

#### 6. `src/features/pods/components/PodDeletionDebugger.tsx` (Line 19)
- **Used for**: Debug diagnostics, test proposals, leader checks
- **Migration**: Replace with `useEvmAddress()` from CDP

#### 7. `src/features/pods/components/RolePermissionsDiagnostics.tsx` (Line 21)
- **Used for**: Auth requirements, role initialization, diagnostic reports
- **Migration**: Replace with `useEvmAddress()` from CDP

#### 8. `src/features/pods/components/ProxyHatIdFixer.tsx` (Line 38)
- **Used for**: Display in technical details (diagnostic tool)
- **Migration**: Replace with `useEvmAddress()` from CDP

---

## CATEGORY 2: WAGMI `useSignMessage()` USAGE (8 FILES)

### Critical Signing Operations

#### 1. `src/app/pods/[id]/applications/apply/page.tsx` (Lines 6, 44, 139-141)
```typescript
import { useSignMessage } from 'wagmi';
const { signMessageAsync } = useSignMessage();
const signature = await signMessageAsync({ message: messageToSign });
```
- **Risk**: Pod applications completely broken - users can't apply to pods
- **Used for**: Signing pod membership applications with accountability statements
- **Migration**: Replace with `useSignEvmMessage()` from CDP (add `evmAccount` parameter)

#### 2. `src/features/pods/components/MembershipAgreementModal.tsx` (Lines 10, 62, 155-157)
```typescript
import { useSignMessage } from 'wagmi';
const { signMessageAsync } = useSignMessage();
const signature = await signMessageAsync({ message: messageToSign });
```
- **Risk**: Membership agreement signing broken
- **Used for**: Cryptographic signing of pod membership agreements
- **Migration**: Replace with `useSignEvmMessage()` from CDP (add `evmAccount` parameter)

#### 3. `src/features/identity/hooks/useSnapshotAuth.ts` (Lines 2, 6, 9)
```typescript
import { useSignMessage } from 'wagmi';
const { signMessageAsync } = useSignMessage();
const signature = await signMessageAsync({ message });
```
- **Risk**: Snapshot governance voting authentication broken
- **Used for**: Signing messages for Snapshot voting/governance verification
- **Migration**: Replace with `useSignEvmMessage()` from CDP

### Event Authentication (Dynamic Imports)

#### 4. `src/features/events/hooks/useEvents.ts` (Line 428)
```typescript
const { signMessage } = await import('wagmi/actions');
const signature = await signMessage(config, { message: nonce });
```
- **Risk**: Event publishing/canceling/completing broken
- **Used for**: Wallet authentication before event actions
- **Migration**: Use CDP's `useSignEvmMessage()` instead of dynamic import

#### 5. `src/features/events/components/SimplifiedEventCreationForm.tsx` (Line 377)
```typescript
const { signMessage } = await import('wagmi/actions');
const signature = await signMessage(config, { message: nonce });
```
- **Risk**: Event creation broken after blockchain transaction
- **Used for**: Authentication before storing event data to database
- **Migration**: Use CDP's `useSignEvmMessage()` instead of dynamic import

#### 6. `src/features/events/components/EventRegistrationModal.tsx` (Line 422)
```typescript
const { signMessage } = await import('wagmi/actions');
const signature = await signMessage(config, { message: nonce });
```
- **Risk**: Event registration broken
- **Used for**: Authentication before storing registration data
- **Migration**: Use CDP's `useSignEvmMessage()` instead of dynamic import

### Pod Accountability Signing

#### 7. `src/features/pods/hooks/useAccountability.ts` (Line 79)
```typescript
const { signMessage } = await import('wagmi/actions');
const signature = await signMessage(config, { message, account: address });
```
- **Risk**: Pod leadership accountability signing broken
- **Used for**: Signing accountability statements for transparency
- **Migration**: Use CDP's `useSignEvmMessage()` instead of dynamic import

#### 8. `src/features/pods/hooks/usePodCreation.ts` (Line 62)
```typescript
const { signMessage } = await import('wagmi/actions');
const signature = await signMessage(config, { message, account: signerAddress });
```
- **Risk**: Pod creation accountability signing broken
- **Used for**: Signing accountability statements from pod leaders during creation
- **Migration**: Use CDP's `useSignEvmMessage()` instead of dynamic import

---

## CATEGORY 3: ONCHAINKIT TRANSACTION COMPONENTS (19 FILES)

### Pod Management Operations (11 Files)

#### 1. `src/features/pods/components/HatsModulePodCreationForm.tsx` (Line 38)
- **Transaction**: Multi-step pod creation (HAT creation + proxy deployment)
- **Components**: `Transaction`, `TransactionButton`, `TransactionSponsor`, `TransactionStatus`
- **Migration**: Replace with `useSendUserOperation()` for sponsored transactions

#### 2. `src/app/pods/[id]/manage/components/PodDeletionButton.tsx` (Lines 13-20)
- **Transaction**: Pod deletion via smart contract
- **Components**: Full transaction flow with sponsor and status
- **Migration**: Replace with `useSendUserOperation()` for sponsored transactions

#### 3. `src/features/pods/components/PodManagerControlPanel.tsx` (Lines 21-28)
- **Transaction**: Multiple (role creation, treasury sync, member management)
- **Components**: Full transaction suite
- **Migration**: Replace with `useSendUserOperation()` for each operation

#### 4. `src/features/pods/components/PodRegistrationManager.tsx` (Lines 8-15)
- **Transaction**: Pod registration via PodCreationManager contract
- **Components**: Transaction with sponsor
- **Migration**: Replace with `useSendUserOperation()`

#### 5. `src/features/pods/components/RoleCreationModal.tsx` (Lines 14-21)
- **Transaction**: Create new roles within pod hierarchy
- **Components**: Full transaction flow
- **Migration**: Replace with `useSendUserOperation()`

#### 6. `src/features/pods/components/PodDeletionManager.tsx` (Line 27)
- **Transaction**: Pod deletion operations
- **Components**: Transaction with sponsor and status
- **Migration**: Replace with `useSendUserOperation()`

#### 7. `src/features/pods/components/PodDeletionApprovalFlow.tsx` (Line 25)
- **Transaction**: Pod deletion approval
- **Components**: Transaction with status tracking
- **Migration**: Replace with `useSendUserOperation()`

#### 8. `src/features/pods/components/PodBlockchainSync.tsx` (Line 14)
- **Transaction**: Pod blockchain data synchronization
- **Components**: Transaction with status
- **Migration**: Replace with `useSendEvmTransaction()`

#### 9. `src/features/pods/components/PodFactorySync.tsx` (Lines 8-14)
- **Transaction**: Pod factory synchronization
- **Components**: Transaction with status
- **Migration**: Replace with `useSendEvmTransaction()`

#### 10. `src/features/pods/components/PodTreasurySync.tsx` (Lines 11-12)
- **Transaction**: Treasury fund transfers and updates
- **Components**: Transaction with status
- **Migration**: Replace with `useSendEvmTransaction()`

#### 11. `src/features/pods/components/ProxyHatIdFixer.tsx` (Lines 5-8)
- **Transaction**: Set HAT IDs on proxy contract
- **Components**: `Transaction`, `TransactionButton`
- **Migration**: Replace with `useSendEvmTransaction()`

### Governance Operations (2 Files)

#### 12. `src/app/proposals/page.tsx` (Lines 4-13)
- **Transaction**: Governor proposal creation with proposeWithMetadata
- **Components**: Full transaction suite with sponsor
- **Migration**: Replace with `useSendUserOperation()` for sponsored proposals

#### 13. `src/features/governance/components/GovernanceDiagnostics.tsx` (Line 10)
- **Transaction**: Governance diagnostic testing
- **Components**: `Transaction`, `TransactionButton`, `TransactionSponsor`
- **Migration**: Replace with `useSendEvmTransaction()`

### NFT Operations (2 Files)

#### 14. `src/nft/components/AdvocateMintCardOnchainKit.tsx` (Lines 4-11)
- **Transaction**: Mint Advocate membership NFT
- **Components**: Transaction with sponsor
- **Migration**: Replace with `useSendUserOperation()` for sponsored mints

#### 15. `src/nft/components/mint/NFTMintButton.tsx` (Lines 6-14)
- **Transaction**: Generic NFT minting
- **Components**: Full transaction flow
- **Migration**: Replace with `useSendUserOperation()`

### Shopping Cart (1 File)

#### 16. `src/features/shopping-cart/components/Cart/CartCheckout/TransactionFlow.tsx` (Lines 10-39)
- **Transaction**: E-commerce purchase with token approvals
- **Components**: Lazy-loaded transaction components
- **Migration**: Replace with `useSendUserOperation()` for checkout flow

### Testing/Diagnostics (3 Files)

#### 17. `src/app/cdp-test/page.tsx` (Lines 5-6)
- **Transaction**: CDP test transaction (sends 0 ETH to self)
- **Components**: Basic transaction components
- **Note**: Already using `useSendEvmTransaction()` - GOOD EXAMPLE for migration pattern
- **Status**: ✅ ALREADY MIGRATED - Use as reference

#### 18. `src/features/proposals/PaymasterTest.tsx` (Lines 6-10)
- **Transaction**: Paymaster sponsorship test
- **Components**: Transaction with sponsor
- **Migration**: Replace with `useSendUserOperation()`

#### 19. `src/components/SafeOnchainKit.tsx` (Lines 56-160)
- **Transaction**: Safe wrapper components with error boundaries
- **Components**: Dynamic imports of all transaction components
- **Migration**: Create similar wrappers for CDP hooks

---

## MIGRATION PRIORITY MATRIX

### 🔴 CRITICAL (Must Fix Immediately)
These break core user flows:

1. **Pod Applications** - `src/app/pods/[id]/applications/apply/page.tsx`
2. **Pod Management** - `src/app/pods/[id]/manage/PodManageClient.tsx`
3. **Pod Deletion** - `src/app/pods/[id]/manage/components/PodDeletionButton.tsx`
4. **Pod Creation** - `src/features/pods/components/HatsModulePodCreationForm.tsx`
5. **Membership Agreements** - `src/features/pods/components/MembershipAgreementModal.tsx`

### 🟡 HIGH (Fix Soon)
These break important features:

6. **Event Creation** - `src/features/events/components/SimplifiedEventCreationForm.tsx`
7. **Event Registration** - `src/features/events/components/EventRegistrationModal.tsx`
8. **Proposal Creation** - `src/app/proposals/page.tsx`
9. **Treasury Operations** - `src/features/pods/components/PodTreasurySync.tsx`
10. **NFT Minting** - `src/nft/components/AdvocateMintCardOnchainKit.tsx`

### 🟢 MEDIUM (Fix When Convenient)
These are diagnostic/admin tools:

11. All sync components (PodBlockchainSync, PodFactorySync, etc.)
12. All debugger components (PodDeletionDebugger, RolePermissionsDiagnostics, etc.)
13. Governance diagnostics
14. Paymaster test

---

## MIGRATION PATTERNS

### Pattern 1: Replace `useAccount()` with `useEvmAddress()`

**Before (Wagmi):**
```typescript
import { useAccount } from 'wagmi';
const { address } = useAccount();
```

**After (CDP):**
```typescript
import { useEvmAddress } from '@coinbase/cdp-hooks';
const { evmAddress: address } = useEvmAddress();
```

### Pattern 2: Replace `useSignMessage()` with `useSignEvmMessage()`

**Before (Wagmi):**
```typescript
import { useSignMessage } from 'wagmi';
const { signMessageAsync } = useSignMessage();
const signature = await signMessageAsync({ message });
```

**After (CDP):**
```typescript
import { useSignEvmMessage } from '@coinbase/cdp-hooks';
const { signEvmMessage } = useSignEvmMessage();
const result = await signEvmMessage({ evmAccount: address, message });
const signature = result.signature;
```

### Pattern 3: Replace OnchainKit Transaction with `useSendUserOperation()`

**Before (OnchainKit):**
```typescript
import { Transaction, TransactionButton, TransactionSponsor } from '@coinbase/onchainkit/transaction';

<Transaction
  chainId={BASE_CHAIN_ID}
  contracts={contracts}
  onStatus={handleStatus}
>
  <TransactionButton text="Execute" />
  <TransactionSponsor />
</Transaction>
```

**After (CDP):**
```typescript
import { useSendUserOperation } from '@coinbase/cdp-hooks';

const { sendUserOperation, status, error } = useSendUserOperation();

const handleExecute = async () => {
  const result = await sendUserOperation({
    calls: [{
      to: contractAddress,
      data: encodedData,
      value: 0n,
    }],
  });
};

<button onClick={handleExecute} disabled={status === 'pending'}>
  {status === 'pending' ? 'Executing...' : 'Execute'}
</button>
```

---

## TESTING CHECKLIST

After each migration, test:

- [ ] Component renders without errors
- [ ] CDP wallet connection works
- [ ] Address is correctly retrieved
- [ ] Signing prompts appear and work
- [ ] Transactions are sent successfully
- [ ] Status updates correctly
- [ ] Error handling works
- [ ] Success/failure callbacks trigger
- [ ] Database updates occur

---

## ESTIMATED MIGRATION EFFORT

- **8 `useAccount()` files**: ~30 min each = 4 hours
- **8 `useSignMessage()` files**: ~45 min each = 6 hours
- **19 Transaction component files**: ~60-90 min each = 19-28 hours

**Total**: 29-38 hours of development work

**Recommendation**: Start with the 5 CRITICAL files first (8-10 hours), then tackle HIGH priority (10-12 hours), then MEDIUM as time allows.

---

## CONCLUSION

Your codebase has significant legacy Wagmi/OnchainKit dependencies that are incompatible with CDP embedded wallets. The good news is that migration patterns are straightforward and consistent across all files.

**Next Steps**:
1. Fix the 5 CRITICAL files immediately
2. Test Ron's pod management access
3. Migrate HIGH priority event/governance files
4. Gradually clean up diagnostic/sync tools

**Key Insight**: The `AgreementSigningModal.tsx` we just fixed is one of **8 similar signing files** that all need the same treatment.
