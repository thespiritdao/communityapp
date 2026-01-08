# CDP Minimal Viable Transaction Test Plan

## The Problem We're Solving

### Documentation Says:
```typescript
// From official CDP docs - SendEvmTransactionOptions
{
  evmAccount: EvmAddress;
  network: SupportedNetwork;
  transaction: AllowedEvmTransactionType;
}
```

### Runtime Says:
```
APIError: property "address" is missing
```

**This is a fundamental mismatch between docs and implementation.**

## The Test Strategy

Strip away ALL complexity and use ONLY what the docs specify:

### What We're Testing
```typescript
await sendEvmTransaction({
  evmAccount: evmAddress,  // ✅ From docs
  network: 'base',         // ✅ From docs
  transaction: {
    to: evmAddress,        // ✅ Send 0 ETH to self (simplest possible)
    value: 0n,
  },
});
```

### What We're NOT Including
- ❌ `address` field (not in docs)
- ❌ `from` field (not in docs)
- ❌ `chainId` (not in docs)
- ❌ `gasLimit` (not in docs)
- ❌ EIP-1559 fields (not in docs)
- ❌ Contract calls
- ❌ ABI encoding
- ❌ Gas overrides

## Why This Test Is Critical

This will **definitively** tell us if the problem is:

1. **Our implementation** (too complex)
2. **Documentation error** (missing required fields)
3. **SDK bug** (types don't match backend)

## How to Run the Test

1. Navigate to: `http://localhost:3000/cdp-test`
2. Make sure wallet is connected
3. Click "Send Minimal CDP Transaction"
4. Check console logs

## Possible Outcomes

### Outcome A: ✅ Test SUCCEEDS

**Meaning**: CDP basic functionality works!

**Conclusion**: Our faucet errors are due to:
- Complex transaction structure
- Gas configuration
- Contract encoding
- Some other layer we added

**Next Steps**:
1. Start with this minimal working transaction
2. Add complexity ONE piece at a time:
   - Add `from` inside transaction
   - Add gas fields
   - Add contract call
   - Add ABI encoding
3. Find exactly which addition breaks it

### Outcome B: ❌ Test FAILS with "property 'address' is missing"

**Meaning**: Docs are incomplete/wrong!

**Conclusion**: CDP backend requires fields NOT documented in types

**Proof for Coinbase Support**:
```
"Using the exact SendEvmTransactionOptions type from official docs
(evmAccount + network + transaction), even a minimal 0 ETH transaction
fails with 'property address is missing'. The types do not include
an 'address' field. Please clarify backend schema vs frontend types."
```

**Next Steps**:
1. Contact Coinbase support with this exact repro
2. Ask them to reconcile:
   - `SendEvmTransactionOptions` TypeScript type
   - Backend API schema validation
   - Official documentation

### Outcome C: ❌ Test FAILS with different error

**Error Message Will Tell Us**:
- Schema validation → Missing other undocumented field
- Network error → Config/provider issue
- Permission error → Session/auth issue
- Gas error → Even minimal tx needs gas config

**Next Steps**: Analyze specific error

## Test Component Location

**File**: `src/app/cdp-test/page.tsx`

**URL**: `http://localhost:3000/cdp-test`

## Console Logs to Check

The test logs:
```
🧪 ===== MINIMAL CDP TRANSACTION TEST =====
🧪 Using evmAccount: 0x...
🧪 Transaction: Send 0 ETH to self
🧪 Payload (exactly as docs specify): {...}
🧪 Fields present: ['evmAccount', 'network', 'transaction']
🧪 evmAccount present? true
🧪 address present? false
🧪 from in transaction? false
```

Then either:
```
✅ Transaction succeeded! {...}
```

Or:
```
❌ Transaction failed: {...}
❌ Error name: ...
❌ Error message: ...
```

## Why This Approach is Correct

### From Second Opinion (errors2.txt.txt):

> "This is a clean, defensible repro. If this fails, your current errors are not your fault. The docs are incomplete or incorrect. Coinbase support must reconcile types vs backend schema."

### What Makes This Test Valid:

1. **Uses ONLY documented fields** - no guessing
2. **Simplest possible transaction** - send 0 ETH to self
3. **No external dependencies** - no contract, no ABI
4. **Clear binary outcome** - works or doesn't
5. **Defensible** - we followed docs exactly

## Expected Test Duration

**< 5 seconds**

This is a simple self-transaction with no complexity.

## Support Ticket Draft (If Test Fails)

```
Subject: SendEvmTransactionOptions type mismatch with backend schema

Description:
Using the exact type definition from @coinbase/cdp-hooks documentation,
a minimal transaction fails with schema validation errors.

Reproduction:
const result = await sendEvmTransaction({
  evmAccount: '0x...',
  network: 'base',
  transaction: {
    to: '0x...',
    value: 0n,
  },
});

Error:
APIError: request body has an error: doesn't match schema:
property "address" is missing

Issue:
The SendEvmTransactionOptions TypeScript type does not include an
'address' field, yet the backend API requires it.

Request:
Please clarify:
1. Is the TypeScript type definition incomplete?
2. Should the backend accept evmAccount without requiring address?
3. What is the correct schema for sendEvmTransaction?

Environment:
- @coinbase/cdp-hooks: [version]
- Network: Base Mainnet
- Wallet: CDP Embedded Wallet (Smart Account)
```

## Summary

This test is the **fork in the road**:

- **Pass** → We can build correctly from minimal working pattern
- **Fail** → We have proof docs don't match backend

Either way, we get definitive answers.

---

**Status**: Test component ready at `/cdp-test`
**Next**: Run test and report outcome
**Time**: < 1 minute to run
