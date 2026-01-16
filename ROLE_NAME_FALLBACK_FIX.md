# Role Name Fallback Fix

## Problem
When creating roles, if the HAT ID already exists on blockchain with invalid details (like plain text "test" instead of proper JSON), the sync would fail to parse the name and fall back to "Role 00000000".

**Example from logs:**
```
Line 6: HAT details JSON sent: {"type":"role","name":"treasurer","description":"treasurer"}
Line 60: HAT details on blockchain: 'test' (plain string, not JSON!)
Line 61: Failed to parse HAT details JSON: SyntaxError
Line 142: Created with fallback name: "Role 00000000"
```

## Root Cause

1. **Orphaned HAT on blockchain**: When you delete a role from database, it only removes the database entry - the blockchain HAT still exists
2. **Invalid HAT details**: The orphaned HAT has invalid details (plain string instead of JSON)
3. **No fallback to user input**: The sync only tried to parse blockchain data, never used the name the user just typed

## Solution Implemented

### 1. Pass User's Input as Fallback
Modified `quickSyncSingleHat` to accept fallback name/description parameters:

```typescript
export async function quickSyncSingleHat(
  publicClient: PublicClient,
  podId: string,
  hatId: string,
  createdBy: string,
  fallbackName?: string,        // NEW: User's intended role name
  fallbackDescription?: string  // NEW: User's intended description
): Promise<boolean>
```

### 2. Use Fallback When Blockchain Has Bad Data
```typescript
// Try to extract role name from blockchain
let roleName = extractRoleName(hatDetails.details, hatDetails.hatId);

// If extraction resulted in generic name but we have a fallback, use fallback
if (roleName.startsWith('Role 0') && fallbackName) {
  console.log(`⚠️ Blockchain has invalid/missing details, using provided name: ${fallbackName}`);
  roleName = fallbackName;
}
```

### 3. Pass Fallback from UI
Updated the call in `PodManagerControlPanel.tsx`:

```typescript
const success = await HatBlockchainSyncService.quickSyncSingleHat(
  publicClient,
  podId,
  expectedHatId,
  address,
  roleCreationTransaction?.roleData.name,        // Fallback name
  roleCreationTransaction?.roleData.description  // Fallback description
);
```

### 4. Improved User Feedback
**Before:**
- Toast appeared for 5 seconds
- Disappeared during the 5-10 second wait
- User saw nothing during sync

**After:**
- Initial toast: 15 seconds ("Syncing with database... (10-15 seconds)")
- Success toast: 8 seconds (clear confirmation)
- Fallback toast: 8 seconds (if sync fails)

## How It Works Now

### Scenario 1: Clean HAT Creation (Normal Flow)
1. User creates role "treasurer"
2. Transaction creates HAT with correct JSON
3. Wait 5 seconds for bundler
4. Sync fetches HAT details from blockchain
5. Parses JSON successfully → Role name: "treasurer" ✓

### Scenario 2: Orphaned HAT with Bad Data (Fixed!)
1. User creates role "treasurer"
2. System tries to sync expected HAT ID
3. HAT already exists on blockchain with invalid details "test"
4. **NEW**: Parser fails, detects "Role 0..." pattern
5. **NEW**: Falls back to user's input: "treasurer" ✓
6. Creates/updates database with correct name!

## Testing the Fix

### Test 1: Create New Role
1. Go to pods/[id]/manage → Controls → Create Role
2. Enter name: "Test Manager Role"
3. Submit
4. **Expected:**
   - See toast: "Syncing with database... (10-15 seconds)" for 15s
   - Wait ~10 seconds (visible feedback the whole time)
   - See toast: "✅ Role Created Successfully! 'Test Manager Role' is now active" for 8s
   - Database shows: `role_name: "Test Manager Role"` ✓

### Test 2: Handle Orphaned HAT
1. If you have orphaned HAT on blockchain with bad details
2. Create role with that same HAT ID
3. **Expected:**
   - Console log: "⚠️ Blockchain has invalid/missing details, using provided name: [your name]"
   - Database shows your intended name (not "Role 00000000")
   - User sees correct name in UI

## Cleaning Up Orphaned HATs

If you have HATs on blockchain that are causing issues:

**Option 1: Let the Fix Handle It**
- Just create the role again with the correct name
- The fallback will use your input instead of blockchain's bad data

**Option 2: Delete and Start Fresh**
```bash
# Delete from database
node scripts/delete-bad-role.mjs [token_address]

# Create role again - will sync correctly
```

**Option 3: Manual Blockchain Cleanup (Advanced)**
- If you need to remove the HAT from blockchain entirely
- You'll need to use the Hats Protocol contract
- This requires the admin HAT and is more complex

## Files Modified

1. **`src/features/pods/services/HatBlockchainSyncService.ts`** (lines 362-395)
   - Added `fallbackName` and `fallbackDescription` parameters
   - Added logic to use fallback when blockchain has bad data
   - Logs when fallback is used

2. **`src/features/pods/components/PodManagerControlPanel.tsx`** (lines 1870-1921)
   - Pass fallback name/description to sync function
   - Increased initial toast to 15 seconds
   - Increased success toast to 8 seconds
   - Added note about timing in description

## Why This Happens

**Blockchain is Permanent:**
- When you create a HAT on blockchain, it stays there forever
- Deleting from database doesn't delete from blockchain
- The HAT ID is calculated deterministically (same every time)
- If you recreate a role, it may try to use the same HAT ID

**Invalid Details:**
- Some older HATs may have been created with plain strings instead of JSON
- This was from earlier code that didn't enforce JSON format
- Or from testing/debugging where "test" was used as a quick value

## Prevention

To avoid orphaned HATs in the future:

1. ✅ **Use fallback name** (this fix)
2. ✅ **Better user feedback** (15s toast)
3. ✅ **Detect and warn** about existing HATs
4. Consider: Implement HAT deactivation instead of deletion
5. Consider: Use unique identifiers in HAT creation

## Related Issues Fixed

- ❌ **Before**: "Role 00000000" appearing after creation
- ✅ **After**: Uses user's input when blockchain has bad data
- ❌ **Before**: 5s toast disappears during 10s wait
- ✅ **After**: 15s toast covers the entire wait
- ❌ **Before**: No visibility into what's happening
- ✅ **After**: Clear "Syncing with database... (10-15 seconds)" message
