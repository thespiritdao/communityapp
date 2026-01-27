# Bounty V4 Transaction Fix - Parameter Mismatch Resolved

## 🔴 Problem Identified

Your bounty creation transaction was failing with:
```
Error: useroperation reverted: execution reverted
```

**Root Cause**: Frontend was calling V4 contract with **V2 signature (5 parameters)** instead of **V4 signature (7 parameters)**.

---

## 🔍 What Was Wrong

### Transaction Call Mismatch:

**Frontend was sending (V2 format)**:
```typescript
createBounty(
  value,           // 1. uint128
  token,           // 2. address
  paymentType,     // 3. uint8
  podId,           // 4. string
  ipfsHash         // 5. string
  // ❌ MISSING: leaderHatId
  // ❌ MISSING: treasuryAddress
)
```

**V4 Contract expects (V3/V4 format)**:
```solidity
function createBounty(
    uint128 value,
    address token,
    uint8 paymentType,
    string calldata podId,
    string calldata ipfsHash,
    uint256 leaderHatId,      // ← REQUIRED
    address treasuryAddress   // ← REQUIRED
) external returns (uint256)
```

---

## ✅ Fixes Applied

### Fix 1: Updated `.env` Configuration

**Added**:
```bash
NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS=0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2
```

**Why**: The `useBountyV2.ts` hook looks for `NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS` to enable V3/V4 mode. Without this variable, it defaults to V2 format.

**File**: `.env` line 71

---

### Fix 2: Frontend Now Passes V4 Parameters

**Updated**: `BountyFormV2.tsx` (lines 214-229)

**Before**:
```typescript
const baseCall = createBountyCall(formData);  // ❌ Missing V4 params
```

**After**:
```typescript
// Get pod metadata for V4 auto-registration
const selectedPod = managablePods.find((p) => p.id === formData.podId);
const leaderHatId = selectedPod?.management_hat_id || undefined;
const treasuryAddress = selectedPod?.treasury_contract_address || undefined;

// Pass V4 parameters
const baseCall = createBountyCall(formData, leaderHatId, treasuryAddress);  // ✅
```

**What This Does**:
1. Finds selected pod from `managablePods` list
2. Extracts `management_hat_id` (leader HAT ID)
3. Extracts `treasury_contract_address` (pod treasury)
4. Passes both to `createBountyCall()` function

---

### Fix 3: Added Debug Logging

**Added** comprehensive logging to track V4 parameter resolution:

```typescript
console.log('🔧 V3/V4 Parameters:', {
  podId: formData.podId,
  selectedPod: selectedPod?.name,
  leaderHatId,
  treasuryAddress,
  hasLeaderHat: !!leaderHatId,
  hasTreasury: !!treasuryAddress,
});
```

**And** in `useBountyV2.ts`:
```typescript
console.log('🎯 V3/V4 createBounty args:', {
  value: v3Args[0].toString(),
  token: v3Args[1],
  paymentType: v3Args[2],
  podId: v3Args[3],
  ipfsHash: v3Args[4],
  leaderHatId: v3Args[5].toString(),
  treasuryAddress: v3Args[6],
});
```

---

## 🔧 How V4 Auto-Registration Works

### When Pod is Already Registered:
```typescript
leaderHatId = 0           // ✅ 0 means "skip registration"
treasuryAddress = 0x0...  // ✅ Zero address is ignored
```

### When Pod Needs Registration:
```typescript
leaderHatId = '0x0000008800010000...'  // ✅ Actual HAT ID
treasuryAddress = '0xb9e3D01C144c5B...'  // ✅ Actual treasury address
```

**Contract Logic** (BountyManagerV4.sol):
```solidity
if (!podMetadata[podId].isRegistered && leaderHatId != 0) {
    // Auto-register pod with provided metadata
    require(
        hatsProtocol.balanceOf(msg.sender, leaderHatId) > 0,
        "Must have leader HAT"
    );

    podMetadata[podId] = PodMetadata({
        leaderHatId: leaderHatId,
        treasuryAddress: treasuryAddress,
        isRegistered: true,
        registeredAt: block.timestamp
    });
}
```

---

## 🎯 Expected Flow Now

### 1. User Fills Bounty Form
- Selects pod from dropdown
- Enters bounty details
- Clicks "Create Bounty"

### 2. Frontend Prepares Transaction
```typescript
// ✅ Automatically retrieves pod metadata
const selectedPod = managablePods.find(p => p.id === formData.podId);
const leaderHatId = selectedPod?.management_hat_id;
const treasuryAddress = selectedPod?.treasury_contract_address;
```

### 3. Transaction Call Built
```typescript
// ✅ All 7 parameters included
createBounty(
  parseEther('100'),                    // 100 $SYSTEM
  '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5',  // $SYSTEM token
  0,                                     // Payment type: Completion
  'e35c9e25-d29f-4988-b1e8-2902e960b94c', // Pod ID
  'bafkrei...',                          // IPFS hash
  '0x0000008800010000...',               // Leader HAT ID ← NOW INCLUDED
  '0xb9e3D01C144c5Bfcd5816afea9190371B0843be6' // Treasury ← NOW INCLUDED
)
```

