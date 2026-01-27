# Knowledge Base RLS Implementation

**Date:** January 26, 2026

## Summary

Added Row Level Security (RLS) policies to protect knowledge base content from unauthorized access and modifications.

## Problem

The knowledge base tables were "unrestricted" which meant:
- ❌ Anyone could read ALL content (even private pod content)
- ❌ Anyone could create/edit/delete categories and items
- ❌ No authentication required
- ❌ Direct Supabase API calls bypassed all security

## Solution

Created comprehensive RLS policies that:
- ✅ Enable RLS on all 3 knowledge base tables
- ✅ Allow public access to global public content
- ✅ Require HAT permissions for pod-specific content
- ✅ Restrict write operations to authorized managers
- ✅ Protect against direct API manipulation

## Files Created

### 1. Migration File
**Location:** `supabase/migrations/20260126000004_add_knowledge_base_rls.sql`

**What it does:**
- Enables RLS on `knowledge_categories`, `knowledge_items`, `knowledge_item_views`
- Creates 13 security policies
- Adds detailed comments for documentation

### 2. Application Script
**Location:** `scripts/apply-knowledge-rls.mjs`

**How to run:**
```bash
node scripts/apply-knowledge-rls.mjs
```

## RLS Policies Explained

### Knowledge Categories (6 policies)

#### SELECT Policies (Read Access)
1. **Public can view global public categories**
   - Content: `pod_id IS NULL AND is_public = true`
   - Who: Everyone (no auth needed)
   - Use case: Global SpiritDAO tutorials

2. **Members can view pod categories with access permission**
   - Content: `pod_id IS NOT NULL`
   - Who: Pod members with `knowledgeBaseAccess` permission OR public categories
   - Use case: Token-gated pod knowledge bases

#### INSERT/UPDATE/DELETE Policies (Write Access)
3-6. **Managers can create/update/delete pod categories**
   - Who: Pod members with `knowledgeBaseManage` permission
   - Prevents: Unauthorized users from modifying content

### Knowledge Items (6 policies)

Same structure as categories:
- 2 SELECT policies (public global + pod-specific with permissions)
- 4 write policies (INSERT/UPDATE/DELETE for managers only)

### Knowledge Item Views (2 policies)

1. **Anyone can record views**
   - Allows the `increment_knowledge_view` RPC function to work
   - The RPC is `SECURITY DEFINER` so it bypasses RLS safely

2. **Users can view their own view history**
   - Users can see what they've watched
   - Privacy: Can't see other users' view history

## Permission Architecture

### Global Knowledge Base
```
pod_id = NULL
is_public = true
→ Accessible to EVERYONE (no wallet needed)
→ Use for: Public tutorials, getting started guides
```

### Pod-Specific Knowledge Base
```
pod_id = [specific_pod_id]
→ Requires active HAT with knowledgeBaseAccess permission
→ Can be public (is_public = true) or private
→ Use for: Private pod training, internal documentation
```

### Management Access
```
knowledgeBaseManage permission required to:
- Create categories
- Create items
- Edit categories
- Edit items
- Delete categories
- Delete items
```

## How RLS Works with Your App

### JWT Authentication
Your app already sets the wallet address in the JWT via `createSupabaseSession`:
```typescript
await supabase.auth.setSession({
  access_token: supabaseToken,
  refresh_token: supabaseRefreshToken,
});
```

The JWT contains `wallet_address` which RLS policies use:
```sql
auth.jwt() ->> 'wallet_address'
```

### Permission Checking
RLS policies query the `pod_role_assignments` and `pod_role_permissions` tables:
```sql
SELECT 1
FROM pod_role_assignments pra
JOIN pod_role_permissions prp ON pra.role_id = prp.id
WHERE pra.pod_id = knowledge_items.pod_id
  AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
  AND pra.is_active = true
  AND (prp.permissions->>'knowledgeBaseAccess')::boolean = true
```

