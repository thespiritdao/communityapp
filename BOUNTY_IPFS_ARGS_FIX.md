# Bounty IPFS Args Fix - Parameter Order

## 🔴 Error After V4 ABI Fix

```
InvalidAddressError: Address "bafkreidjcsw7atkivx4q7owjhgzwiobnatqepn3yb36wl7fhx3x6mrg45e" is invalid.
- Address must be a hex value of 20 bytes (40 hex characters).
```

The IPFS hash was being passed in the wrong position and interpreted as an Ethereum address.

## 🔍 Root Cause

**V4 has 7 parameters**:
```typescript
[
  value,           // 0: uint128
  token,           // 1: address
  paymentType,     // 2: uint8
  podId,           // 3: string
  ipfsHash,        // 4: string ← Position 4
  leaderHatId,     // 5: uint256
  treasuryAddress  // 6: address
]
```

**The bug**: When replacing the temp IPFS hash, the code was doing:
```typescript
args: [
  ...baseCall.args.slice(0, -1), // Remove LAST item (treasuryAddress) ❌
  ipfsHash, // Add IPFS hash at end (position 6) ❌
]
```

This resulted in:
```typescript
[
  value,
  token,
  paymentType,
  podId,
  tempIpfs,        // ← Still temp!
  leaderHatId,
  realIpfsHash     // ❌ WRONG POSITION (should be address)
]
```

Viem tried to encode `realIpfsHash` as position 6 (address type) → error!

## ✅ Fix Applied

**Updated**: `BountyFormV2.tsx` (lines 231-241)

**Before** (wrong):
```typescript
const bountyCall = {
  ...baseCall,
  args: [
    ...baseCall.args.slice(0, -1), // ❌ Removes last param (treasuryAddress)
    ipfsHash, // ❌ Adds IPFS at wrong position
  ],
};
```

**After** (correct):
```typescript
const bountyCall = {
  ...baseCall,
  args: [
    ...baseCall.args.slice(0, 4), // ✅ Keep: value, token, paymentType, podId
    ipfsHash, // ✅ Replace position 4 (ipfsHash)
    ...baseCall.args.slice(5), // ✅ Keep: leaderHatId, treasuryAddress
  ],
};
```

Now produces correct args:
```typescript
[
  value,
  token,
  paymentType,
  podId,
  realIpfsHash,    // ✅ Position 4 (string)
  leaderHatId,     // ✅ Position 5 (uint256)
  treasuryAddress  // ✅ Position 6 (address)
]
```

## 🧪 Debug Logging Added

```typescript
console.log('📦 Final bountyCall args:', {
  paramCount: bountyCall.args.length,
  ipfsHash: bountyCall.args[4],
  leaderHatId: bountyCall.args[5]?.toString(),
  treasuryAddress: bountyCall.args[6],
});
```

Should show:
```
📦 Final bountyCall args: {
  paramCount: 7,
  ipfsHash: 'bafkreidjcsw7atkivx4q7owjhgzwiobnatqepn3yb36wl7fhx3x6mrg45e',
  leaderHatId: '3666553158177674653027420687215266389400940611515258128056551483637760',
  treasuryAddress: '0x1B7a1058f9611680ed48c580BFbD1a84a83F9F71'
}
```

## ✅ Complete Fix Summary

| Issue | Status |
|-------|--------|
| Missing V4 parameters (7 vs 5) | ✅ FIXED |
| ABI format (object vs array) | ✅ FIXED |
| Using V3 ABI instead of V4 | ✅ FIXED |
| **IPFS hash in wrong position** | ✅ **NOW FIXED** |

## 🎯 Why This Works

### Array Slice Explanation:

Given V4 args: `[value, token, paymentType, podId, tempIpfs, leaderHatId, treasuryAddress]`

- `slice(0, 4)` → `[value, token, paymentType, podId]` (indices 0-3)
- Insert `realIpfsHash` → position 4
- `slice(5)` → `[leaderHatId, treasuryAddress]` (indices 5-6)

Final: `[value, token, paymentType, podId, realIpfsHash, leaderHatId, treasuryAddress]` ✅

### V2 Compatibility:

For V2 (5 params), `slice(5)` returns empty array:
- V2 args: `[value, token, paymentType, podId, tempIpfs]`
- `slice(0, 4)` → first 4 params
- `slice(5)` → `[]` (no extra params)
- Result: `[value, token, paymentType, podId, realIpfs]` ✅

The fix works for both V2 and V4! 🎉

## 🚀 Transaction Should Now Work

All four fixes applied - try creating a bounty now! 🎉
