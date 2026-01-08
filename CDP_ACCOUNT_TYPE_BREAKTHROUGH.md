# 🎯 BREAKTHROUGH: CDP Account Type Discovery

## The Critical Issue

**Error**: "EVM account not found"

**Root Cause**: Passing the wrong account type to `evmAccount` parameter

## What We Discovered

### CDP Creates TWO Accounts

When you use `createOnLogin: 'smart'`, CDP creates:

1. **EOA Account** (Externally Owned Account)
   - Regular Ethereum wallet
   - Controls/owns the Smart Account
   - Used for **authentication**
   - Address: `0x5fe9c0e4B69f24857A2670b55FDE613F5dd139b7`

2. **Smart Account** (Smart Contract Wallet)
   - Contract-based wallet with advanced features
   - Owned by the EOA
   - Used for **transaction execution**
   - Address: `0xAECF4D00F0e402FbeB0757f22be9062d89018106`

### The Relationship

```
EOA Account (Owner)
    ↓ controls
Smart Account (Executor)
    ↓ executes
Blockchain Transaction
```

From diagnostic logs:
```typescript
{
  evmAccounts: ['0x5fe9c0e4B69f24857A2670b55FDE613F5dd139b7'],  // EOA
  evmSmartAccounts: ['0xAECF4D00F0e402FbeB0757f22be9062d89018106'],  // Smart Account
  evmSmartAccountObjects: [{
    address: '0xAECF4D00F0e402FbeB0757f22be9062d89018106',
    ownerAddresses: ['0x5fe9c0e4B69f24857A2670b55FDE613F5dd139b7']  // ← Ownership link
  }]
}
```

## The Mistake We Made

### What We Did (WRONG ❌)

```typescript
const { evmAddress } = useEvmAddress();  // Returns Smart Account
await sendEvmTransaction({
  evmAccount: evmAddress,  // ❌ WRONG: Smart Account cannot authenticate
  network: 'base',
  transaction: { ... }
});
```

**Result**: "EVM account not found" - CDP couldn't find session for Smart Account

### Why It Failed

- `evmAccount` parameter is for **authentication**
- Authentication requires the **EOA account** (the owner)
- We were passing the **Smart Account** (the executor)
- Smart Account can't authenticate itself - it's controlled by the EOA

## The Correct Pattern

### What to Do (CORRECT ✅)

```typescript
const { evmAddress } = useEvmAddress();  // Smart Account
const { currentUser } = useCurrentUser();
const eoaAccount = currentUser.evmAccounts[0];  // EOA Account

await sendEvmTransaction({
  evmAccount: eoaAccount,  // ✅ CORRECT: EOA authenticates
  network: 'base',
  transaction: {
    from: evmAddress,      // ✅ CORRECT: Smart Account executes
    to: recipientAddress,
    data: contractCallData,
    value: 0n,
    type: 'eip1559',
    maxFeePerGas: 1_000_000_000n,
    chainId: 8453n,
  }
});
```

### Why This Works

1. **`evmAccount`** (EOA) = CDP session authentication
2. **`transaction.from`** (Smart Account) = Actual transaction sender
3. CDP verifies EOA owns the Smart Account
4. Transaction executes from Smart Account with EOA's authorization

## The Two-Layer Architecture

### Layer 1: CDP Authentication
- **Parameter**: `evmAccount`
- **Value**: EOA account address
- **Purpose**: Verify user session and authorization

### Layer 2: Transaction Execution
- **Parameter**: `transaction.from`
- **Value**: Smart Account address
- **Purpose**: Execute transaction on blockchain

### Layer 3: Viem Serialization
- **Requirements**: `type`, `maxFeePerGas`, `chainId`
- **Purpose**: Serialize transaction for network submission

## Complete Working Pattern

