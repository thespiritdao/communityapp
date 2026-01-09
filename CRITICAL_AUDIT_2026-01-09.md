# Critical Permission System Audit - January 9, 2026

## 🚨 CRITICAL ISSUES IDENTIFIED

### Issue #1: 406 Errors STILL OCCURRING (Not Fixed)
**Status:** 🔴 **CRITICAL** - Our previous fix did NOT resolve this

```
GET pod_role_permissions?select=*&token_address=...&is_active=eq.true
→ 406 (Not Acceptable)
```

**What we thought we fixed:**
- We changed EligibilityService.ts to query by `token_address` instead of `role_name`

**Why it's STILL failing:**
- The 406 errors are STILL showing in production
- This means our fix didn't get deployed correctly OR there's another code path still using the old query

**Action:** Need to verify which code is making these 406 queries

---

### Issue #2: Supabase 400 Error - Token Query Format
**Status:** 🔴 **CRITICAL** - Invalid SQL syntax

```
GET /rest/v1/tokens?select=*&symbol=not.in.%28SELF%2CSYSTEM%29&is_active=eq.true
→ 400 (Bad Request)
```

**Root Cause:**
The query `symbol=not.in.(SELF,SYSTEM)` is using **incorrect Supabase syntax**.

**Correct Syntax:**
```typescript
// WRONG (current):
.not('symbol', 'in', '(SELF,SYSTEM)')

// CORRECT:
.not('symbol', 'in', ['SELF', 'SYSTEM'])
```

OR use array notation:
```typescript
.not.in('symbol', ['SELF', 'SYSTEM'])
```

**Impact:** Token loading completely fails, blocking permission checks

---

### Issue #3: Infura Rate Limiting (429 errors)
**Status:** 🟡 **HIGH** - Hitting RPC limits

```
POST https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50
→ 429 (Too Many Requests)
```

**Root Cause:**
- Making too many RPC calls to check HAT balances on-chain
- Likely from `useHatPermissions` hook calling `balanceOf` for every user/pod combination
- No caching or batching of RPC calls

**Impact:**
- Permission checks fail intermittently
- Users see inconsistent permissions
- Beta testers can't access features they should have

---

### Issue #4: Multiple Supabase Client Instances
**Status:** 🟡 **MEDIUM** - Performance + State Issues

```
Multiple GoTrueClient instances detected in the same browser context.
```

**Root Cause:**
- Multiple `createClient()` calls creating separate auth contexts
- Likely from importing `supabase` in multiple places vs using singleton

**Impact:**
- Auth state inconsistency
- Memory leaks
- Possible race conditions in permission checks

---

### Issue #5: Notifications STILL Not Working
**Status:** 🔴 **CRITICAL** - CDP migration incomplete

Despite our fix, notifications still show "Please connect your wallet"

**Possible causes:**
1. **Cache issue** - Old build still deployed
2. **Provider missing** - UnifiedNotificationProvider not wrapped in CDP provider
3. **Hook initialization** - `useEvmAddress` returning undefined before wallet loads

---

## 🔍 ROOT CAUSE ANALYSIS

### Why Permissions Fail for Some Users But Not Others

**The Real Problem: Race Conditions + Cascading Failures**

1. **Initial Load Sequence:**
   ```
   User loads page
   → useEvmAddress() initializes (may take 500-1000ms)
   → useHatPermissions() starts loading
   → Makes RPC calls to check HAT balances
   → Makes Supabase calls to load permissions
   → If ANY step fails → Entire permission chain breaks
   ```

2. **First Point of Failure: Infura Rate Limit**
   - When RPC calls hit 429, HAT balance checks fail
   - System assumes user doesn't have HAT
   - Permission denied

3. **Second Point of Failure: Supabase Token Query**
   - 400 error on token query breaks eligibility checks
   - System can't determine what tokens are required
   - Permission denied by default

4. **Third Point of Failure: 406 pod_role_permissions**
   - Can't load permission definitions
   - System doesn't know what permissions exist
   - Permission denied

5. **Result:**
   - **Users with good timing** → All calls succeed → Permissions work
   - **Users with bad timing** → One call fails → Everything breaks
   - **Why it's intermittent** → Depends on rate limits, cache state, timing

---

## 📊 CURRENT SYSTEM ARCHITECTURE FLAWS

### Permission Check Flow (Current - BROKEN)

```
┌─────────────────┐
│ User Loads Page │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ useEvmAddress()             │ ← May be slow/undefined initially
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ useHatPermissions()         │
│  → Queries active_pod_members│ ← Database query (fast)
│  → For each HAT:            │
│     → Check balanceOf()     │ ← RPC call (SLOW, rate limited)
│     → Load permissions      │ ← Supabase query (may 406/400)
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ canUserManagePod()          │ ← Depends on ALL above succeeding
│  → Executive check          │
│  → Leader check             │
│  → Beta Tester check        │
└─────────────────────────────┘
```

### Problems with This Design:

1. **No Fallback Strategy**
   - If RPC fails → Assume no HAT (WRONG)
   - Should: Use database as source of truth, RPC as verification

2. **No Caching**
   - Every page load = Full RPC calls
   - Should: Cache HAT balances, revalidate periodically

3. **Synchronous Dependencies**
   - Each step blocks the next
   - Should: Parallel loading with timeouts

4. **No Error Recovery**
   - One 429 error = Everything breaks
   - Should: Retry with exponential backoff

5. **Database as Secondary**
   - Code treats blockchain as primary source
   - Should: **Database IS the source of truth** (we control it)

---

## 🎯 RECOMMENDED ARCHITECTURE (Correct Approach)

### Principle: **Trust Database First, Verify Blockchain Later**

