# Application Approval System Audit

**Date:** 2026-01-16
**Issue:** "execution reverted" error when approving membership applications
**Scope:** Application routes, smart contracts, and approval flow architecture

---

## Executive Summary

### Critical Finding: HAT Admin Permission Architecture Mismatch

The application approval system is attempting to mint member role HATs but **may not have proper admin permissions** to do so. Based on Hats Protocol documentation and error analysis, the root cause is likely one or more of the following:

1. **The caller doesn't have admin rights over the target HAT**
2. **The target HAT doesn't exist on-chain** (only in database)
3. **The applicant already wears the HAT** (duplicate mint attempt)
4. **The HAT is inactive or at max supply**
5. **Self-approval scenario** (applicant == approver, same address)

---

## Hats Protocol mintHat Requirements

According to official Hats Protocol documentation:

### Permission Requirement
> **Only a hat's admin(s)** can mint its token to a wearer.

### Pre-Mint Conditions
Before `Hats.mintHat` can succeed, ALL of these must be true:

1. **Hat must be active** – Inactive hats cannot receive new wearers
2. **Max supply not reached** – The hat's supply cap cannot already be exhausted
3. **Wearer doesn't already have it** – "The target wearer must not already wear the hat"
4. **Wearer is eligible** – If mechanistic eligibility module exists, wearer must pass checks

### Who is an "Admin"?
In Hats Protocol's hierarchical structure:
- **Wearing a parent HAT makes you an admin of its children**
- The smart account must pass: `isAdminOfHat(smartAccountAddress, childHatId)`
- Simply wearing the management HAT *should* make you admin of member roles (children)

---

## Architecture Analysis

### Current Implementation

#### 1. **Application Routes**
**Finding:** No route files exist at `src/app/pods/[id]/applications/apply/` or `src/app/pods/[id]/applications/`

**Status:** ❌ Missing - This may be intentional if using components directly, but should be verified

**Recommendation:** If these routes should exist, create them. Otherwise, document that application flow is component-based only.

---

#### 2. **Smart Contracts**

##### **A. IHats.sol Interface** (`src/contracts/interfaces/IHats.sol`)
```solidity
function mintHat(uint256 _hatId, address _wearer) external returns (bool);
function isAdminOfHat(address _user, uint256 _hatId) external view returns (bool);
```

**Status:** ✅ Correct - Interface matches Hats Protocol specification

---

##### **B. HatsProtocol.json ABI** (`src/abis/HatsProtocol.json`)
**Critical Issue:** The ABI is **INCOMPLETE**

**Missing Functions:**
- ✅ `balanceOf` - Present
- ✅ `isWearerOfHat` - Present
- ✅ `viewHat` - Present
- ✅ `isAdminOfHat` - Present
- ❌ **`mintHat` - MISSING!**
- ❌ **`createHat` - MISSING!**

**Impact:** The incomplete ABI doesn't affect `ApproveApplicationButton.tsx` because it defines `HATS_MINT_ABI` inline. However, other parts of the codebase using the imported ABI cannot call `mintHat`.

**Recommendation:** Add the complete Hats Protocol ABI to `HatsProtocol.json`:
```json
{
  "inputs": [
    { "name": "_hatId", "type": "uint256" },
    { "name": "_wearer", "type": "address" }
  ],
  "name": "mintHat",
  "outputs": [{ "name": "", "type": "bool" }],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

---

##### **C. PodAuthProxy.sol**
**Purpose:** Serves as the ADMIN of pod's HATs

**Key Findings:**
- Line 77: `uint256 public proxyAdminHatId;` - Proxy wears this HAT to have admin rights
- Line 404, 425, 445, 465, 483: Multiple checks using `isAdminOfHat(address(this), _hatId)`
- **The proxy contract itself is designed to be the admin, NOT individual users**

**Critical Insight:**
The pod architecture uses a **proxy-based admin model** where:
1. The `PodAuthProxy` contract wears an admin HAT
2. The proxy contract is the admin of pod HATs
3. Individual users (pod leaders) **delegate through the proxy**, not mint directly

**Problem:** `ApproveApplicationButton.tsx` is trying to call `mintHat` directly from a user's smart account, **bypassing the proxy architecture**!

---

#### 3. **Application Approval Implementation**

##### **A. ApplicationApprovalCard.tsx** (`src/features/pods/components/ApplicationApproval/ApplicationApprovalCard.tsx`)

**Status:** ✅ Recently fixed - Now correctly loads member roles from `pod_role_permissions` table

**Lines 99-113:** Fetches member roles, excluding management HAT
**Lines 142-155:** Selects first available member role token_address

**Potential Issue:** If NO member roles exist in database, falls back to `pod.membership_hat_id` which may not exist.

---

##### **B. ApproveApplicationButton.tsx** (`src/features/pods/components/ApplicationApproval/ApproveApplicationButton.tsx`)

**ABI Definition (Lines 36-47):**
```typescript
const HATS_MINT_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_wearer', type: 'address' },
    ],
    name: 'mintHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
