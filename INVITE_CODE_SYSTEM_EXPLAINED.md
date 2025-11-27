# Invite Code System - Database Structure Explained

## ✅ YES, Invite Codes ARE Tracked in the Database!

The invite code system uses **two approaches** for complete tracking:

---

## 📋 Database Schema

### **1. `user_profiles` Table (Modified)**

**New Columns Added:**

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `referral_key` | `VARCHAR(6)` | **User's OWN invite code** they can share | `ABC123` |
| `invited_by` | `TEXT` | **Wallet address** of who invited them | `0x12a0...0244` |
| `onboarded_at` | `TIMESTAMP` | When user completed onboarding | `2025-11-26 14:30:00` |

**How It Works:**
```sql
-- Alice (first user) gets auto-generated code
INSERT INTO user_profiles (wallet_address, referral_key)
VALUES ('0x12a0...0244', 'XYZ789'); -- Auto-generated

-- Bob uses Alice's code to join
INSERT INTO user_profiles (wallet_address, referral_key, invited_by)
VALUES ('0xBob...', 'ABC123', '0x12a0...0244');
         ↑ Bob's code   ↑ Alice invited Bob
```

---

### **2. `referral_validations` Table (Separate Analytics Table)**

**Schema:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `BIGSERIAL` | Auto-increment primary key |
| `invite_code` | `VARCHAR(6)` | The code that was used |
| `used_by_wallet` | `TEXT` | Who entered the code |
| `validated_at` | `TIMESTAMP` | When it was validated |
| `referrer_wallet` | `TEXT` | Owner of the code (foreign key) |

**Purpose:** Track every time someone uses an invite code (for analytics, fraud detection, leaderboards)

**Example Data:**
```sql
SELECT * FROM referral_validations;

id | invite_code | used_by_wallet | validated_at        | referrer_wallet
---+-------------+----------------+---------------------+-----------------
1  | XYZ789      | 0xBob...       | 2025-11-26 10:00:00 | 0x12a0...0244
2  | XYZ789      | 0xCarol...     | 2025-11-26 11:30:00 | 0x12a0...0244
3  | ABC123      | 0xDave...      | 2025-11-26 14:00:00 | 0xBob...
```

**What This Shows:**
- Alice's code `XYZ789` was used by Bob and Carol
- Bob's code `ABC123` was used by Dave
- Full audit trail of invite code usage

---

## 🔍 How to Check If Migration Was Run

**Option 1: Check in Supabase Dashboard**
```
1. Go to Supabase Dashboard
2. Click "SQL Editor"
3. Run this query:

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_profiles'
  AND column_name IN ('referral_key', 'invited_by', 'onboarded_at');
```

**Expected Result:**
```
column_name  | data_type
-------------+-----------
referral_key | character varying
invited_by   | text
onboarded_at | timestamp with time zone
```

**Option 2: Check if Table Exists**
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'referral_validations'
);
```

Should return: `true`

---

## 📊 Useful Queries

### **1. Get a User's Invite Code**
```sql
SELECT wallet_address, referral_key
FROM user_profiles
WHERE wallet_address = '0x12a0...0244';

-- Returns: XYZ789
```

### **2. See Who Invited Someone**
```sql
SELECT
  up.wallet_address as new_user,
  up.invited_by as invited_by_wallet,
  referrer.referral_key as code_used
FROM user_profiles up
LEFT JOIN user_profiles referrer ON referrer.wallet_address = up.invited_by
WHERE up.wallet_address = '0xBob...';

-- Shows: Bob was invited by 0x12a0...0244 using code XYZ789
```

### **3. Referral Leaderboard (Who Invited Most People)**
```sql
SELECT
  up.wallet_address,
  up.referral_key,
  COUNT(invited.wallet_address) as total_invites
FROM user_profiles up
LEFT JOIN user_profiles invited ON invited.invited_by = up.wallet_address
GROUP BY up.wallet_address, up.referral_key
ORDER BY total_invites DESC;
```

### **4. All Invites Using a Specific Code**
```sql
SELECT
  rv.used_by_wallet,
  rv.validated_at,
  up.display_name
FROM referral_validations rv
LEFT JOIN user_profiles up ON up.wallet_address = rv.used_by_wallet
WHERE rv.invite_code = 'XYZ789'
ORDER BY rv.validated_at DESC;
```

### **5. Check If Code Already Used by Someone**
```sql
SELECT EXISTS (
  SELECT 1 FROM referral_validations
  WHERE invite_code = 'XYZ789'
    AND used_by_wallet = '0xBob...'
);

-- Returns: true (already used) or false (not used)
```

---

## 🔄 How Codes Are Assigned

### **Auto-Generation Trigger**

When a new user is created, a trigger automatically generates a unique code:

```sql
-- This trigger runs BEFORE INSERT
CREATE TRIGGER trigger_auto_generate_referral_key
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_referral_key();
```

**Function Logic:**
1. Generate random 6-character code using safe characters (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
2. Excludes confusing characters: `0`, `O`, `I`, `1`
3. Check if code already exists in database
4. If exists, generate new one (loop until unique)
5. Assign to new user

**Examples of Valid Codes:**
- ✅ `ABC123`
- ✅ `XYZ789`
- ✅ `MN4P5Q`

**Examples of INVALID Codes (Never Generated):**
- ❌ `O00O1I` (contains 0, O, I, 1)
- ❌ `ABCDE` (only 5 characters)
- ❌ `ABC 123` (contains space)

---

## 🎯 Complete Onboarding Flow

```
1. New user connects wallet
   ↓
