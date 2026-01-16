# Role Creation Name Persistence Fix

## Problem
When creating new roles, the role name was not being saved correctly in the database. Instead of the user's input (e.g., "ttttttttt"), the database would show "Role 00000000".

### Root Cause
The blockchain sync service had a critical flaw in the `quickSyncSingleHat` function:

1. **Initial Failure**: First role creation attempt would sometimes fail to sync properly (bundler delay issue)
2. **Database Entry**: Role would be created with fallback name "Role 00000000"
3. **Subsequent Attempts**: When user tried again, sync would find the HAT already exists in database
4. **Early Return**: Function would return `true` without checking if the name needed updating
5. **Stuck State**: Role name would remain "Role 00000000" forever

## Solution Implemented

### 1. Always Fetch from Blockchain
Modified `quickSyncSingleHat` to ALWAYS fetch HAT details from blockchain, even if it exists in database:

```typescript
// Before: Check exists, then skip
const exists = existingRoles.some(role => role.token_address === hatId);
if (exists) {
  return true; // ❌ Never updates!
}

// After: Always fetch blockchain data
const existingRole = existingRoles.find(role => role.token_address === hatId);
const hatDetails = await fetchHatDetails(publicClient, hatId);
```

### 2. Update Existing Roles
Added logic to update existing roles with blockchain data:

```typescript
if (existingRole) {
  // Check if update needed
  const needsUpdate =
    existingRole.role_name !== roleName ||
    existingRole.role_name.startsWith('Role 0') || // Fix bad names
    existingRole.max_holders !== hatDetails.maxSupply ||
    existingRole.is_active !== hatDetails.active;

  if (needsUpdate) {
    await PodRolePermissionsService.updateRoleFromBlockchain(
      hatDetails.hatId,
      {
        role_name: roleName,
        max_holders: hatDetails.maxSupply,
        is_active: hatDetails.active,
        updated_by: createdBy,
      }
    );
  }
}
```

### 3. New Service Method
Added `updateRoleFromBlockchain` method in `PodRolePermissionsService`:

```typescript
static async updateRoleFromBlockchain(
  tokenAddress: string,
  updates: {
    role_name?: string;
    max_holders?: number;
    is_active?: boolean;
    updated_by: string;
  }
): Promise<PodRolePermission>
```

This method:
- Updates role by `token_address` (HAT ID)
- Syncs blockchain state to database
- Updates `last_synced_at` and `sync_status`
- Preserves user permissions and settings

### 4. Delete Methods
Added methods to clean up bad roles:

```typescript
// Delete by ID
static async deleteRolePermission(id: string): Promise<void>

// Delete by token address
static async deleteRoleByTokenAddress(tokenAddress: string): Promise<void>
```

### 5. Cleanup Script
Created `scripts/delete-bad-role.mjs` to help users delete stuck roles:

```bash
# List all bad roles
node scripts/delete-bad-role.mjs

# Delete specific role
node scripts/delete-bad-role.mjs 0x000000880001000b000200000000000000000000000000000000000000000000
```

## Files Modified

1. **`src/features/pods/services/HatBlockchainSyncService.ts`**
   - Modified `quickSyncSingleHat` function (lines 362-429)
   - Always fetches from blockchain
   - Updates existing roles when needed
   - Detects and fixes generic "Role 0..." names

2. **`src/features/pods/services/PodRolePermissionsService.ts`**
   - Added `updateRoleFromBlockchain` method (lines 281-323)
   - Added `deleteRolePermission` method (lines 357-379)
   - Added `deleteRoleByTokenAddress` method (lines 381-403)

3. **`scripts/delete-bad-role.mjs`** (new file)
   - Lists roles with generic names
   - Deletes specific role by token address
   - Service role authentication for admin operations

## How It Works Now

### Role Creation Flow

1. **User Creates Role**
   - User inputs name "My Custom Role"
   - Transaction submitted to blockchain with correct JSON
   - HAT created on-chain with proper details

2. **5-Second Delay**
   - Wait for CDP bundler to mine transaction
   - Ensures HAT details are available on-chain

3. **Blockchain Sync**
   - Fetches HAT details from blockchain
   - Checks if role exists in database
   - **NEW**: If exists but has wrong name → UPDATE it
   - If doesn't exist → CREATE new entry

4. **Success Feedback**
   - Immediate toast: "✅ Role Created!"
   - After sync: "✅ Role Created Successfully! 'My Custom Role' is ready"
   - Or fallback: "⏳ Role Creation In Progress - refresh in 30s"

### Fixing Existing Bad Roles

If you have existing "Role 00000000" entries:

**Option 1: Delete and Re-create**
```bash
node scripts/delete-bad-role.mjs 0x[token_address]
# Then create role again in UI - will sync correctly
```

**Option 2: Force Re-sync**
- Create role with same name again
- New sync will detect "Role 0..." pattern
- Automatically updates with correct name from blockchain

## Testing

To verify the fix works:

1. **Test Normal Creation**
   - Create role with name "Test Role 123"
   - Should appear in database with exact name

2. **Test Fix for Bad Role**
   - If you have "Role 00000000" in database
   - Create another role (triggers sync)
   - Bad role should update with correct blockchain name

3. **Test Cleanup Script**
   ```bash
   # List bad roles
   node scripts/delete-bad-role.mjs

   # Delete specific one
   node scripts/delete-bad-role.mjs [token_address]
   ```

## About `pod_role_permissions_active`

**This is a VIEW, not a table!**

- Views are read-only database queries
- They show data from underlying tables
- You cannot delete directly from views
- Deleting from `pod_role_permissions` will update the view automatically

If role still shows after deletion:
1. Check if it was actually deleted from `pod_role_permissions` table
2. Refresh your database connection
3. Check for RLS policies blocking the delete
4. Use the cleanup script with service role key (bypasses RLS)

## Prevention

The fix prevents this issue by:
1. ✅ Always checking blockchain for latest data
2. ✅ Detecting generic "Role 0..." names
3. ✅ Auto-updating when sync runs
4. ✅ Better user feedback during creation
5. ✅ Proper delay before sync (5 seconds)

## Related Issues

This fix also addresses:
- Line 159 in errors.txt: "Role 00000000" appearing after creation
- Line 144: "HAT already in database" preventing updates
- View vs table confusion with `pod_role_permissions_active`
- Need for manual database cleanup tools
