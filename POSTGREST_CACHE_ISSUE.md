# PostgREST Schema Cache Issue

## The Problem

After running the nuclear RLS fix, the policies should be correct, but you're still getting errors:
- `GET` returns **406 (Not Acceptable)** - unusual!
- `POST` returns **403 (Forbidden)** with RLS violation

The debug panel shows everything is correct, so this suggests **PostgREST's schema cache** hasn't refreshed.

## What is PostgREST?

Supabase uses PostgREST to provide the REST API. PostgREST caches the database schema (including RLS policies) for performance. When you change policies, the cache might not update immediately.

## Solution 1: Reload PostgREST Schema Cache (via Supabase Dashboard)

1. Go to **Supabase Dashboard**
2. Navigate to **Settings** → **API**
3. Look for a **"Reload schema cache"** or **"Restart PostgREST"** button
4. Click it

OR

## Solution 2: Reload via SQL (NOTIFY command)

Run this in Supabase SQL Editor:

```sql
NOTIFY pgrst, 'reload schema';
```

OR

## Solution 3: Wait for Auto-Refresh

PostgREST automatically refreshes its cache every **10 seconds** by default. Wait 10-15 seconds and try again.

## Solution 4: Restart the Supabase Project

If the above don't work:
1. Go to **Supabase Dashboard**
2. **Settings** → **General**
3. Find **"Pause project"** (if available)
4. Pause and unpause the project

## Solution 5: Manual Connection Pool Restart

In Supabase Dashboard:
1. **Database** → **Connection Pooling**
2. If there's a restart option, use it

## The 406 Error

The `406 (Not Acceptable)` error on GET suggests:
- PostgREST doesn't think the response format is acceptable
- OR there's a content negotiation issue
- OR the schema cache is serving stale data

This is different from 403 and suggests the cache is definitely the issue.

## After Clearing Cache

1. Wait 10-15 seconds
2. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Try the operations again

## Verification

After clearing the cache, run `verify-policies-created.sql` to confirm:
1. Policies exist
2. They use the correct wallet_address lookup
3. The lookup returns your wallet correctly
