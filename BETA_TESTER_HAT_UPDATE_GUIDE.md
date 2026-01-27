# Beta Tester HAT Expiration Update Guide

## Overview

The Beta Tester role has **two layers** of time restrictions:

1. **Database** (`pod_modules.eligibility_criteria`) - Controls UI/permissions
2. **On-Chain** (`TimeBasedToggleModule` contract) - Controls HAT token validity

**Both must be updated** for the expiration change to take full effect.

---

## Current Configuration

### Module Details
```
ID: 64d5d229-b3ea-4f6a-a3bc-9a6315248daa
Pod ID: af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb
Token Address: 0x000000880001000b000000000000000000000000000000000000000000000000
Role Name: Beta Tester
Max Holders: 100
Current Holders: 0
Status: Active
```

### Current Time Restriction
```json
{
  "id": "time_based_1",
  "name": "time based requirement",
  "type": "time_based",
  "required": true,
  "valid_from": "2025-11-26T00:01",
  "valid_until": "2026-02-06T12:00"
}
```

**Current Expiration:** February 6, 2026 at 12:00 PM
**Desired Expiration:** February 28, 2026 at 11:59 PM
**Extension:** 22 days, 11 hours, 59 minutes

---

## Update Methods

### Method 1: Automated Script (Recommended for Database)

**What it does:** Updates the database `eligibility_criteria` field

```bash
node scripts/update-beta-tester-expiration.mjs
```

**Output:**
- Fetches current Beta Tester module
- Displays current time restriction
- Updates expiration to `2026-02-28T23:59`
- Confirms successful update
- Provides next steps for on-chain update

**Requirements:**
- Supabase credentials in `.env`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### Method 2: Manual Database Update

**SQL Query:**

```sql
UPDATE pod_modules
SET
  eligibility_criteria = jsonb_set(
    eligibility_criteria::jsonb,
    '{0,valid_until}',
    '"2026-02-28T23:59"'
  ),
  updated_at = NOW()
WHERE id = '64d5d229-b3ea-4f6a-a3bc-9a6315248daa';
```

**Steps:**
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Paste the query above
4. Click "Run"
5. Verify update in Table Editor

---

### Method 3: UI Update (Pod Management)

**Steps:**

1. **Navigate to Pod Management**
   - Go to `/pods` in your app
   - Find the pod containing Beta Tester role
   - Click "Manage Roles" or "View Modules"

2. **Find Beta Tester Role**
   - Look for "Beta Tester" in the roles list
   - Note the current expiration date

3. **Edit Time Restriction**
   - Click "Edit" or gear icon next to Beta Tester role
   - Find "Time-Based Eligibility" section
   - Update "Valid Until" field to `2026-02-28T23:59`

4. **Save Changes**
   - Click "Save" or "Update"
   - Confirm the change
   - Database will be updated automatically

---

## On-Chain Update (REQUIRED)

After updating the database, you **must** update the on-chain time restriction.

### Why Both Updates Are Needed:

| Location | Controls | Update Method |
|----------|----------|---------------|
| **Database** | UI permissions, access control in app | Script or SQL |
| **On-Chain** | HAT token validity, blockchain enforcement | Smart contract transaction |

If you only update the database, the HAT token will still expire on-chain on Feb 6th!

---

### Option A: Using SetHatExpirationButton Component

**Where to find it:**
The `SetHatExpirationButton` component should be available in your pod management UI when editing roles with time restrictions.

**Steps:**

1. Navigate to the Beta Tester role edit page
2. Look for "On-Chain Expiration" or "Commit to Blockchain" section
3. Update the expiration date to `February 28, 2026 23:59`
4. Click "Commit Change"
5. Approve the transaction (gasless via paymaster)
6. Wait for confirmation

**Behind the scenes:**
- Calls `TimeBasedToggleModule.setHatExpiration()`
- HAT ID: `0x000000880001000b000000000000000000000000000000000000000000000000`
- Uses CDP Smart Account for gasless transaction
- Sponsored by Coinbase Paymaster (no ETH needed)

---

### Option B: Using TimeBasedToggleService (Programmatic)

**Calculate Unix Timestamp:**
```javascript
const expirationDate = new Date('2026-02-28T23:59:00');
const unixTimestamp = Math.floor(expirationDate.getTime() / 1000);
console.log(unixTimestamp); // 1740786000
```

**Call the service:**
```typescript
import { TimeBasedToggleService } from '@/features/pods/services/TimeBasedToggleService';

const hatId = BigInt('0x000000880001000b000000000000000000000000000000000000000000000000');
const expiration = 1740786000n; // Feb 28, 2026 23:59 UTC

const txHash = await TimeBasedToggleService.setHatExpiration(
  hatId,
  expiration
);

console.log('Transaction hash:', txHash);
```

**Requirements:**
- Connected wallet with permissions to modify HAT
- `NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE` env var configured
- User must be pod admin or have HAT modification rights

---

### Option C: Direct Contract Interaction (Advanced)

**Contract Details:**
```
Contract: TimeBasedToggleModule
Address: [Check NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE in .env]
Network: Base (chain ID: 8453) or Base Sepolia (84532)
Function: setHatExpiration(uint256 hatId, uint256 expiration)
```

**Parameters:**
```
hatId: 0x000000880001000b000000000000000000000000000000000000000000000000
expiration: 1740786000 (Feb 28, 2026 23:59 UTC)
```

