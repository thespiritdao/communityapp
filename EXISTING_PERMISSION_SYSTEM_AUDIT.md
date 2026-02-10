# Existing Permission System Audit

## Executive Summary

✅ **You already have a comprehensive database-first permission system!**

The hardcoded `HAT_ROLES` in `hatPermissionsService.ts` and `TOKEN_SYMBOL_MAP` in bounty components are **legacy code** that should NOT be used. Instead, use the existing database-first services.

---

## ✅ Existing Database-First Services

### 1. **`DatabaseFirstPermissionService`** (Primary)
**Location:** `src/services/DatabaseFirstPermissionService.ts`

**Purpose:** Fast, reliable permission checks using database as source of truth

**Key Methods:**
- `getUserPodMemberships(userAddress)` - Get user's pod memberships (50-100ms)
- `canUserManagePod(userAddress, podId)` - Check pod management permission
- `getUserPermissionsSummary(userAddress)` - Get complete permission summary

**Architecture:**
```
User → Query database (fast) → Grant access immediately ✅
            ↓
       Verify blockchain in background (async)
            ↓
       If mismatch → Revoke access
```

---

### 2. **`useDatabaseFirstPermissions`** Hook
**Location:** `src/hooks/useDatabaseFirstPermissions.ts`

**Usage:**
```typescript
const {
  memberships,           // User's pod memberships
  isExecutiveLeader,     // Is exec leader?
  managedPods,           // Pods user can manage
  isLoading,
  canManagePod,          // Async check
  canManagePodSync,      // Sync check (instant)
  isPodLeader,
  isMemberOf,
} = useDatabaseFirstPermissions();
```

