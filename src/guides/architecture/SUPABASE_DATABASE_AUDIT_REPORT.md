# 🔒 SUPABASE DATABASE SECURITY AUDIT REPORT

**Date:** November 23, 2025
**Database:** DAO Community Platform
**Status:** ⚠️ **CRITICAL ISSUES FOUND - NOT PRODUCTION READY**

---

## 🚨 EXECUTIVE SUMMARY

**Total Tables Audited:** 67
**Critical Security Issues:** 5
**High Priority Issues:** 8
**Medium Priority Issues:** 4
**Recommendations:** 12

### ⛔ BLOCKER ISSUES (Must Fix Before Production)

1. **21 tables have RLS policies defined but RLS is DISABLED** - Policies are not being enforced
2. **Foreign key constraint errors** - Events table references wrong table (tokens instead of pods)
3. **Overly permissive "Anyone can..." policies** - No authentication required for sensitive operations
4. **TEMP policies in production** - hats_module_deployments has temporary allow-all policies

---

## 🔴 CRITICAL ISSUES

### Issue #1: RLS Enabled But Not Enforced (CRITICAL)

**Problem:** Tables have RLS policies defined but `rowsecurity = false`, meaning policies are NOT enforced.

**Affected Tables (21):**
```
✅ Has Policies | ❌ RLS OFF
├── admin_token_definitions
├── chat_groups (4 policies defined but not enforced!)
├── forum_categories (4 policies defined but not enforced!)
├── forum_category_required_tokens
├── forum_featured_content
├── forum_poll_options
├── forum_poll_votes
├── forum_polls
├── forum_post_reactions
├── forum_posts
├── forum_thread_drafts
├── forum_threads
├── governance_votes
├── pod_role_permissions_history
├── pods (7 policies defined but NOT ENFORCED!) ⚠️ CRITICAL
├── proposal_onchain_status
├── relay_tasks
├── token_balances
├── tokens
├── treasury_approval_workflows
└── user_tokens
```

**Impact:**
- Anyone can read ALL pods, including private/deleted ones
- Anyone can read ALL forum posts without permission checks
- Anyone can read governance votes
- Complete bypass of your permission system

**Fix:** Enable RLS on all tables
```sql
ALTER TABLE admin_token_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_category_required_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_featured_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_thread_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_role_permissions_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_onchain_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
```

---

### Issue #2: Foreign Key Constraint Errors (CRITICAL)

**Problem:** Events table foreign keys reference wrong table

**Lines 218-233 in foreign key analysis:**
```sql
-- WRONG: Events reference "tokens" table instead of "pods"
events.organizing_pod_id → tokens.id ❌
events.fund_recipient_pod_id → tokens.id ❌
```

**Impact:**
- Events cannot properly link to organizing pods
- Foreign key violations when creating events
- Data integrity compromised

**Fix:**
```sql
-- Drop incorrect foreign keys
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_fund_recipient_pod_id_fkey;

-- Add correct foreign keys
ALTER TABLE events
  ADD CONSTRAINT events_organizing_pod_id_fkey
    FOREIGN KEY (organizing_pod_id)
    REFERENCES pods(id)
    ON DELETE SET NULL;

ALTER TABLE events
  ADD CONSTRAINT events_fund_recipient_pod_id_fkey
    FOREIGN KEY (fund_recipient_pod_id)
    REFERENCES pods(id)
    ON DELETE SET NULL;
```

---

### Issue #3: Overly Permissive "Anyone Can..." Policies (CRITICAL)

**Problem:** Sensitive operations allow anonymous/unauthenticated access

**Tables with "Anyone can..." policies:**

