# CATEGORY 3: OnchainKit Transaction Migration Plan

**Status**: Ready to Execute
**Files**: 19 total
**Complexity**: HIGH - Each file requires Transaction component → CDP hooks refactor

---

## MIGRATION PATTERN

### OLD (OnchainKit Transaction Component):
```typescript
import { Transaction, TransactionButton, TransactionSponsor, TransactionStatus } from '@coinbase/onchainkit/transaction';

<Transaction
  chainId={base.id}
  calls={contractCalls}
  isSponsored={true}
  onSuccess={(response) => { /* handle success */ }}
  onError={(error) => { /* handle error */ }}
>
  <TransactionButton text="Execute" />
  <TransactionSponsor />
  <TransactionStatus>
    <TransactionStatusLabel />
    <TransactionStatusAction />
  </TransactionStatus>
</Transaction>
```

### NEW (CDP useSendUserOperation):
```typescript
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';

const { sendUserOperation, status, error } = useSendUserOperation();
const { currentUser } = useCurrentUser();

const handleExecute = async () => {
  if (!currentUser?.evmSmartAccounts?.[0]) {
    throw new Error('Smart account not available');
  }

  const result = await sendUserOperation({
    calls: contractCalls.map(call => ({
      to: call.to,
      data: call.data,
      value: call.value || 0n,
    })),
  });

  // Handle success
  console.log('Transaction successful:', result);
};

<button
  onClick={handleExecute}
  disabled={status === 'pending'}
>
  {status === 'pending' ? 'Executing...' : 'Execute'}
</button>
```

---

## FILES TO MIGRATE (19 TOTAL)

### TIER 1: SIMPLE DIAGNOSTIC TOOLS (3 files - START HERE)
Easy migrations, minimal impact if bugs occur.

1. **src/features/pods/components/ProxyHatIdFixer.tsx**
   - Single transaction: setHatIds on proxy
   - No sponsor needed
   - Use: `useSendEvmTransaction()`

2. **src/features/proposals/PaymasterTest.tsx**
   - Test file for paymaster
   - Use: `useSendUserOperation()`

3. **src/features/governance/components/GovernanceDiagnostics.tsx**
   - Governance test transaction
   - Use: `useSendUserOperation()`

### TIER 2: SYNC/ADMIN TOOLS (5 files)
Admin tools, less critical for end users.

4. **src/features/pods/components/PodBlockchainSync.tsx**
   - Sync pod data to blockchain
   - Use: `useSendEvmTransaction()`

5. **src/features/pods/components/PodFactorySync.tsx**
   - Sync pods with factory contract
   - Use: `useSendEvmTransaction()`

6. **src/features/pods/components/PodTreasurySync.tsx**
   - Treasury fund transfers
   - Multiple transactions
   - Use: `useSendUserOperation()`

7. **src/features/pods/components/PodRegistrationManager.tsx**
   - Register pods via PodCreationManager
   - Use: `useSendUserOperation()` (sponsored)

8. **src/features/pods/components/TreasuryManagement.tsx** *(if exists)*
   - Treasury operations
   - Use: `useSendUserOperation()`

### TIER 3: POD MANAGEMENT (4 files)
Core pod management features.

9. **src/app/pods/[id]/manage/components/PodDeletionButton.tsx**
   - HAT deactivation + pod deletion
   - CRITICAL: Used by pod leaders
   - Use: `useSendUserOperation()` (sponsored)

10. **src/features/pods/components/PodDeletionManager.tsx**
    - Pod deletion operations
    - Use: `useSendUserOperation()` (sponsored)

11. **src/features/pods/components/PodDeletionApprovalFlow.tsx**
    - Deletion approval workflow
    - Use: `useSendUserOperation()`

12. **src/features/pods/components/RoleCreationModal.tsx**
    - Create new roles within pod
    - Use: `useSendUserOperation()` (sponsored)

### TIER 4: POD CREATION (2 files)
Pod creation workflows.

13. **src/features/pods/components/HatsModulePodCreationForm.tsx**
    - COMPLEX: Multi-step transactions (HAT creation + proxy deployment)
    - 4500+ lines
    - Deferred to last due to complexity
    - Use: `useSendUserOperation()` for each step

14. **src/features/pods/components/PodManagerControlPanel.tsx**
    - Central control panel with multiple transaction types
    - Complex state management
    - Use: `useSendUserOperation()`

