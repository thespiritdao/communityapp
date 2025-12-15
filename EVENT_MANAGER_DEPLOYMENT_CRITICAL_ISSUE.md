# CRITICAL: EventManager Deployment Issue - Hat ID Mismatch

**Date:** December 14, 2025
**Severity:** 🚨 **BLOCKER** - Will break event creation for all users
**Status:** ⚠️ MUST RESOLVE BEFORE DEPLOYING

---

## 🎯 The Problem

You've discovered a **critical architectural mismatch** between:

1. **App Permission Model** (database-based)
2. **Contract Permission Model** (hat-based)

### **What the App Does:**

```typescript
// useEventManagementAccess() - Lines 177-195
// Checks database permissions:
// 1. Pod module: events_enabled (database)
// 2. User role: eventCreation permission (database)
// NO HAT CHECK!

const hasEventsModule = modules[pod.id]?.events_enabled ?? false;
const hasPermission = podRoles.some(
  (role) => role.permissions?.eventCreation,
);
return hasEventsModule && hasPermission;
```

**Users with database `eventCreation` permission can access event creation UI.**

### **What the Contract Requires:**

```solidity
// EventManager.sol - Lines 127-146
modifier onlyEventManager() {
    require(
        hatsContract.isWearerOfHat(msg.sender, eventManagementHatId),
        "Must wear event management hat"
    );
    _;
}

function createEvent(...) external onlyEventManager {
    // Create event on-chain
}
```

**Only users wearing `eventManagementHatId` can call `createEvent()` on-chain.**

### **The Conflict:**

```
User with database permission tries to create event
  ↓
App calls EventManager.createEvent()
  ↓
Contract checks: Does user wear eventManagementHatId?
  ↓
User does NOT wear Executive Pod Leader hat
  ↓
Transaction REVERTS: "Must wear event management hat"
  ↓
Event creation FAILS for ALL regular users
```

**If you deploy with Executive Pod Leader hat (0x0000008800010000...), ONLY YOU can create events.**

---

## 🔍 Evidence

### **App Uses EventManager Contract**

**File:** `src/features/events/hooks/useSimplifiedEventTransactions.ts:81-96`

```typescript
const getCreateEventCall = useCallback(
  (params: CreateSimplifiedEventParams) => {
    return [
      {
        address: EVENT_MANAGER_CONTRACT, // Your deployed EventManager
        abi: EventManagerABI,
        functionName: 'createEvent',  // Calls the protected function
        args: [
          params.eventId,
          params.title,
          finalTimestamp,
          params.fundRecipient as `0x${string}`,
          priceSystemWei,
          priceSelfWei,
          params.maxAttendees || 0,
        ],
      },
    ];
  },
  [address],
);
```

**This function is called by:**
- `SimplifiedEventCreationForm.tsx` (line 280)
- Used by ALL users creating events

### **App Permission Check is Database-Only**

**File:** `src/features/events/hooks/useEventTokenGating.ts:177-195`

```typescript
// Filter pods where user has eventCreation permission
const podsWithPermission = allPods.filter((pod) => {
  // Check 1: Pod module enabled (database)
  const hasEventsModule = modules[pod.id]?.events_enabled ?? false;

  // Check 2: User has permission (database role)
  const podRoles = userRoles.filter((role) => role.podId === pod.id);
  const hasPermission = podRoles.some(
    (role) => role.permissions?.eventCreation,
  );

  // Both conditions from DATABASE, not blockchain
  return hasEventsModule && hasPermission;
});
```

**No hat check anywhere in the app-level permission logic!**

---

## 🚨 Impact Analysis

### **Scenario 1: Deploy with Executive Pod Leader Hat**

**Parameters:**
```
_eventManagementHatId: 0x0000008800010000000000000000000000000000000000000000000000000000
```

**Result:**
- ✅ YOU can create events (you wear this hat)
- ❌ ALL other users CANNOT create events
- ❌ Even users with database `eventCreation` permission will fail
- ❌ Event creation completely broken for community

