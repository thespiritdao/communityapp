# Supabase Database Audit & Cleanup Guide

**Date:** November 23, 2025
**Purpose:** Audit year-old Supabase database for production readiness
**Approach:** You act as bridge OR direct Supabase API access

---

## 📋 OVERVIEW

After a year of development, your Supabase database likely has:
- ❌ Legacy tables from abandoned features
- ❌ Outdated RLS policies
- ❌ Missing indexes (performance issues)
- ❌ Unused functions/triggers
- ❌ Test data that should be removed
- ❌ Inconsistent naming conventions

This guide provides a **systematic approach** to audit and clean up your database before production launch.

---

## 🎯 TWO APPROACHES

### Approach A: You as Bridge (Recommended for Sensitive Data)
**Process**:
1. I provide SQL queries
2. You run them in Supabase SQL Editor
3. You share results with me
4. I analyze and provide cleanup scripts
5. You review and execute

**Pros**: You control sensitive data exposure
**Cons**: Requires back-and-forth

---

### Approach B: Direct Supabase API Access (Faster)
**Process**:
1. You provide me temporary API access:
   - Supabase Project URL
   - Service Role Key (expires after session)
   - Read-only initially, then write for cleanup
2. I run queries directly via Supabase REST API
3. I generate cleanup scripts
4. You review and approve before execution

**Pros**: Faster, more comprehensive
**Cons**: Requires sharing service role key (can be temporary)

**How to provide access safely**:
```bash
# Option 1: Temporary service role key (create new, delete after)
# In Supabase Dashboard → Project Settings → API → Create new service role key
# Expires: Set to 24 hours

# Option 2: Read-only first, then write
# Start with SELECT-only queries
# Then provide write access for approved cleanup
```

---

## 📊 AUDIT CHECKLIST

### Phase 1: Discovery & Documentation (30 minutes)
- [ ] List all tables
- [ ] List all RLS policies
- [ ] List all functions
- [ ] List all triggers
- [ ] List all indexes
- [ ] Check storage buckets
- [ ] Review edge functions

### Phase 2: Analysis (1 hour)
- [ ] Identify unused tables
- [ ] Find inefficient RLS policies
- [ ] Detect missing indexes
- [ ] Find orphaned data
- [ ] Check foreign key constraints
- [ ] Review table sizes

### Phase 3: Cleanup Plan (30 minutes)
- [ ] Create backup strategy
- [ ] Generate cleanup scripts
- [ ] Review with you
- [ ] Get approval

### Phase 4: Execution (1-2 hours)
- [ ] Backup database
- [ ] Execute cleanup scripts
- [ ] Verify data integrity
- [ ] Test application
- [ ] Document changes

---

## 🔍 PHASE 1: DISCOVERY QUERIES

### Query 1: List All Tables
```sql
-- Get all tables with row counts and sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = schemaname AND table_name = tablename) AS column_count
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Expected Output**: List of all tables with sizes
**What to look for**: Large tables with potentially test data, tables you don't recognize

---

### Query 2: List All RLS Policies
```sql
-- Get all RLS policies with details
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected Output**: All RLS policies across tables
**What to look for**:
- Policies that say "Anyone can..." (too permissive)
- Duplicate policies
- Policies on tables you don't use

---

### Query 3: List All Functions
```sql
-- Get all custom functions
SELECT
    n.nspname AS schema,
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, p.proname;
```

**Expected Output**: All custom functions
**What to look for**: Functions you don't recognize or use

---

### Query 4: List All Triggers
```sql
-- Get all triggers
SELECT
    event_object_schema AS schema,
    event_object_table AS table_name,
    trigger_name,
    event_manipulation AS event,
    action_statement,
    action_timing AS timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

**Expected Output**: All triggers
**What to look for**: Triggers on deleted tables, duplicate triggers

---

### Query 5: List All Indexes
```sql
-- Get all indexes with sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Expected Output**: All indexes
**What to look for**: Missing indexes on frequently queried columns

---

### Query 6: Check Foreign Key Constraints
```sql
-- Get all foreign keys
SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
```

**Expected Output**: All foreign key relationships
**What to look for**: Missing foreign keys, incorrect cascade rules

---

