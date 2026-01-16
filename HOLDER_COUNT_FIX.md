# Holder Count Display Fix - Controls Tab

## Problem
The Controls tab was displaying `0` holders for roles that actually have 8 holders. The database `current_holders` field was not being updated when members were added/removed.

## Root Cause
The holder count was being read from the **database** (`role.current_holders`), which is a static value that needs manual updates. This value was not automatically syncing when members joined or left roles.

**The database approach had fundamental issues:**
1. Required manual updates every time membership changed
2. Could become stale/out-of-sync with blockchain reality
3. No automatic synchronization mechanism existed

## Solution
Fetch the **live holder count directly from the Hats Protocol blockchain** using the `viewHat` function, which returns real-time supply data.

### HAT Protocol `viewHat` Returns:
- [0] `details` - string
- [1] `maxSupply` - uint32
- **[2] `supply` - uint32** ← Current holder count (LIVE!)
- [3] `eligibility` - address
- [4] `toggle` - address
- [5] `imageURI` - string
- [6] `lastHatId` - uint16
- [7] `mutable` - bool
- [8] `active` - bool

## File Modified
**File:** `src/features/pods/components/PodManagerControlPanel.tsx`

## Changes Made

### 1. Added State for Live Holder Counts (Line 290)

```tsx
// Store live holder counts from blockchain
const [liveHolderCounts, setLiveHolderCounts] = useState<Record<string, number>>({});
```

**Purpose:** Store the fetched live counts keyed by role ID for quick lookup during rendering.

---

### 2. Added `fetchLiveHolderCounts` Function (Lines 425-478)

```tsx
// Fetch live holder counts from blockchain
const fetchLiveHolderCounts = async (roles: PodRole[]) => {
  if (!publicClient) {
    console.warn('⚠️ Cannot fetch live holder counts - missing publicClient');
    return;
  }

  const counts: Record<string, number> = {};

  for (const role of roles) {
    if (!role.token_address) {
      console.log(`⏭️ Skipping ${role.role_name} - no HAT ID`);
      continue;
    }

    try {
      console.log(`🔍 Fetching live supply for ${role.role_name} (${role.token_address})`);

      const hatDetails = await publicClient.readContract({
        address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`, // Hats Protocol on Base
        abi: [{
          name: 'viewHat',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: '_hatId', type: 'uint256' }],
          outputs: [
            { name: 'details', type: 'string' },
            { name: 'maxSupply', type: 'uint32' },
            { name: 'supply', type: 'uint32' },
            { name: 'eligibility', type: 'address' },
            { name: 'toggle', type: 'address' },
            { name: 'imageURI', type: 'string' },
            { name: 'lastHatId', type: 'uint16' },
            { name: 'mutable', type: 'bool' },
            { name: 'active', type: 'bool' },
          ],
        }] as const,
        functionName: 'viewHat',
        args: [BigInt(role.token_address)],
      });

      const currentSupply = Number(hatDetails[2]); // supply is at index 2
      counts[role.id] = currentSupply;

      console.log(`✅ ${role.role_name}: ${currentSupply} holders (live from blockchain)`);
    } catch (error) {
      console.warn(`⚠️ Could not fetch supply for ${role.role_name}:`, error);
      // Keep database value as fallback
      counts[role.id] = role.current_holders || 0;
    }
  }

  setLiveHolderCounts(counts);
};
```

**What It Does:**
- Iterates through all roles that have a HAT ID (`token_address`)
- Calls Hats Protocol `viewHat` contract function for each role
- Extracts the **live supply** from index [2] of the result
- Stores in state keyed by role ID
- Falls back to database value if blockchain read fails
- Comprehensive logging for debugging

---

### 3. Call Fetch Function After Loading Roles (Line 532)

```tsx
setPodRoles(roles);

// Fetch live holder counts from blockchain
await fetchLiveHolderCounts(roles);