**Error Users Will See:**
```
Transaction failed: Must wear event management hat
```

### **Scenario 2: Deploy with Dummy Hat ID (e.g., 0)**

**Parameters:**
```
_eventManagementHatId: 0
```

**Result:**
- ❌ NOBODY can create events (no one wears hat ID 0)
- ❌ Even YOU cannot create events
- ❌ Event creation completely broken for everyone

**Error Users Will See:**
```
Transaction failed: Must wear event management hat
```

### **Scenario 3: Don't Deploy EventManager at All**

**Result:**
- ❌ Event creation will fail (contract address not found)
- ❌ Registration will fail
- ❌ All event functionality broken

---

## ✅ Solutions

### **Option 1: Modify EventManager Contract (RECOMMENDED)**

**Remove the hat check from createEvent() function**

**Edit:** `src/contracts/EventManager.sol`

**Change from:**
```solidity
function createEvent(
    string memory eventId,
    string memory title,
    uint256 eventDate,
    address fundRecipient,
    uint256 priceSystem,
    uint256 priceSelf,
    uint256 maxAttendees
) external onlyEventManager {  // ← REMOVE THIS
```

**To:**
```solidity
function createEvent(
    string memory eventId,
    string memory title,
    uint256 eventDate,
    address fundRecipient,
    uint256 priceSystem,
    uint256 priceSelf,
    uint256 maxAttendees
) external {  // ← No modifier - open to all
```

**Keep hat check ONLY for admin functions:**
- `withdrawEmergencyTokens()` - Still protected ✅
- `updateTokenAddresses()` - Still protected ✅
- `updateHatsConfig()` - Still protected ✅

**Why This Works:**
- ✅ App-level permissions (database) control who can access UI
- ✅ All users with `eventCreation` permission can create events
- ✅ Admin functions still protected by hat
- ✅ Aligns with your pod permission model

**Deployment Parameters:**
```
_hatsContract: 0x3bc1a0ad72417f2d411118085256fc53cbddd137
_eventManagementHatId: 0x0000008800010000000000000000000000000000000000000000000000000000
_systemToken: 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
_selfToken: 0x1b8d424695E63ABca04E94bA46c03f1D83e14020
```

---

### **Option 2: Create a Universal Event Creator Hat**

**Create a new hat that ALL users with event permissions wear**

**Steps:**
1. Create new hat: "Event Creator"
2. Mint this hat to ALL users when they get `eventCreation` permission
3. Deploy EventManager with this new hat ID

**Why This is Complex:**
- ❌ Requires creating new hat
- ❌ Requires syncing database permissions → blockchain hats
- ❌ Requires updating app to mint/burn hats when permissions change
- ❌ Adds complexity to permission management
- ❌ Defeats the purpose of your database-based permission model

---

### **Option 3: Use a Paymaster or Relayer (Advanced)**

**Have a backend service create events on behalf of users**

**Flow:**
1. User creates event in UI
2. App sends request to backend
3. Backend (wearing admin hat) calls `createEvent()` on-chain
4. Transaction succeeds

**Why This is Complex:**
- ❌ Requires backend infrastructure
- ❌ Requires secure key management
- ❌ Adds latency to event creation
- ❌ Single point of failure (backend)
- ❌ Not decentralized

---

### **Option 4: Don't Use EventManager Contract**

**Use only EventEscrow for payments, skip on-chain event creation**

**Change app to:**
1. Store all event data in database (already doing this)
2. Use EventEscrow ONLY for payments when event has a price
3. Don't call EventManager.createEvent() at all

**Why This Could Work:**
- ✅ Simpler - just database + escrow
- ✅ No hat permission issues
- ⚠️ But EventManager is already deployed and app calls it

**Required Changes:**
- Modify `useSimplifiedEventTransactions.ts` to skip EventManager calls
- Use database as source of truth
- Keep EventEscrow for payments

