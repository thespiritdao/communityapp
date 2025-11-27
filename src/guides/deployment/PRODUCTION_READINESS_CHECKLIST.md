# 🚀 PRODUCTION READINESS CHECKLIST

**Project:** DAO Community Platform
**Date:** November 23, 2025
**Status:** ⚠️ **BLOCKERS IDENTIFIED - NOT READY FOR PRODUCTION**

---

## 📋 PRE-DEPLOYMENT CHECKLIST

Use this checklist to track progress toward production deployment.

---

## 🔴 CRITICAL BLOCKERS (Must Complete)

### Security Issues
- [ ] **Enable RLS on 21 tables**
  - File: `SUPABASE_PRODUCTION_HARDENING.sql` (Section 1)
  - Tables affected: pods, governance_votes, forum tables, etc.
  - Time: 5 minutes
  - Risk if skipped: Complete security bypass

- [ ] **Fix foreign key constraints**
  - File: `SUPABASE_PRODUCTION_HARDENING.sql` (Section 2)
  - Issue: Events table references wrong table (tokens instead of pods)
  - Time: 2 minutes
  - Risk if skipped: FK violations, data corruption

- [ ] **Replace "Anyone can..." policies**
  - File: `SUPABASE_FIX_PERMISSIVE_POLICIES.sql`
  - Tables: bounties, bids, bid_reviews, milestones, proposal_metadata, etc.
  - Time: 10 minutes + testing
  - Risk if skipped: Spam, data manipulation, security breach

- [ ] **Remove TEMP policies**
  - File: `SUPABASE_PRODUCTION_HARDENING.sql` (Section 5)
  - Table: hats_module_deployments
  - Time: 2 minutes
  - Risk if skipped: Complete bypass of module deployment security

### Database Backup
- [ ] **Create full database backup**
  - Method: Supabase Dashboard → Database → Backups → Create Manual Backup
  - OR: `pg_dump` via CLI
  - Time: 5-10 minutes
  - REQUIRED before running any migration scripts

---

## 🟠 HIGH PRIORITY (Strongly Recommended)

### Performance
- [ ] **Add missing indexes**
  - File: `SUPABASE_PRODUCTION_HARDENING.sql` (Section 6)
  - Impact: 10-100x query speedup for common operations
  - Time: 5 minutes

### Data Integrity
- [ ] **Fix cascade behavior**
  - File: `SUPABASE_PRODUCTION_HARDENING.sql` (Section 3)
  - Tables: bounties.pod_id, marketplace_orders.product_id
  - Impact: Prevent orphaned data

### Architecture
- [ ] **Consolidate notification systems** (Optional - Can be done post-launch)
  - Current: 4 separate tables (general, governance, event, bounty)
  - Target: Single unified system
  - Benefits: Easier maintenance, consistent behavior
  - Time: 2-4 hours development + migration
  - **Recommendation:** Plan for post-launch refactor

---

## 🟡 MEDIUM PRIORITY (Recommended)

### Documentation
- [ ] **Document table purposes**
  - Clarify: admin_token_definitions usage
  - Clarify: token_balances vs user_tokens difference
  - Clarify: notification_preferences vs user_notification_preferences
  - Time: 30 minutes

### Maintenance
- [ ] **Set up automated maintenance**
  - Schedule cleanup functions (cleanup_old_drafts, expire_old_deletion_proposals)
  - Method: pg_cron extension
  - Time: 1 hour
  - **Can be done post-launch**

### Monitoring
- [ ] **Set up table size monitoring**
  - Monitor: general_notifications, pod_role_permissions_history
  - Alert: When tables exceed 10 MB
  - **Can be done post-launch**

---

## ✅ DEPLOYMENT STEPS

### Step 1: Backup (5-10 minutes)
```bash
# Option A: Supabase Dashboard
# → Project Settings → Database → Backups → Create Manual Backup

# Option B: CLI
pg_dump --no-owner --no-acl \
  -h db.YOUR_PROJECT.supabase.co \
  -U postgres -d postgres > backup_$(date +%Y%m%d).sql
```

### Step 2: Run Production Hardening Script (5 minutes)
```sql
-- In Supabase SQL Editor:

-- Review the script first!
-- File: SUPABASE_PRODUCTION_HARDENING.sql

-- Execute in transaction (safe - can rollback)
-- The script will pause at the end for review

-- After reviewing output:
COMMIT; -- if everything looks good
-- OR
ROLLBACK; -- if issues found
```

### Step 3: Fix Permissive Policies (10 minutes)
```sql
-- In Supabase SQL Editor:

-- Review the script first!
-- File: SUPABASE_FIX_PERMISSIVE_POLICIES.sql

-- Execute in transaction
-- After reviewing output:
COMMIT; -- if everything looks good
```

