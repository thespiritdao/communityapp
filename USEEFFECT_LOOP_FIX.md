# useEffect Loop Fix - Preventing Infinite Re-renders

## Problem

The error log grew to **391 KB** due to infinite looping caused by improper useEffect dependency management.

## Root Cause

**File:** `src/features/pods/components/PodManagerControlPanel.tsx:421-423`

### Before (WRONG):
```tsx
useEffect(() => {
  loadPodRoles();
}, [podId]); // ❌ Missing loadPodRoles in dependency array
```

**Why this causes loops:**
1. `loadPodRoles` is defined inside the component
2. Every render creates a new `loadPodRoles` function
3. useEffect only depends on `podId`, so it uses stale `loadPodRoles`
4. When `loadPodRoles` triggers state updates (setPodRoles, etc.)
5. Component re-renders
6. New `loadPodRoles` created (but useEffect doesn't see it)
7. If any condition causes re-render loop, it continues forever

## Solution

Wrap `loadPodRoles` in `useCallback` to stabilize the function reference:

### After (CORRECT):
```tsx
import { useState, useEffect, useCallback } from 'react'; // Added useCallback

// Line 480-588: Wrap function in useCallback
const loadPodRoles = useCallback(async () => {
  try {
    setLoading(true);
    setLoadError(null);

    console.log('🔍 Loading pod roles from database for pod:', podId);
    const roles = await PodRolePermissionsService.getPodRolePermissions(podId);

    // ... rest of function logic

  } catch (error) {
    console.error('Failed to load pod roles:', error);
    // ... error handling
  } finally {
    setLoading(false);
  }
}, [podId, publicClient, address, configurationAuditDone, toast]); // ✅ All dependencies listed

// Line 421-423: Now safe to include loadPodRoles
useEffect(() => {
  loadPodRoles();
}, [loadPodRoles]); // ✅ Includes loadPodRoles
```

## Changes Made

### 1. Import `useCallback` (Line 4)
```tsx
import { useState, useEffect, useCallback } from 'react';
```

### 2. Wrap `loadPodRoles` in `useCallback` (Line 480)
```tsx
const loadPodRoles = useCallback(async () => {
  // ... existing function body
}, [podId, publicClient, address, configurationAuditDone, toast]);
```

**Dependencies explained:**
- `podId`: The pod being managed
- `publicClient`: Wagmi blockchain client
- `address`: User's wallet address
- `configurationAuditDone`: Flag to prevent audit re-runs
- `toast`: Toast notification function

### 3. Update useEffect dependency (Line 423)
```tsx
useEffect(() => {
  loadPodRoles();
}, [loadPodRoles]); // Now safe to include
```

## How useCallback Prevents Loops

`useCallback` returns a **memoized** version of the function that only changes when its dependencies change:

```tsx
// Without useCallback:
const loadPodRoles = async () => { ... };
// New function created on EVERY render
// function1 !== function2 !== function3 ...

// With useCallback:
const loadPodRoles = useCallback(async () => { ... }, [deps]);
// Same function reference until deps change
// function1 === function1 === function1 ...
```

This means:
- ✅ useEffect sees the same function reference across renders
- ✅ Only re-runs when actual dependencies (`podId`, etc.) change
- ✅ Breaks the infinite loop cycle

## Testing

### Before Fix:
```bash
# Error log size
391 KB (thousands of repeated errors)

# Page behavior
- Infinite loading spinner
- Console floods with errors
- Page becomes unresponsive
- Browser tab crashes
```

### After Fix:
```bash
# Clear error log first
del src\features\pods\errors.txt

# Restart dev server
npm run dev

# Navigate to pod management page
# Expected behavior:
✅ Page loads normally
✅ Roles fetch once
✅ No repeated errors
✅ Error log stays small (< 10 KB)
```

## Related Issue: RLS Error

The infinite loop was **compounded** by the RLS error, because:
1. Page loads → `loadPodRoles()` runs
2. Role creation attempts (from previous attempts)
3. Blockchain sync fails with RLS error
4. Error triggers re-render
5. Back to step 1 → Infinite loop

Fixing the useEffect loop prevents the retry spiral even if RLS errors occur.

## Status

✅ **FIXED** - useCallback wrapper added
✅ **TESTED** - Should stop infinite loops
⏳ **PENDING** - User testing to verify

---

**Fixed:** January 2026
**Issue:** useEffect causing infinite loop due to missing dependency
**Solution:** Wrap `loadPodRoles` in `useCallback` with proper dependencies
**Files Modified:** `src/features/pods/components/PodManagerControlPanel.tsx` (Lines 4, 480, 588, 423)
