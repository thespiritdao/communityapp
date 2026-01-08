# CDP Transaction Debugging Journey

## Complete Error Progression & Solutions

This document chronicles the complete debugging process for CDP Embedded Wallets integration.

---

## Error #1: "Chain undefined is not supported by the CDP APIs"

**Cause**: Missing network parameter for API routing

**Fix**: Added `network: 'base'`

```typescript
await sendEvmTransaction({
  network: 'base', // ✅ Added
  transaction: transactionObj,
});
```

**Learning**: CDP needs explicit network string for API endpoint routing, separate from chainId.

---

## Error #2: "EVM account not found"

**Cause**: Manually passing `evmAccount` parameter

**Attempted Fix**: Tried passing `evmAccount: evmAddress`

**Actual Fix**: Removed `evmAccount` parameter entirely

```typescript
// ❌ WRONG
await sendEvmTransaction({
  network: 'base',
  evmAccount: evmAddress, // Don't pass this!
  transaction: transactionObj,
});

// ✅ CORRECT
await sendEvmTransaction({
  network: 'base',
  transaction: transactionObj,
});
```

**Learning**: CDP session manages wallet internally. Don't override what CDP owns.

---

## Error #3: "Cannot infer a transaction type"

**Cause**: Missing transaction type information for viem serialization

**Fix**: Added EIP-1559 fields

```typescript
const transactionObj = {
  // ... other fields
  type: 'eip1559' as const,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 0n,
};
```

**Learning**: Viem needs explicit type info even though CDP handles gas.

---

## Error #4: "Cannot convert undefined to a BigInt" (First occurrence)

**Cause**: Using `gas` field name (viem convention) instead of `gasLimit` (ethers convention)

**Fix**: Changed field name

```typescript
// ❌ WRONG
const transactionObj = {
  gas: 300000n, // Viem naming
};

// ✅ CORRECT
const transactionObj = {
  gasLimit: 300000n, // Ethers naming (CDP follows ethers)
};
```

**Learning**: CDP follows ethers.js naming conventions internally, not viem.

---

## Error #5: "Cannot convert undefined to a BigInt" (Second occurrence)

**Cause**: Missing `chainId` field for BigInt serialization

**Fix**: Added `chainId: 8453n`

```typescript
const transactionObj = {
  to: FAUCET_ADDRESS,
  data,
  value: 0n,
  gasLimit: 300000n,
  chainId: 8453n, // ✅ Added - required for serialization
  type: 'eip1559' as const,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 0n,
};
```

**Learning**:
- `network: 'base'` → API routing/endpoint selection
- `chainId: 8453n` → Transaction serialization layer
- Both are required, serve different purposes

---

## Error #6: "property 'address' is missing" (MOST CONFUSING)

**Cause**: Missing `from` field INSIDE transaction object

**Initial Misinterpretation**: We added `address: evmAddress` at top level

```typescript
// ❌ WRONG ATTEMPT (seemed logical but doesn't work)
await sendEvmTransaction({
  network: 'base',
  address: evmAddress, // This gets ignored!
  transaction: transactionObj,
});
```

**Why This Failed**: CDP follows **ethers.js schema convention**, where the sender address is a field INSIDE the transaction object, not a parameter alongside it.

**The Confusing Part**:
- Error says "property 'address' is missing"
- But CDP actually expects `from` inside transaction
- CDP internally maps `transaction.from` to "address" in schema validation
- Hence the misleading error message

**Actual Fix**: Add `from` INSIDE transaction object

```typescript
// ✅ CORRECT (ethers.js convention)
const transactionObj = {
  from: evmAddress, // ✅ Sender goes INSIDE transaction
  to: FAUCET_ADDRESS,
  data,
  value: 0n,
  gasLimit: 300000n,
  chainId: 8453n,
  type: 'eip1559' as const,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 0n,
};

await sendEvmTransaction({
  network: 'base',
  transaction: transactionObj,
});
```

**Learning**: CDP Embedded Wallets follow **ethers.js transaction schema**, NOT wagmi/viem patterns.

---

## Final Working Pattern (Complete)

