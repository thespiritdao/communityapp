# CDP Gas Sponsorship Solution

## 🎉 Progress Summary

### We Fixed the Account Issue! ✅

**Before**:
```
Error: EVM account not found
```

**Now**:
```
APIError: Insufficient balance to execute the transaction.
```

This is MASSIVE progress! The transaction structure is now **correct**.

## The Gas Issue

The Smart Account (`0xAECF...8106`) has no ETH for gas fees.

Even though you have paymaster configured:
```typescript
paymaster: process.env.NEXT_PUBLIC_PAYMASTER
// https://api.developer.coinbase.com/rpc/v1/base/...
```

**The problem**: `sendEvmTransaction` from `@coinbase/cdp-hooks` doesn't automatically use the paymaster configured in OnchainKitProvider.

## Why Paymaster Isn't Working

### Traditional Transactions vs User Operations

**Regular Transactions** (`sendEvmTransaction`):
- Direct blockchain transactions
- Require sender to have ETH for gas
- Don't support paymaster sponsorship

**User Operations** (ERC-4337):
- Smart Account abstraction standard
- Support paymaster gas sponsorship
- Support transaction bundling
- Require special handling

### The Architecture Gap

```
OnchainKitProvider
    paymaster: https://api.developer.coinbase.com/...
    ↓
    ❌ NOT automatically used by sendEvmTransaction
    ✅ Used by OnchainKit Transaction component
```

## Solutions

### Solution 1: Use OnchainKit Transaction Component (Recommended for Production)

OnchainKit's `<Transaction>` component is designed to work with paymaster:

```typescript
import { Transaction, TransactionButton, TransactionStatus } from '@coinbase/onchainkit/transaction';
import type { ContractFunctionParameters } from 'viem';

function FaucetWithPaymaster() {
  const { evmAddress } = useEvmAddress();

  const contracts = [{
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: 'requestTestTokens',
    args: [],
  }] as ContractFunctionParameters[];

  return (
    <Transaction
      contracts={contracts}
      chainId={8453}  // Base
      onStatus={(status) => console.log('Transaction status:', status)}
    >
      <TransactionButton text="Request Tokens (Gasless)" />
      <TransactionStatus>
        <TransactionStatusLabel />
        <TransactionStatusAction />
      </TransactionStatus>
    </Transaction>
  );
}
```

**Why this works**:
- OnchainKit Transaction automatically uses configured paymaster
- Handles Smart Account user operations
- Sponsors gas fees for eligible transactions
- Built-in UI for transaction status

### Solution 2: Fund Smart Account with ETH (For Testing)

For testing purposes, send a small amount of ETH to your Smart Account:

```
Smart Account: 0xAECF4D00F0e402FbeB0757f22be9062d89018106
Recommended: 0.001 ETH (covers ~100 transactions)
```

Then `sendEvmTransaction` will work for testing.

### Solution 3: Use CDP Smart Account Client (Advanced)

For full control, use viem's Smart Account client with paymaster middleware:

```typescript
import { createSmartAccountClient } from 'viem/account-abstraction';
import { createPimlicoPaymasterClient } from 'permissionless/clients/pimlico';

const paymasterClient = createPimlicoPaymasterClient({
  transport: http(process.env.NEXT_PUBLIC_PAYMASTER),
});

const smartAccountClient = createSmartAccountClient({
  account: smartAccount,
  chain: base,
  bundlerTransport: http(bundlerUrl),
  middleware: {
    sponsorUserOperation: paymasterClient.sponsorUserOperation,
  },
});

const txHash = await smartAccountClient.sendTransaction({
  to: contractAddress,
  data: callData,
});
```

## Recommended Approach for Your Faucet

### Use OnchainKit Transaction Component

This is the **simplest** and **most reliable** approach:

#### Before (Complex + No Paymaster):
```typescript
const { sendEvmTransaction } = useSendEvmTransaction();
const { currentUser } = useCurrentUser();

const handleRequest = async () => {
  const eoaAccount = currentUser.evmAccounts[0];
  const data = encodeFunctionData({
    abi: FAUCET_ABI,
    functionName: 'requestTestTokens',
    args: [],
  });

  await sendEvmTransaction({
    evmAccount: eoaAccount,
    network: 'base',
    transaction: {
      from: evmAddress,
      to: FAUCET_ADDRESS,
      data,
      value: 0n,
      type: 'eip1559',
      maxFeePerGas: 1_000_000_000n,
      chainId: 8453n,
      gasLimit: 300000n,
    },
  });
};
```

#### After (Simple + Paymaster):
```typescript
import { Transaction, TransactionButton, TransactionStatus } from '@coinbase/onchainkit/transaction';

const contracts = [{
  address: FAUCET_ADDRESS,
  abi: FAUCET_ABI,
  functionName: 'requestTestTokens',
  args: [],
}];

return (
  <Transaction contracts={contracts} chainId={8453}>
    <TransactionButton />
    <TransactionStatus>
      <TransactionStatusLabel />
      <TransactionStatusAction />
    </TransactionStatus>
  </Transaction>
);
```

**Benefits**:
- ✅ Automatic paymaster integration
- ✅ Handles Smart Account user operations
- ✅ Built-in loading states
- ✅ Transaction status updates
- ✅ Error handling
- ✅ Much simpler code

## Why OnchainKit Transaction Works

OnchainKit Transaction component:
1. Detects you're using a Smart Account (from CDP)
2. Automatically converts transaction to User Operation
3. Applies paymaster sponsorship
4. Submits via bundler
5. Returns transaction hash

All of this is **automatic** - no manual configuration needed!

## Testing the Fix

### Test 1: OnchainKit Transaction (With Paymaster)
```bash
# Update faucet to use OnchainKit Transaction
# Test transaction - should succeed gaslessly
```

### Test 2: Check Paymaster Sponsorship
```bash
# After transaction succeeds:
# 1. Check Smart Account balance - should still be 0 ETH
# 2. Check transaction on BaseScan - gas paid by paymaster
```

## Migration Steps

1. **Update Faucet** - Replace `sendEvmTransaction` with OnchainKit `<Transaction>`
2. **Test** - Verify gasless transaction works
3. **Apply Pattern** - Use same pattern for marketplace, cart, governance

## The Complete Pattern (For Reference)

If you need to use `sendEvmTransaction` with paymaster in the future:

```typescript
// 1. Check if paymaster is configured
const hasPaymaster = !!process.env.NEXT_PUBLIC_PAYMASTER;

// 2. For Smart Accounts with paymaster, use OnchainKit Transaction
if (hasPaymaster && isSmartAccount) {
  return <Transaction contracts={contracts} />;
}

// 3. For EOA or no paymaster, use sendEvmTransaction
const eoaAccount = currentUser.evmAccounts[0];
await sendEvmTransaction({
  evmAccount: eoaAccount,  // EOA authenticates
  network: 'base',
  transaction: {
    from: evmAddress,      // Smart Account executes
    // ... rest
  },
});
```

## Summary

| Method | Paymaster Support | Complexity | Use Case |
|--------|------------------|------------|----------|
| OnchainKit Transaction | ✅ Automatic | Low | Production (recommended) |
| sendEvmTransaction | ❌ Manual only | High | Testing with funded account |
| Smart Account Client | ✅ With middleware | Very High | Advanced custom flows |

**Recommendation**: Use OnchainKit Transaction for all production transactions.

---

**Next Step**: Update faucet to use OnchainKit Transaction component