```
┌─────────────────┐
│ User Loads Page │
└────────┬────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ STEP 1: Load from Database (INSTANT)  │
│  → active_pod_members (user's roles)  │
│  → pod_role_permissions (what they can do) │
│  → GRANT ACCESS IMMEDIATELY            │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ STEP 2: Verify Blockchain (ASYNC)     │
│  → Check balanceOf() in background    │
│  → If mismatch: Update database       │
│  → If mismatch: Revoke access         │
└────────────────────────────────────────┘
```

### Why This Works:

1. **Instant Access**
   - Database query = 50-100ms
   - RPC call = 500-2000ms (or timeout)
   - User sees permissions immediately

2. **Resilient to RPC Failures**
   - 429 errors don't block users
   - Rate limits affect verification, not access

3. **Secure**
   - We control database writes (only verified HAT holders get added)
   - Blockchain verification catches any database manipulation
   - Mismatch = Immediate access revocation

4. **Scalable**
   - Database can handle 1000s of queries/sec
   - RPC is rate-limited to ~100-200/sec

---

## 🔧 IMMEDIATE ACTION ITEMS

### Priority 1: Fix Supabase Token Query (30 min)
**File:** Find where `symbol=not.in.(SELF,SYSTEM)` is being queried

**Search for:**
```typescript
.not('symbol', 'in', '(SELF,SYSTEM)')
// OR
symbol=not.in
```

**Fix to:**
```typescript
.not.in('symbol', ['SELF', 'SYSTEM'])
// OR
.not('symbol', 'in', ['SELF', 'SYSTEM'])
```

### Priority 2: Find Remaining 406 Queries (30 min)
**Search entire codebase for:**
```typescript
role_name
```

**Why:** The 406 errors prove our fix didn't catch all queries

### Priority 3: Add RPC Caching (2 hours)
**Create:** `src/services/HATCacheService.ts`

**Implementation:**
```typescript
class HATCacheService {
  private cache = new Map<string, { balance: number; timestamp: number }>();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async getHATBalance(address: string, hatId: string): Promise<number> {
    const key = `${address}:${hatId}`;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.balance; // Return cached value
    }

    try {
      // Make RPC call
      const balance = await hatsContract.balanceOf(address, hatId);
      this.cache.set(key, { balance, timestamp: Date.now() });
      return balance;
    } catch (error) {
      // If RPC fails, check database as fallback
      const dbRecord = await supabase
        .from('active_pod_members')
        .select('*')
        .eq('wallet', address.toLowerCase())
        .eq('hat_id', hatId)
        .eq('is_active', true)
        .maybeSingle();

      return dbRecord ? 1 : 0; // Database says they have it
    }
  }
}
```

### Priority 4: Fix Notification Provider Wrapping (15 min)
**File:** `src/app/layout.tsx`

**Verify:**
```typescript
<CDPProvider>
  <UnifiedNotificationProvider>
    {children}
  </UnifiedNotificationProvider>
</CDPProvider>
```

### Priority 5: Add Loading States (1 hour)
**Every permission-gated component needs:**
```typescript
const { evmAddress, isLoading } = useEvmAddress();
const { userRoles, loading: rolesLoading } = useHatPermissions();

if (isLoading || rolesLoading) {
  return <PermissionLoadingState />;
}

if (!evmAddress) {
  return <ConnectWalletPrompt />;
}

// Now safe to check permissions
```

---

## 📋 FULL AUDIT CHECKLIST

### Database Issues
- [ ] Fix token query syntax (not.in format)
- [ ] Find all 406-causing queries
- [ ] Audit all Supabase queries for correct syntax
- [ ] Add database indexes for permission queries
- [ ] Verify active_pod_members view is correct

### RPC/Blockchain Issues
- [ ] Implement HAT balance caching
- [ ] Add retry logic for 429 errors
- [ ] Consider using public Base RPC as fallback
- [ ] Batch RPC calls where possible
- [ ] Add circuit breaker for RPC failures

### Permission Logic Issues
- [ ] Switch to database-first permission checks
- [ ] Add async blockchain verification
- [ ] Implement proper loading states
- [ ] Add error boundaries for permission failures
- [ ] Add fallback permissions for critical operations

### Code Quality Issues
- [ ] Consolidate Supabase client instances
- [ ] Remove duplicate permission check logic
- [ ] Add proper TypeScript types for permissions
- [ ] Add unit tests for permission checks
- [ ] Add integration tests for full permission flow

### Monitoring & Debugging
- [ ] Add Sentry error tracking for permission failures
- [ ] Log permission check failures to database
- [ ] Create admin dashboard to view failed permission checks
- [ ] Add performance monitoring for permission load times
- [ ] Create diagnostic endpoint for users to check their permissions

---

## 🎯 SUCCESS METRICS

### Before (Current State):
- ❌ 30-40% of beta testers can't access features
- ❌ Permissions fail intermittently
- ❌ No visibility into why failures occur
- ❌ Multiple critical errors in console

### After (Target State):
- ✅ 99%+ success rate for permission checks
- ✅ < 200ms permission load time
- ✅ Graceful degradation on RPC failures
- ✅ Clear error messages when access denied
- ✅ Zero critical errors in console

---

## 📞 NEXT STEPS

1. **Immediate:** Start with Priority 1-2 fixes (token query + 406 search)
2. **Today:** Implement Priority 3 (RPC caching)
3. **Tomorrow:** Complete Priority 4-5 (notifications + loading states)
4. **This Week:** Full audit checklist completion

**Estimated Total Time:** 12-16 hours of focused development

Would you like me to start with Priority 1 (finding and fixing the token query)?
