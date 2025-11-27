# Image Upload Error Handling Test Plan

**Issue:** #15 - IPFS Uploads Have No Error Recovery
**Date:** November 25, 2025

---

## 🧪 Manual Testing Procedure

### Test 1: Invalid File Type

**Steps:**
1. Navigate to pod creation form
2. Upload a .txt or .pdf file as pod image
3. **Expected:** Toast notification appears: "Image Upload Failed: Invalid file type. Only JPG, JPEG, and PNG files are allowed. Pod will use a default avatar instead."
4. **Expected:** Pod creation continues successfully with default avatar
5. **Expected:** Console shows warning log (development only)

---

### Test 2: File Size Too Large

**Steps:**
1. Navigate to pod creation form
2. Upload an image larger than 2MB (e.g., 5MB JPG)
3. **Expected:** Toast notification appears: "Image Upload Failed: File size too large. Maximum size is 2MB. Pod will use a default avatar instead."
4. **Expected:** Pod creation continues successfully with default avatar
5. **Expected:** Console shows warning log (development only)

---

### Test 3: Supabase Storage Error

**Scenario:** Simulate storage bucket unavailable

**Steps:**
1. Temporarily rename the pod-images bucket in Supabase to cause error
2. Navigate to pod creation form
3. Upload a valid image file
4. **Expected:** Toast notification appears: "Image Upload Failed: [Supabase error message]. Pod will use a default avatar instead."
5. **Expected:** Pod creation continues successfully with default avatar
6. **Expected:** Console shows error log with full details (development only)
7. Restore bucket name after test

---

### Test 4: Network Failure During Upload

**Scenario:** Disconnect network mid-upload

**Steps:**
1. Navigate to pod creation form
2. Start uploading a large image (1.5MB+)
3. Disconnect network immediately
4. **Expected:** Toast notification appears: "Image Upload Failed: [Network error]. Pod will use a default avatar instead."
5. **Expected:** Pod creation continues successfully with default avatar
6. **Expected:** Console shows error log (development only)
7. Reconnect network

---

### Test 5: Successful Upload (Control Test)

**Steps:**
1. Navigate to pod creation form
2. Upload a valid JPG/PNG image under 2MB
3. **Expected:** NO error toast appears
4. **Expected:** Console log shows "✅ Pod image uploaded: [URL]"
5. **Expected:** Pod created with custom image visible

---

## ✅ Success Criteria

### User Experience
- [ ] Users are **always notified** when image upload fails
- [ ] Notification includes **clear error message** explaining what went wrong
- [ ] Pod creation **never fails** due to image upload issues
- [ ] Default avatar is used when upload fails

### Developer Experience
- [ ] Console warning logged for failed uploads (development)
- [ ] Full error details included in console (development)
- [ ] Error details redacted in production (no sensitive data leak)

### Error Recovery
- [ ] Pod creation completes successfully even with upload failure
- [ ] Users can retry by editing pod and re-uploading image
- [ ] No data loss or incomplete pod records

---

## 🔍 Additional Validation

### Check Toast Configuration

**File:** `src/features/pods/hooks/usePodCreation.ts:120-124`

```typescript
toast({
  title: "Image Upload Failed",
  description: `${uploadResult.error || 'Unknown error'}. Pod will use a default avatar instead.`,
  variant: "destructive"
});
```

**Verify:**
- [x] Toast uses `variant: "destructive"` for error styling
- [x] Description includes specific error message from upload service
- [x] Description explains fallback behavior (default avatar)
- [x] Console warning preserved for debugging

---

### Check Upload Service Error Messages

**File:** `src/features/pods/services/podImageUploadService.ts`

**Possible Error Messages:**
1. `"Invalid file type. Only JPG, JPEG, and PNG files are allowed."` (Line 26)
2. `"File size too large. Maximum size is 2MB."` (Line 34)
3. `"Failed to upload image"` (Line 59 - Supabase error)
4. `"Failed to get public URL for uploaded image"` (Line 71)
5. `"Unexpected error occurred"` (Line 86 - catch-all)

**All messages are user-friendly and actionable:** ✅

---

### Check Other Image Upload Implementations

**Files Reviewed:**
1. ✅ `EventImageUpload.tsx` - Has error display UI (lines 162-168)
2. ✅ `ImageUpload.tsx` (marketplace) - Has `onUploadError` callback
3. ✅ `hatImageUploadService.ts` - Not yet used, but follows same pattern

**Status:** Only pod image upload had silent failures. All others handle errors properly.

---

## 🐛 Known Issues (Pre-Fix)

**Before Implementation:**
```typescript
// Lines 117-119 (OLD CODE)
console.warn('⚠️ Image upload failed, using default:', uploadResult.error);
// Don't fail pod creation, just use default image
```

**Problem:**
- ❌ No user notification
- ❌ Silent failure
- ❌ Users don't know custom image wasn't saved
- ❌ Users may assume upload succeeded

---

## ✅ Fixed Implementation

**After Implementation:**
```typescript
// Lines 117-127 (NEW CODE)
console.warn('⚠️ Image upload failed, using default:', uploadResult.error);

// Notify user that image upload failed
toast({
  title: "Image Upload Failed",
  description: `${uploadResult.error || 'Unknown error'}. Pod will use a default avatar instead.`,
  variant: "destructive"
});

// Don't fail pod creation, just use default image
```

**Benefits:**
- ✅ User notified immediately
- ✅ Clear error message with reason
- ✅ Graceful degradation (pod still created)
- ✅ Users understand fallback behavior
- ✅ Maintains existing robust error recovery

---

## 📋 Test Results Template

| Test Case | Status | Notes |
|-----------|--------|-------|
| Invalid file type | ☐ Pass / ☐ Fail | |
| File size too large | ☐ Pass / ☐ Fail | |
| Supabase storage error | ☐ Pass / ☐ Fail | |
| Network failure | ☐ Pass / ☐ Fail | |
| Successful upload | ☐ Pass / ☐ Fail | |

---

## 🚀 Deployment Notes

**No Additional Changes Required:**
- ✅ Toast system already integrated
- ✅ Error messages already exist in upload service
- ✅ No database schema changes
- ✅ No API changes
- ✅ No environment variables needed

**Deploy:**
```bash
git add src/features/pods/hooks/usePodCreation.ts
git commit -m "Fix Issue #15: Add user notification for IPFS upload failures"
git push
```

---

**Test Plan Created:** November 25, 2025
**Status:** Ready for Manual Testing
**Risk:** Low (only adds notification, doesn't change behavior)