### Step 4: Verification (10 minutes)
```sql
-- 1. Check RLS is enabled on all tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;
-- Should return NO rows

-- 2. Check all tables have policies
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.tablename
  );
-- Should return NO rows

-- 3. Check for "Anyone can" policies
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%Anyone can%';
-- Should return only read-only policies (if any)

-- 4. Verify foreign keys
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'events'
  AND kcu.column_name IN ('organizing_pod_id', 'fund_recipient_pod_id');
-- Should show foreign_table_name = 'pods' (not 'tokens')
```

### Step 5: Application Testing (1-2 hours)
Test all critical user flows:

**Pod Management:**
- [ ] Create new pod
- [ ] Invite members to pod
- [ ] Approve membership applications
- [ ] View pod members

**Bounties:**
- [ ] Create bounty
- [ ] Submit bid
- [ ] Review bid
- [ ] Accept/reject bid
- [ ] Complete bounty

**Events:**
- [ ] Create event
- [ ] Register for event
- [ ] Check-in to event
- [ ] View event attendees

**Forum:**
- [ ] Create thread
- [ ] Post reply
- [ ] View threads by category
- [ ] Token-gated category access

**Governance:**
- [ ] Create proposal
- [ ] Vote on proposal
- [ ] View proposal results

**Marketplace:**
- [ ] Create product
- [ ] Purchase product
- [ ] View order history

**Notifications:**
- [ ] Receive notifications
- [ ] Mark as read
- [ ] Notification preferences

### Step 6: Performance Testing (30 minutes)
```sql
-- Check slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 20;

-- Check table sizes
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC
LIMIT 10;

-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
-- Shows unused indexes (consider removing)
```

---

## 🔍 POST-DEPLOYMENT MONITORING

### Week 1: Daily Checks
- [ ] Monitor error logs for RLS policy violations
- [ ] Check database size growth
- [ ] Review slow query log
- [ ] Monitor API error rates

### Week 2-4: Weekly Checks
- [ ] Review largest tables (general_notifications, pod_role_permissions_history)
- [ ] Check for orphaned data
- [ ] Verify backup retention
- [ ] Review and optimize slow queries

### Ongoing: Monthly Checks
- [ ] Run cleanup functions manually (until automated)
- [ ] Review and archive old history data
- [ ] Update this checklist based on learnings

---

## 📊 SUCCESS METRICS

### Security
- ✅ All tables have RLS enabled
- ✅ No "Anyone can..." policies for write operations
- ✅ All foreign keys point to correct tables
- ✅ No TEMP policies in production

### Performance
- ✅ All common queries use indexes
- ✅ Average query time < 100ms
- ✅ No queries > 1 second (except complex reports)

### Data Integrity
- ✅ No orphaned records
- ✅ All foreign key constraints valid
- ✅ Backup schedule active

---

## 🚨 ROLLBACK PLAN

If issues are discovered after deployment:

### Option 1: Rollback Database (DESTRUCTIVE)
```sql
-- Restore from backup (loses all data since backup)
-- Only use if database is corrupted

-- In Supabase Dashboard:
-- → Database → Backups → Select backup → Restore
```

### Option 2: Rollback Specific Changes (SAFE)
```sql
-- Revert production hardening script
BEGIN;

-- Disable RLS on specific tables (if causing issues)
ALTER TABLE [table_name] DISABLE ROW LEVEL SECURITY;

-- Restore old policies (if new policies too restrictive)
-- See your backup .sql file for original policies

COMMIT;
```

### Option 3: Hotfix Specific Policy
```sql
-- If a specific policy is too restrictive:
BEGIN;

DROP POLICY IF EXISTS "[policy_name]" ON [table_name];

-- Create temporary more permissive policy
CREATE POLICY "[policy_name]_temp"
  ON [table_name] FOR [operation]
  USING (true); -- or specific condition

COMMIT;

-- Then fix properly in development and redeploy
```

---

## 📞 EMERGENCY CONTACTS

**If you encounter issues during deployment:**

1. **Database Corruption:**
   - Restore from backup immediately
   - Contact Supabase support

2. **Policy Too Restrictive (Users Locked Out):**
   - Use Option 3 (Hotfix Specific Policy) above
   - Create temporary more permissive policy
   - Fix properly in development

3. **Performance Degradation:**
   - Check slow query log
   - Temporarily remove new indexes if causing issues
   - Review and optimize

4. **FK Constraint Violations:**
   - Likely have orphaned data
   - Run: `SELECT * FROM events WHERE organizing_pod_id IS NOT NULL AND organizing_pod_id NOT IN (SELECT id FROM pods);`
   - Clean up orphaned records before retrying

---

## ✅ SIGN-OFF

**Before deploying to production, confirm:**

- [ ] All CRITICAL BLOCKERS completed
- [ ] Database backup created and verified
- [ ] Production hardening script reviewed
- [ ] Permissive policies script reviewed
- [ ] Test environment successfully tested
- [ ] Rollback plan understood
- [ ] Team notified of deployment window

**Deployment Approved By:**
- [ ] Developer: _________________ Date: _______
- [ ] QA/Tester: ________________ Date: _______
- [ ] Product Owner: ____________ Date: _______

---

**END OF CHECKLIST**

Last updated: November 23, 2025
