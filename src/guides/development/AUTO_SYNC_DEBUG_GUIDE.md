# Auto-Sync Debugging Guide

## Issue
Created new pod with agreement requirement during pod creation (Step 2), but:
- ❌ No "Module Synced!" toast appeared
- ❌ Immediately have leader access (should be blocked)
- ❌ Signing agreement has no effect

**This means auto-sync is NOT working.**

---

## Added Logging (Just Now)

I've added detailed logging to help diagnose the issue. When you create a new pod with agreement, you should now see these console logs:

### When Adding Agreement in Step 2

Look for this log when you click "Add" after selecting Agreement:
```
📋 Eligibility criteria updated: {
  count: 1,
  criteria: [{ type: 'agreement_signed', ... }],
  formDataBefore: []
}
✅ FormData updated with criteria
```

**If you DON'T see this**: The `onCriteriaChange` callback is not being called, which means the criteria aren't being saved to `formData`.

### During Pod Creation

Look for this log after clicking "Create Pod":
```
🔍 AUTO-SYNC CHECK: {
  criteriaCount: 1,
  podDataExists: true,
  podId: 'some-uuid-here',
  newHatId: '0x...',
  criteriaDetails: [{ type: 'agreement_signed', ... }]
}
```

**This will tell us which condition is failing:**
- `criteriaCount: 0` → Criteria not saved to formData
- `podDataExists: false` → Pod data not returned from database
- `podId: undefined` → Pod ID missing
- `newHatId: undefined` or `'extracted_from_tx'` → HAT ID not extracted

### If Auto-Sync Runs

If the condition passes, you'll see:
```
🔄 Auto-syncing eligibility criteria to module...
📋 Criteria count: 1
```

And then either:
```
✅ Eligibility module auto-synced successfully!
Toast: "Module Synced!"
```

Or:
```
❌ Module auto-sync failed: [error details]
Toast: "Warning: Module Not Synced"
```

---

## Testing Steps

1. **Clear browser console**
2. Go to `/pods/create-with-modules`
3. Fill in Step 1 (basic info)
4. In Step 2:
   - Click "Add Criterion"
   - Select "Agreement"
   - **Watch console** - should see "📋 Eligibility criteria updated"
   - Click "Add"
   - **Watch console** - should see "✅ FormData updated"
5. Go to Review step
   - Verify you see "📝 Agreement" badge
6. Click "Create Pod"
7. **Watch console carefully** for the "🔍 AUTO-SYNC CHECK" log
8. Note what it says for each field
9. **Share the console output** with me

---

## Possible Issues & Fixes

### Issue 1: criteriaCount is 0
**Problem**: Criteria not being saved to formData
**Possible Causes**:
- `updateFormData` not working
- `onCriteriaChange` not being called
- React state not updating

**Debug**: Check if you see the "📋 Eligibility criteria updated" log

### Issue 2: podDataExists is false or podId is undefined
**Problem**: Pod not created in database or data not returned
**Possible Causes**:
- Database insert failed
- `podData` variable not set correctly
- Wrong variable being checked

**Fix**: Need to check the pod creation code

### Issue 3: newHatId is undefined or 'extracted_from_tx'
**Problem**: HAT ID not extracted from transaction
**Possible Causes**:
- Transaction logs not parsed correctly
- HAT creation transaction failed
- Wrong event being monitored

**Fix**: Need to check HAT creation transaction parsing

---

## What to Share

After testing, please share:

1. **Full console output** from Step 4-8 above
2. Screenshot of the console logs
3. Specifically:
   - The "🔍 AUTO-SYNC CHECK" log content
   - Whether you saw "📋 Eligibility criteria updated"
   - Any error messages

This will tell us exactly which part is failing!

---

## Expected Flow (When Working)

1. Add agreement → See "📋 Eligibility criteria updated"
2. Review step → See "📝 Agreement" badge
3. Create pod → See "🔍 AUTO-SYNC CHECK" with all values present
4. See "🔄 Auto-syncing..." logs
5. See "✅ Eligibility module auto-synced successfully!"
6. See toast: "Module Synced!"
7. Navigate to pod → Blocked from management
8. Sign agreement → Access granted

---

Generated: 2025-11-08
Status: Debugging logs added
Next: Test pod creation and share console output