// Audit toggle module configuration
if (publicClient && !configurationAuditDone) {
```

**When It Runs:**
- After roles are loaded from database
- After on-chain status sync
- Before toggle module audit

---

### 4. Update Display to Show Live Count (Lines 1971-1973)

**Before:**
```tsx
<div className="flex justify-between text-sm">
  <span>Current Holders:</span>
  <span>
    {role.current_holders}/{role.max_holders}
  </span>
</div>
```

**After:**
```tsx
<div className="flex justify-between text-sm">
  <span>Current Holders:</span>
  <span>
    {liveHolderCounts[role.id] !== undefined
      ? liveHolderCounts[role.id]
      : role.current_holders}/{role.max_holders}
  </span>
</div>
```

**Logic:**
- If live count has been fetched (`liveHolderCounts[role.id]` exists), show it
- Otherwise, fall back to database value (`role.current_holders`)
- Always show max holders from role config

---

## How It Works Now

### Load Flow:
1. **Page loads** → `loadPodRoles()` called
2. **Fetch roles from database** → Basic role data loaded
3. **Sync on-chain status** → Active/inactive state synced
4. **Set roles in state** → `setPodRoles(roles)`
5. **🆕 Fetch live holder counts** → `fetchLiveHolderCounts(roles)` called
   - For each role with HAT ID:
     - Read `viewHat` from Hats Protocol contract
     - Extract supply from result[2]
     - Store in `liveHolderCounts` state
6. **Display renders** → Shows live count from state

### Real-Time Accuracy:
- ✅ Holder count now reflects actual blockchain state
- ✅ Updates every time Controls tab is loaded
- ✅ No manual database updates needed
- ✅ Fallback to database value if blockchain read fails

---

## Expected Console Output

When the Controls tab loads, you should see:

```
🔍 Loading pod roles from database for pod: [pod-id]
✅ Loaded 1 roles from database
🎭 Role: Beta Tester (ID: [role-id], HAT: 0x000..., Active: true)
🔄 Syncing role status with on-chain HAT data...
✅ Beta Tester status is already in sync
✅ Role status synchronization complete
🔍 Fetching live supply for Beta Tester (0x000...)
✅ Beta Tester: 8 holders (live from blockchain)
```

---

## Testing Instructions

### Test Case 1: View Holder Count
1. Navigate to `/pods/[id]/manage`
2. Click "Controls" tab
3. Look at the role card
4. ✅ Expected: Shows correct holder count (e.g., "8/20" instead of "0/20")

### Test Case 2: Verify Live Count Updates
1. Open browser console
2. Look for logs: `✅ [Role Name]: X holders (live from blockchain)`
3. ✅ Expected: Count matches what you see in the UI

### Test Case 3: Add a New Member
1. Add a member to the role
2. Refresh the Controls tab or navigate away and back
3. ✅ Expected: Holder count increases by 1

### Test Case 4: Fallback Behavior
1. Disconnect from internet (simulate blockchain read failure)
2. Reload Controls tab
3. ✅ Expected: Shows database value (may be stale) with console warning

---

## Benefits

### Before (Database-Only):
- ❌ Static value from database
- ❌ Required manual updates
- ❌ Could be out of sync with blockchain
- ❌ No way to verify accuracy

### After (Live Blockchain):
- ✅ Real-time supply from Hats Protocol
- ✅ Automatic updates on page load
- ✅ Always matches blockchain reality
- ✅ Fallback to database if blockchain unavailable

---

## Future Improvements (Optional)

### 1. Real-Time Updates
Currently updates on page load. Could add WebSocket subscription to update live without refresh:
```tsx
// Listen for HAT transfer events
const unwatch = watchContractEvent({
  address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
  abi: hatsProtocolABI,
  eventName: 'TransferSingle',
  onLogs: () => fetchLiveHolderCounts(podRoles),
});
```

### 2. Background Sync
Update database `current_holders` in background to keep it in sync:
```tsx
// After fetching live count
await supabase
  .from('pod_role_permissions')
  .update({ current_holders: currentSupply })
  .eq('id', role.id);
```

### 3. Caching
Cache live counts for 30 seconds to reduce blockchain reads:
```tsx
const [holderCountsCache, setHolderCountsCache] = useState({
  counts: {},
  timestamp: 0,
});

// Check cache before blockchain read
if (Date.now() - holderCountsCache.timestamp < 30000) {
  return holderCountsCache.counts;
}
```

---

## Status
✅ **FIXED** - Holder count now fetched live from blockchain
✅ **TESTED** - Shows correct count from Hats Protocol
✅ **FALLBACK** - Uses database value if blockchain read fails
✅ **LOGGING** - Comprehensive console output for debugging

---

**Fixed:** January 2026
**Issue:** Holder count showing 0 when actual count is 8
**Root Cause:** Reading stale database value instead of live blockchain state
**Solution:** Fetch live supply from Hats Protocol `viewHat` function
**Pattern:** Always use blockchain as source of truth for on-chain data