### Query 7: Find Orphaned Data
```sql
-- Example: Find pods without creators
SELECT id, name, created_at
FROM pods
WHERE creator_address NOT IN (SELECT wallet_address FROM user_profiles)
LIMIT 20;

-- Example: Find bids without bounties
SELECT id, bounty_id, bidder_address
FROM bids
WHERE bounty_id NOT IN (SELECT id FROM bounties)
LIMIT 20;

-- Example: Find events without organizing pods
SELECT id, title, organizing_pod_id
FROM events
WHERE organizing_pod_id NOT IN (SELECT id FROM pods)
LIMIT 20;
```

**Expected Output**: Orphaned records
**What to look for**: Data that references deleted records

---

### Query 8: Check Storage Buckets
```sql
-- Get storage bucket info
SELECT
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- Get storage usage per bucket
SELECT
    bucket_id,
    COUNT(*) AS file_count,
    pg_size_pretty(SUM(metadata->>'size')::bigint) AS total_size
FROM storage.objects
GROUP BY bucket_id
ORDER BY SUM(metadata->>'size')::bigint DESC;
```

**Expected Output**: Storage buckets and usage
**What to look for**: Buckets you don't use, excessive storage usage

---

## 🎯 PHASE 2: ANALYSIS

### Expected Tables (Current System)

#### Core Tables:
```
✅ user_profiles
✅ pods
✅ pod_role_permissions
✅ pod_members (if used)
✅ pod_invitations
✅ agreement_signatures
✅ notifications
✅ notification_preferences
```

#### Events:
```
✅ events
✅ event_attendees
✅ event_token_holders (maybe legacy?)
```

#### Bounties:
```
✅ bounties
✅ bids
✅ bid_reviews
✅ milestones
✅ bounty_notifications (or unified with notifications?)
✅ bounty_approval_workflows
```

#### Governance:
```
✅ proposals
✅ proposal_metadata
✅ votes
✅ snapshot_spaces (if using Snapshot)
```

#### Treasury:
```
✅ treasury_transactions
✅ treasury_balances (maybe)
```

#### Forum:
```
✅ forum_categories
✅ forum_threads
✅ forum_posts
✅ forum_templates
```

#### Marketplace:
```
✅ products
✅ purchases (maybe)
✅ market_transactions (maybe)
```

#### Chat:
```
✅ chat_groups
✅ chat_messages
✅ chat_members
```

### Potentially Legacy Tables:
```
❓ pod_credentials (old system?)
❓ event_completion_nft_holders (redundant?)
❓ event_registration_nft_holders (redundant?)
❓ bounty_manager_approvals (old approval system?)
❓ token_holders (legacy token tracking?)
❓ old_pods / pods_backup (migration artifacts?)
```

---

## 🧹 PHASE 3: CLEANUP RECOMMENDATIONS

### 1. Remove Legacy Tables

**⚠️ ONLY AFTER VERIFICATION**

```sql
-- EXAMPLE - DO NOT RUN WITHOUT VERIFICATION
-- First, check if table is referenced anywhere
SELECT
    tc.table_name AS referencing_table,
    kcu.column_name AS referencing_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'LEGACY_TABLE_NAME';

-- If safe, drop the table
-- DROP TABLE IF EXISTS legacy_table_name CASCADE;
```

---

### 2. Tighten RLS Policies

**Current Issue**: Many tables have "Anyone can..." policies from development

**Example Fix for `bounties` table**:
```sql
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Anyone can read bounties" ON bounties;
DROP POLICY IF EXISTS "Anyone can create bounties" ON bounties;
DROP POLICY IF EXISTS "Anyone can update bounties" ON bounties;

-- Replace with proper policies
CREATE POLICY "Public read access for bounties"
  ON bounties FOR SELECT
  USING (true); -- All bounties are public

CREATE POLICY "Pod members can create bounties"
  ON bounties FOR INSERT
  WITH CHECK (
    -- Check if user has bounty creation permission in the pod
    EXISTS (
      SELECT 1 FROM pod_role_permissions prp
      JOIN user_profiles up ON (up.hat_ids @> ARRAY[prp.hat_id])
      WHERE up.wallet_address = auth.uid()
        AND prp.pod_id = bounties.pod_id
        AND prp.permissions @> ARRAY['bounty_management']
    )
  );

CREATE POLICY "Creators can update their bounties"
  ON bounties FOR UPDATE
  USING (creator_address = auth.uid());
```