**Using Etherscan/Basescan:**
1. Go to contract address on Basescan
2. Navigate to "Write Contract" tab
3. Connect wallet
4. Find `setHatExpiration` function
5. Enter parameters above
6. Submit transaction

---

## Verification Steps

### 1. Verify Database Update

**SQL Query:**
```sql
SELECT
  id,
  role_name,
  eligibility_criteria,
  updated_at
FROM pod_modules
WHERE id = '64d5d229-b3ea-4f6a-a3bc-9a6315248daa';
```

**Expected Result:**
```json
{
  "eligibility_criteria": [
    {
      "id": "time_based_1",
      "valid_until": "2026-02-28T23:59"
    }
  ]
}
```

---

### 2. Verify On-Chain Update

**Using TimeBasedToggleService:**
```typescript
import { TimeBasedToggleService } from '@/features/pods/services/TimeBasedToggleService';

const hatId = BigInt('0x000000880001000b000000000000000000000000000000000000000000000000');

const timeWindow = await TimeBasedToggleService.getHatTimeWindow(hatId);

console.log('Start Time:', new Date(Number(timeWindow.startTime) * 1000));
console.log('Expiration:', new Date(Number(timeWindow.expiration) * 1000));
console.log('Is Active:', timeWindow.isActive);
console.log('Time Until Expiration:', timeWindow.timeUntilExpiration.toString(), 'seconds');
```

**Expected Output:**
```
Start Time: Tue Nov 26 2025 00:01:00 GMT
Expiration: Fri Feb 28 2026 23:59:00 GMT
Is Active: true
Time Until Expiration: [remaining seconds]
```

---

### 3. Test User Access

1. **Create Test Account**
   - Sign up as a new user
   - Request Beta Tester role

2. **Check Access**
   - Verify forum access
   - Verify bounty access
   - Check governance participation
   - Test marketplace access

3. **Check Expiration Behavior**
   - Fast-forward system time (if testing environment)
   - OR wait until original expiration date (Feb 6)
   - Verify user still has access after Feb 6
   - Verify access revokes after Feb 28

---

## Troubleshooting

### Issue: "TimeBasedToggleModule not configured"

**Cause:** `NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE` not set in `.env`

**Solution:**
```bash
# Check your .env file
cat .env | grep TIME_BASED_TOGGLE_MODULE

# If missing, add:
NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE=0x[contract_address]
```

---

### Issue: "Transaction Failed - Insufficient Permissions"

**Cause:** Wallet doesn't have permission to modify HAT expiration

**Solution:**
- Use pod admin wallet
- Or use wallet that deployed TimeBasedToggleModule
- Check HAT permissions in Hats Protocol

---

### Issue: "Database updated but still expires on Feb 6"

**Cause:** On-chain expiration not updated

**Solution:**
Follow "On-Chain Update" steps above. Database controls app UI, but blockchain controls token validity.

---

### Issue: "Changes not reflecting in UI"

**Cause:** Cache or state not refreshed

**Solution:**
```javascript
// Clear browser cache
localStorage.clear();

// Hard refresh
location.reload(true);

// Or restart dev server
npm run dev:clean
```

---

## Important Notes

### ⚠️ Two-Layer Architecture

This system has **dual enforcement**:

1. **App Layer (Database)**
   - Controls UI permissions
   - Shows/hides features
   - Checks `eligibility_criteria` field
   - Updated via script or SQL

2. **Blockchain Layer (Smart Contract)**
   - Controls HAT token validity
   - Enforced by TimeBasedToggleModule
   - Automatically revokes access when expired
   - Updated via transaction

**Both must match** for consistent behavior!

---

### 🕐 Timezone Considerations

All timestamps are in **UTC**. When setting expiration:

```
Input: 2026-02-28T23:59
Interpreted as: February 28, 2026 at 23:59 UTC
Your Local Time: [depends on your timezone]
```

To expire at end of day in your timezone, adjust accordingly.

---

### 📅 Extension Best Practices

When extending beta periods:

1. **Announce in advance** - Give testers notice
2. **Update both layers** - Database AND on-chain
3. **Verify immediately** - Check both updates worked
4. **Document the change** - Update any beta communications
5. **Test with one user** - Before announcing to all testers

---

## Quick Reference

### Key Files
- **Service:** `src/features/pods/services/TimeBasedToggleService.ts`
- **Component:** `src/features/pods/components/SetHatExpirationButton.tsx`
- **Script:** `scripts/update-beta-tester-expiration.mjs`
- **Contract:** `src/contracts/TimeBasedToggleModule.sol`

### Key Commands
```bash
# Update database
node scripts/update-beta-tester-expiration.mjs

# Verify update
node scripts/verify-beta-tester-expiration.mjs # (create if needed)

# Check on-chain
# (use TimeBasedToggleService.getHatTimeWindow() in browser console)
```

### Key Dates
- **Original Start:** November 26, 2025 at 00:01
- **Original End:** February 6, 2026 at 12:00
- **New End:** February 28, 2026 at 23:59
- **Beta Duration:** ~94 days

---

## Next Steps

1. ✅ Run the update script: `node scripts/update-beta-tester-expiration.mjs`
2. ⏳ Update on-chain expiration via UI or service
3. ✅ Verify both database and on-chain updates
4. 📢 Announce extension to beta testers
5. 📝 Update beta launch emails if needed

---

*Last Updated: January 27, 2026*
*Related: Beta launch preparation*