---

## 🎯 RECOMMENDATION

**Use Option 1: Modify EventManager Contract**

### **Why:**
1. ✅ **Simplest solution** - One line change in contract
2. ✅ **Aligns with your architecture** - Database permissions for users, hat for admins
3. ✅ **No app changes required** - App already expects this behavior
4. ✅ **Secure** - Admin functions still protected
5. ✅ **Works immediately** - No infrastructure changes

### **What to Change:**

**File:** `src/contracts/EventManager.sol`

**Line 146:** Remove `onlyEventManager` modifier from `createEvent()`

```solidity
// BEFORE (line 146):
function createEvent(...) external onlyEventManager {

// AFTER (line 146):
function createEvent(...) external {
```

**Keep other functions protected:**
- Line 477: `withdrawEmergencyTokens() onlyEventManager` ✅ Keep
- Line 485: `updateTokenAddresses() onlyEventManager` ✅ Keep
- Line 490: `updateHatsConfig() onlyEventManager` ✅ Keep

### **Deployment Steps:**

1. Edit `EventManager.sol` (remove modifier from line 146)
2. Compile contract
3. Deploy with parameters:
   ```
   _hatsContract: 0x3bc1a0ad72417f2d411118085256fc53cbddd137
   _eventManagementHatId: 0x0000008800010000000000000000000000000000000000000000000000000000
   _systemToken: 0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
   _selfToken: 0x1b8d424695E63ABca04E94bA46c03f1D83e14020
   ```
4. Verify on BaseScan
5. Update `.env`: `NEXT_PUBLIC_EVENT_MANAGER=<new_address>`
6. Test event creation

---

## 📋 Testing Checklist (After Fix)

### **As Admin (You)**
- [ ] Create event (should succeed)
- [ ] Call `updateTokenAddresses()` (should succeed - you have hat)
- [ ] Call `withdrawEmergencyTokens()` (should succeed - you have hat)

### **As Regular User (No Hat, But Has Database Permission)**
- [ ] Create event (should succeed - no hat check)
- [ ] Register for event (should succeed)
- [ ] Try to call `updateTokenAddresses()` (should FAIL - requires hat)
- [ ] Try to call `withdrawEmergencyTokens()` (should FAIL - requires hat)

### **As User Without Database Permission**
- [ ] Cannot access event creation UI (database check blocks)
- [ ] Cannot create event (UI prevents it)

---

## 🔒 Security Implications

### **Before Fix (with hat check on createEvent):**
- ✅ Only hat holders can create events on-chain
- ❌ But your app gives database permission to create events
- ❌ Result: Permission mismatch, broken for users

### **After Fix (without hat check on createEvent):**
- ✅ Anyone can call `createEvent()` on contract
- ✅ But your app UI only allows users with database permission
- ✅ Admin functions still protected by hat
- ✅ Result: Aligned with your permission model

**Is this secure?**

YES, because:
1. **UI-level protection:** App only shows event creation to permitted users
2. **Database tracking:** All events tracked in database regardless
3. **Cost barrier:** Users must pay gas to create events
4. **Admin controls:** You can still manage emergency situations via protected functions
5. **Standard pattern:** Many dApps use UI-level permissions + open smart contracts

**Extra Security (Optional):**
- Add event creation fee (small SYSTEM token fee)
- Add rate limiting in UI
- Add moderation tools in admin dashboard

---

## 📞 Quick Decision Guide

**Question:** Should I use the Executive Pod Leader hat for `_eventManagementHatId`?

**Answer:** YES, but ONLY AFTER removing the hat check from `createEvent()`.

**Reason:** The hat should protect ADMIN functions only, not user-facing event creation.

---

**Document Status:** ✅ Complete
**Action Required:** Modify EventManager.sol before deployment
**Risk Level:** High (will break event creation if not fixed)
**Time to Fix:** 5 minutes (one line change)