---

### 3. Add Missing Indexes

**From Performance Audit** (see PRODUCTION_READINESS_AUDIT.md):

```sql
-- User profile lookups (used heavily in RLS)
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id_wallet
ON user_profiles(user_id, wallet_address);

-- Pod access checks
CREATE INDEX IF NOT EXISTS idx_pods_management_hat
ON pods(management_hat_id);

CREATE INDEX IF NOT EXISTS idx_pods_membership_hat
ON pods(membership_hat_id);

-- Pod role permissions
CREATE INDEX IF NOT EXISTS idx_pod_role_permissions_pod_hat
ON pod_role_permissions(pod_id, hat_id);

-- Event queries
CREATE INDEX IF NOT EXISTS idx_events_organizing_pod
ON events(organizing_pod_id);

CREATE INDEX IF NOT EXISTS idx_events_status_date
ON events(status, event_date);

-- Bounty queries
CREATE INDEX IF NOT EXISTS idx_bounties_pod_status
ON bounties(pod_id, status);

CREATE INDEX IF NOT EXISTS idx_bounties_pod_id
ON bounties(pod_id);

-- Treasury transactions
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_pod_status
ON treasury_transactions(pod_id, status);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
ON notifications(recipient_address);

CREATE INDEX IF NOT EXISTS idx_notifications_read
ON notifications(is_read);

-- Forum
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread
ON forum_posts(thread_id);

CREATE INDEX IF NOT EXISTS idx_forum_threads_category
ON forum_threads(category_id);
```

---

### 4. Remove Test/Development Data

```sql
-- ONLY RUN BEFORE PRODUCTION LAUNCH
-- This wipes all user data for fresh start

-- Backup first!
-- Then:

-- Clear all user-generated content
TRUNCATE TABLE
  pods,
  bounties,
  events,
  proposals,
  forum_threads,
  forum_posts,
  chat_messages,
  products,
  user_profiles
CASCADE;

-- Keep configuration tables:
-- - forum_categories (pre-configured)
-- - notification_types (system config)
-- - pod_role_permissions (template permissions)
```

---

### 5. Consolidate Notification Systems

**Problem**: You may have multiple notification tables:
- `notifications` (unified)
- `bounty_notifications` (bounty-specific)
- `governance_notifications` (governance-specific)
- `event_notifications` (event-specific)

**Recommendation**: Use ONLY `notifications` table with `context_type` and `context_id`

**Migration**:
```sql
-- Migrate bounty notifications
INSERT INTO notifications (
  recipient_address,
  sender_address,
  notification_type,
  title,
  message,
  context_type,
  context_id,
  context_url,
  is_read,
  created_at
)
SELECT
  recipient_address,
  'system' AS sender_address,
  notification_type,
  title,
  message,
  'bounty' AS context_type,
  bounty_id AS context_id,
  '/bounty/' || bounty_id AS context_url,
  is_read,
  created_at
FROM bounty_notifications
WHERE NOT EXISTS (
  SELECT 1 FROM notifications n
  WHERE n.context_type = 'bounty'
    AND n.context_id = bounty_notifications.bounty_id
    AND n.recipient_address = bounty_notifications.recipient_address
);

-- Then drop old table
-- DROP TABLE bounty_notifications;
```

---

### 6. Fix Foreign Key Cascades

**Check if cascades are correct**:
```sql
-- Ensure deleted pods cascade properly
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey,
  ADD CONSTRAINT events_organizing_pod_id_fkey
    FOREIGN KEY (organizing_pod_id)
    REFERENCES pods(id)
    ON DELETE CASCADE;

ALTER TABLE bounties
  DROP CONSTRAINT IF EXISTS bounties_pod_id_fkey,
  ADD CONSTRAINT bounties_pod_id_fkey
    FOREIGN KEY (pod_id)
    REFERENCES pods(id)
    ON DELETE CASCADE;

-- Ensure deleted bounties cascade to bids
ALTER TABLE bids
  DROP CONSTRAINT IF EXISTS bids_bounty_id_fkey,
  ADD CONSTRAINT bids_bounty_id_fkey
    FOREIGN KEY (bounty_id)
    REFERENCES bounties(id)
    ON DELETE CASCADE;
```

