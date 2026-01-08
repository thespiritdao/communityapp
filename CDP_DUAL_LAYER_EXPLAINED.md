# CDP Dual-Layer Architecture Explained

## The Critical Insight

CDP Embedded Wallets require **BOTH** of these fields:

1. `address` at **top level** of `sendEvmTransaction()` call
2. `from` **inside** the `transaction` object

## Why Both Are Required

They serve **different purposes** in a dual-layer architecture:

### Layer 1: CDP API Authentication

```typescript
sendEvmTransaction({
  address: evmAddress,  // ⬅️ THIS FIELD
  // ...
})
```

**Purpose**:
- Binds the request to your embedded wallet session
- Identifies which CDP account to use
- Applies paymaster sponsorship to the transaction
- Enforces project/user scoping and permissions

**What it does NOT do**:
- Does NOT get inferred from `transaction.from`
- Does NOT automatically populate from session
- Must be explicitly provided

### Layer 2: Ethereum Transaction Structure

```typescript
sendEvmTransaction({
  transaction: {
    from: evmAddress,  // ⬅️ THIS FIELD
    to: '0x...',
    // ...
  }
})
```

**Purpose**:
- Ethereum transaction sender field (ethers.js convention)
- Required for proper transaction construction
- Used during transaction serialization
- Part of the blockchain transaction data

**What it does NOT do**:
- Does NOT bind to CDP session
- Does NOT trigger paymaster
- Cannot replace top-level `address`

## The Complete Pattern

```typescript
const { evmAddress } = useEvmAddress();
const { sendEvmTransaction } = useSendEvmTransaction();

const result = await sendEvmTransaction({
  // ===== LAYER 1: CDP API =====
  network: 'base',
  address: evmAddress,  // ✅ REQUIRED: Session binding & paymaster

  // ===== LAYER 2: ETHEREUM TX =====
  transaction: {
    from: evmAddress,   // ✅ REQUIRED: Transaction sender
    to: CONTRACT_ADDRESS,
    data: encodedData,
    value: 0n,
    gasLimit: 300000n,
    chainId: 8453n,
    type: 'eip1559',
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 0n,
  },
});
```

## Common Confusion

### ❌ "Both fields have the same value, why do I need both?"

**Answer**: They serve different architectural layers:
- `address` → CDP backend uses this for session/paymaster
- `from` → Ethereum network uses this for transaction

Think of it like:
- `address` = "Which embedded wallet am I using?"
- `from` = "Who is the sender on the blockchain?"

### ❌ "Can't CDP infer `address` from `transaction.from`?"

**Answer**: No. CDP's API validation happens **before** transaction parsing. The API schema requires `address` as a top-level field for session binding. It doesn't look inside `transaction` to find it.

### ❌ "Is this creating two wallets?"

**Answer**: No! Both fields point to the same wallet address. It's just required at two different layers of the system architecture.

## Error Message Translation

When you see:
```
APIError: property "address" is missing
```

It means one of these:
1. Missing top-level `address` field
2. Missing `from` field inside `transaction`
3. Missing BOTH (most common)

**Solution**: Include both fields with the same `evmAddress` value.

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│  sendEvmTransaction({                  │
│                                         │
│    ┌─────────────────────────────┐     │
│    │  Layer 1: CDP API           │     │
│    │  • network: 'base'          │     │
│    │  • address: evmAddress      │ ◄── Session binding, paymaster
│    └─────────────────────────────┘     │
│                                         │
│    ┌─────────────────────────────┐     │
│    │  Layer 2: Ethereum TX       │     │
│    │  transaction: {             │     │
│    │    from: evmAddress,        │ ◄── Blockchain sender
│    │    to: '0x...',             │     │
│    │    data: '0x...',           │     │
│    │    gasLimit: 300000n,       │     │
│    │    chainId: 8453n,          │     │
│    │    type: 'eip1559',         │     │
│    │    maxFeePerGas: ...,       │     │
│    │    maxPriorityFeePerGas: ...│     │
│    │  }                          │     │
│    └─────────────────────────────┘     │
│  })                                     │
└─────────────────────────────────────────┘
```

## Comparison to Other Patterns

### Wagmi (Standard Web3)
```typescript
// Wagmi/viem pattern
{
  account,  // Top level
  to,
  data,
  // No separate 'from' inside
}
```

### Ethers.js (Traditional)
```typescript
// Ethers.js pattern
{
  from,  // Inside transaction only
  to,
  data,
}
```

### CDP Embedded Wallets (Hybrid)
```typescript
// CDP pattern (combines both!)
{
  address,       // Top level (CDP layer)
  transaction: {
    from,        // Inside (Ethereum layer)
    to,
    data,
  }
}
```

## Summary

**The Rule**: When using CDP Embedded Wallets, ALWAYS provide:

✅ `address: evmAddress` at top level
✅ `from: evmAddress` inside `transaction`
✅ Both should have the same value (your wallet address)

This satisfies both the CDP API layer and the Ethereum transaction layer.

**Memory Aid**: "Dual-layer, dual-address, same value, different purposes."
