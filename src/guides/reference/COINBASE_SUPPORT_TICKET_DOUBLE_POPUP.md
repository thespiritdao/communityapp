# Coinbase OnchainKit Support Ticket: Double Wallet Popup Issue

**Date**: 2025-11-12
**Issue**: Duplicate wallet popup appearing after successful transaction
**Severity**: Medium (UX issue, transactions do complete successfully)
**OnchainKit Version**: Check `package.json` for exact version
**Chain**: Base Sepolia (chainId: 84532)

---

## Issue Description

After successfully completing a sponsored transaction in OnchainKit's `<Transaction>` component, a second wallet popup appears with a "Popup was blocked / Retry" error message. The blockchain state is correct (transaction succeeded), but the UX is confusing for users.

### Expected Behavior
1. User approves Transaction 1 (HAT creation) ✅
2. Transaction 1 completes successfully ✅
3. Transaction 2 (Proxy deployment) automatically triggers ✅
4. User approves Transaction 2 ✅
5. Transaction 2 completes successfully ✅
6. Flow moves to next phase ✅

### Actual Behavior
1. User approves Transaction 1 (HAT creation) ✅
2. Transaction 1 completes successfully ✅
3. Transaction 2 (Proxy deployment) automatically triggers ✅
4. User approves Transaction 2 ✅
5. Transaction 2 completes successfully ✅
6. **🚫 Unexpected third popup appears with "Popup was blocked / Retry"**
7. Flow eventually continues (transactions are on-chain)

---

## Technical Details

### Transaction Flow Setup

**Sequential transactions using OnchainKit Transaction component**:

```typescript
// Transaction 1: HAT Creation
{!hatCreationComplete && !podCreated && (
  <Transaction
    account={address}
    chainId={base.id}
    calls={[transactionCalls[0]]}
    isSponsored={true}
    onStatus={handleHatCreationStatus}
    onError={handleHatCreationError}
  >
    <TransactionButton text="Create Pod" />
    <TransactionSponsor />
    <TransactionStatus>
      <TransactionStatusLabel />
      <TransactionStatusAction />
    </TransactionStatus>
  </Transaction>
)}

// Transaction 2: Proxy Deployment
{hatCreationComplete && !proxyDeploymentComplete && !podCreated && transactionCalls.length > 1 && (
  <Transaction
    account={address}
    chainId={base.id}
    calls={[transactionCalls[1]]}
    isSponsored={true}
    onStatus={handleProxyDeploymentStatus}
    onError={handleProxyDeploymentError}
  >
    <TransactionButton text="Deploy Proxy" />
    <TransactionSponsor />
    <TransactionStatus>
      <TransactionStatusLabel />
      <TransactionStatusAction />
    </TransactionStatus>
  </Transaction>
)}
```

### State Management

```typescript
const [hatCreationComplete, setHatCreationComplete] = useState(false);
const [proxyDeploymentComplete, setProxyDeploymentComplete] = useState(false);
const [podCreated, setPodCreated] = useState(false);
const [transactionCalls, setTransactionCalls] = useState<any[]>([]);

const prepareTransactionCalls = async () => {
  // Guard to prevent duplicate calls
  if (podCreated) {
    console.warn('🚫 Pod already created — skipping transaction rebuild.');
    return;
  }

  // Build transaction calls
  const calls = [
    { /* HAT creation call */ },
    { /* Proxy deployment call */ }
  ];

  setTransactionCalls(calls);
  setShowTransaction(true);
};

const handleProxyDeploymentStatus = (status: any) => {
  if (status.statusName === 'success') {
    setProxyDeploymentComplete(true);
    setPodCreated(true); // Prevent rebuilds
    // Move to next phase...
  }
};
```

### Attempted Fixes

We've implemented multiple guards to prevent transaction rebuild:

1. **Early return guard in prepareTransactionCalls()**:
   ```typescript
   if (podCreated) {
     console.warn('🚫 Pod already created — skipping transaction rebuild.');
     return;
   }
   ```

2. **Removed state reset** that was allowing re-execution:
   ```typescript
   // ❌ REMOVED: setPodCreated(false);
   ```

3. **Conditional rendering with guards**:
   ```typescript
   {!hatCreationComplete && !podCreated && (
   {hatCreationComplete && !proxyDeploymentComplete && !podCreated && (
   ```

4. **State flags to prevent re-renders**:
   - `podCreated` flag set after success
   - `hatCreationComplete` flag for sequential flow
   - `proxyDeploymentComplete` flag for completion

### Console Output Pattern