**Benefits:**
- 50-100ms response time (vs 2-5 seconds with RPC)
- No rate limit issues
- Graceful degradation (RPC failures don't block access)
- Still secure (async verification catches mismatches)

---

### 3. **`PodRolePermissionsService`**
**Location:** `src/features/pods/services/PodRolePermissionsService.ts`

**Purpose:** Manage role permissions stored in `pod_role_permissions` table

**Key Methods:**
- `getPodRolePermissions(podId)` - Get all roles for a pod
- `getRolePermissionsByTokenAddress(tokenAddress)` - Get permissions for specific role
- `createRolePermission(...)` - Create new role
- `updateRolePermission(...)` - Update role permissions

**Database Schema:**
```typescript
interface PodRolePermission {
  id: string;
  pod_id: string;
  token_address: string;  // ERC-1155 token ID (hat ID)
  role_name: string;
  permissions: HatPermissions;  // ← Source of truth!
  eligibility_criteria: EligibilityCriteria[];
  is_active: boolean;
}
```

---

### 4. **`checkPodFeatureAccess`** (Three-Tier System)
**Location:** `src/utils/podFeatureAccess.ts`

**Purpose:** Unified access control through three layers

**Layers:**
1. **Module Toggle** - Is feature enabled for this pod? (`pod_modules` table)
2. **Token Gating** - Does user have required Hat?
3. **Role Permission** - Does user's role have permission?

**Usage:**
```typescript
const access = await checkPodFeatureAccess('bounties', userAddress, podId);
if (!access.allowed) {
  return <AccessDenied reason={access.reason} />;
}
```

---

### 5. **`useHybridPodPermission`** Hook (For Fund-Related Features)
**Location:** `src/hooks/useHybridPodPermission.ts`

**Purpose:** Two-factor permission check for critical operations

**Security Model:**
1. **ON-CHAIN:** Verifies user holds HAT token (source of truth)
2. **DATABASE:** Checks fine-grained permission flags

Both checks must pass for features involving funds.

**Usage:**
```typescript
const { hasPermission, isLoading } = useHybridPodPermission(
  podId,
  'bountyManagement'
);
```

**When to use:**
- Bounty management (involves funds)
- Treasury operations
- Paid events
- Marketplace transactions

---

### 6. **`useHatPermissions`** Hook
**Location:** `src/hooks/useHatPermissions.ts`

**Purpose:** React hook for permission checking

**Returns:**
```typescript
{
  userRoles: HatRole[];           // User's roles across pods
  userHats: string[];             // HAT IDs user holds
  canAccessChat: boolean;
  canCreateEvents: boolean;
  isPodLeader: boolean;
  // ... and more permission flags
}
```

---

## ❌ Legacy Code (DO NOT USE)

### 1. **`hatPermissionsService.ts` → `HAT_ROLES`**
**Problem:** Hardcoded permission mappings bypass database

**Example:**
```typescript
// ❌ WRONG - Hardcoded
BETA_TESTER: {
  permissions: {
    subPodCreation: true,
    bountyManagement: true,
  }
}
```

**Should be:**
```typescript
// ✅ RIGHT - Query database
const permissions = await PodRolePermissionsService
  .getRolePermissionsByTokenAddress(betaTesterHatId);
// permissions.subPodCreation from database
```

---

### 2. **`BountyCard.tsx` → `TOKEN_SYMBOL_MAP`**
**Problem:** Hardcoded token mappings bypass database

**Example:**
```typescript
// ❌ WRONG - Hardcoded
const TOKEN_SYMBOL_MAP = {
  BETA: 'hasBetaTesterHat',
  ADVOCATE: 'hasAdvocate',
};
```

**Should be:**
```typescript
// ✅ RIGHT - Use hybrid permission check
const { hasPermission } = useHybridPodPermission(podId, 'bountyManagement');
if (!hasPermission) {
  return <AccessDenied />;
}
```

---

### 3. **`useBountyTokenGating.ts` → `TOKEN_BALANCE_MAP`**
**Problem:** Hardcoded token mappings bypass database

**Should use:** `checkPodFeatureAccess('bounties', userAddress, podId)` instead

---

## 🎯 Recommended Migration Path

### For Bounty Access Control

**Current (BROKEN):**
```typescript
// BountyCard.tsx
const TOKEN_SYMBOL_MAP = {
  BETA: 'hasBetaTesterHat',  // ❌
};

useEffect(() => {
  const balances = await fetchTokenBalances(address);
  const hasAccess = balances.hasBetaTesterHat;  // ❌
}, []);
```

**Correct (DATABASE-FIRST):**
```typescript
// BountyCard.tsx
const { hasPermission, isLoading } = useHybridPodPermission(
  bounty.pod_id,
  'bountyManagement'
);

if (isLoading) return <LoadingSpinner />;
if (!hasPermission) return <AccessDenied />;
```

**OR use the three-tier system:**
```typescript
// BountyCard.tsx
const [hasAccess, setHasAccess] = useState(false);

useEffect(() => {
  const checkAccess = async () => {
    if (!address) return;

    const access = await checkPodFeatureAccess(
      'bounties',
      address,
      bounty.pod_id
    );

    setHasAccess(access.allowed);
  };

  checkAccess();
}, [address, bounty.pod_id]);
```

---

### For Pod Creation Permission

**Current (BROKEN):**
```typescript
// src/app/pods/page.tsx
const permissionService = new HatPermissionsService();
const hasPermission = await permissionService.canCreateSubPods(address);  // ❌ Uses hardcoded HAT_ROLES
```

**Correct (DATABASE-FIRST):**
```typescript
// src/app/pods/page.tsx
const { memberships } = useDatabaseFirstPermissions();

// Check if user has subPodCreation permission in ANY pod
const hasPermission = memberships.some(m => {
  // Query pod_role_permissions for this membership
  const rolePerms = await PodRolePermissionsService
    .getRolePermissionsByTokenAddress(m.hatId);

  return rolePerms?.permissions.subPodCreation === true;
});
```

**OR create a helper:**
```typescript
// Add to DatabaseFirstPermissionService
static async hasGlobalPermission(
  userAddress: string,
  permission: keyof HatPermissions
): Promise<boolean> {
  const memberships = await this.getUserPodMemberships(userAddress);

  for (const membership of memberships) {
    const rolePerms = await PodRolePermissionsService
      .getRolePermissionsByTokenAddress(membership.hatId);

    if (rolePerms?.permissions[permission] === true) {
      return true;
    }
  }

  return false;
}
```

---

## 📊 Database Tables (Source of Truth)

### `pod_role_permissions`
Source of truth for all role permissions
```sql
SELECT permissions FROM pod_role_permissions
WHERE token_address = '0x...' AND is_active = true;
-- Returns: { subPodCreation: true, bountyManagement: true, ... }
```

### `pod_modules`
Source of truth for pod-level feature toggles
```sql
SELECT bounties_enabled FROM pod_modules
WHERE pod_id = 'beta-testers-pod';
-- Returns: true or false
```

### `active_pod_members` (view)
Source of truth for user memberships
```sql
SELECT * FROM active_pod_members
WHERE wallet = '0x...' AND is_active = true;
-- Returns: All pods user is a member of
```

---

## ✅ Action Items

### Immediate
1. ✅ Remove `HAT_ROLES` from `hatPermissionsService.ts` OR add deprecation warning
2. ✅ Remove `TOKEN_SYMBOL_MAP` from `BountyCard.tsx`
3. ✅ Remove `TOKEN_BALANCE_MAP` from `useBountyTokenGating.ts`
4. ✅ Update all components to use existing database-first hooks

### Short Term
1. Add `hasGlobalPermission()` helper to `DatabaseFirstPermissionService`
2. Update `BountyCard` to use `useHybridPodPermission`
3. Update `PodsPage` to use `useDatabaseFirstPermissions`
4. Add migration guide for other components

### Long Term
1. Deprecate entire `hatPermissionsService.ts` file
2. Create unified permission checking wrapper
3. Add comprehensive permission testing suite
4. Document permission system in wiki

---

## 📚 Documentation

**Best Practices:** `src/features/podpermissions.md`

**Example Implementations:**
- `src/features/chat/components/HatGatedChatContainer.tsx` - Gated feature example
- `src/app/pods/page.tsx` - Permission-based UI rendering

**API Protection:**
- `src/features/pods/middleware/podAuthMiddleware.ts` - API route protection

---

## 🎉 Conclusion

You DON'T need to create `UserPermissionService` - **it already exists**!

Use these existing services instead:
- `useDatabaseFirstPermissions` - For pod management checks
- `useHybridPodPermission` - For fund-related features
- `checkPodFeatureAccess` - For three-tier access control
- `PodRolePermissionsService` - For role permission queries

The hardcoded `HAT_ROLES` and `TOKEN_SYMBOL_MAP` are **legacy technical debt** that bypass your properly designed database-first system.
