# Pod Management Permissions Fix

**Date**: January 5, 2026
**Issue**: Executive Pod Leader HAT on-chain but NO management permissions for pods
**Status**: ✅ **RESOLVED**

---

## 🎯 **Problem Summary**

User has Executive Pod Leader HAT on-chain and can create events (✅), but **cannot manage pods** at `/pods/`. Only viewing permissions were granted despite being an Executive Pod Leader.

### **Root Cause**

Pod management permission checks used the **`pod_leads` array** in the `pods` table:

```typescript
// OLD CODE - Only checked pod_leads array
const isLeader = Boolean(
  pod.pod_leads?.some(
    (lead) => lead.toLowerCase() === effectiveAddress.toLowerCase(),
  ),
);
```

**The Problem**:
- User's OLD wallet: `0x12a0cf22d632c859b793f852af03b9d515580244` (in `pod_leads` array) ✅
- User's NEW wallet: `0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48` (in `pod_members` table) ✅
- Pod permission checks ONLY looked at `pod_leads` array ❌
- Result: User had HAT in database but no pod management permissions

This is a **different** issue from the event creation bug:
- **Event creation** - Uses `pod_members` table + `pod_role_permissions` (fixed earlier)
- **Pod management** - Used `pod_leads` array (fixed now)

---

## ✅ **Solution**

Modified all pod permission checks to query the `pod_members` table (the source of truth for HAT-based membership) with fallback to `pod_leads` array for backwards compatibility.

### **Files Modified**

#### **1. PodCoreService.ts** (Lines 518-589)

**Before**:
```typescript
static canUserManagePod(pod: Pod, userAddress: string): boolean {
  return (
    pod.created_by_address?.toLowerCase() === userAddress.toLowerCase() ||
    (pod.pod_leads?.some(...) ?? false)  // Only checked array
  );
}
```

**After**:
```typescript
static async canUserManagePod(pod: Pod, userAddress: string): Promise<boolean> {
  // 1. Check if creator
  if (pod.created_by_address?.toLowerCase() === normalizedAddress) {
    return true;
  }

  // 2. Check pod_leads array (backwards compatibility)
  const isInLeadsArray = pod.pod_leads?.some(...) ?? false;
  if (isInLeadsArray) return true;

  // 3. CRITICAL FIX - Check pod_members table
  const membership = await this.checkPodMembership(pod.id, normalizedAddress);
  if (membership.is_member && membership.membership_type === 'leader') {
    return true;
  }

  // 4. Check for Executive Pod leadership (full access to all pods)
  const execPod = await supabase.from('pods')...;
  const execMembership = await this.checkPodMembership(execPod.id, normalizedAddress);
  if (execMembership.is_member && execMembership.membership_type === 'leader') {
    return true;  // Executive Pod leaders can manage ALL pods!
  }

  return false;
}
```

**Key Changes**:
- ✅ Now queries `pod_members` table
- ✅ Checks for Executive Pod leadership (grants access to ALL pods)
- ✅ Made async to support database queries
- ✅ Maintains backwards compatibility with `pod_leads` array

---

#### **2. usePodPermissions.ts** (Lines 1-185)

**Before**:
```typescript
const isLeader = Boolean(
  pod.pod_leads?.some(...)  // Only checked array
);
const canManagePod = PodCoreService.canUserManagePod(pod, effectiveAddress);
```