```
✅ Transaction 1 (HAT creation): success
✅ Transaction 2 (Proxy deployment): success
🔄 Component re-renders with new state
🚫 OnchainKit detects "new" transaction call set
🚫 Wallet popup opens with already-spent nonce
❌ "Popup was blocked / Retry" error shown
```

---

## Environment

- **Framework**: Next.js 15.x (App Router)
- **Chain**: Base Sepolia (84532)
- **Wallet**: Coinbase Smart Wallet
- **Transaction Type**: Sponsored (via Coinbase Paymaster)
- **OnchainKit Version**: [Check package.json]

### Relevant Dependencies

```json
{
  "@coinbase/onchainkit": "^version",
  "viem": "^version",
  "wagmi": "^version",
  "next": "^version",
  "react": "^version"
}
```

---

## Suspected Root Causes

### 1. OnchainKit Internal State Management
OnchainKit may be caching transaction state keyed by `{chainId, address, callDataHash}`. When the component re-renders with the same `transactionCalls` array (even if it's a new reference), OnchainKit might interpret this as a pending transaction requiring wallet approval.

### 2. Transaction Call Reference Equality
The `transactionCalls` array might be getting recreated with the same content, causing OnchainKit to think it's a new transaction set despite the blockchain state being correct.

### 3. Race Condition in State Updates
Multiple state updates (`setProxyDeploymentComplete`, `setPodCreated`, state transitions) happening near-simultaneously might be causing OnchainKit to process a stale transaction call set before the guards take effect.

---

## Questions for Coinbase Support

1. **Transaction Component Lifecycle**: Does OnchainKit cache transaction requests internally? If so, what's the cache key and invalidation strategy?

2. **Sequential Transaction Pattern**: What's the recommended pattern for sequential sponsored transactions in OnchainKit? Should we:
   - Use single Transaction with multiple calls?
   - Use multiple Transaction components conditionally rendered?
   - Clear/reset some internal state between transactions?

3. **State Management Best Practices**: How should we prevent OnchainKit from re-triggering wallet popups when:
   - Transaction completed successfully on-chain
   - Component re-renders due to state changes
   - Same transaction calls are in state but shouldn't be re-executed

4. **Transaction Call Memoization**: Should we be memoizing the `calls` array or using a different approach to prevent OnchainKit from treating re-renders as new transaction requests?

5. **Cleanup Required**: Is there a cleanup function or state reset we should call after transaction success to prevent duplicate popups?

---

## Workarounds Considered

### Option 1: Clear Transaction Calls After Success
```typescript
const handleProxyDeploymentStatus = (status: any) => {
  if (status.statusName === 'success') {
    setTransactionCalls([]); // Clear calls
    setProxyDeploymentComplete(true);
    setPodCreated(true);
  }
};
```

**Result**: Untested, may help if OnchainKit checks for empty calls array.

### Option 2: Unmount Transaction Component
```typescript
{showTransaction && !podCreated && (
  <Transaction ... />
)}
```

**Result**: Already implemented, issue persists.

### Option 3: Use Single Transaction for Both Calls
```typescript
<Transaction
  calls={[hatCall, proxyCall]} // Both at once
  ...
/>
```

**Result**: Not compatible with our use case (need sequential execution with state updates between).

---

## Current Impact

- **User Experience**: Confusing "retry" popup appears but can be dismissed
- **Functionality**: ✅ All transactions complete successfully on-chain
- **Frequency**: 100% reproducible in pod creation flow
- **Blocking**: No - transactions work, just poor UX

---

## Reproduction Steps

1. Set up OnchainKit Transaction component with sequential flow
2. Create two transaction calls in state
3. Render first Transaction component conditionally
4. On first transaction success, update state to show second Transaction
5. On second transaction success, update state to move to next phase
6. Observe: Third wallet popup appears despite transactions being complete

---

## Additional Context

This issue appeared in a pod creation flow where we deploy:
1. A Hats Protocol HAT (ERC1155)
2. A custom authorization proxy contract

Both transactions complete successfully and are visible on Base Sepolia explorer. The third popup appears to be attempting to re-submit the proxy deployment transaction with an already-used nonce.

---

## Requested Assistance

1. Confirm if this is a known issue in OnchainKit
2. Provide recommended pattern for sequential sponsored transactions
3. Suggest OnchainKit-specific state management to prevent duplicate popups
4. Review our implementation and suggest improvements

---

## Contact Information

[Your contact details]

**Repository**: [If you want to share repo access]
**Live Demo**: [If you have a deployed version]

---

## Priority

**Medium** - Transactions work correctly, but UX is degraded. Would like to resolve for production deployment.