```

**Status:** ✅ ABI is correct

**Transaction Construction (Lines 1081-1097):**
```typescript
const callData = encodeFunctionData({
  abi: HATS_MINT_ABI,
  functionName: 'mintHat',
  args: [BigInt(effectiveHatId), applicantAddress as `0x${string}`],
});

const result = await sendUserOperation({
  evmSmartAccount: smartAccount,
  network: 'base',
  calls: [{
    to: HATS_PROTOCOL_ADDRESS,
    value: 0n,
    data: callData,
  }],
  useCdpPaymaster: true,
});
```

**Status:** ✅ Transaction structure is correct

**On-Chain Verification (Lines 1043-1078):**
- ✅ Checks smart account HAS management HAT (balanceOf check)
- ❌ **MISSING:** `isAdminOfHat` check for the child HAT being minted!

**Critical Gap:** The code verifies the user WEARS the management HAT but doesn't verify the user IS ADMIN of the member HAT being minted.

---

##### **C. Comparison with Working Implementation**

**ClaimManagementHATButton.tsx** (Lines 199-203):
```typescript
const callData = encodeFunctionData({
  abi: HATS_ABI,
  functionName: 'mintHat',
  args: [BigInt(managementHatId), evmAddress], // ← Minting to SELF
});
```

**Key Difference:**
- **ClaimManagementHATButton:** Mints management HAT to self (works because self-minting is allowed when eligible)
- **ApproveApplicationButton:** User with management HAT tries to mint member HAT to another person

**Why this matters:**
- Management HAT: User is eligible and calls mint on themselves
- Member HAT: Admin tries to mint to applicant BUT may not be recognized as admin

---

## Root Cause Analysis

### Error: "execution reverted: execution reverted"

Based on the latest error logs:
```
🔍 Smart Account Management HAT balance on-chain: 1  ✅ User HAS management HAT
👥 Applicant Address: 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48
👤 Current User Address: 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48
```

### Issue #1: Self-Approval (Same Address)
**The applicant and approver are THE SAME ADDRESS** (case-insensitive match).

### Issue #2: Missing Pre-Flight Checks
The code doesn't verify:
1. ❌ Does the target HAT exist on-chain? (might only be in database)
2. ❌ Is the smart account an admin of the target HAT? (via `isAdminOfHat`)
3. ❌ Does the applicant already wear this HAT? (would cause revert)
4. ❌ Is the target HAT active? (inactive HATs can't be minted)
5. ❌ Has max supply been reached?

### Issue #3: Database vs Blockchain Mismatch
From previous debugging sessions, we know:
- Database shows fewer roles than blockchain (gap identified)
- Some HATs may exist in database but not on-chain (or vice versa)
- The blockchain sync was incomplete

**Hypothesis:** The HAT being minted (member role) might:
- Not exist on-chain yet (only in pod_role_permissions table)
- Exist but have wrong admin (created with wrong parent)
- Be inactive or at max supply

---

## Recommended Fixes

### 1. **Immediate: Add Comprehensive Pre-Flight Checks**

Before attempting to mint, verify all Hats Protocol requirements:

```typescript
// Add to ApproveApplicationButton.tsx before transaction

