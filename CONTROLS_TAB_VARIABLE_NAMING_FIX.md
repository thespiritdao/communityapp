# Controls Tab Variable Naming Fix

## Problem
The Controls tab in `pods/[id]/manage` was STILL crashing after the initial OnchainKit → CDP migration fix, with a NEW error:
```
ReferenceError: transactionConfig is not defined (at line 1888)
```

## Root Cause
During the migration, we renamed state variables for consistency but **missed updating ALL references** in the massive PodManagerControlPanel.tsx file (2400+ lines). This led to multiple undefined variable errors:

1. **Line 1888**: Code referenced `transactionConfig` which didn't exist
2. **Line 1896**: Code referenced `transactionConfig?.roleId` which didn't exist
3. **Lines 2159-2246**: Code referenced `toggleModuleConfig` which didn't exist

## Variable Naming Inconsistencies Found

### Issue 1: `transactionConfig` → `pendingToggleRole`
**Location:** Lines 1888, 1896 (role toggle Switch component)

The Switch component and status text were checking for a variable called `transactionConfig` that didn't exist. This variable should have been `pendingToggleRole` (declared at line 262).

### Issue 2: `toggleModuleConfig` → `pendingModuleConfig`
**Location:** Lines 1202, 2159-2246 (toggle module configuration UI)

The entire toggle module configuration section was using:
- `toggleModuleConfig` (undefined state variable)
- `setToggleModuleConfig()` (undefined setter)

But the actual state was declared as:
- `pendingModuleConfig` (line 277)
- `setPendingModuleConfig()` (line 277)

### Issue 3: State Type Mismatch
**Location:** Line 278

The state type definition had `call: any` but the code was using `transactionCall`, causing a property mismatch.

## Files Fixed

### `src/features/pods/components/PodManagerControlPanel.tsx`

#### Fix 1: Switch Component Variable Names (Lines 1888, 1896)

**Before:**
```tsx
<Switch
  checked={role.is_active}
  onCheckedChange={() => toggleRoleActive(role.id)}
  className="permission-switch"
  disabled={transactionConfig !== null}  // ❌ Undefined variable
/>
<span className="text-xs">
  {transactionConfig?.roleId === role.id  // ❌ Undefined variable
    ? 'Preparing...'
    : role.is_active
      ? 'Active'
      : 'Disabled'}
</span>
```

**After:**
```tsx
<Switch
  checked={role.is_active}
  onCheckedChange={() => toggleRoleActive(role.id)}
  className="permission-switch"
  disabled={pendingToggleRole !== null}  // ✅ Correct variable
/>
<span className="text-xs">
  {pendingToggleRole?.roleId === role.id  // ✅ Correct variable
    ? 'Preparing...'
    : role.is_active
      ? 'Active'
      : 'Disabled'}
</span>
```

#### Fix 2: State Type Definition (Line 278)

**Before:**
```tsx
const [pendingModuleConfig, setPendingModuleConfig] = useState<{
  call: any;  // ❌ Property name mismatch
  roleId: string;
  roleName: string;
  targetToggleHat: string;
} | null>(null);
```

**After:**
```tsx
const [pendingModuleConfig, setPendingModuleConfig] = useState<{
  transactionCall: any;  // ✅ Matches usage in code
  roleId: string;
  roleName: string;
  targetToggleHat: string;
} | null>(null);
```

#### Fix 3: Module Configuration Setter (Line 1202)

**Before:**
```tsx
// Set the transaction config for OnchainKit
setToggleModuleConfig({  // ❌ Undefined function
  ...transactionConfig,
  roleId,
  roleName: role.role_name,
});
```

**After:**
```tsx
// Set the transaction config for CDP
setPendingModuleConfig({  // ✅ Correct function
  ...transactionConfig,
  roleId,
  roleName: role.role_name,
});
```

#### Fix 4: Module Configuration UI (Lines 2159-2246)

**Before:**
```tsx
{toggleModuleConfig && (  // ❌ Undefined variable
  <Card>
    <CardTitle>
      Configuring Toggle Module: {toggleModuleConfig.roleName}
    </CardTitle>
    <CardContent>
      <p>Setting toggle module to Executive Pod Leader HAT (
        {toggleModuleConfig.targetToggleHat})
      </p>
      <Button onClick={async () => {
        const response = await sendUserOperation({
          calls: [{
            to: toggleModuleConfig.transactionCall.address,
            data: toggleModuleConfig.transactionCall.data,
            value: toggleModuleConfig.transactionCall.value || 0n,
          }],
        });

        toast({
          description: `Toggle module configured for ${toggleModuleConfig.roleName}.`,
        });

        setToggleModuleConfig(null);
      }}>
        Configure Toggle Module
      </Button>

      <button onClick={() => setToggleModuleConfig(null)}>
        Cancel
      </button>
    </CardContent>
  </Card>
)}
```