### TIER 5: NFT MINTING (2 files)
NFT operations.

15. **src/nft/components/AdvocateMintCardOnchainKit.tsx**
    - Advocate NFT minting with sponsor
    - Use: `useSendUserOperation()` (sponsored)

16. **src/nft/components/mint/NFTMintButton.tsx**
    - Generic NFT minting
    - Use: `useSendUserOperation()`

### TIER 6: GOVERNANCE (2 files)
Governance proposal creation.

17. **src/app/proposals/page.tsx**
    - Governor proposal creation with proposeWithMetadata
    - CRITICAL: Core governance feature
    - Use: `useSendUserOperation()` (sponsored)

18. **src/components/SafeOnchainKit.tsx**
    - Safe wrapper components with error boundaries
    - Create CDP equivalents
    - May not need migration if unused

### TIER 7: SHOPPING CART (1 file)
E-commerce transactions.

19. **src/features/shopping-cart/components/Cart/CartCheckout/TransactionFlow.tsx**
    - Token approval + purchase flow
    - Multi-step transaction
    - Use: `useSendUserOperation()`

---

## EXECUTION STRATEGY

### Phase 1: Validate Pattern (DONE ✅)
- ✅ `src/app/cdp-test/page.tsx` already uses correct pattern

### Phase 2: Migrate Tier 1 (Diagnostic Tools)
Start with simple, low-risk files to validate migration pattern.

### Phase 3: Migrate Tier 2 (Sync/Admin)
Admin tools - less user-facing impact.

### Phase 4: Migrate Tier 3 (Pod Management)
Core features users interact with daily.

### Phase 5: Migrate Tier 4 (Pod Creation)
Complex multi-step transactions.

### Phase 6: Migrate Tier 5-7 (NFT, Governance, Shopping)
Remaining features.

---

## KEY MIGRATION STEPS (PER FILE)

1. **Add CDP Hooks**
   ```typescript
   import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
   const { sendUserOperation, status, error, data } = useSendUserOperation();
   const { currentUser } = useCurrentUser();
   ```

2. **Remove OnchainKit Transaction Imports**
   ```typescript
   // DELETE:
   import { Transaction, TransactionButton, TransactionSponsor, ... } from '@coinbase/onchainkit/transaction';
   ```

3. **Create Handler Function**
   ```typescript
   const handleTransaction = async () => {
     if (!currentUser?.evmSmartAccounts?.[0]) {
       toast({ title: 'Wallet Not Ready', variant: 'destructive' });
       return;
     }

     try {
       const result = await sendUserOperation({
         calls: calls.map(call => ({
           to: call.to,
           data: call.data,
           value: call.value || 0n,
         })),
       });

       // Success handling
       onSuccess?.(result);
     } catch (err) {
       // Error handling
       onError?.(err);
     }
   };
   ```

4. **Replace JSX**
   ```typescript
   // OLD:
   <Transaction>
     <TransactionButton text="Execute" />
     <TransactionSponsor />
     <TransactionStatus />
   </Transaction>

   // NEW:
   <button
     onClick={handleTransaction}
     disabled={status === 'pending'}
   >
     {status === 'pending' ? '⏳ Processing...' : 'Execute'}
   </button>
   {error && <div className="text-red-600">{error.message}</div>}
   {status === 'success' && <div className="text-green-600">✅ Success!</div>}
   ```

5. **Test Transaction Flow**
   - Wallet connection
   - Transaction execution
   - Success/error states
   - Callback handlers

---

## ESTIMATED TIME

- **Tier 1 (3 files)**: 45-60 min
- **Tier 2 (5 files)**: 90-120 min
- **Tier 3 (4 files)**: 75-90 min
- **Tier 4 (2 files)**: 120-180 min (complex)
- **Tier 5-7 (5 files)**: 90-120 min

**Total**: 7-10 hours for complete migration

---

## SUCCESS CRITERIA

✅ All OnchainKit `Transaction` components removed
✅ All transactions use CDP hooks (`useSendUserOperation` or `useSendEvmTransaction`)
✅ Smart account checks before every transaction
✅ Proper error handling for all flows
✅ Status indicators for pending/success/error states
✅ All callbacks (onSuccess, onError) preserved
✅ Application builds without errors
✅ Manual testing of critical flows (pod management, governance)

---

## READY TO BEGIN

Starting with **Tier 1** (diagnostic tools) to validate the pattern before moving to critical user-facing features.
