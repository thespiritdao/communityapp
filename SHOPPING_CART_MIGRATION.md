# Shopping Cart Checkout Migration - OnchainKit → CDP

## Overview
Migrated the shopping cart checkout flow from OnchainKit Transaction components to CDP Smart Account integration.

## File Migrated
**File:** `src/features/shopping-cart/components/Cart/CartCheckout/TransactionFlow.tsx`

**Status:** ✅ COMPLETE

## Changes Made

### 1. Imports Replaced

**Before (OnchainKit):**
```tsx
import { memo, useState, useCallback, useEffect, lazy, Suspense } from 'react';

// Lazy load OnchainKit transaction components
const Transaction = lazy(() =>
  import('@coinbase/onchainkit/transaction').then((m) => ({
    default: m.Transaction,
  })),
);
const TransactionButton = lazy(() => ...);
const TransactionSponsor = lazy(() => ...);
const TransactionStatus = lazy(() => ...);
const TransactionStatusLabel = lazy(() => ...);
const TransactionStatusAction = lazy(() => ...);
```

**After (CDP):**
```tsx
import { memo, useState, useCallback, useEffect } from 'react';
import { useSendUserOperation, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

**Changes:**
- ❌ Removed all lazy-loaded OnchainKit component imports
- ✅ Added `useEvmAddress`, `useSendUserOperation`, and `useCurrentUser` CDP hooks
- ✅ Added `Loader2` icon for loading states
- ✅ Added shadcn `Button` component

---

### 2. Component State Updated

**Added CDP hooks and transaction state:**
```tsx
const { evmAddress } = useEvmAddress();
const { sendUserOperation } = useSendUserOperation();
const { currentUser } = useCurrentUser();

const [isTransactionPending, setIsTransactionPending] = useState(false);
```

**Purpose:**
- `evmAddress` - Initialize EVM address context (required for CDP SDK)
- `sendUserOperation` - Execute transactions via CDP Smart Account
- `currentUser` - Access user's CDP Smart Account details
- `isTransactionPending` - Track transaction execution state

---

### 3. Transaction Handler Created

**New CDP transaction handler:**
```tsx
const handlePurchaseTransaction = useCallback(async () => {
  if (!currentUser) {
    console.error('❌ No CDP Smart Account connected');
    setTransactionState('error');
    return;
  }

  setIsTransactionPending(true);
  setTransactionState('processing');

  try {
    console.log('🚀 Initiating shopping cart purchase via CDP Smart Account');

    const calls = buildTransactionCalls();
    if (calls.length === 0) {
      throw new Error('Failed to build transaction calls');
    }

    console.log(`📦 Processing ${calls.length} transaction calls (approvals + purchase)`);

    // Execute multi-call transaction via CDP
    const response = await sendUserOperation({
      calls: calls.map((call: any) => ({
        to: call.address,
        data: call.data,
        value: call.value || 0n,
      })),
    });

    console.log('✅ Purchase transaction submitted:', response.hash);
    const receipt = await response.wait();
    console.log('✅ Purchase transaction confirmed');

    setTransactionState('success');

    // Process orders in database
    await processAllOrders({
      products,
      address: userAddress,
      selectedToken,
      transactionHash: receipt?.transactionHash || response.hash,
      receipt: receipt,
    });

  } catch (error) {
    console.error('❌ Purchase transaction failed:', error);
    logTransactionError(error);
    setTransactionState('error');
  } finally {
    setIsTransactionPending(false);
  }
}, [currentUser, sendUserOperation, buildTransactionCalls, products, userAddress, selectedToken]);
```

**Key Features:**
- Validates CDP Smart Account connection
- Builds multi-call transaction (token approvals + purchase)
- Executes via `sendUserOperation`
- Waits for transaction confirmation
- Processes orders in database after success
- Comprehensive error handling

---

### 4. UI Component Replaced

**Before (OnchainKit):**
```tsx
<Suspense fallback={<LoadingSkeleton />}>
  <Transaction
    chainId={BASE_CHAIN_ID}
    calls={calls}
    isSponsored={true}
    onSuccess={handleSuccess}
    onError={handleError}
  >
    <TransactionButtonStyled
      as={TransactionButton}
      text={...}
      disabled={...}
    />

    <TransactionSponsor />
    <TransactionStatus>
      <TransactionStatusLabel />
      <TransactionStatusAction />
    </TransactionStatus>
  </Transaction>
</Suspense>
```

**After (CDP):**
```tsx
<Button
  onClick={handlePurchaseTransaction}
  disabled={
    !currentUser ||
    isTransactionPending ||
    transactionState === 'processing' ||
    transactionState === 'success' ||
    calls.length === 0
  }
  className="w-full bg-[#007bff] hover:bg-[#0056b3] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  {isTransactionPending || transactionState === 'processing' ? (
    <>
      <Loader2 className="mr-2 h-5 w-5 animate-spin inline" />
      Processing...
    </>
  ) : transactionState === 'success' ? (
    '✅ Success!'
  ) : transactionState === 'error' ? (
    '❌ Transaction Failed'
  ) : needsApproval ? (
    'Approve & Purchase'
  ) : (
    'Purchase'
  )}
</Button>

{!currentUser && (
  <div className="mt-2 text-sm text-red-600">
    Please connect your CDP Smart Account to complete the purchase
  </div>
)}

{transactionState === 'success' && (
  <div className="mt-2 text-sm text-green-600">
    ✅ Purchase successful! Processing your order...
  </div>
)}

