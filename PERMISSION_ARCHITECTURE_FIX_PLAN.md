# Permission Architecture Fix Plan

## Problem: Hardcoded Permissions Bypass Database

### Current State (BROKEN)
The codebase has **two conflicting permission systems**:

1. **Database-First (CORRECT)** ✅
   - `pod_role_permissions` table - Source of truth
   - `tokens` table - Token definitions
   - `DatabaseFirstPermissionService` - Fast, reliable queries
   - `PodRolePermissionsService` - Role management

2. **Hardcoded Blockchain-First (ANTIQUATED)** ❌
   - `hatPermissionsService.ts` → `HAT_ROLES` - Hardcoded permission mappings
   - `BountyCard.tsx` → `TOKEN_SYMBOL_MAP` - Hardcoded token mappings
   - `useBountyTokenGating.ts` → `TOKEN_BALANCE_MAP` - Hardcoded token mappings

### Why This is Broken

**Example 1: Beta Tester Pod Creation**
```typescript
// WRONG: Hardcoded in hatPermissionsService.ts
BETA_TESTER: {
  permissions: {
    subPodCreation: true  // ❌ Bypasses database
  }
}

// RIGHT: Should query database
SELECT permissions FROM pod_role_permissions
WHERE token_address = '0x...' AND is_active = true
→ { subPodCreation: true } ✅
```

**Example 2: Bounty Access**
```typescript
// WRONG: Hardcoded in BountyCard.tsx
const TOKEN_SYMBOL_MAP = {
  BETA: 'hasBetaTesterHat',  // ❌ Bypasses database
}

// RIGHT: Should query database
SELECT * FROM tokens WHERE symbol = 'BETA'
→ Get contract_address, then check user balance ✅
```

### Impact
- Database changes don't take effect (need code deployment)
- No flexibility for pod admins to configure permissions
- Inconsistent permission checking across features
- Hard to audit who has what permissions

---

## Solution: Database-First Architecture

### Phase 1: Fix Bounty Token Gating

**Current Flow (BROKEN):**
```
BountyCard → TOKEN_SYMBOL_MAP → fetchTokenBalances → RPC call
```

**New Flow (CORRECT):**
```
BountyCard → Query pod_role_permissions → Check user's role → Check permissions.bountyManagement
```

**Implementation:**
1. Replace `TOKEN_SYMBOL_MAP` with database query to `pod_role_permissions`
2. Check if user's hat/role has `bountyManagement: true` permission
3. Use `DatabaseFirstPermissionService` for fast, cached lookups

### Phase 2: Fix Pod Creation Permission

**Current Flow (BROKEN):**
```
PodsPage → HatPermissionsService.canCreateSubPods() → HAT_ROLES[BETA_TESTER] → hardcoded true
```

**New Flow (CORRECT):**
```
PodsPage → PodRolePermissionsService.getUserPermissions() → Check permissions.subPodCreation from DB
```

**Implementation:**
1. Remove `HAT_ROLES` hardcoded mappings
2. Query `pod_role_permissions` for user's role
3. Check `permissions.subPodCreation` from database

### Phase 3: Deprecate hatPermissionsService

**Current Usage:**
- `HatPermissionsService.canCreateSubPods()` - Used in PodsPage
- `HatPermissionsService.getUserPermissions()` - Used in various components
- `HAT_ROLES` - Referenced in permission checks

**Migration:**
1. Replace all `HatPermissionsService` calls with `DatabaseFirstPermissionService`
2. Add deprecation warnings to `hatPermissionsService.ts`
3. Eventually remove file entirely

---

## Database Schema (Already Correct)

### `pod_role_permissions` table
```sql
id: uuid
pod_id: text
token_address: text  -- ERC-1155 token ID (formerly hat_id)
role_name: text
permissions: jsonb   -- { subPodCreation: boolean, bountyManagement: boolean, ... }
eligibility_criteria: jsonb[]
is_active: boolean
```

### `tokens` table
```sql
id: uuid
name: text
symbol: text
contract_address: text
token_type: text  -- 'ERC1155', 'ERC721', 'ERC20'
is_active: boolean
```

### `active_pod_members` table (view)
```sql
wallet: text
pod_id: text
pod_name: text
membership_type: text  -- 'leader' | 'member'
hat_id: text
is_active: boolean
```

---

## Implementation Steps

### Step 1: Add Helper Service
Create `src/services/UserPermissionService.ts`:
```typescript
/**
 * Database-First User Permission Service
 * Replaces hardcoded HAT_ROLES with database queries
 */
export class UserPermissionService {
  /**
   * Get user's permissions across all pods they're a member of
   */
  static async getUserPermissions(userAddress: string): Promise<HatPermissions> {
    // 1. Get user's pod memberships from active_pod_members
    const memberships = await DatabaseFirstPermissionService.getUserPodMemberships(userAddress);

    // 2. Get role permissions for each membership
    const rolePermissions = await Promise.all(
      memberships.map(m =>
        PodRolePermissionsService.getRolePermissionsByTokenAddress(m.hatId)
      )
    );

    // 3. Merge permissions (union of all roles)
    return this.mergePermissions(rolePermissions);
  }

  /**
   * Check if user has specific permission in any pod
   */
  static async hasPermission(
    userAddress: string,
    permission: keyof HatPermissions
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userAddress);
    return permissions[permission] === true;
  }
}
```

### Step 2: Update BountyCard
```typescript
// Before (WRONG):
const TOKEN_SYMBOL_MAP = {
  BETA: 'hasBetaTesterHat',
  ADVOCATE: 'hasAdvocate',
};

// After (RIGHT):
const checkBountyAccess = async () => {
  if (!address) return false;

  // Check if user has bountyManagement permission in ANY pod
  const canAccess = await UserPermissionService.hasPermission(
    address,
    'bountyManagement'
  );

  setHasAccess(canAccess);
};
```

### Step 3: Update PodsPage
```typescript
// Before (WRONG):
const permissionService = new HatPermissionsService();
const hasPermission = await permissionService.canCreateSubPods(address);

// After (RIGHT):
const hasPermission = await UserPermissionService.hasPermission(
  address,
  'subPodCreation'
);
```

---

## Benefits of Database-First

1. **Flexibility** - Pod admins can configure permissions via UI
2. **Consistency** - Single source of truth for all permissions
3. **Performance** - Database queries are cached and fast (50-100ms)
4. **Auditability** - All permission changes are logged in database
5. **Reliability** - No RPC rate limits or network failures

---

## Migration Checklist

- [ ] Create `UserPermissionService.ts`
- [ ] Update `BountyCard.tsx` to use database queries
- [ ] Update `useBountyTokenGating.ts` to use database queries
- [ ] Update `src/app/pods/page.tsx` to use database queries
- [ ] Add deprecation warnings to `hatPermissionsService.ts`
- [ ] Test with beta tester account
- [ ] Test with advocate account
- [ ] Test with non-member account
- [ ] Deploy and verify in production

---

## Notes

- Keep `SessionCacheManager` - that fix is still valid
- Keep `fetchTokenBalances` for balance checks, but not permission checks
- `hatPermissionsService.ts` can remain for backwards compatibility but should be deprecated
- All new features should use `UserPermissionService` instead
