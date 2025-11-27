# 🚀 Quick Start: Database Hardening

**You're 85% done! Here's what to do next:**

---

## ✅ What You've Completed

- ✅ RLS enabled on 21 tables
- ✅ Fixed cascade behavior
- ✅ Removed TEMP policies
- ✅ Added 8 performance indexes
- ✅ Secured 10 tables with proper RLS policies

**Great work!** Sections 1, 3, 4 (partial), and 5 are done.

---

## 🎯 What's Next (2 Quick Tasks)

### Task 1: Run the Fixed Script (2 minutes)

1. Open Supabase SQL Editor
2. Copy/paste: **`SUPABASE_PRODUCTION_HARDENING_FIXED.sql`**
3. Click "Run"
4. Review output
5. Run: `COMMIT;`

**This fixes the type casting errors for governance_votes, token_balances, and user_tokens.**

---

### Task 2: Two Manual Investigations (10 minutes)

#### Investigation A: Events Table FK Issue

**Run this in Supabase:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name IN ('organizing_pod_id', 'fund_recipient_pod_id');
```

**Then check sample data:**
```sql
SELECT organizing_pod_id, fund_recipient_pod_id
FROM events
LIMIT 5;
```

**Question to answer:** Do these columns contain:
- Pod UUIDs? → Fix: Migrate column to UUID type
- Token identifiers (TEXT)? → Fix: Point FK to `tokens` table instead
- Mixed/legacy data? → Fix: Clean up later

**See `INVESTIGATION_NEEDED.md` for detailed solutions**

---

#### Investigation B: Find Column Name

**Run this in Supabase:**
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'pod_role_permissions'
  AND (column_name LIKE '%token%' OR column_name LIKE '%address%');
```

**Or use:** `FIND_POD_PERMISSIONS_COLUMNS.sql`

**Then update line 57 in `SUPABASE_PRODUCTION_HARDENING_FIXED.sql`**

Replace:
```sql
-- [CORRECT_COLUMN_NAME]
```

With the actual column name (e.g., `token_address`)

---

## 📋 Verification (After Tasks 1 & 2)

Run these queries to confirm everything works:

```sql
-- 1. NO tables without RLS
SELECT COUNT(*) FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- Should return: 0

-- 2. Check new policies exist
SELECT COUNT(*) FROM pg_policies
WHERE policyname IN (
  'Authenticated users can vote',
  'Users can view their own balances',
  'Users can view their own tokens'
);
-- Should return: 3

-- 3. Check indexes exist
SELECT COUNT(*) FROM pg_indexes
WHERE indexname LIKE 'idx_general_notifications%'
   OR indexname LIKE 'idx_governance_notifications%';
-- Should return: 2
```

---

## 🎯 Success Metrics

After completing all tasks:

| Metric | Target | Check |
|--------|--------|-------|
| Tables with RLS OFF | 0 | ✅ |
| Type casting errors | 0 | ✅ |
| TEMP policies | 0 | ✅ |
| Performance indexes | 9+ | ✅ |
| "Anyone can..." write policies | 0 | ✅ |

---

## 📁 Key Files

1. **SUPABASE_PRODUCTION_HARDENING_FIXED.sql** ⭐ Run this next
2. **FIND_POD_PERMISSIONS_COLUMNS.sql** - Helper for Investigation B
3. **INVESTIGATION_NEEDED.md** - Detailed solutions
4. **FIXES_APPLIED_SUMMARY.md** - What you've done

---

## 🆘 If You Get Stuck

**Type casting error?**
→ Check line with error, add `::text` after `auth.uid()`

**Foreign key error?**
→ See `INVESTIGATION_NEEDED.md` Section 1

**Column not found?**
→ Run `FIND_POD_PERMISSIONS_COLUMNS.sql`

**Need to rollback?**
→ Run `ROLLBACK;` in SQL Editor

---

## ✅ When You're Done

Test these features:
- [ ] Create bounty (should require auth)
- [ ] Vote on proposal (should work)
- [ ] Create pod (should work)
- [ ] View forum posts (should work)

Then you're ready for production! 🚀

---

**Total time to completion: ~15 minutes**
**You've got this!**
