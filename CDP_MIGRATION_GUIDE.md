# CDP Transaction Pattern Migration Guide

## Overview

This guide documents the **correct pattern** for sending transactions with CDP Embedded Wallets, based on the working implementation in `src/app/faucet/page.tsx`.

## The Problem

CDP Embedded Wallets use a **dual-layer architecture** that requires BOTH top-level AND transaction-level fields:

### Dual-Layer Requirements

**Layer 1: CDP API Authentication**
- `address` at TOP LEVEL → Session binding, paymaster application, account lookup

**Layer 2: Ethereum Transaction (ethers.js style)**
- `from` INSIDE transaction → Ethereum transaction sender field
- `gasLimit` (NOT `gas`) → Ethers naming convention
- `chainId` → BigInt serialization
- EIP-1559 fields → Transaction type specification

### Critical Insight

**BOTH `address` (top-level) AND `from` (inside transaction) are REQUIRED!**

They serve different purposes:
- `address` = Who is sending (CDP session layer)
- `from` = How the Ethereum tx is constructed (transaction layer)

## The Working Pattern

### ✅ Correct Implementation (from `src/app/faucet/page.tsx`)

```typescript
import { useEvmAddress, useSendEvmTransaction } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';

// Inside component
const { evmAddress } = useEvmAddress();
const { sendEvmTransaction } = useSendEvmTransaction();

// Encode function call
const data = encodeFunctionData({
  abi: CONTRACT_ABI,
  functionName: 'myFunction',
  args: [arg1, arg2],
});

// Build transaction object (ethers.js convention)
const transactionObj = {
  from: evmAddress,         // ✅ REQUIRED: Inside transaction (Ethereum layer)
  to: CONTRACT_ADDRESS,
  data,
  value: 0n,
  gasLimit: 300000n,        // NOT 'gas'
  chainId: 8453n,           // Required for BigInt serialization
  type: 'eip1559' as const,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 0n,
};

// Send via CDP API (DUAL-LAYER SCHEMA)
const result = await sendEvmTransaction({
  network: 'base',                // API routing
  address: evmAddress,            // ✅ REQUIRED: Top-level (CDP API layer)
  transaction: transactionObj,    // Contains 'from' (Ethereum layer)
});
```

### The Dual-Layer Explained

```typescript
sendEvmTransaction({
  // ---- Layer 1: CDP API ----
  network: 'base',       // Which blockchain network
  address: evmAddress,   // Which embedded wallet session

  // ---- Layer 2: Ethereum Transaction ----
  transaction: {
    from: evmAddress,    // Transaction sender (ethers.js)
    to: '0x...',         // Transaction recipient
    data: '0x...',       // Encoded function call
    // ... gas fields, etc.
  }
});
```

### ❌ Common Mistakes to Avoid

```typescript
// ❌ WRONG: Using top-level 'address' field (wagmi pattern)
await sendEvmTransaction({
  network: 'base',
  address: evmAddress,     // ERROR: "property 'address' is missing"
  transaction: transactionObj, // (CDP ignores top-level address, expects 'from' inside)
});

// ❌ WRONG: Missing 'from' inside transaction
const transactionObj = {
  to: CONTRACT_ADDRESS,
  data,
  // Missing: from: evmAddress
  // ERROR: "property 'address' is missing" (confusing error message!)
};

// ❌ WRONG: Using 'evmAccount' parameter
await sendEvmTransaction({
  network: 'base',
  evmAccount: evmAddress,  // ERROR: "EVM account not found"
  transaction: transactionObj,
});

// ❌ WRONG: Using 'gas' instead of 'gasLimit'
const transactionObj = {
  from: evmAddress,
  to: CONTRACT_ADDRESS,
  data,
  gas: 300000n,  // ERROR: "Cannot convert undefined to BigInt"
  // Should be: gasLimit: 300000n
};

// ❌ WRONG: Missing chainId
const transactionObj = {
  from: evmAddress,
  to: CONTRACT_ADDRESS,
  data,
  gasLimit: 300000n,
  // Missing: chainId: 8453n
  // ERROR: "Cannot convert undefined to BigInt"
};

// ❌ WRONG: Missing EIP-1559 fields
const transactionObj = {
  from: evmAddress,
  to: CONTRACT_ADDRESS,
  data,
  gasLimit: 300000n,
  chainId: 8453n,
  // Missing: type, maxFeePerGas, maxPriorityFeePerGas
  // ERROR: "Cannot infer transaction type"
};
```

## Using the Helper Function

For cleaner code, use the `buildCDPTransaction` helper:

```typescript
import { buildCDPTransaction } from '@/utils/cdpTransaction';
import { useEvmAddress, useSendEvmTransaction } from '@coinbase/cdp-hooks';

const { evmAddress } = useEvmAddress();
const { sendEvmTransaction } = useSendEvmTransaction();

// Build transaction params
const params = buildCDPTransaction({
  senderAddress: evmAddress,
  contractAddress: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  functionName: 'myFunction',
  args: [arg1, arg2],
  value: 0n, // optional, default 0n
  gasLimit: 300000n, // optional, default 300000n
});

// Send transaction
const result = await sendEvmTransaction(params);
```

## Migration Checklist

### Routes to Migrate

- [ ] `/faucet` - ✅ COMPLETE (reference implementation)
- [ ] `/marketplace` - Purchase items
- [ ] `/cart` - Checkout flow
- [ ] `/governance` - Vote on proposals
- [ ] Any other transaction flows

