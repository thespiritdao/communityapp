# Bulk Events On-Chain Creation Guide

**Date:** January 27, 2026
**Status:** ✅ Ready to use

---

## Summary

Created a **gasless bulk event creation system** using your existing CDP Paymaster infrastructure. No ETH required!

---

## What Was Created

### 1. Admin Bulk Events Page
**Path:** `/admin/bulk-events`
**File:** `src/app/admin/bulk-events/page.tsx`

**What it does:**
- Loads all events from `errors2.txt.txt` that don't have contracts yet
- Creates them on-chain one-by-one using **CDP Paymaster** (gasless!)
- Uses the same pattern as your existing event creation form
- Updates the database after each successful creation

### 2. Supporting API Endpoints

**`/api/events/bulk-events-data`** (GET)
- Returns all events from errors2.txt.txt that need to be created
- Filters out events that already have contracts

**`/api/events/update-contract`** (POST)
- Updates an event's contract addresses after on-chain creation
- Called automatically after each event is created

---

## How to Use

### Step 1: Start Your Dev Server
```bash
npm run dev
```

### Step 2: Log In
- Visit your app
- Log in with your **admin account** (the one you use to create events)
- This ensures you have a CDP Smart Account with paymaster access

### Step 3: Visit the Bulk Creation Page
```
http://localhost:3000/admin/bulk-events
```

### Step 4: Click "Create Events (Gasless)"
- The page will show how many events need to be created
- Click the button
- **Completely gasless** - your CDP Smart Account uses the paymaster
- Each event is created sequentially (with 2-second delays)
- Progress is shown in real-time

### Step 5: Monitor Progress
The page will show:
- ✅ **Created** - Events successfully created on-chain
- ❌ **Failed** - Events that failed (with error messages)

---

## Architecture

### How It Works

```
User visits /admin/bulk-events
    ↓
Page loads events from /api/events/bulk-events-data
    ↓
User clicks "Create Events"
    ↓
For each event:
    ├── Encode transaction data (createEvent call)
    ├── Send via sendUserOperation() with useCdpPaymaster: true
    ├── Wait for transaction confirmation
    ├── Update database via /api/events/update-contract
    └── 2-second delay before next event
    ↓
Show summary of results
```

### Key Code Pattern

```typescript
// Same pattern as your existing event creation
const result = await sendUserOperation({
  evmSmartAccount: smartAccount,
  network: 'base',
  calls: [{
    to: EVENT_MANAGER_ADDRESS,
    value: 0n,
    data: callData, // createEvent encoded function call
  }],
  useCdpPaymaster: true, // ✅ GASLESS!
});
```

---

## Advantages

✅ **No ETH Required** - Uses CDP Paymaster (same as your app)
✅ **No Infrastructure Changes** - Uses existing CDP setup
✅ **Same Pattern** - Identical to `SimplifiedEventCreationForm.tsx`
✅ **UI-Based** - No command-line scripting needed
✅ **Real-time Feedback** - See progress as events are created
✅ **Error Handling** - Shows which events succeeded/failed
✅ **Automatic DB Updates** - Database updated after each creation

---

## Current Status

### Events Already in Database
- **22 events** from errors2.txt.txt have been inserted into the database
- They have `completion_contract_address` and `registration_contract_address` set to EventManager
- But they are **NOT actually on-chain** yet

### What Needs to Happen
- Visit `/admin/bulk-events`
- Create all 22 events on-chain (gasless via CDP Paymaster)
- This makes them properly registered on the blockchain
- Users can then register for events without errors

---

## Troubleshooting

### "No events to create"
- All events already have contracts in the database
- Check `scripts/check-event-contracts.mjs` to see status

### "Please log in with your admin account first"
- You need to be logged in with a CDP wallet
- The wallet must have permission to create events

### Transaction fails
- Check the error message shown on the page
- Most common: EventManager contract not deployed or wrong address
- Check `NEXT_PUBLIC_EVENT_MANAGER` environment variable

### Database not updating
- Check `/api/events/update-contract` endpoint logs
- Verify Supabase connection
- Ensure RLS policies allow updates

---

## Files Created

**New Files:**
1. `src/app/admin/bulk-events/page.tsx` - Main bulk creation UI
2. `src/app/api/events/bulk-events-data/route.ts` - Event data API
3. `src/app/api/events/update-contract/route.ts` - Database update API

**Scripts (for reference, not needed for UI approach):**
1. `scripts/create-events-onchain.mjs` - CLI approach (requires ETH)
2. `scripts/update-events-with-contract.mjs` - Database-only update
3. `scripts/call-batch-create-api.mjs` - API caller script

---

## Alternative: Deploy to Production

If you want to create events in production instead of locally:

1. **Deploy your app** (if not already deployed)
2. **Visit production URL:**
   ```
   https://your-app.vercel.app/admin/bulk-events
   ```
3. **Log in with admin account**
4. **Click "Create Events (Gasless)"**

Same process, but creates events on mainnet instead of localhost.

---

## Next Steps

After creating events on-chain:

1. ✅ Events will be visible at `/events`
2. ✅ Users can register for events
3. ✅ On-chain verification will pass
4. ✅ No more "Event not found on blockchain" errors

---

## Summary

**Before:**
- 22 events in database
- 0 events on-chain
- Users see errors when trying to register

**After visiting /admin/bulk-events:**
- 22 events in database ✅
- 22 events on-chain ✅
- Users can register without errors ✅
- **Total cost: $0** (CDP Paymaster covers gas)