| Table | Policy | Risk Level |
|-------|--------|------------|
| `bounties` | Anyone can create/read/update | 🔴 HIGH |
| `bids` | Anyone can create/read/update | 🔴 HIGH |
| `bid_reviews` | Anyone can create/read/update | 🔴 HIGH |
| `milestones` | Anyone can create/read/update | 🔴 HIGH |
| `proposal_metadata` | Anyone can create/read/update | 🔴 HIGH |
| `bounty_notifications` | Anyone can create/read/update | 🟡 MEDIUM |
| `pod_member_counts` | Anyone can insert/update | 🟡 MEDIUM |
| `pod_members` | Anyone can insert/update | 🔴 HIGH |
| `pod_approval_signatures` | Anyone can insert | 🔴 HIGH |
| `pod_accountability_signatures` | Multiple "anyone" policies | 🟡 MEDIUM |

**Impact:**
- Malicious actors can create fake bounties
- Anyone can submit/approve bids without authorization
- Pod membership can be manipulated
- Spam/abuse potential

**Recommendation:** Replace with proper authentication:
```sql
-- Example for bounties
DROP POLICY "Anyone can create bounties" ON bounties;
CREATE POLICY "Authenticated users can create bounties"
  ON bounties FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    creator_address = auth.uid()
  );
```

---

### Issue #4: Temporary Policies in Production (CRITICAL)

**Table:** `hats_module_deployments`

**Policies:**
```
"TEMP: Allow all deletes"
"TEMP: Allow all inserts"
"TEMP: Allow all reads"
"TEMP: Allow all updates"
```

**Impact:** Complete bypass of security for hats module deployments

**Fix:** Replace with proper permission checks based on pod ownership

---

### Issue #5: Bounties Don't Cascade on Pod Deletion (HIGH)

**Problem:**
```sql
bounties.pod_id → pods.id (ON DELETE NO ACTION)
```

**Impact:** Orphaned bounties if pod is deleted

**Fix:**
```sql
ALTER TABLE bounties
  DROP CONSTRAINT IF EXISTS bounties_pod_id_fkey;

ALTER TABLE bounties
  ADD CONSTRAINT bounties_pod_id_fkey
    FOREIGN KEY (pod_id)
    REFERENCES pods(id)
    ON DELETE CASCADE;
```

---

## 🟠 HIGH PRIORITY ISSUES

### Issue #6: Multiple Notification Systems (HIGH - Maintenance Overhead)

**Problem:** 4 separate notification tables instead of unified system

**Tables:**
- `general_notifications` (1664 kB) ← Largest table
- `governance_notifications` (1128 kB)
- `event_notifications` (160 kB)
- `bounty_notifications` (64 kB)

**Impact:**
- Code duplication across 4 systems
- Inconsistent notification handling
- Performance overhead
- Difficult to maintain

**Recommendation:** Consolidate into `general_notifications` with `context_type` and `context_id` fields

**Benefits:**
- Single codebase for notifications
- Easier to add new notification types
- Better performance
- ~400 kB storage savings

---

### Issue #7: Duplicate Notification Preference Tables (MEDIUM)

**Tables:**
- `notification_preferences` (64 kB, 54 columns)
- `user_notification_preferences` (24 kB, 5 columns)

**Impact:** Confusion about which table is authoritative

**Recommendation:** Consolidate or document which is used

---

### Issue #8: Marketplace Orders Missing Cascade (MEDIUM)

**Problem:**
```sql
marketplace_orders.product_id → products.id (ON DELETE NO ACTION)
```

**Impact:** Orphaned orders if product deleted

**Fix:**
```sql
ALTER TABLE marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_product_id_fkey;

ALTER TABLE marketplace_orders
  ADD CONSTRAINT marketplace_orders_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON DELETE SET NULL; -- Keep order history but mark product as deleted
```

---

### Issue #9: Pod Member Counts Denormalization (LOW - Performance)

**Table:** `pod_member_counts` (40 kB)

**Purpose:** Caches member count per pod

**Issue:** Maintained by trigger, can get out of sync

**Recommendation:** Consider calculating on-demand with indexed query:
```sql
SELECT pod_id, COUNT(*) FROM pod_members GROUP BY pod_id;
```