This means:
1. User must have an active role assignment
2. Role must have the specific permission enabled
3. Everything is checked server-side (can't be bypassed)

## Testing the RLS

### Before Running Migration
```bash
# Check current RLS status (should be OFF)
psql "$SUPABASE_DB_URL" -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE tablename IN ('knowledge_categories', 'knowledge_items', 'knowledge_item_views');
"
```

### Apply Migration
```bash
node scripts/apply-knowledge-rls.mjs
```

### After Running Migration
```bash
# Verify RLS is enabled (should show 't' for true)
psql "$SUPABASE_DB_URL" -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE tablename IN ('knowledge_categories', 'knowledge_items', 'knowledge_item_views');
"

# View all policies
psql "$SUPABASE_DB_URL" -c "
  SELECT tablename, policyname, cmd
  FROM pg_policies
  WHERE tablename IN ('knowledge_categories', 'knowledge_items', 'knowledge_item_views')
  ORDER BY tablename, policyname;
"
```

### Test Scenarios

#### Test 1: Public Global Content (Should Work)
```javascript
// No authentication needed
const { data } = await supabase
  .from('knowledge_items')
  .select('*')
  .is('pod_id', null)
  .eq('is_public', true);
// Should return all global public items
```

#### Test 2: Pod Content Without Permission (Should Fail)
```javascript
// User has no HAT for this pod
const { data, error } = await supabase
  .from('knowledge_items')
  .select('*')
  .eq('pod_id', 'some-pod-id');
// Should return empty array (RLS filters it out)
```

#### Test 3: Pod Content With Permission (Should Work)
```javascript
// User has active HAT with knowledgeBaseAccess
const { data } = await supabase
  .from('knowledge_items')
  .select('*')
  .eq('pod_id', 'pod-user-has-access-to');
// Should return all items for that pod
```

#### Test 4: Creating Content Without Permission (Should Fail)
```javascript
// User doesn't have knowledgeBaseManage permission
const { error } = await supabase
  .from('knowledge_categories')
  .insert({
    pod_id: 'some-pod-id',
    name: 'Test Category'
  });
// Should fail with RLS error
```

## Security Benefits

### Before RLS
```
Anyone → Supabase API → Direct database access ❌
```

### After RLS
```
User → Supabase API → RLS Policies → Database ✅
                    ↓
            Check permissions
            Filter results
            Block unauthorized writes
```

### What's Protected
1. **Direct API calls** - Even with the anon key, users can't bypass permissions
2. **SQL injection** - RLS policies are evaluated at the database level
3. **Token tampering** - JWT is verified by Supabase before policies run
4. **Privilege escalation** - Users can't give themselves permissions

## Troubleshooting

### Issue: Category created but not visible in frontend

**Possible causes:**
1. User doesn't have `knowledgeBaseAccess` permission for the pod
2. User's HAT is not active (`is_active = false`)
3. Frontend permission check returning false

**Debug steps:**
```javascript
// In browser console:
console.log('Address:', address);
console.log('User Hats:', userHats);
console.log('Selected Pod:', selectedPod);

// Check if permission check passes:
const hasAccess = userHats?.find(
  hat => hat.podId === selectedPod &&
  hat.isActive &&
  hat.permissions?.knowledgeBaseAccess === true
);
console.log('Has Access:', hasAccess);
```

### Issue: RLS blocking legitimate access

**Check the role assignment:**
```sql
SELECT
  pra.pod_id,
  pra.wallet_address,
  pra.is_active,
  prp.permissions->>'knowledgeBaseAccess' as kb_access,
  prp.permissions->>'knowledgeBaseManage' as kb_manage
FROM pod_role_assignments pra
JOIN pod_role_permissions prp ON pra.role_id = prp.id
WHERE pra.wallet_address = '0x...'; -- your wallet
```

## Next Steps

1. ✅ Run the migration: `node scripts/apply-knowledge-rls.mjs`
2. ✅ Test public global content (should work without login)
3. ✅ Test pod-specific content with permissions
4. ✅ Verify managers can create/edit content
5. ✅ Confirm non-managers cannot modify content

## Migration Reversibility

If you need to disable RLS (NOT recommended for production):
```sql
-- Disable RLS (removes all security)
ALTER TABLE knowledge_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_item_views DISABLE ROW LEVEL SECURITY;

-- Drop all policies
DROP POLICY "Public can view global public categories" ON knowledge_categories;
DROP POLICY "Members can view pod categories with access permission" ON knowledge_categories;
-- ... (drop all 13 policies)
```

## Additional Notes

- RLS policies are evaluated on EVERY database query
- Performance impact is minimal (policies use indexed columns)
- Policies are enforced even for service role (unless explicitly bypassed)
- This protects against both malicious users AND developer mistakes