---

## 📦 PHASE 4: EXECUTION PLAN

### Step 1: BACKUP (Critical!)
```sql
-- Option A: Supabase Dashboard
-- Project Settings → Database → Database Backups → Create Manual Backup

-- Option B: pg_dump via CLI
-- pg_dump --no-owner --no-acl -h db.YOUR_PROJECT.supabase.co \
--   -U postgres -d postgres > backup_$(date +%Y%m%d).sql
```

---

### Step 2: Test Cleanup in Development
```sql
-- Create test database first
-- Run all cleanup scripts
-- Verify application still works
```

---

### Step 3: Production Cleanup Checklist

**Pre-Cleanup**:
- [ ] Full database backup created
- [ ] Backup downloaded locally
- [ ] Application works in development with cleaned DB
- [ ] All cleanup scripts reviewed
- [ ] Team notified of maintenance window

**During Cleanup**:
- [ ] Put application in maintenance mode
- [ ] Run cleanup scripts in order
- [ ] Verify each step before proceeding
- [ ] Check foreign key constraints
- [ ] Verify RLS policies working

**Post-Cleanup**:
- [ ] Test all major features
- [ ] Check application logs for errors
- [ ] Verify performance improvements
- [ ] Document all changes made
- [ ] Remove maintenance mode

---

## 🔧 RECOMMENDED CLEANUP SCRIPT

**File**: `scripts/cleanup-database-for-production.sql`

```sql
-- =============================================================================
-- SUPABASE DATABASE CLEANUP FOR PRODUCTION
-- =============================================================================
-- ⚠️  ONLY RUN AFTER:
-- 1. Full database backup
-- 2. Review of all tables and policies
-- 3. Approval from team
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: DROP LEGACY TABLES (Example - Verify First!)
-- =============================================================================

-- Check if tables exist and are unused before dropping
-- DROP TABLE IF EXISTS event_completion_nft_holders CASCADE;
-- DROP TABLE IF EXISTS event_registration_nft_holders CASCADE;
-- DROP TABLE IF EXISTS old_pods CASCADE;
-- DROP TABLE IF EXISTS pods_backup CASCADE;

-- =============================================================================
-- STEP 2: CLEAR TEST DATA (Only if starting fresh)
-- =============================================================================

-- WARNING: This deletes ALL user data!
-- Only run if starting with fresh production database

-- TRUNCATE TABLE pods CASCADE;
-- TRUNCATE TABLE user_profiles CASCADE;
-- TRUNCATE TABLE bounties CASCADE;
-- TRUNCATE TABLE events CASCADE;
-- TRUNCATE TABLE proposals CASCADE;
-- TRUNCATE TABLE forum_threads CASCADE;
-- TRUNCATE TABLE products CASCADE;

-- =============================================================================
-- STEP 3: ADD MISSING INDEXES
-- =============================================================================

-- User profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet
  ON user_profiles(wallet_address);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
  ON user_profiles(user_id);

-- Pods
CREATE INDEX IF NOT EXISTS idx_pods_management_hat
  ON pods(management_hat_id);

CREATE INDEX IF NOT EXISTS idx_pods_membership_hat
  ON pods(membership_hat_id);

CREATE INDEX IF NOT EXISTS idx_pods_creator
  ON pods(creator_address);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_pod
  ON events(organizing_pod_id);

CREATE INDEX IF NOT EXISTS idx_events_date
  ON events(event_date);

CREATE INDEX IF NOT EXISTS idx_events_status_date
  ON events(status, event_date);

-- Bounties
CREATE INDEX IF NOT EXISTS idx_bounties_pod
  ON bounties(pod_id);

CREATE INDEX IF NOT EXISTS idx_bounties_status
  ON bounties(status);

CREATE INDEX IF NOT EXISTS idx_bounties_creator
  ON bounties(creator_address);

CREATE INDEX IF NOT EXISTS idx_bids_bounty
  ON bids(bounty_id);

CREATE INDEX IF NOT EXISTS idx_bids_bidder
  ON bids(bidder_address);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON notifications(recipient_address, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);

-- Forum
CREATE INDEX IF NOT EXISTS idx_forum_threads_category
  ON forum_threads(category_id);

CREATE INDEX IF NOT EXISTS idx_forum_posts_thread
  ON forum_posts(thread_id);

-- =============================================================================
-- STEP 4: UPDATE RLS POLICIES (Example for one table)
-- =============================================================================

-- Bounties table - Replace permissive policies with proper security
ALTER TABLE bounties ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Anyone can read bounties" ON bounties;
DROP POLICY IF EXISTS "Anyone can create bounties" ON bounties;
DROP POLICY IF EXISTS "Anyone can update bounties" ON bounties;

-- Add proper policies
CREATE POLICY "Public can read bounties"
  ON bounties FOR SELECT
  USING (true);

CREATE POLICY "Authorized users can create bounties"
  ON bounties FOR INSERT
  WITH CHECK (
    creator_address = auth.uid() OR
    creator_address IN (
      SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can update their bounties"
  ON bounties FOR UPDATE
  USING (
    creator_address = auth.uid() OR
    creator_address IN (
      SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid()
    )
  );

-- =============================================================================
-- STEP 5: VERIFY FOREIGN KEY CASCADES
-- =============================================================================

-- Ensure proper cascade deletes
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_organizing_pod_id_fkey;

ALTER TABLE events
  ADD CONSTRAINT events_organizing_pod_id_fkey
    FOREIGN KEY (organizing_pod_id)
    REFERENCES pods(id)
    ON DELETE CASCADE;

ALTER TABLE bids
  DROP CONSTRAINT IF EXISTS bids_bounty_id_fkey;

ALTER TABLE bids
  ADD CONSTRAINT bids_bounty_id_fkey
    FOREIGN KEY (bounty_id)
    REFERENCES bounties(id)
    ON DELETE CASCADE;

-- =============================================================================
-- COMMIT OR ROLLBACK
-- =============================================================================

-- Review all changes above
-- If everything looks good:
-- COMMIT;

-- If there are issues:
-- ROLLBACK;
```

