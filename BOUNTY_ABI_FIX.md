# Bounty ABI Fix - "abi.filter is not a function"

## 🔴 Error After V4 Parameter Fix

After fixing the V4 parameters, a new error appeared:

```
TypeError: abi.filter is not a function
    at getAbiItem (getAbiItem.js:20:26)
    at encodeFunctionData (encodeFunctionData.js:18:7)
```

## 🔍 Root Cause

The `BountyManagerV3.json` file is a **Hardhat artifact** (JSON object with metadata), not a raw ABI array:

```json
// BountyManagerV3.json (WRONG for encodeFunctionData)
{
  "_format": "hh-sol-artifact-1",
  "contractName": "BountyManagerV3",
  "sourceName": "src/contracts/BountyManagerV3.sol",
  "abi": [
    // ... actual ABI array here
  ]
}
```

But `encodeFunctionData()` from Viem expects just the ABI array:

```typescript
encodeFunctionData({
  abi: [...], // ← Must be an array, not an object
  functionName: 'createBounty',
  args: [...]
})
```

## ✅ Fix Applied

**Updated**: `useBountyV2.ts` (lines 9-15)

**Before**:
```typescript
import BountyManagerV3ABI from '@/abis/BountyManagerV3.json';

const BOUNTY_MANAGER_ABI = USE_V3
  ? BountyManagerV3ABI  // ❌ This is the full artifact object
  : BountyManagerV2ABI;
```

**After**:
```typescript
import BountyManagerV3Artifact from '@/abis/BountyManagerV3.json';

// Extract ABI array from Hardhat artifact
const BountyManagerV3ABI = BountyManagerV3Artifact.abi;  // ✅ Just the array

const BOUNTY_MANAGER_ABI = USE_V3
  ? BountyManagerV3ABI  // ✅ Now it's an array
  : BountyManagerV2ABI;
```

## 🔧 Why This Happened

- `BountyManagerV2.json` is a **raw ABI array** (starts with `[`)
- `BountyManagerV3.json` is a **Hardhat artifact** (starts with `{`)

When Hardhat compiles contracts, it creates artifacts with:
- `_format`: Artifact version
- `contractName`: Contract name
- `sourceName`: Source file path
- `abi`: The actual ABI array ← We need this!
- `bytecode`: Compiled bytecode
- `deployedBytecode`: On-chain bytecode
- `linkReferences`: Library references

We only need the `.abi` property for `encodeFunctionData()`.

## ✅ Transaction Should Now Work

With both fixes applied:
1. ✅ V4 parameters (7 params) are passed correctly
2. ✅ ABI is properly extracted from Hardhat artifact
3. ✅ `encodeFunctionData()` receives valid ABI array

The transaction should now succeed! 🚀
