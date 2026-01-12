# sendUserOperation Parameters Fix

## Problem
Role creation was failing with:
```
POST .../smart-accounts/undefined/send 400 (Bad Request)
```

Even though the logs showed both `evmAddress` and `smartAccount` were present!

```
🚀 Creating role via CDP Smart Account:
{evmAddress: '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48', smartAccount: '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48', callsCount: 1}
```

## Root Cause
The `sendUserOperation` function from `@coinbase/cdp-hooks` requires **EXPLICIT parameters** to be passed:
- `evmSmartAccount` - The smart account address to use
- `network` - The network to execute on ('base')
- `useCdpPaymaster` - Enable gas sponsorship

**Without these parameters**, the CDP SDK tries to infer them but fails, resulting in `undefined` in the API endpoint.

## The Correct Pattern (From Working Bounty Files)

```tsx
const smartAccount = currentUser.evmSmartAccounts[0];

const result = await sendUserOperation({
  evmSmartAccount: smartAccount,  // ← MUST specify!
  network: 'base',                 // ← MUST specify!
  calls: [{
    to: contractAddress,
    data: callData,
    value: 0n,
  }],
  useCdpPaymaster: true,          // ← Enable gas sponsorship!
});
```

## Files Fixed

### 1. RoleCreationModal.tsx

**Before:**
```tsx
const response = await sendUserOperation({
  calls: transactionCalls.map((call: any) => ({
    to: call.to,
    data: call.data,
    value: call.value || 0n,
  })),
});
```

**After:**
```tsx
const smartAccount = currentUser.evmSmartAccounts[0];

const response = await sendUserOperation({
  evmSmartAccount: smartAccount,    // ✅ Explicitly pass smart account
  network: 'base',                   // ✅ Specify Base mainnet
  calls: transactionCalls.map((call: any) => ({
    to: call.to,
    data: call.data,
    value: call.value || 0n,
  })),
  useCdpPaymaster: true,            // ✅ Enable gas sponsorship
});
```

### 2. TransactionFlow.tsx (Shopping Cart)

**Before:**
```tsx
const response = await sendUserOperation({
  calls: calls.map((call: any) => ({
    to: call.address,
    data: call.data,
    value: call.value || 0n,
  })),
});
```

**After:**
```tsx
const smartAccount = currentUser.evmSmartAccounts[0];

const response = await sendUserOperation({
  evmSmartAccount: smartAccount,    // ✅ Explicitly pass smart account
  network: 'base',                   // ✅ Specify Base mainnet
  calls: calls.map((call: any) => ({
    to: call.address,
    data: call.data,
    value: call.value || 0n,
  })),
  useCdpPaymaster: true,            // ✅ Enable gas sponsorship
});
```

## Required Parameters Explained

### `evmSmartAccount: string`
- **Required:** Yes
- **Value:** The EVM smart account address (from `currentUser.evmSmartAccounts[0]`)
- **Purpose:** Tells CDP SDK which smart account to use for the transaction
- **Type:** `0x...` hex address string

### `network: string`
- **Required:** Yes
- **Value:** `'base'` (Base mainnet) or `'base-sepolia'` (testnet)
- **Purpose:** Specifies which blockchain network to execute on
- **Type:** String literal

### `calls: Array<{ to, data, value }>`
- **Required:** Yes
- **Value:** Array of transaction calls to execute
- **Purpose:** The actual operations to perform
- **Type:** Array of call objects

### `useCdpPaymaster: boolean`
- **Required:** No (but recommended)
- **Value:** `true`
- **Purpose:** Enable Coinbase gas sponsorship (gasless transactions)
- **Type:** Boolean

## Why This Wasn't Caught Earlier

The bounty files were already correct because they were migrated earlier and followed the exact "faucet pattern" from CDP examples.

When I migrated the RoleCreationModal and shopping cart:
1. I added `useEvmAddress()` and `useCurrentUser()` ✅
2. I validated that both hooks returned values ✅
3. **BUT** I didn't pass those values as parameters to `sendUserOperation` ❌

The CDP SDK **requires explicit parameters** - it doesn't automatically infer them from the hooks context.

## Complete Working Example