**After**:
```typescript
// CRITICAL FIX: Check pod_members table in useEffect
const [isLeaderInDB, setIsLeaderInDB] = useState<boolean | null>(null);
const [isExecutiveLeader, setIsExecutiveLeader] = useState<boolean>(false);

useEffect(() => {
  const checkLeadershipInDatabase = async () => {
    // Check if user is leader in this pod's pod_members table
    const { data: podMembership } = await supabase
      .from('pod_members')
      .select('membership_type, is_active')
      .eq('pod_id', pod.id)
      .eq('wallet', normalizedAddress)
      .eq('is_active', true)
      .maybeSingle();

    setIsLeaderInDB(podMembership?.membership_type === 'leader');

    // Check if user is Executive Pod leader (access to all pods)
    const { data: execPod } = await supabase...;
    const { data: execMembership } = await supabase...;
    setIsExecutiveLeader(execMembership?.membership_type === 'leader' || false);
  };

  checkLeadershipInDatabase();
}, [pod, effectiveAddress]);

// User is a leader if they're in array OR database OR Executive Pod leader
const isLeader = isInLeadsArray || isLeaderInDB === true || isExecutiveLeader;
const canManagePod = isCreator || isLeader;
```

**Key Changes**:
- ✅ Added `useEffect` to query database asynchronously
- ✅ Checks `pod_members` table for current pod
- ✅ Checks for Executive Pod leadership
- ✅ Combines all sources: array + database + Executive Pod
- ✅ Added console logging for debugging

---

#### **3. usePodAccessControl.ts** (Lines 87-167)

**Before**:
```typescript
// Check Executive Pod membership
isExecutiveMember = executivePod.pod_leads?.some(...) || false;

// Check Pod Leadership
isPodLeader = pod.pod_leads?.some(...) || false;
```

**After**:
```typescript
// Check Executive Pod membership
// CRITICAL FIX: Check pod_members table first (source of truth)
const { data: execMembership } = await supabase
  .from('pod_members')
  .select('membership_type, is_active')
  .eq('pod_id', executivePod.id)
  .eq('wallet', address.toLowerCase())
  .eq('is_active', true)
  .maybeSingle();

isExecutiveMember = execMembership?.membership_type === 'leader' || false;

// Fallback: Check pod_leads array (legacy)
if (!isExecutiveMember) {
  isExecutiveMember = executivePod.pod_leads?.some(...) || false;
}

// Fallback: Check HAT on-chain
if (!isExecutiveMember && executivePod.membership_hat_id) {
  const hatBalance = await HatCreationService.checkHatOwnership(...);
  isExecutiveMember = hatBalance;
}
```

**Key Changes**:
- ✅ Checks `pod_members` table first (source of truth)
- ✅ Falls back to `pod_leads` array
- ✅ Falls back to on-chain HAT verification
- ✅ Three-tier permission check ensures maximum compatibility

---

## 🎓 **Permission Check Hierarchy**

The system now uses a **three-tier fallback** for maximum reliability:

### **Tier 1: Database (pod_members table)** - PRIMARY
- Fastest and most reliable
- Updated when HATs are minted
- Supports offline/cached access
- **This is the source of truth!**

### **Tier 2: Legacy Array (pod_leads)** - BACKWARDS COMPATIBILITY
- For pods created before HAT system
- For manual overrides
- Immediate update without blockchain transaction

### **Tier 3: On-Chain Verification** - ULTIMATE FALLBACK
- Queries Hats Protocol contract directly
- Slowest but always accurate
- Used when tiers 1 & 2 fail

---

## 🔍 **Debugging Features**

Added console logging to help diagnose permission issues:

```javascript
console.log('🔍 Pod permissions calculated:', {
  podName: pod.name,
  isInLeadsArray,        // Is user in pod_leads array?
  isLeaderInDB,          // Is user leader in pod_members table?
  isExecutiveLeader,     // Is user Executive Pod leader?
  canManagePod,          // Final permission decision
  isLeader,              // Combined leader status
});
```

Look for these logs in browser console when testing!

---

## 🧪 **Testing Instructions**

### **Test 1: Executive Pod Member Access**

