# Knowledge Base - Final Fixes Applied

**Date:** January 26, 2026

## Issues Fixed

### 1. ✅ Button Labels Updated
**Files Changed:** `src/features/pods/components/PodKnowledgeManager.tsx`

Changed button labels to be more concise:
- "New Category" → "Add" (line 249)
- "New Content" → "Add" (line 362)

### 2. ✅ RPC Function Created
**File Created:** `supabase/migrations/20260126000003_add_increment_knowledge_view_rpc.sql`

Created the missing `increment_knowledge_view` RPC function to atomically increment view counts.

**SQL to run in Supabase:**
```sql
CREATE OR REPLACE FUNCTION increment_knowledge_view(item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE knowledge_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_knowledge_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_knowledge_view(uuid) TO anon;
```

### 3. ✅ Content Security Policy Fixed
**File Changed:** `next.config.mjs` (line 194)

Added `media-src` directive to allow loading videos from files.spiritdao.org:
```javascript
media-src 'self' https://files.spiritdao.org;
```

**Before:** Videos failed with CSP error: "violates the following Content Security Policy directive: \"default-src 'self'\""

**After:** Videos can now load from files.spiritdao.org

## Issue Requiring Clarification

### 4. ⚠️ Knowledge Base Permissions in Controls Tab

**User Report:** "in pods/[id]/manage --> Controls I do not see a Knowledge Base Management function"

**Current State:** Knowledge Base permissions ARE defined in the codebase:
- `knowledgeBaseAccess` - View knowledge base items
- `knowledgeBaseManage` - Create/edit categories and upload content

**Permissions are in:**
1. `src/services/hatPermissionsService.ts` (lines 81-98)
2. `src/features/pods/components/PodManagerControlPanel.tsx` (lines 63-64, 87-88)
3. Database JSONB storage (`pod_role_permissions.permissions`)

**The Issue:**
The permissions exist in the backend but may not be visible in the UI where role permissions are toggled. The user mentions they don't see Knowledge Base toggles in the "Controls" tab where other permissions like "Chat Access", "Forum Access", etc. are displayed.

**What I Need:**
To find where the UI renders the permission toggle switches (checkboxes/switches for each permission when editing a role). This is likely in a component that maps over permission keys and creates UI controls.

**Search Locations:**
- Components in `src/app/pods/[id]/manage/components/`
- The "Controls" tab rendering logic
- Any component that displays permission toggles with labels like "Chat Access", "Bounty Management", etc.

## Testing Required

1. **RPC Function:** Run the SQL migration in Supabase
2. **Video Playback:** Restart dev server and test video playback
3. **Permissions UI:** Locate and update the Controls tab to include Knowledge Base toggles

## All Errors Addressed

**From `src/features/pods/errors.txt`:**

1. ✅ **404 on increment_knowledge_view** - Fixed with SQL migration
2. ✅ **CSP violation for files.spiritdao.org** - Fixed with media-src directive
3. ⚠️ **Font 404 error** - Unrelated to knowledge base (existing issue)
4. ✅ **NotSupportedError: no supported sources** - Fixed by CSP fix allowing videos to load

## Next Steps

1. User runs SQL migration for RPC function
2. Restart dev server to pick up CSP changes
3. Test video playback on /knowledge page
4. Identify where permission toggles are rendered in Controls tab
5. Add Knowledge Base Access and Knowledge Base Manage toggles in alphabetical order