2. System checks: Has onboarded?
   - Query: SELECT onboarded_at FROM user_profiles WHERE wallet_address = '0x...'
   - If NULL → Show invite modal
   ↓
3. User enters invite code "XYZ789"
   ↓
4. Backend validates code
   - Query: SELECT wallet_address FROM user_profiles WHERE referral_key = 'XYZ789'
   - Found? → Valid code (get referrer wallet)
   - Not found? → Invalid code (reject)
   ↓
5. Hat minting transaction
   ↓
6. Airdrop 100 SYSTEM + 100 SELF tokens
   ↓
7. Database updates:
   a. Mark user as onboarded:
      UPDATE user_profiles
      SET onboarded_at = NOW(),
          invited_by = '0x12a0...0244'  -- Alice's wallet
      WHERE wallet_address = '0xBob...';

   b. Generate Bob's OWN invite code (via trigger):
      referral_key = 'ABC123'  -- Bob can now invite others!

   c. Record usage in analytics table:
      INSERT INTO referral_validations (invite_code, used_by_wallet, referrer_wallet)
      VALUES ('XYZ789', '0xBob...', '0x12a0...0244');
   ↓
8. User sees their code on /identity/
   - API: GET /api/invite/validate?wallet=0xBob...
   - Returns: { inviteCode: 'ABC123' }
```

---

## 🚫 Preventing Abuse

### **1. One Code Per User**
```sql
-- referral_key is UNIQUE constraint
ALTER TABLE user_profiles
ADD CONSTRAINT unique_referral_key UNIQUE (referral_key);
```

### **2. Can't Reuse Same Code**
Before accepting code:
```typescript
const alreadyUsed = await hasReceivedAirdrop(walletAddress);
if (alreadyUsed) {
  return { error: 'You already received your testnet airdrop' };
}
```

### **3. Code Must Exist**
```typescript
const validationResult = await validateInviteCode(code, wallet);
if (!validationResult.isValid) {
  return { error: 'Invalid invite code' };
}
```

---

## 📍 Where to See Invite Codes in Action

### **1. User's Identity Page (`/identity/`)**

Shows the user's **own invite code** in a beautiful card:

```
┌─────────────────────────────────┐
│   Your Invite Code              │
│   Share this code with friends  │
│                                 │
│   ┌─────────────────┐          │
│   │    ABC123       │          │
│   └─────────────────┘          │
│                                 │
│   [📋 Copy Code]               │
│                                 │
│   🎁 Each person who joins...  │
└─────────────────────────────────┘
```

Component: `src/features/identity/components/InviteCodeDisplay.tsx`

### **2. Invite Modal (Entry Screen)**

Where users **enter someone else's code**:

```
┌─────────────────────────────────┐
│   Welcome, Traveler...          │
│                                 │
│   Has a key found you yet?      │
│   If so, share its code:        │
│                                 │
│   ┌─────────────────┐          │
│   │    [______]     │  ← Input │
│   └─────────────────┘          │
│                                 │
│   [Enter]                       │
└─────────────────────────────────┘
```

Component: `src/components/InviteCodeModal.tsx`

### **3. API Endpoints**

**Validate Code:**
```bash
POST /api/invite/validate
{
  "inviteCode": "XYZ789",
  "walletAddress": "0xBob..."
}
```

**Get User's Code:**
```bash
GET /api/invite/validate?wallet=0xBob...

Returns:
{
  "success": true,
  "inviteCode": "ABC123"
}
```

---

## 🔧 Migration Status Check

**Run this in Supabase SQL Editor:**

```sql
-- Check if migration was applied
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_profiles'
        AND column_name = 'referral_key'
    ) THEN '✅ Migration Applied'
    ELSE '❌ Migration NOT Applied'
  END as migration_status,

  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'referral_validations'
    ) THEN '✅ Table Exists'
    ELSE '❌ Table Missing'
  END as validation_table_status;
```

**Expected Result:**
```
migration_status       | validation_table_status
-----------------------+------------------------
✅ Migration Applied   | ✅ Table Exists
```

---

## 🎯 Summary

**To answer your questions:**

1. ✅ **YES**, invite codes ARE in `user_profiles` table as `referral_key` column
2. ✅ **YES**, we track who invited whom via `invited_by` column
3. ✅ **YES**, we have a separate `referral_validations` table for detailed analytics
4. ❌ **NOT MISSED** - Migration file exists: `supabase/migrations/20251125000001_add_referral_system.sql`

**You just need to run the migration!**

```bash
# Apply migration to Supabase
npx supabase db push

# Or manually run the SQL in Supabase Dashboard
```

Once applied, every user will automatically get a unique invite code! 🎉