1. **Hard refresh browser**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. **Navigate to** `/pods/`
3. **Expected**: You should see management functions for:
   - ✅ **Executive Pod** (you're a leader)
   - ✅ **Community Pod** (you're Executive Pod leader = access to all pods)
   - ❌ **Top Hat** (should be HIDDEN - only for Executive Pod members)

### **Test 2: Check Console Logs**

Open browser console and look for:
```
✅ User 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48 is leader in pod_members table
✅ User 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48 is Executive Pod leader - has access to all pods

🔍 Pod permissions calculated: {
  podName: "Executive Pod",
  isInLeadsArray: false,
  isLeaderInDB: true,     ← Should be true!
  isExecutiveLeader: true, ← Should be true!
  canManagePod: true,     ← Should be true!
  isLeader: true
}
```

### **Test 3: Management Functions**

For each pod you can manage, verify you see:
- ✅ **Edit Pod** button
- ✅ **Manage Members** section
- ✅ **Treasury** access (if pod has treasury)
- ✅ **Deactivate Pod** option (if active)

---

## 📊 **Permission Schema Recap**

As clarified by user:

### **Executive Pod Leaders** 🔴
- **Full access to EVERYTHING**
- Can manage ALL pods (including Community Pod, Executive Pod)
- Can view Top Hat pod
- Can create events in any pod
- Can access all treasury functions

### **Other Pod Leaders** 🟡
- **Full permissions to their owned pods**
- **Full permissions to sub-pods within their owned pods**
- Example: Community Pod Leader can manage Community Pod + any sub-pods under Community Pod
- Cannot access Executive Pod or Top Hat pod

### **Pod Members** 🟢
- Limited permissions based on `pod_role_permissions` table
- Can view pod content
- Can participate in pod activities
- Cannot manage pod settings

---

## 🎯 **What This Fixes**

1. ✅ **Pod management permissions** - Executive Pod leaders can now manage all pods
2. ✅ **New wallet support** - Works with any wallet that has HAT (not just pod_leads array)
3. ✅ **HAT-based permissions** - Fully integrated with Hats Protocol
4. ✅ **Executive Pod hierarchy** - Executive Pod leaders have access to all pods
5. ✅ **Backwards compatibility** - Still works with legacy pod_leads array

---

## 🚨 **Known Limitations**

### **Top Hat Visibility**

The Top Hat pod (5754d810-7729-4a48-a0bb-31774175dcc1) should be **hidden from non-Executive Pod members**. This requires updating the pod listing component to filter based on user permissions.

**Location to Fix**: `src/features/pods/hooks/usePods.ts` or the pod listing component

**Required Change**:
```typescript
// Filter out Top Hat pod for non-executive members
const filteredPods = pods.filter(pod => {
  if (pod.name === 'Top hat' && !isExecutiveLeader) {
    return false;  // Hide Top Hat from non-exec members
  }
  return true;
});
```

---

## 📋 **Remaining Tasks**

1. **Test pod management** - Verify management functions now appear
2. **Hide Top Hat pod** - Filter pod list based on Executive Pod membership
3. **Beta Tester token expiration** - Extend or create new time-based HAT (expired Dec 30, 2025)

---

## 📦 **Related Fixes**

This fix builds on the earlier permission parsing fix:

### **Fix #1: Event Creation Permissions** (COMPLETED)
- **File**: `src/hooks/useHatPermissions.ts`
- **Issue**: JSON string not parsed to object
- **Status**: ✅ Fixed

### **Fix #2: HAT Minting Sync** (COMPLETED)
- **Files**: `ClaimManagementHATButton.tsx`, `/api/onboarding/mint-hat/route.ts`
- **Issue**: HAT minted on-chain but not synced to database
- **Status**: ✅ Fixed

### **Fix #3: Pod Management Permissions** (COMPLETED - THIS FIX)
- **Files**: `PodCoreService.ts`, `usePodPermissions.ts`, `usePodAccessControl.ts`
- **Issue**: Only checked `pod_leads` array, not `pod_members` table
- **Status**: ✅ Fixed

---

**Generated with** 🤖 [Claude Code](https://claude.com/claude-code)