```typescript
// 1. Get both account types
const { evmAddress } = useEvmAddress();        // Smart Account (executor)
const { currentUser } = useCurrentUser();
const eoaAccount = currentUser.evmAccounts[0]; // EOA (authenticator)

// 2. Build transaction
const payload = {
  // CDP Layer: Authentication
  evmAccount: eoaAccount,     // EOA authenticates
  network: 'base',

  // Transaction Layer: Execution + Viem Serialization
  transaction: {
    from: evmAddress,         // Smart Account executes
    to: contractAddress,
    data: encodedData,
    value: 0n,
    gasLimit: 300000n,
    type: 'eip1559',
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 0n,
    chainId: 8453n,
  }
};

// 3. Send transaction
const result = await sendEvmTransaction(payload);
```

## Hook Reference

```typescript
// Get Smart Account (transaction executor)
const { evmAddress } = useEvmAddress();
// Returns: '0xAECF4D00F0e402FbeB0757f22be9062d89018106' (Smart Account)

// Get EOA Account (authentication)
const { currentUser } = useCurrentUser();
const eoaAccount = currentUser.evmAccounts[0];
// Returns: '0x5fe9c0e4B69f24857A2670b55FDE613F5dd139b7' (EOA)

// Get Smart Account directly from currentUser
const smartAccount = currentUser.evmSmartAccounts[0];
// Same as evmAddress: '0xAECF4D00F0e402FbeB0757f22be9062d89018106'
```

## Why Smart Accounts?

Smart Accounts provide features like:
- **Gasless transactions** (via paymaster)
- **Batched operations** (multiple calls in one tx)
- **Account recovery** (social recovery)
- **Custom permissions** (delegation, spending limits)
- **Session keys** (temporary authorization)

The EOA is the "master key" that controls these features.

## Impact on Our Codebase

### Files to Update

1. **`src/app/faucet/page.tsx`** - Apply correct pattern
2. **`src/utils/cdpTransaction.ts`** - Update helper function
3. All other transaction-sending code

### Pattern to Apply

```typescript
// Helper function pattern
export function buildCDPTransaction(params: {
  eoaAccount: `0x${string}`;      // From currentUser.evmAccounts[0]
  smartAccount: `0x${string}`;    // From useEvmAddress()
  contractAddress: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: any[];
  value?: bigint;
}) {
  const { eoaAccount, smartAccount, contractAddress, abi, functionName, args, value } = params;

  const data = encodeFunctionData({ abi, functionName, args });

  return {
    evmAccount: eoaAccount,     // ✅ EOA for authentication
    network: 'base',
    transaction: {
      from: smartAccount,       // ✅ Smart Account for execution
      to: contractAddress,
      data,
      value: value || 0n,
      gasLimit: 300000n,
      type: 'eip1559' as const,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 0n,
      chainId: 8453n,
    }
  };
}
```

## Testing Results

After applying this fix:
- ✅ CDP accepts the payload
- ✅ Authentication succeeds (EOA verified)
- ✅ Transaction execution proceeds (Smart Account used)
- ✅ Paymaster sponsorship works (if configured)

## Documentation Gap

The CDP docs show:
```typescript
{
  evmAccount: EvmAddress;
  network: SupportedNetwork;
  transaction: AllowedEvmTransactionType;
}
```

But they DON'T clearly explain:
- `evmAccount` should be the **EOA**, not Smart Account
- Even when using Smart Accounts
- The Smart Account goes in `transaction.from`

This caused hours of debugging.

## Key Takeaways

1. **Always use EOA for `evmAccount`** - even with Smart Accounts
2. **Smart Account goes in `transaction.from`** - for execution
3. **`useEvmAddress()` returns Smart Account** - not the authenticator
4. **Get EOA from `currentUser.evmAccounts[0]`** - for authentication
5. **Both accounts are created automatically** - with `createOnLogin: 'smart'`

## Next Steps

1. ✅ Test minimal transaction with correct accounts
2. Apply pattern to faucet
3. Update helper function
4. Test faucet transaction
5. Replicate to other transaction flows

---

**Status**: Pattern identified and tested
**Confidence**: HIGH - diagnostic logs prove the issue
**Ready**: To apply to production code