```tsx
// 1. Import hooks
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';

// 2. Use hooks
const { evmAddress } = useEvmAddress();
const { sendUserOperation } = useSendUserOperation();
const { currentUser } = useCurrentUser();

// 3. Validate
if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
  console.error('❌ Missing CDP requirements');
  return;
}

const smartAccount = currentUser.evmSmartAccounts[0];

// 4. Execute with ALL required parameters
try {
  const response = await sendUserOperation({
    evmSmartAccount: smartAccount,  // ← Required!
    network: 'base',                 // ← Required!
    calls: [{
      to: '0x...',
      data: '0x...',
      value: 0n,
    }],
    useCdpPaymaster: true,          // ← Recommended!
  });

  console.log('✅ User operation sent successfully!', response);

  // CDP SDK returns userOperationHash, NOT immediate receipt
  const resultWithHash = response as any;
  const txHash = resultWithHash?.userOperationHash;

  if (txHash) {
    console.log('✅ Transaction submitted, hash:', txHash);
    // Use userOperationHash as transaction identifier
    // Receipt will be available later via blockchain indexing
  } else {
    throw new Error('No userOperationHash found in result');
  }
} catch (error) {
  console.error('❌ Transaction failed:', error);
}
```

## Migration Checklist

When migrating any OnchainKit Transaction to CDP, ensure:

- [x] Import `useEvmAddress`, `useSendUserOperation`, `useCurrentUser`
- [x] Use all three hooks in component
- [x] Validate `evmAddress` and `currentUser.evmSmartAccounts[0]` exist
- [x] Extract `smartAccount` from `currentUser.evmSmartAccounts[0]`
- [x] Pass `evmSmartAccount` parameter to `sendUserOperation` ← **CRITICAL!**
- [x] Pass `network: 'base'` parameter ← **CRITICAL!**
- [x] Pass `useCdpPaymaster: true` for gas sponsorship
- [x] Map calls to correct format (`to`, `data`, `value`)
- [x] Access `response.userOperationHash` (NOT `response.receipt` or `response.wait()`) ← **CRITICAL!**

## Comparison: Wrong vs Right

### ❌ WRONG (Missing Parameters)
```tsx
await sendUserOperation({
  calls: [{ to, data, value }]
});
// Result: POST .../smart-accounts/undefined/send 400
```

### ✅ RIGHT (All Parameters)
```tsx
await sendUserOperation({
  evmSmartAccount: smartAccount,
  network: 'base',
  calls: [{ to, data, value }],
  useCdpPaymaster: true,
});
// Result: POST .../smart-accounts/0x.../send 200
```

## CDP Response Structure

The CDP `sendUserOperation` returns a **different response format** than viem or ethers:

### ❌ DON'T use `.wait()` (viem/ethers pattern)
```tsx
const response = await sendUserOperation({...});
await response.wait(); // ❌ This doesn't exist!
```

### ❌ DON'T expect immediate `.receipt` (viem pattern)
```tsx
const response = await sendUserOperation({...});
const receipt = response.receipt; // ❌ Not immediately available!
```

### ✅ DO use `.userOperationHash` (CDP pattern)
```tsx
const response = await sendUserOperation({...});

// CDP SDK returns userOperationHash, NOT immediate receipt
const resultWithHash = response as any;
const txHash = resultWithHash?.userOperationHash;

if (txHash) {
  console.log('Transaction submitted:', txHash);
  // Use userOperationHash as transaction identifier
  // Receipt will be available later via blockchain indexing
}
```

**Why:** CDP Smart Accounts use ERC-4337 UserOperations. The transaction is submitted immediately with a `userOperationHash`, but the receipt is not available until the bundler processes the operation and it's included in a block. For most use cases, the `userOperationHash` serves as the transaction identifier.

## Testing

After this fix, role creation should work. Expected logs:

```
🚀 Creating role via CDP Smart Account:
{evmAddress: '0x...', smartAccount: '0x...', callsCount: 1}

POST .../smart-accounts/0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48/send 200 (OK)

✅ User operation sent successfully! {userOperationHash: '0x...'}
✅ Role creation submitted, userOperationHash: 0x...
```

Note:
- The URL now has the **actual address** instead of `undefined`!
- Response contains `userOperationHash`, not `receipt`
- The `userOperationHash` serves as the transaction identifier

## Status
✅ **FIXED** - Added all required parameters to `sendUserOperation`
✅ **PATTERN** - Now matches working bounty files exactly
✅ **READY** - Role creation should work now

---

**Fixed:** January 2026
**Issue:** `sendUserOperation` receiving undefined smart account
**Root Cause:** Missing `evmSmartAccount` and `network` parameters
**Solution:** Explicitly pass all required parameters to CDP SDK
**Pattern:** Always follow the bounty file pattern for CDP transactions
