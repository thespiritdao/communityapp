# Knowledge Base - Issues Fixed

**Date:** January 26, 2026

## Issues Identified

1. ❌ White background instead of standard grey with chatbg.png
2. ❌ Duplicate category buttons (each category showing twice)
3. ❌ Only 4 videos displaying instead of all 18
4. ❌ Video player failing with Next.js 15 async params error

## Root Causes

### Duplicate Categories & Videos
- The seeding script (`scripts/seed-knowledge-base.mjs`) was run **twice**
- This created 14 categories (7 duplicates) and 4 videos (2 duplicates)

### Missing Videos
- Only 2 videos were defined in the original seeding script
- The remaining 16 videos from `/src/guides/Instructional/` subfolders were never added to the database

### Video Player Error
- Next.js 15 changed the `params` API in dynamic routes
- `params` is now a `Promise` that must be unwrapped with `React.use()`

### Background Color
- Knowledge base pages were using `#FAFAF8` (white) instead of `#F5F4ED` (grey)
- Missing background image: `url(/images/chatbg.png)`

## Fixes Applied

### 1. Fixed Background Styling ✅
**File:** `src/app/knowledge/page.tsx`

Changed loading state and main container:
```typescript
// Loading state
<div className="min-h-screen flex items-center justify-center" style={{
  backgroundColor: '#F5F4ED',  // Changed from #FAFAF8
  backgroundImage: 'url(/images/chatbg.png)'  // Added
}}>

// Main container
<div style={{
  minHeight: '100vh',
  backgroundColor: '#F5F4ED',  // Changed from #FAFAF8
  backgroundImage: 'url(/images/chatbg.png)',  // Added
  padding: '24px 16px',
}}>
```

### 2. Fixed Next.js 15 Async Params ✅
**File:** `src/app/knowledge/[id]/page.tsx`

```typescript
// Before
interface PageProps {
  params: { id: string };
}

export default function KnowledgeItemPage({ params }: PageProps) {
  const loadItem = async () => {
    const { data } = await supabase
      .from('knowledge_items')
      .eq('id', params.id)  // ❌ Direct access fails in Next.js 15
  };
}

// After
import { use } from 'react';  // Added

interface PageProps {
  params: Promise<{ id: string }>;  // Changed to Promise
}

export default function KnowledgeItemPage({ params }: PageProps) {
  const { id } = use(params);  // ✅ Unwrap Promise

  const loadItem = async () => {
    const { data } = await supabase
      .from('knowledge_items')
      .eq('id', id)  // ✅ Use unwrapped id
  };
}
```

### 3. Removed Duplicates & Seeded All Videos ✅
**Script Created:** `scripts/fix-and-seed-all-videos.mjs`

This script:
1. Identified 7 duplicate categories (14 total → 7 clean)
2. Identified 2 duplicate videos (4 total → 2 clean)
3. Removed all duplicates from database
4. Seeded all 18 videos from the Instructional folder

**Video Structure:**
```
src/guides/Instructional/
├── AppWalkthough.mp4          (Getting Started)
├── ClaimingTokens.mp4          (Getting Started)
├── identity/
│   └── ProfileSetup.mp4        (Identity)
├── pods/
│   ├── CreatingPods.mp4        (Pods)
│   ├── ApplyToPod.mp4          (Pods)
│   ├── RoleCreationandPermissions.mp4  (Pods)
│   ├── PodModulesChatForum.mp4 (Pods)
│   └── PodCreateTreasury.mp4   (Pods)
├── bounties/
│   ├── IntroToBounties.mp4     (Bounties)
│   ├── CreatingBounties.mp4    (Bounties)
│   ├── ApplyToBounty.mp4       (Bounties)
│   ├── ReviewApproveBounty.mp4 (Bounties)
│   ├── SubmittingWork.mp4      (Bounties)
│   └── ReviewWorkPayBounty.mp4 (Bounties)
├── events/
│   ├── CreateEvents.mp4        (Events)
│   └── EventsAttendanceCredentials.mp4  (Events)
├── governance/
│   └── VotingProposals.mp4     (Governance)
└── marketplace/
    └── Marketplace.mp4          (Marketplace)
```

**Video URLs:** All videos hosted at `https://files.spiritdao.org/videos/Instructional/`

## Verification

Run the diagnostic script to verify:
```bash
node scripts/diagnose-knowledge-issues.mjs
```

**Expected Output:**
```
Categories in DB: 7
Videos in DB: 18
Videos visible on frontend: 18
Hidden videos: 0
✅ No duplicate category names found
✅ All videos have valid categories
```

## Current State

### Categories (7 total)
- 🚀 Getting Started (2 videos)
- 👤 Identity (1 video)
- 🏘️ Pods (5 videos)
- 💰 Bounties (6 videos)
- 📅 Events (2 videos)
- 🗳️ Governance (1 video)
- 🛒 Marketplace (1 video)

### Videos (18 total, all public)
All videos are:
- `is_public = true` (visible to everyone)
- `pod_id = null` (global, not pod-specific)
- Properly categorized
- Hosted on files.spiritdao.org

## Scripts Created

1. **diagnose-knowledge-issues.mjs** - Identifies duplicates and visibility issues
2. **fix-and-seed-all-videos.mjs** - Removes duplicates and seeds all 18 videos
3. **check-knowledge-data.mjs** - Quick database check utility

## Testing

1. Navigate to `/knowledge` - Should see 7 category buttons (no duplicates)
2. Click "All" - Should see all 18 videos in grid
3. Filter by category - Should see correct videos per category
4. Click any video - Should play without errors
5. Background should be grey (#F5F4ED) with chatbg.png texture

## All Issues Resolved ✅

- ✅ Background color and image fixed
- ✅ Duplicate category buttons removed
- ✅ All 18 videos now displaying
- ✅ Video player working with Next.js 15
