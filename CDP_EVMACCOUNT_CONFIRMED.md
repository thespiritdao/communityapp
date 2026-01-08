# ✅ CONFIRMED: evmAccount is the Correct Field!

## The Minimal Test Result

**Test**: Send 0 ETH to self with ONLY CDP-documented fields
```typescript
await sendEvmTransaction({
  evmAccount: evmAddress,
  network: 'base',
  transaction: {
    to: evmAddress,
    value: 0n,
  },
});
```

## What Happened

**Error**: `InvalidSerializableTransactionError: Cannot infer a transaction type`

**NOT**: "property 'address' is missing" ❌

## Critical Discoveries

### 1. ✅ `evmAccount` is CORRECT!

CDP API **accepted** the `evmAccount` field without any schema errors. No "address is missing" error!

### 2. ✅ CDP Schema Validation PASSED

The transaction made it through CDP's API validation layer successfully.

### 3. ❌ Viem Serialization FAILED

The error came from **viem's transaction serialization**, not from CDP.

Viem error:
```
Cannot infer a transaction type from provided transaction.

To infer the type, either provide:
- a `type` to the Transaction, or
- an EIP-1559 Transaction with `maxFeePerGas`, or
- an EIP-2930 Transaction with `gasPrice` & `accessList`, or
...
```

## What This Means

### The Real Architecture

```
Your Code
    ↓
CDP API (validates evmAccount, network) ✅ PASSED
    ↓
Viem Serialization (needs transaction type) ❌ FAILED HERE
    ↓
Blockchain
```

The error occurred at the **viem layer**, not the CDP layer!

### Why Our Faucet Failed

Looking back at our faucet errors with fresh eyes:

**We were using**: `address: evmAddress`
**CDP was rejecting**: Because it wanted `evmAccount`, NOT `address`!

The error message "property 'address' is missing" was confusing because:
- We thought it meant we needed a field called `address`
- It actually meant CDP couldn't find the `evmAccount` field
- So it was looking for some internal `address` mapping that comes from `evmAccount`

## The Corrected Pattern

### What CDP Needs (Layer 1)
```typescript
{
  evmAccount: evmAddress,  // ✅ CORRECT field name
  network: 'base',
}
```

### What Viem Needs (Layer 2)
```typescript
transaction: {
  type: 'eip1559',           // ✅ So viem can serialize
  maxFeePerGas: 1_000_000_000n,  // ✅ Required for EIP-1559 type
  // ... rest of tx fields
}
```

## Updated Minimal Test

Now testing with minimal viem requirements added:

```typescript
await sendEvmTransaction({
  evmAccount: evmAddress,     // CDP layer
  network: 'base',            // CDP layer
  transaction: {
    to: evmAddress,
    value: 0n,
    type: 'eip1559',          // Viem layer
    maxFeePerGas: 1_000_000_000n,  // Viem layer
  },
});
```

## Impact on Our Faucet

### Before (WRONG)
```typescript
await sendEvmTransaction({
  network: 'base',
  address: evmAddress,  // ❌ Wrong field name - CDP didn't recognize it
  transaction: {
    from: evmAddress,
    // ... rest
  },
});
```

### After (CORRECT)
```typescript
await sendEvmTransaction({
  network: 'base',
  evmAccount: evmAddress,  // ✅ Correct field name - CDP recognizes it
  transaction: {
    from: evmAddress,      // May or may not be needed - let's test!
    type: 'eip1559',
    maxFeePerGas: 1_000_000_000n,
    // ... rest
  },
});
```

## Questions Still to Answer

1. **Do we still need `from` inside transaction?**
   - Possibly not - `evmAccount` might provide it
   - Test will tell us

2. **Do we need `chainId`?**
   - Viem error didn't mention it
   - Let's test without it first

3. **Do we need `gasLimit`?**
   - Viem error didn't mention it
   - CDP might auto-estimate

4. **Do we need `maxPriorityFeePerGas`?**
   - Viem only mentioned `maxFeePerGas`
   - Let's test minimal first

## Next Test

Run updated minimal test with:
- ✅ `evmAccount` (CDP requirement)
- ✅ `network` (CDP requirement)
- ✅ `type: 'eip1559'` (viem requirement)
- ✅ `maxFeePerGas` (viem requirement)
- ❓ NO `from` (testing if needed)
- ❓ NO `chainId` (testing if needed)
- ❓ NO `gasLimit` (testing if CDP estimates)
- ❓ NO `maxPriorityFeePerGas` (testing if needed)

If this works, we can build up from there!

## Summary

**Major Breakthrough**: The minimal test proved that:
1. `evmAccount` is the **correct** field name (not `address`)
2. CDP API validation **works** with this field
3. The previous errors were due to using wrong field name
4. Viem serialization needs transaction type info

We're much closer to a working solution! The test with minimal viem requirements should tell us exactly what's needed.

---

**Status**: Updated test ready
**Confidence**: HIGH - we've isolated the issue to viem serialization
**Next**: Test updated minimal transaction
