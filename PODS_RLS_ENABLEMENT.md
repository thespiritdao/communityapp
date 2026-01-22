## Pods Table RLS Enablement Plan

### Current Status
**RLS is currently DISABLED on the `pods` table**

This means:
- ❌ Anyone can read ALL pods (including inactive/rejected)
- ❌ Anyone can update ANY pod
- ❌ Anyone can delete ANY pod
- ❌ No security restrictions whatsoever

### Impact of Enabling RLS

#### What Will Work ✅
1. **Reading active pods** - All users can see active pods
2. **Creating pods** - Authenticated users can create pods (governance approval still required)
3. **Pod leaders managing their pods** - Leaders can update/delete their own pods
4. **Service role operations** - Backend scripts and migrations will work

#### What Might Break ❌
1. **Admin operations** - If you have admin UI that queries all pods (including inactive)
2. **Pod member queries** - If non-leaders try to update pod settings
3. **Reporting/analytics** - Queries that need to see all pods regardless of status

### Recommended Testing Plan

#### Step 1: Delete Test Pod (Before Enabling RLS)
```bash
# Run in Supabase SQL Editor
-- Replace ROLLBACK with COMMIT if you want to keep changes
```
See: `scripts/delete-pod.sql`

#### Step 2: Enable RLS
```bash
# Apply migration
npx supabase db push
# OR manually run: supabase/migrations/20250121000003_enable_pods_rls.sql
```

#### Step 3: Test Pod Creation Flow
1. **Create a new pod** via the app
2. **Verify it appears** in the pods list
3. **Check status** is "proposed" or "draft"
4. **Approve via governance** (if applicable)
5. **Verify status** changes to "active"

#### Step 4: Test Pod Management
1. **As pod leader:**
   - Update pod details ✅ Should work
   - Delete pod ✅ Should work
2. **As non-leader:**
   - Try to update pod ❌ Should fail
   - Try to delete pod ❌ Should fail

#### Step 5: Test Edge Cases
1. **Inactive pods** - Should not appear in public lists
2. **Rejected pods** - Should not appear in public lists
3. **Service role scripts** - Should still work

### RLS Policies Created

```sql
1. "Anyone can read active pods" (SELECT)
   - Public can see pods where is_active = true

2. "Pod leaders can update their pods" (UPDATE)
   - Only if wallet_address is in pod_leads array

3. "Authenticated users can create pods" (INSERT)
   - Anyone authenticated can propose a pod

4. "Pod leaders can delete their pods" (DELETE)
   - Only if wallet_address is in pod_leads array

5. "Service role full access to pods" (ALL)
   - Backend scripts and migrations bypass RLS
```

### Rollback Plan

If enabling RLS causes issues:

```sql
-- Disable RLS immediately
ALTER TABLE pods DISABLE ROW LEVEL SECURITY;

-- Drop all policies
DROP POLICY IF EXISTS "Anyone can read active pods" ON pods;
DROP POLICY IF EXISTS "Pod leaders can update their pods" ON pods;
DROP POLICY IF EXISTS "Authenticated users can create pods" ON pods;
DROP POLICY IF EXISTS "Pod leaders can delete their pods" ON pods;
DROP POLICY IF EXISTS "Service role full access to pods" ON pods;
```

### Known Risks

#### LOW RISK ✅
- Pod creation flow (app handles this well)
- Pod member viewing
- Public pod listings

#### MEDIUM RISK ⚠️
- Admin queries that need to see all pods
- Analytics queries counting inactive pods
- Pod leader checks (depends on JWT wallet_address)

#### HIGH RISK ❌
- If `auth.jwt() ->> 'wallet_address'` is not populated correctly
- If pod_leads array format doesn't match expectations
- If there are queries that need to see inactive pods

### Testing Checklist

Before enabling RLS in production:
- [ ] Delete test pod (scripts/delete-pod.sql)
- [ ] Apply RLS migration (20250121000003_enable_pods_rls.sql)
- [ ] Create a new test pod
- [ ] Verify it appears in pod list
- [ ] Update pod as leader (should work)
- [ ] Try to update as non-leader (should fail)
- [ ] Check inactive pods are hidden
- [ ] Verify service scripts still work
- [ ] Test pod governance approval flow
- [ ] Check pod member queries
- [ ] Verify pod analytics/reports

After enabling in staging:
- [ ] Monitor error logs for RLS violations
- [ ] Check Supabase logs for failed queries
- [ ] Test all pod-related features
- [ ] Verify nothing broke unexpectedly

If all tests pass, enable in production! 🚀

### Expected Console Logs After Enabling

**Before (RLS disabled):**
```
All pods visible, no restrictions
```

**After (RLS enabled):**
```
Only active pods visible to public
Inactive/rejected pods hidden
Leaders can manage their pods only
```

### Next Steps

1. **TESTING RECOMMENDED:** Yes, create a test pod with RLS enabled
2. **BACKUP RECOMMENDED:** Export current pods table before migration
3. **MONITORING:** Watch Supabase logs for RLS policy violations
4. **ROLLBACK READY:** Keep rollback SQL handy

Good luck! 🍀