// 1. Check if target HAT exists and is active
const hatDetails = await publicClient.readContract({
  address: HATS_PROTOCOL_ADDRESS,
  abi: HATS_ABI_EXTENDED, // Need viewHat function
  functionName: 'viewHat',
  args: [BigInt(effectiveHatId)],
});

if (!hatDetails.active) {
  console.error('❌ Target HAT is inactive');
  toast({
    title: 'Role Inactive',
    description: 'This role is currently inactive and cannot be minted.',
    variant: 'destructive',
  });
  return;
}

// 2. Check if applicant already wears the HAT
const applicantBalance = await publicClient.readContract({
  address: HATS_PROTOCOL_ADDRESS,
  abi: HATS_MINT_ABI_EXTENDED,
  functionName: 'balanceOf',
  args: [applicantAddress, BigInt(effectiveHatId)],
});

if (Number(applicantBalance) > 0) {
  console.error('❌ Applicant already wears this HAT');
  toast({
    title: 'Already Has Role',
    description: 'This applicant already has this role.',
    variant: 'destructive',
  });
  return;
}

// 3. **CRITICAL:** Check if smart account is admin of target HAT
const isAdmin = await publicClient.readContract({
  address: HATS_PROTOCOL_ADDRESS,
  abi: [
    {
      name: 'isAdminOfHat',
      type: 'function',
      inputs: [
        { name: '_user', type: 'address' },
        { name: '_hatId', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view',
    },
  ],
  functionName: 'isAdminOfHat',
  args: [smartAccountAddress, BigInt(effectiveHatId)],
});

if (!isAdmin) {
  console.error('❌ CRITICAL: Smart account is NOT admin of target HAT');
  console.error('Smart account:', smartAccountAddress);
  console.error('Target HAT:', effectiveHatId);
  console.error('Management HAT:', managementHatId);

  toast({
    title: 'Permission Error',
    description: 'Your account is not an admin of this role. Contact a pod administrator.',
    variant: 'destructive',
  });
  return;
}

console.log('✅ All pre-flight checks passed - proceeding with mint');
```

---

### 2. **Prevent Self-Approval**

Add check before allowing approval:

```typescript
// Add early in ApproveApplicationButton component
if (applicantAddress.toLowerCase() === evmAddress?.toLowerCase()) {
  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: '#F5E6E6', border: '1px solid #D9B3B3' }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: '#8B3A3A' }}>
        <XCircle className="w-5 h-5" />
        <span className="font-semibold">Cannot Approve Own Application</span>
      </div>
      <p className="text-sm" style={{ color: '#8B3A3A' }}>
        You cannot approve your own membership application. Another pod leader must approve it.
      </p>
    </div>
  );
}
```

---

### 3. **Verify HAT Exists On-Chain Before Minting**

The HAT might exist in database but not on blockchain. Add check:

```typescript
try {
  const hatDetails = await publicClient.readContract({
    address: HATS_PROTOCOL_ADDRESS,
    abi: [
      {
        name: 'viewHat',
        type: 'function',
        inputs: [{ name: '_hatId', type: 'uint256' }],
        outputs: [
          { name: 'details', type: 'string' },
          { name: 'maxSupply', type: 'uint32' },
          { name: 'supply', type: 'uint32' },
          { name: 'eligibility', type: 'address' },
          { name: 'toggle', type: 'address' },
          { name: 'imageURI', type: 'string' },
          { name: 'lastHatId', type: 'uint16' },
          { name: 'mutable_', type: 'bool' },
          { name: 'active', type: 'bool' },
        ],
        stateMutability: 'view',
      },
    ],
    functionName: 'viewHat',
    args: [BigInt(effectiveHatId)],
  });

  console.log('✅ HAT exists on-chain:', hatDetails);
} catch (error) {
  console.error('❌ HAT does not exist on-chain!', error);
  toast({
    title: 'Role Not Found',
    description: 'This role does not exist on the blockchain. Please contact a pod administrator.',
    variant: 'destructive',
  });
  return;
}
```

---

### 4. **Complete the HatsProtocol.json ABI**

Add missing functions to `src/abis/HatsProtocol.json`:

```json
[
  {
    "inputs": [
      { "internalType": "uint256", "name": "_hatId", "type": "uint256" },
      { "internalType": "address", "name": "_wearer", "type": "address" }
    ],
    "name": "mintHat",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_admin", "type": "uint256" },
      { "internalType": "string", "name": "_details", "type": "string" },
      { "internalType": "uint32", "name": "_maxSupply", "type": "uint32" },
      { "internalType": "address", "name": "_eligibility", "type": "address" },
      { "internalType": "address", "name": "_toggle", "type": "address" },
      { "internalType": "bool", "name": "_mutable", "type": "bool" },
      { "internalType": "string", "name": "_imageURI", "type": "string" }
    ],
    "name": "createHat",
    "outputs": [{ "internalType": "uint256", "name": "newHatId", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // ... existing functions (balanceOf, isWearerOfHat, viewHat, isAdminOfHat)
]
```

---

### 5. **Investigate Pod Proxy Architecture**

**Current State:**
User smart accounts call `mintHat` directly on Hats Protocol contract

**Pod Architecture:**
`PodAuthProxy.sol` is designed to be the admin of pod HATs

**Question:** Should minting go through the proxy instead of direct calls?

**Investigation Needed:**
1. Check how roles are currently created - do they use the proxy as admin?
2. If yes, minting must also go through the proxy
3. If no, verify that child HATs have the correct admin set (parent HAT, not proxy)

**Recommendation:** Review pod creation flow in `PodCreationManager.sol` to understand the intended admin structure.

---

## Testing Plan

### Test Case 1: Pre-Flight Checks
1. Create a test application with an INACTIVE role
2. Attempt approval
3. **Expected:** Error message "Role is inactive"

### Test Case 2: Self-Approval Prevention
1. User applies to their own pod
2. Same user tries to approve
3. **Expected:** Error message "Cannot approve own application"

### Test Case 3: Verify Admin Rights
1. Query `isAdminOfHat(smartAccountAddress, memberHatId)`
2. **Expected:** Should return `true` if user wears parent HAT

### Test Case 4: Non-Existent HAT
1. Create role in database only (not on-chain)
2. Attempt approval
3. **Expected:** Error message "Role not found on blockchain"

### Test Case 5: Duplicate Mint
1. Manually mint a HAT to applicant
2. Attempt approval for same role
3. **Expected:** Error message "Already has role"

---

## Summary of Findings

### ✅ Correct Architecture
1. ABI function signature matches Hats Protocol
2. Transaction structure is correct (CDP SDK usage)
3. Gas sponsorship (paymaster) properly enabled
4. Recent fixes correctly load member roles from database

### ❌ Critical Issues
1. **Missing isAdminOfHat check** - Doesn't verify caller can mint this HAT
2. **No HAT existence check** - Might try to mint non-existent HAT
3. **No duplicate prevention** - Doesn't check if applicant already has HAT
4. **Self-approval allowed** - Same person can approve their own application
5. **Incomplete HatsProtocol.json ABI** - Missing mintHat and createHat functions

### ⚠️ Architectural Questions
1. Should minting go through `PodAuthProxy` instead of direct calls?
2. How are child HATs' admins set during creation?
3. Is the database-blockchain sync complete for all roles?

---

## Next Steps (Priority Order)

1. **🔴 HIGH:** Add `isAdminOfHat` pre-flight check before minting
2. **🔴 HIGH:** Prevent self-approval (applicant == approver)
3. **🟡 MEDIUM:** Add HAT existence verification (viewHat check)
4. **🟡 MEDIUM:** Check if applicant already wears HAT (balanceOf check)
5. **🟡 MEDIUM:** Verify HAT is active and under max supply
6. **🟢 LOW:** Complete HatsProtocol.json ABI
7. **🟢 LOW:** Document whether direct minting or proxy-based minting is intended

---

## References

- **Hats Protocol Docs:** https://docs.hatsprotocol.xyz/for-developers/hats-protocol-for-developers/minting-hats
- **Interface Definition:** `src/contracts/interfaces/IHats.sol`
- **Pod Proxy Contract:** `src/contracts/PodAuthProxy.sol`
- **Working Self-Mint Example:** `src/features/pods/components/ClaimManagementHATButton.tsx`