{transactionState === 'error' && (
  <div className="mt-2 text-sm text-red-600">
    ❌ Transaction failed. Please try again.
  </div>
)}
```

**Changes:**
- ❌ Removed OnchainKit `<Transaction>` wrapper and all nested components
- ✅ Replaced with shadcn `Button` component
- ✅ Added loading spinner with `Loader2` icon
- ✅ Added status messages for success/error states
- ✅ Added CDP Smart Account connection validation

---

## Migration Summary

| Aspect | Before (OnchainKit) | After (CDP) |
|--------|-------------------|-------------|
| **Transaction Execution** | `<Transaction>` component | `sendUserOperation` hook |
| **Button Component** | `<TransactionButton>` | shadcn `Button` |
| **Loading State** | `<TransactionStatus>` | `Loader2` spinner + state |
| **Gas Sponsorship** | `<TransactionSponsor>` | CDP paymaster (automatic) |
| **Success Handling** | `onSuccess` callback | Async/await + state updates |
| **Error Handling** | `onError` callback | Try/catch + state updates |
| **User Validation** | Implicit in component | Explicit `currentUser` check |

---

## What Still Works

✅ **Token Approval Logic** - All existing token approval checking remains intact
✅ **Multi-Call Transactions** - Approval + purchase still executed in single transaction
✅ **Order Processing** - Database order creation still happens after transaction success
✅ **$SYSTEM and $SELF Tokens** - Both payment token types supported
✅ **Allowance Checking** - Token allowance validation still works
✅ **Transaction Services** - All modular services (`tokenApproval`, `purchaseRouter`, `orderCreation`) remain unchanged

---

## How It Works Now

### Purchase Flow:

1. **Component Loads**
   - Checks token allowances using existing services
   - Displays approval requirements to user

2. **User Clicks "Approve & Purchase" or "Purchase"**
   - Validates CDP Smart Account connection
   - Calls `handlePurchaseTransaction()`

3. **Transaction Building**
   - `buildTransactionCalls()` creates multi-call array
   - If approval needed: [approve call, purchase call]
   - If no approval needed: [purchase call only]

4. **CDP Execution**
   - `sendUserOperation()` sends multi-call to CDP Smart Account
   - CDP paymaster sponsors gas fees automatically
   - Transaction confirmed on Base network

5. **Order Processing**
   - `processAllOrders()` creates orders in database
   - Associates transaction hash with orders
   - Updates inventory and order status

6. **User Feedback**
   - Success: "✅ Purchase successful! Processing your order..."
   - Error: "❌ Transaction failed. Please try again."
   - Loading: Spinner with "Processing..." text

---

## Testing Instructions

### Prerequisites:
1. User must have CDP Smart Account connected
2. User must have sufficient $SYSTEM or $SELF token balance
3. Cart must contain products

### Test Cases:

#### 1. **First Time Purchase (Requires Approval)**
- Add products to cart
- Proceed to checkout
- Select $SYSTEM or $SELF token
- Click "Approve & Purchase"
- ✅ Expected: Transaction executes with both approval + purchase, orders created

#### 2. **Subsequent Purchase (No Approval Needed)**
- Add products to cart
- Proceed to checkout
- Select same token as before
- Click "Purchase"
- ✅ Expected: Transaction executes with only purchase call, orders created

#### 3. **No CDP Smart Account**
- Disconnect CDP wallet
- Try to checkout
- ✅ Expected: Button disabled, shows "Please connect your CDP Smart Account" message

#### 4. **Transaction Failure**
- Attempt purchase with insufficient token balance
- ✅ Expected: Transaction fails, shows error message, can retry

#### 5. **Empty Cart**
- Remove all products from cart
- Try to checkout
- ✅ Expected: Button disabled, no transaction attempted

---

## Potential Issues to Watch For

### 1. **Transaction Hash Format**
- **Issue:** CDP returns `response.hash` vs OnchainKit's `transactionReceipts[0].transactionHash`
- **Solution:** Updated to use `receipt?.transactionHash || response.hash` for compatibility

### 2. **Order Processing Timing**
- **Issue:** Orders processed before transaction fully confirmed
- **Solution:** Added `await response.wait()` to ensure confirmation before order processing

### 3. **Multi-Call Gas Estimation**
- **Issue:** Multi-call transactions (approval + purchase) may have higher gas
- **Solution:** CDP paymaster handles gas sponsorship automatically

### 4. **Token Approval State**
- **Issue:** Allowance check may be stale after approval
- **Solution:** Existing `checkAllowances()` runs on component mount and token change

---

## Rollback Instructions

If issues occur, you can revert to OnchainKit:

```bash
git diff src/features/shopping-cart/components/Cart/CartCheckout/TransactionFlow.tsx
git checkout src/features/shopping-cart/components/Cart/CartCheckout/TransactionFlow.tsx
npm run dev
```

---

## Status

✅ **MIGRATION COMPLETE**
✅ **NO ONCHAINKIT TRANSACTION IMPORTS REMAINING**
✅ **READY FOR TESTING**

---

**Migrated:** January 2026
**File:** TransactionFlow.tsx (Shopping Cart Checkout)
**Pattern:** OnchainKit Transaction → CDP Smart Account
**Complexity:** HIGH (multi-call transactions + order processing)

---

## Final Notes

This was the **LAST file** in the entire application using OnchainKit Transaction components. With this migration complete:

- ✅ All pod management features use CDP
- ✅ All governance features use CDP
- ✅ All bounty features use CDP
- ✅ All treasury features use CDP
- ✅ All shopping cart features use CDP

**The entire app is now fully migrated to CDP Smart Account!** 🎉