### 4. CDP Smart Account Sends
```typescript
// ✅ Two calls: approve + createBounty
sendUserOperation({
  evmSmartAccount: smartAccount,
  network: 'base',
  calls: [approveCall, createBountyCall],  // ← createBountyCall now has 7 params
  useCdpPaymaster: true,
});
```

---

## 🧪 Testing Checklist

### Before Testing:
- [x] `.env` updated with `NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS`
- [x] Frontend passes `leaderHatId` and `treasuryAddress`
- [x] V3 ABI available at `src/abis/BountyManagerV3.json`
- [x] Debug logging added

### During Testing:
Check browser console for these logs:

1. **V3 Detection**:
   ```
   🎯 Bounty System: Using V3 (Decentralized) at 0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2
   ```

2. **Pod Metadata Retrieved**:
   ```
   🔧 V3/V4 Parameters: {
     podId: 'e35c9e25-...',
     selectedPod: 'My Pod',
     leaderHatId: '0x0000008800010000...',
     treasuryAddress: '0xb9e3D01C144c5B...',
     hasLeaderHat: true,
     hasTreasury: true
   }
   ```

3. **Correct Args Sent**:
   ```
   🎯 V3/V4 createBounty args: {
     value: '100000000000000000000',
     token: '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5',
     paymentType: 0,
     podId: 'e35c9e25-...',
     ipfsHash: 'bafkrei...',
     leaderHatId: '123456789...',
     treasuryAddress: '0xb9e3D01C144c5B...'
   }
   ```

4. **Transaction Success**:
   ```
   ✅ User operation sent successfully!
   ```

---

## ⚠️ Potential Issues & Solutions

### Issue 1: Pod Missing `management_hat_id`

**Symptom**: `leaderHatId` is `undefined` in logs

**Cause**: Pod doesn't have `management_hat_id` in database

**Solution**:
```typescript
// Temporarily allow 0 for testing (pod will need to be registered manually later)
const leaderHatId = selectedPod?.management_hat_id || '0';
```

**Long-term**: Ensure all pods have `management_hat_id` set in database

---

### Issue 2: Pod Missing `treasury_contract_address`

**Symptom**: `treasuryAddress` is `undefined` in logs

**Cause**: Pod doesn't have treasury deployed

**Solution**:
```typescript
// Use zero address (contract will reject if treasury funding is required)
const treasuryAddress = selectedPod?.treasury_contract_address ||
  '0x0000000000000000000000000000000000000000';
```

**Long-term**: Deploy treasury for all pods via Pod Creation flow

---

### Issue 3: Still Getting "execution reverted"

**If transaction still fails**, check:

1. **Token Balance**:
   ```typescript
   // Check Smart Account has enough tokens
   const balance = await publicClient.readContract({
     address: SYSTEM_TOKEN_ADDRESS,
     abi: ERC20_ABI,
     functionName: 'balanceOf',
     args: [smartAccountAddress]
   });
   console.log('$SYSTEM Balance:', formatEther(balance));
   ```

2. **Contract Deployed**:
   ```bash
   cast code 0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2 --rpc-url https://mainnet.base.org
   ```
   Should return bytecode (not empty)

3. **HAT Ownership**:
   ```typescript
   // Verify user has the leader HAT
   const hasHat = await hatsProtocol.balanceOf(userAddress, leaderHatId);
   console.log('Has Leader HAT:', hasHat > 0);
   ```

---

## 📊 Summary of Changes

| File | Lines | Change |
|------|-------|--------|
| `.env` | 71 | Added `NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS` |
| `BountyFormV2.tsx` | 214-229 | Pass `leaderHatId` and `treasuryAddress` to createBountyCall |
| `BountyFormV2.tsx` | 219-226 | Added debug logging for V4 parameters |
| `useBountyV2.ts` | 147-182 | Added debug logging for args construction |

---

## 🚀 Next Steps

1. **Restart Dev Server**:
   ```bash
   npm run dev
   ```
   Ensure `.env` changes are loaded

2. **Test Bounty Creation**:
   - Open browser console
   - Create a test bounty
   - Verify logs show correct 7 parameters
   - Transaction should succeed

3. **Verify On-Chain**:
   - Check transaction on Basescan
   - Verify `createBounty` was called with 7 parameters
   - Check pod is registered in contract

4. **Database Sync**:
   - After successful transaction, bounty should save to database
   - Verify bounty appears in bounty list

---

## 🎓 Key Lesson

**Always match frontend call signature to deployed contract!**

- V2 → 5 parameters
- V3/V4 → 7 parameters (adds `leaderHatId`, `treasuryAddress`)

The V4 contract was deployed, but the frontend was still using V2 format because:
1. Missing `NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS` env var
2. Not passing pod metadata to `createBountyCall()`

Both issues are now fixed! ✅