**Benefits:**
- Always accurate
- No sync issues
- One less table to maintain

**Trade-off:** Slightly slower queries (but with proper indexes, negligible)

---

### Issue #10: Large History Table (MEDIUM)

**Table:** `pod_role_permissions_history` (1520 kB - 2nd largest)

**Size:** 1.5 MB with 14 columns

**Questions:**
1. Is this actively used for audit/rollback?
2. Do you have a retention policy?
3. Should old records be archived?

**Recommendation:**
- If actively used: Add retention policy (delete records older than 1 year)
- If not used: Consider dropping the table
- Archive to cold storage after 90 days

---

### Issue #11: Admin Token Definitions Table (LOW)

**Table:** `admin_token_definitions` (24 kB, 5 columns)

**Questions:**
1. What is this used for?
2. Is it still actively used?
3. How does it differ from `tokens` table?

**Recommendation:** Document purpose or remove if legacy

---

### Issue #12: Relay Tasks Table (LOW)

**Table:** `relay_tasks` (16 kB, 7 columns)

**Purpose:** Likely Gelato relay task tracking

**Questions:**
1. Is this actively populated?
2. Do you clean up old tasks?
3. Is it still needed?

**Recommendation:** Add TTL/cleanup policy for completed tasks

---

### Issue #13: Token Balances vs User Tokens Overlap (MEDIUM)

**Tables:**
- `token_balances` (24 kB, 5 columns)
- `user_tokens` (48 kB, 6 columns)

**Potential Overlap:** Both track user token ownership

**Recommendation:** Clarify purpose of each or consolidate

---

## 📊 DATABASE STATISTICS

### Size Distribution

**Top 10 Largest Tables:**
1. general_notifications - 1664 kB
2. pod_role_permissions_history - 1520 kB
3. governance_notifications - 1128 kB
4. pod_role_permissions - 408 kB
5. bounties - 280 kB
6. events - 272 kB
7. event_registrations - 256 kB
8. pods - 240 kB
9. proposal_metadata - 200 kB
10. hat_metadata_cache - 200 kB

**Total Database Size:** ~8.5 MB (estimated)

---

## 🔧 CUSTOM FUNCTIONS AUDIT

**Total Functions:** 41

### Maintenance Functions (Should be scheduled)
```sql
cleanup_old_drafts()
cleanup_old_hat_images()
expire_old_deletion_proposals()
normalize_chat_addresses()
normalize_dm_block_addresses()
```

**Recommendation:** Set up pg_cron to run these weekly:
```sql
-- Schedule cleanup functions
SELECT cron.schedule(
  'cleanup-old-drafts',
  '0 2 * * 0',  -- Every Sunday at 2 AM
  'SELECT cleanup_old_drafts();'
);
```

### Timestamp Update Triggers (Auto-maintained)
```
update_updated_at_column()
update_governance_notifications_updated_at()
update_hat_metadata_cache_updated_at()
update_notification_preferences_updated_at()
update_pod_modules_timestamp()
update_pod_role_permissions_updated_at()
update_treasury_transactions_updated_at()
update_work_submissions_updated_at()
update_dispute_updated_at()
```

**Status:** ✅ Good - automatic timestamp management

### Permission Check Functions (Core Security)
```
check_pod_permission()
check_bounty_access()
can_post_in_category()
can_user_register_for_event()
has_admin_token()
is_forum_moderator()
is_user_muted_in_chat()
```

**Status:** ✅ Critical for permission system

---

## 🎯 PRODUCTION READINESS CHECKLIST

### 🔴 BLOCKERS (Must Fix)
- [ ] Enable RLS on 21 tables with disabled security
- [ ] Fix events table foreign key constraints
- [ ] Replace "Anyone can..." policies with proper auth
- [ ] Remove TEMP policies from hats_module_deployments
- [ ] Add CASCADE to bounties.pod_id foreign key

