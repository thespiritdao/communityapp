# Pod Bounty Service Authorization Fix

## Error
```
❌ Pod registration failed: useroperation reverted: Not authorized to update pod data
```

## Root Cause

The `PodBountyService` contract (`0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396`) has an `onlyAuthorizedUpdater` modifier that restricts who can call `registerPod`:

```solidity
modifier onlyAuthorizedUpdater() {
    require(authorizedUpdaters[msg.sender] || msg.sender == owner(), "Not authorized to update pod data");
    _;
}

function registerPod(...) external onlyAuthorizedUpdater {
    // Only owner or authorized updaters can call this
}
```

**Your address:** `0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48`
**Is NOT** in the `authorizedUpdaters` mapping.

---

## Solutions

### Option A: Add Your Address as Authorized Updater (Recommended)

**Steps:**
1. Find who owns the contract (the deployer)
2. Have the owner call `addAuthorizedUpdater("0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48")`

**To check contract owner:**
```typescript
// In console or new script
const owner = await publicClient.readContract({
  address: '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396',
  abi: [{ name: 'owner', type: 'function', outputs: [{ type: 'address' }], stateMutability: 'view' }],
  functionName: 'owner',
});
console.log('Contract owner:', owner);
```

**If you ARE the owner:**
```typescript
// Call addAuthorizedUpdater
await sendUserOperation({
  calls: [{
    to: '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396',
    data: encodeFunctionData({
      abi: PodBountyServiceABI,
      functionName: 'addAuthorizedUpdater',
      args: ['0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48'],
    }),
  }],
});
```

---

### Option B: Remove Authorization Requirement (Not Recommended)

Deploy a new version of the contract without the `onlyAuthorizedUpdater` modifier.

**Risks:**
- Anyone could register fake pods
- No access control
- Security vulnerability

---

### Option C: Backend API Registration (Alternative)

Instead of users registering pods directly, have your backend API register them:

1. User creates bounty in frontend
2. Frontend calls your API: `POST /api/bounty/register-pod`
3. Backend (which IS an authorized updater) calls `registerPod` on-chain
4. Return success to frontend

**Benefits:**
- Centralized control
- Can validate pod data before registering
- Backend can be added as authorized updater

**Implementation:**
```typescript
// pages/api/bounty/register-pod.ts
export async function POST(request: Request) {
  const { podId, creator, leaders, treasuryAddress } = await request.json();

  // Backend wallet (authorized updater)
  const backendWallet = privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY);

  // Register pod on-chain
  const hash = await walletClient.writeContract({
    address: '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396',
    abi: PodBountyServiceABI,
    functionName: 'registerPod',
    args: [podId, creator, leaders, treasuryAddress],
    account: backendWallet,
  });

  return Response.json({ success: true, hash });
}
```

---

### Option D: Remove RegisterPodButton Entirely (Quick Fix)

If pod registration isn't actually needed for bounty creation (depends on your architecture), just remove the registration step.

**Check if bounties work without registration:**
1. Comment out the RegisterPodButton in BountyFormV2
2. Try creating a bounty
3. If it works, registration may not be necessary

---

## Recommended Approach

**Short-term (Today):**
1. Check contract owner
2. If you're the owner, add your address as authorized updater
3. Test bounty creation

**Long-term (Production):**
1. Use backend API for pod registration (Option C)
2. Add multiple authorized updaters (backend services)
3. Implement proper access control

---

## Files Involved

- **Contract:** `src/contracts/PodBountyService.sol` (lines 54-71)
- **Frontend:** `src/features/pods/components/RegisterPodButton.tsx`
- **Contract Address:** `0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396`

---

## Quick Verification Script

Run this to check authorization status:

```typescript
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const POD_BOUNTY_SERVICE = '0xbccee13f13Ca4f97758c79C8FF05ff7EB9290396';
const YOUR_ADDRESS = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48';

// Check owner
const owner = await publicClient.readContract({
  address: POD_BOUNTY_SERVICE,
  abi: [{ name: 'owner', type: 'function', outputs: [{ type: 'address' }], stateMutability: 'view' }],
  functionName: 'owner',
});

// Check if you're authorized
const isAuthorized = await publicClient.readContract({
  address: POD_BOUNTY_SERVICE,
  abi: [{
    name: 'authorizedUpdaters',
    type: 'function',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  }],
  functionName: 'authorizedUpdaters',
  args: [YOUR_ADDRESS],
});

console.log('Contract owner:', owner);
console.log('You are owner:', owner.toLowerCase() === YOUR_ADDRESS.toLowerCase());
console.log('You are authorized updater:', isAuthorized);
```

---

## Next Steps

1. Run the verification script above
2. Determine which option to implement
3. Let me know the contract owner address and I can help with the next steps