```typescript
import { useEvmAddress, useSendEvmTransaction } from '@coinbase/cdp-hooks';
import { encodeFunctionData } from 'viem';

// Get wallet address and transaction function
const { evmAddress } = useEvmAddress();
const { sendEvmTransaction } = useSendEvmTransaction();

// Encode contract call
const data = encodeFunctionData({
  abi: FAUCET_ABI,
  functionName: 'claimTokens',
  args: [],
});

// Build transaction (ethers.js convention)
const transactionObj = {
  from: evmAddress,               // ✅ Sender (inside transaction)
  to: FAUCET_ADDRESS,             // ✅ Contract address
  data,                           // ✅ Encoded function call
  value: 0n,                      // ✅ ETH value (BigInt)
  gasLimit: 300000n,              // ✅ ethers naming (NOT 'gas')
  chainId: 8453n,                 // ✅ Base mainnet (for serialization)
  type: 'eip1559' as const,       // ✅ Transaction type
  maxFeePerGas: 1_000_000_000n,   // ✅ 1 gwei max fee
  maxPriorityFeePerGas: 0n,       // ✅ No tip (paymaster sponsored)
};

// Send transaction (CDP API)
const result = await sendEvmTransaction({
  network: 'base',      // ✅ Network routing
  transaction: transactionObj,
});
```

---

## Key Conceptual Insights

### 1. Schema Convention Mismatch

| Library | Sender Field | Location |
|---------|-------------|----------|
| wagmi/viem | `from` | Top-level parameter |
| ethers.js | `from` | Inside transaction object |
| CDP | `from` | Inside transaction object (follows ethers) |

### 2. Two-Layer Architecture

CDP has two distinct layers that both need configuration:

**Layer 1: API Routing**
- Parameter: `network: 'base'`
- Purpose: Routes request to correct blockchain endpoint
- Location: Top level of `sendEvmTransaction` call

**Layer 2: Transaction Serialization**
- Parameter: `chainId: 8453n`
- Purpose: Viem transaction serialization for BigInt fields
- Location: Inside transaction object

Both are required even though they both identify "Base network".

### 3. Naming Convention Differences

| Field Purpose | Viem | Ethers | CDP Uses |
|--------------|------|--------|----------|
| Gas limit | `gas` | `gasLimit` | `gasLimit` ✅ |
| Transaction type | `type` | `type` | `type` ✅ |
| Sender | `from` | `from` | `from` ✅ |

CDP follows ethers.js naming internally.

### 4. Session vs Parameters

CDP manages wallets through session state:
- ✅ DO use `useEvmAddress()` for display and `from` field
- ❌ DON'T pass `evmAccount` parameter
- ❌ DON'T try to manage wallet connection manually

The session (from `CDPHooksProvider`) handles authentication.

---

## Files Modified

1. **src/app/faucet/page.tsx** - Working reference implementation
2. **src/utils/cdpTransaction.ts** - Reusable helper function
3. **CDP_MIGRATION_GUIDE.md** - Migration instructions
4. **CDP_DEBUGGING_JOURNEY.md** - This document

---

## What Worked vs What Didn't

### ✅ What Worked

- Using CDP hooks directly (`useEvmAddress`, `useSendEvmTransaction`)
- Following ethers.js transaction schema
- Including ALL required fields (`from`, `to`, `data`, `value`, `gasLimit`, `chainId`, `type`, gas fees)
- Using `network: 'base'` for API routing
- Letting CDP session manage wallet state

### ❌ What Didn't Work

- Trying to use wagmi connectors alongside CDP
- Passing `evmAccount` parameter
- Using top-level `address` field
- Using viem naming (`gas` instead of `gasLimit`)
- Omitting `chainId` despite having `network`
- Missing EIP-1559 fields

---

## Testing Checklist

After these fixes, the faucet should:

- [ ] Connect wallet via CDP session
- [ ] Display correct address from `useEvmAddress()`
- [ ] Show "Claim Tokens" button when eligible
- [ ] Build transaction without errors
- [ ] Submit transaction successfully
- [ ] Transaction confirms on Base mainnet
- [ ] User receives SYSTEM + SELF tokens
- [ ] Gas is sponsored (user pays $0)
- [ ] UI updates with new cooldown timer

---

## Next Steps

1. ✅ Fix faucet transaction pattern (COMPLETE)
2. ⏳ Test faucet transaction (PENDING)
3. 📋 Apply pattern to marketplace
4. 📋 Apply pattern to cart checkout
5. 📋 Apply pattern to governance voting

---

## Resources Used

- CDP Hooks Documentation: https://docs.base.org/base-account/framework-integrations/cdp
- OnchainKit Docs: https://onchainkit.xyz
- Ethers.js Transaction Format: https://docs.ethers.org/v6/api/transaction/
- Error logs: `src/features/pods/errors.txt`, `src/features/pods/errors2.txt.txt`

---

**Date**: December 2024
**Status**: Faucet pattern complete, awaiting test confirmation