### 🟠 HIGH PRIORITY (Strongly Recommended)
- [ ] Consolidate notification systems
- [ ] Add missing indexes for performance
- [ ] Fix marketplace_orders cascade behavior
- [ ] Document/consolidate duplicate tables
- [ ] Add retention policy for history tables

### 🟡 MEDIUM PRIORITY (Nice to Have)
- [ ] Schedule maintenance functions with pg_cron
- [ ] Review and archive old pod_role_permissions_history
- [ ] Clean up legacy tables (if unused)
- [ ] Add monitoring for table growth

### ✅ OPTIONAL (Performance Optimization)
- [ ] Consider removing pod_member_counts denormalization
- [ ] Add composite indexes for complex queries
- [ ] Review and optimize slow queries

---

## 📋 MISSING INDEXES ANALYSIS

Based on foreign key relationships and common query patterns:

**Recommended Indexes:**
```sql
-- User profile lookups (heavily used in RLS)
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id_wallet
  ON user_profiles(user_id, wallet_address);

-- Pod permission checks
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_pod_hat_active
  ON pod_role_permissions(pod_id, hat_id, is_active);

-- Notification queries
CREATE INDEX IF NOT EXISTS idx_general_notifications_recipient_read_created
  ON general_notifications(recipient_address, is_read, created_at DESC);

-- Forum access checks
CREATE INDEX IF NOT EXISTS idx_forum_categories_pod_id
  ON forum_categories(pod_id);

-- Event queries
CREATE INDEX IF NOT EXISTS idx_events_date_status
  ON events(event_date, status) WHERE status = 'published';
```

---

## 🔒 RLS POLICY IMPROVEMENTS

### Current Issues:
1. 12 tables with "Anyone can..." policies
2. Some policies check `auth.uid()` but should check wallet_address
3. Missing policies for service role operations

### Recommended Pattern:
```sql
-- Read: Public for published content, private for drafts
CREATE POLICY "Public read for published bounties"
  ON bounties FOR SELECT
  USING (status = 'open' OR creator_address = auth.uid());

-- Insert: Authenticated users only
CREATE POLICY "Authenticated users can create bounties"
  ON bounties FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    creator_address = auth.uid()
  );

-- Update: Creators or pod managers only
CREATE POLICY "Creators can update bounties"
  ON bounties FOR UPDATE
  USING (creator_address = auth.uid());
```

---

## 📈 STORAGE RECOMMENDATIONS

### Storage Buckets to Audit:
Run this query to check storage usage:
```sql
SELECT
    bucket_id,
    COUNT(*) AS file_count,
    pg_size_pretty(SUM((metadata->>'size')::bigint)) AS total_size
FROM storage.objects
GROUP BY bucket_id
ORDER BY SUM((metadata->>'size')::bigint) DESC;
```

### Expected Buckets:
- `event-images`
- `product-images`
- `forum-attachments`
- `profile-avatars`

**Ensure RLS is enabled on all buckets!**

---

## 🚀 NEXT STEPS

### Immediate (Today):
1. Run `SUPABASE_PRODUCTION_HARDENING.sql` script (created separately)
2. Enable RLS on all 21 tables
3. Fix foreign key constraints
4. Test application thoroughly

### This Week:
1. Replace "Anyone can..." policies
2. Remove TEMP policies
3. Add missing indexes
4. Consolidate notification tables

### This Month:
1. Schedule maintenance functions
2. Set up monitoring
3. Archive old history data
4. Document all tables and their purposes

---

## 📞 SUPPORT

**Questions to Address:**
1. admin_token_definitions - What is this for?
2. relay_tasks - Still needed?
3. token_balances vs user_tokens - Which is authoritative?
4. pod_role_permissions_history - Retention policy?

---

**End of Audit Report**
**Generated:** November 23, 2025
**Next Review:** Before production launch + monthly thereafter
