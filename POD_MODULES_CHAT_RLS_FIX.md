# Pod Modules & Chat Groups RLS Policy Fix

## Issue Summary

Users were unable to create chat groups or enable pod modules, receiving RLS (Row Level Security) policy violations:

```
Error: {code: '42501', message: 'new row violates row-level security policy for table "pod_modules"'}
Error: {code: '42501', message: 'new row violates row-level security policy for table "chat_groups"'}
```

## Root Cause

The migration `20260113000000_fix_pod_modules_rls.sql` had **broken RLS policies** that checked:

```sql
auth.uid()::text = ANY(pods.pod_leads)
```

**This was incorrect** because:
- `auth.uid()` returns a UUID (e.g., `663e69b6-aefe-4a2c-83fc-5c5ac822a101`)
- `pods.pod_leads` contains wallet addresses (e.g., `0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48`)
- These will NEVER match!

## The Fix

Created migration `20260118000000_fix_pod_modules_rls_correctly.sql` that properly checks:

```sql
(SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()) = ANY(pods.pod_leads)
OR
pods.created_by_address = (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
```

This correctly:
1. Gets the user's wallet address from their profile using `auth.uid()`
2. Checks if that wallet address is in the `pod_leads` array
3. OR checks if the wallet matches `created_by_address`

## Files Changed

### New Migration
- `supabase/migrations/20260118000000_fix_pod_modules_rls_correctly.sql`
  - Drops broken policies from previous migration
  - Creates correct RLS policies for INSERT, UPDATE, DELETE on `pod_modules`
  - Grants proper permissions to authenticated users

### Diagnostic Scripts
- `scripts/check-pod-permissions.mjs` - Check if a wallet has manager access to a pod
- `scripts/check-chat-rls-permissions.mjs` - Check chat group creation permissions (existing)
- `scripts/fix-user-wallet-rls.mjs` - Sync user profile wallet_address (existing)

## How RLS Policies Work

The RLS policies enforce that only pod managers can create/modify modules and chat groups:

1. **User Authentication**: When a user makes a request, Supabase knows their `auth.uid()`
2. **Profile Lookup**: Policy queries `user_profiles` to get the user's `wallet_address`
3. **Permission Check**: Verifies wallet is in `pods.pod_leads` OR matches `pods.created_by_address`
4. **Grant/Deny**: Allows operation if check passes, denies if it fails

## Verification

To verify a user has proper permissions:

```bash
node scripts/check-pod-permissions.mjs <pod-id> <wallet-address>
```

Example:
```bash
node scripts/check-pod-permissions.mjs f2bc166d-33d5-47dc-8409-ea8d445d3fc0 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48
```

## Requirements for Users

For RLS policies to work, users must have:

1. **Authenticated Session**: Logged in via Supabase Auth (provides `auth.uid()`)
2. **User Profile**: Entry in `user_profiles` table linked to their `auth.uid()`
3. **Wallet Address**: `user_profiles.wallet_address` must be set
4. **Pod Manager Status**: Their wallet must be in:
   - `pods.pod_leads` array (as a pod leader), OR
   - `pods.created_by_address` (as the pod creator)

## Affected Tables

- `pod_modules` - Stores module configuration (chat, forum, treasury, etc.)
- `chat_groups` - Stores pod chat channels

## Related Issues

- Initial fix attempt added `created_by_address` to chat_groups inserts but didn't solve the issue
- The problem was at the RLS policy level, not the data level
- User profile had wallet_address correctly set, but policy wasn't checking it properly

## Testing

After running the migration, test by:

1. Navigate to `/pods/[id]/manage`
2. Try toggling a module (e.g., Chat Channels)
3. Try creating a chat group
4. Should succeed without RLS violations

## Future Prevention

When creating RLS policies:
- **Always** use `user_profiles.wallet_address` lookups, not `auth.uid()` directly
- **Test** policies with actual user data
- **Remember**: `auth.uid()` is a UUID, wallet addresses are hex strings
- **Verify** that the data type you're comparing matches what's in the database