### Migration Steps

1. **Import CDP Hooks**
   ```typescript
   import { useEvmAddress, useSendEvmTransaction } from '@coinbase/cdp-hooks';
   ```

2. **Get Address and Transaction Function**
   ```typescript
   const { evmAddress } = useEvmAddress();
   const { sendEvmTransaction } = useSendEvmTransaction();
   ```

3. **Use Helper Function**
   ```typescript
   import { buildCDPTransaction } from '@/utils/cdpTransaction';

   const params = buildCDPTransaction({
     senderAddress: evmAddress,
     contractAddress: YOUR_CONTRACT,
     abi: YOUR_ABI,
     functionName: 'yourFunction',
     args: yourArgs,
   });

   const result = await sendEvmTransaction(params);
   ```

4. **Remove Old Wagmi Write Hooks**
   - Remove `useContractWrite`
   - Remove `useWaitForTransaction`
   - Remove wagmi connector logic for transactions

5. **Update Error Handling**
   ```typescript
   try {
     const result = await sendEvmTransaction(params);
     console.log('✅ Transaction successful:', result);
   } catch (err: any) {
     console.error('❌ Transaction failed:', err);
     // Handle error
   }
   ```

## Key Concepts

### Session Management

CDP manages wallet state through the session (established via `CDPHooksProvider`). You don't need to:
- Pass `evmAccount` manually
- Manage wallet connection state
- Handle wallet switching

Just use `evmAddress` from `useEvmAddress()` hook.

### Gas Sponsorship

Paymaster is configured in `CDPEmbeddedProvider.tsx` via OnchainKit:

```typescript
paymaster: process.env.NEXT_PUBLIC_PAYMASTER
```

Transactions are automatically sponsored - users don't pay gas fees.

### Network Configuration

Network is configured in `CDPEmbeddedProvider.tsx`:

```typescript
ethereum: {
  createOnLogin: 'smart' as const,
  networks: [{
    chainId: base.id, // 8453
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0],
  }],
}
```

Always use `network: 'base'` in transaction calls.

### Transaction Type

Always use EIP-1559 transactions:

```typescript
type: 'eip1559' as const,
maxFeePerGas: 1_000_000_000n,      // 1 gwei
maxPriorityFeePerGas: 0n,          // No tip needed with paymaster
```

## Testing Checklist

After migrating a route:

- [ ] Wallet connects properly (CDP session active)
- [ ] Transaction builds without errors
- [ ] Transaction submits successfully
- [ ] Transaction confirms on-chain
- [ ] UI updates after confirmation
- [ ] Error states handled gracefully
- [ ] Loading states work correctly
- [ ] Gas is sponsored (user pays $0)

## Common Issues

### "property 'address' is missing"
**The Error**: Most confusing CDP error - requires DUAL-LAYER addressing!

**Root Cause**: CDP requires BOTH:
1. `address` at top level (CDP API session binding)
2. `from` inside transaction (Ethereum transaction structure)

Missing either one causes this error.

**Fix**: Include BOTH fields (they serve different purposes)
```typescript
// ✅ CORRECT (DUAL-LAYER)
const transactionObj = {
  from: evmAddress,  // ✅ Ethereum transaction sender
  to: CONTRACT_ADDRESS,
  // ... rest of fields
};

await sendEvmTransaction({
  network: 'base',
  address: evmAddress,     // ✅ CDP API session binding
  transaction: transactionObj,
});

// ❌ WRONG: Missing top-level 'address'
await sendEvmTransaction({
  network: 'base',
  transaction: transactionObj,  // Has 'from' but no top-level 'address'
});

// ❌ WRONG: Missing 'from' inside transaction
await sendEvmTransaction({
  network: 'base',
  address: evmAddress,
  transaction: {
    to: CONTRACT_ADDRESS,  // Missing 'from' field
    // ...
  },
});
```

**Why Both Are Needed**:
- `address` → CDP uses this to bind request to your embedded wallet session and apply paymaster
- `from` → Ethereum transaction structure requires sender field (ethers.js convention)

### "Cannot convert undefined to BigInt"
**Fix**: Add `chainId: 8453n` to transaction object AND ensure all BigInt fields are present (`value`, `gasLimit`, etc.)

### "Cannot infer transaction type"
**Fix**: Add EIP-1559 fields (`type: 'eip1559'`, `maxFeePerGas`, `maxPriorityFeePerGas`)

### "EVM account not found"
**Fix**: Remove `evmAccount` parameter entirely - CDP uses session internally

### "Chain undefined is not supported"
**Fix**: Add `network: 'base'` to `sendEvmTransaction` call

## Resources

- **Working Example**: `src/app/faucet/page.tsx`
- **Helper Function**: `src/utils/cdpTransaction.ts`
- **CDP Provider**: `src/wallet/components/CDPEmbeddedProvider.tsx`
- **CDP Hooks Docs**: https://docs.base.org/base-account/framework-integrations/cdp
- **OnchainKit Docs**: https://onchainkit.xyz

## Support

If you encounter issues:

1. Check the debug logs (all working transactions log their field types)
2. Compare against `src/app/faucet/page.tsx` working implementation
3. Use `validateCDPTransactionParams()` helper to check params
4. Review error messages carefully - CDP API errors are usually explicit

---

**Note**: This pattern was established through iterative debugging and represents the **definitive correct approach** for CDP Embedded Wallets on Base mainnet as of December 2024.