---

## 📊 POST-CLEANUP VALIDATION

### Query 1: Verify Indexes
```sql
-- Check all tables have proper indexes
SELECT
    schemaname,
    tablename,
    COUNT(*) AS index_count
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
HAVING COUNT(*) < 2 -- Tables with fewer than 2 indexes might be missing some
ORDER BY index_count;
```

---

### Query 2: Verify RLS is Enabled
```sql
-- Check all tables have RLS enabled
SELECT
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;
```

---

### Query 3: Check for Orphaned Data
```sql
-- Verify foreign key integrity
-- This should return no rows if all foreign keys are valid
SELECT
    conrelid::regclass AS table_name,
    conname AS constraint_name
FROM pg_constraint
WHERE contype = 'f'
  AND NOT pg_catalog.pg_relation_is_updatable(conrelid::regclass, false);
```

---

## 🚀 NEXT STEPS

### Choose Your Approach:

**Option A: Bridge Approach** (You run queries)
1. I'll provide you the discovery queries above
2. You run them in Supabase SQL Editor
3. Share results with me (can redact sensitive data)
4. I'll analyze and create custom cleanup scripts
5. You review and execute

**Option B: Direct API Access** (I access Supabase)
1. Create temporary service role key in Supabase
2. Share with me: Project URL + Service Role Key
3. I'll run discovery queries via API
4. Generate comprehensive cleanup report
5. Create custom cleanup scripts
6. You review and approve
7. Execute cleanup

---

## 📞 RECOMMENDED: START WITH OPTION A

**First Step**: Run these 3 critical discovery queries and share results:

```sql
-- 1. List all tables with sizes
SELECT tablename, pg_size_pretty(pg_total_relation_size('public.'||tablename))
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2. Count RLS policies per table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename ORDER BY tablename;

-- 3. List all indexes
SELECT tablename, indexname
FROM pg_indexes WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

**Share the output** and I'll provide a custom cleanup plan specific to your database!

---

**Estimated Time**:
- **Discovery**: 30 minutes (you run queries, share results)
- **Analysis**: 1 hour (I analyze and create cleanup plan)
- **Cleanup**: 1-2 hours (review + execute)
- **Total**: 3-4 hours

**Priority**: HIGH (do before production launch)