**After:**
```tsx
{pendingModuleConfig && (  // ✅ Correct variable
  <Card>
    <CardTitle>
      Configuring Toggle Module: {pendingModuleConfig.roleName}
    </CardTitle>
    <CardContent>
      <p>Setting toggle module to Executive Pod Leader HAT (
        {pendingModuleConfig.targetToggleHat})
      </p>
      <Button onClick={async () => {
        const response = await sendUserOperation({
          calls: [{
            to: pendingModuleConfig.transactionCall.address,
            data: pendingModuleConfig.transactionCall.data,
            value: pendingModuleConfig.transactionCall.value || 0n,
          }],
        });

        toast({
          description: `Toggle module configured for ${pendingModuleConfig.roleName}.`,
        });

        setPendingModuleConfig(null);
      }}>
        Configure Toggle Module
      </Button>

      <button onClick={() => setPendingModuleConfig(null)}>
        Cancel
      </button>
    </CardContent>
  </Card>
)}
```

## Summary of Changes

| Old Variable Name | New Variable Name | Lines Affected |
|-------------------|-------------------|----------------|
| `transactionConfig` | `pendingToggleRole` | 1888, 1896 |
| `toggleModuleConfig` | `pendingModuleConfig` | 1202, 2159, 2168, 2174, 2189, 2190, 2191, 2201, 2210, 2226, 2245 |
| `setToggleModuleConfig` | `setPendingModuleConfig` | 1202, 2210, 2226, 2245 |
| State type: `call` | State type: `transactionCall` | 278 |

## State Variable Naming Convention

After this fix, all CDP transaction state follows a consistent pattern:

```tsx
// HAT Toggle Operations
const [toggleTransactionPending, setToggleTransactionPending] = useState(false);
const [pendingToggleRole, setPendingToggleRole] = useState<{...} | null>(null);

// Eligibility Sync Operations
const [syncTransactionPending, setSyncTransactionPending] = useState(false);
const [pendingSyncConfig, setPendingSyncConfig] = useState<{...} | null>(null);

// Module Configuration Operations
const [moduleConfigPending, setModuleConfigPending] = useState(false);
const [pendingModuleConfig, setPendingModuleConfig] = useState<{...} | null>(null);
```

**Naming Pattern:**
- Boolean flags: `{operation}TransactionPending`
- Transaction data: `pending{Operation}` (e.g., `pendingToggleRole`, `pendingSyncConfig`)

## Verification

Run this command to verify NO undefined variables remain:
```bash
grep -E "(transactionConfig|toggleModuleConfig|syncTransactionConfig)[^a-zA-Z]" src/features/pods/components/PodManagerControlPanel.tsx | grep -v "const transactionConfig" | grep -v "transactionConfiguration"
```

Expected result: Only **local variables** (temporary vars within functions) should appear, NO undefined state references.

## Testing Instructions

1. **Clear Next.js cache and restart**:
   ```bash
   rm -rf .next
   npm run dev
   ```

2. **Test the Controls tab**:
   - Navigate to any pod: `/pods/[id]/manage`
   - Click the "Controls" tab
   - ✅ Tab should load without crashing
   - Try toggling a role on/off
   - Verify the status shows "Preparing..." during toggle
   - Try configuring toggle modules
   - Verify UI updates correctly

## Why This Happened

**PodManagerControlPanel.tsx is MASSIVE:**
- 2400+ lines of code
- 3 separate transaction patterns (HAT toggle, eligibility sync, module config)
- Inconsistent variable naming from incremental migration
- Complex nested UI logic

**Migration Process:**
1. Initial migration renamed some variables for consistency
2. Missed updating ALL references due to file size
3. Variable name mismatches weren't caught until runtime

**Lesson:** Large files require comprehensive find/replace operations, not manual editing.

## Related Issues

This fix addresses the **third crash** in the Controls tab:
1. ✅ First crash: `syncTransactionConfig` → `pendingSyncConfig` (fixed in CONTROLS_TAB_CRASH_FIX.md)
2. ✅ Second crash: Migrated Module Configuration Transaction (fixed in CONTROLS_TAB_CRASH_FIX.md)
3. ✅ Third crash: `transactionConfig` and `toggleModuleConfig` variable naming (THIS FIX)

## Status
✅ **FIXED** - All variable naming inconsistencies resolved
✅ **VERIFIED** - No undefined state variable references remain
✅ **READY FOR TESTING**

---

**Fixed:** January 2026
**Issue:** Controls tab crash on toggle (third iteration)
**Solution:** Fixed variable naming inconsistencies from incomplete migration
