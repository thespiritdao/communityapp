# Knowledge Base & Video Tutorial System Architecture
**Date**: January 14, 2026
**Purpose**: Design in-app knowledge base with video tutorials, documentation, and interactive help
**Companion Documents**:
- VIDEO_TUTORIAL_FRAMEWORK.md
- USER_JOURNEY_MAPS.md

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [Video Hosting Strategy](#video-hosting-strategy)
5. [UI/UX Design Patterns](#uiux-design-patterns)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Content Management](#content-management)
8. [Analytics & Tracking](#analytics--tracking)
9. [Cost Analysis](#cost-analysis)
10. [Technical Specifications](#technical-specifications)

---

## Executive Summary

### Vision
Create an **in-app knowledge base** that provides:
- 📹 **45 video tutorials** (bite-sized, 2-5 minutes each)
- 📚 **Interactive documentation** (searchable, contextual)
- 🎯 **Contextual help** (tooltips, guided tours)
- 📊 **Progress tracking** (completion badges, learning paths)
- 🔍 **Smart search** (find answers instantly)

### Key Features
- ✅ **Self-Hosted Videos**: No external dependencies, full control
- ✅ **Progressive Learning**: Track 1 → Track 7 unlock system
- ✅ **Contextual Triggers**: Show relevant help based on user location
- ✅ **Multi-Format Content**: Videos, text guides, FAQs, troubleshooting
- ✅ **Mobile Optimized**: Works perfectly on all devices

### Success Metrics
- 📈 **80%+ tutorial completion rate** for Track 1 (Getting Started)
- 📈 **60%+ users** access knowledge base within first session
- 📈 **50% reduction** in support questions
- 📈 **<2 second** video load times

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CommApp Frontend                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Knowledge Base Modal/Sidebar Component              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │   │
│  │  │ Video Player │  │ Text Guides  │  │  Search  │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │   │
│  │  │ Progress Bar │  │   Tooltips   │  │  Badges  │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  knowledge_base_videos                               │   │
│  │  knowledge_base_articles                             │   │
│  │  knowledge_base_categories                           │   │
│  │  user_learning_progress                              │   │
│  │  knowledge_base_analytics                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Video Storage (Self-Hosted)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Supabase Storage Bucket: "tutorial-videos"         │   │
│  │  - Organized by track (track-1/, track-2/, ...)     │   │
│  │  - Multiple quality levels (1080p, 720p, 480p)      │   │
│  │  - WebM + MP4 formats (browser compatibility)       │   │
│  │  - Subtitles (.vtt files)                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
/src/features/knowledge-base/
├── components/
│   ├── KnowledgeBaseModal.tsx         # Main modal component
│   ├── VideoPlayer.tsx                 # Custom video player
│   ├── ArticleViewer.tsx               # Text guide renderer
│   ├── SearchBar.tsx                   # Fuzzy search component
│   ├── ProgressTracker.tsx             # Learning progress UI
│   ├── TrackNavigator.tsx              # 7-track navigation
│   ├── ContextualTooltip.tsx           # Inline help tooltips
│   └── GuidedTour.tsx                  # First-time user walkthrough
├── hooks/
│   ├── useKnowledgeBase.ts             # Main knowledge base hook
│   ├── useVideoProgress.ts             # Track video completion
│   ├── useArticleSearch.ts             # Search functionality
│   └── useContextualHelp.ts            # Contextual help system
├── lib/
│   ├── video-service.ts                # Video fetching/streaming
│   ├── search-indexer.ts               # Full-text search indexing
│   └── analytics-tracker.ts            # Usage analytics
└── types/
    └── knowledge-base.ts                # TypeScript definitions
```

---

## Database Schema

### Supabase Tables

#### 1. `knowledge_base_categories`
Organizes content into the 7 learning tracks.

```sql
CREATE TABLE knowledge_base_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL, -- 'track-1', 'track-2', etc.
  title TEXT NOT NULL, -- 'Getting Started', 'Pods', etc.
  description TEXT,
  icon_name TEXT, -- Icon identifier for UI
  order_index INTEGER NOT NULL, -- Display order (1-7)
  tier TEXT NOT NULL, -- 'essential', 'core', 'advanced'
  estimated_duration_minutes INTEGER, -- Total track duration
  prerequisite_category_id UUID REFERENCES knowledge_base_categories(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example data:
INSERT INTO knowledge_base_categories (slug, title, description, tier, order_index, estimated_duration_minutes) VALUES
('track-1', 'Getting Started', 'Platform basics and onboarding', 'essential', 1, 20),
('track-2', 'Pods', 'Communities and roles', 'core', 2, 30),
('track-3', 'Events', 'Event management and NFTs', 'core', 3, 25);
```

#### 2. `knowledge_base_videos`
Stores video tutorial metadata and file references.

```sql
CREATE TABLE knowledge_base_videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES knowledge_base_categories(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL, -- 'video-1-2-wallet-setup'
  title TEXT NOT NULL, -- 'Creating Your Account & Smart Wallet'
  description TEXT,
  objective TEXT, -- Learning objective
  duration_seconds INTEGER NOT NULL,
  order_index INTEGER NOT NULL, -- Position within track (1, 2, 3...)

  -- Video file paths (Supabase Storage)
  video_url_1080p TEXT, -- 'tutorial-videos/track-1/1.2-wallet-setup-1080p.webm'
  video_url_720p TEXT,
  video_url_480p TEXT,
  video_url_fallback_mp4 TEXT, -- For Safari/iOS compatibility
  thumbnail_url TEXT, -- Preview image
  subtitles_url TEXT, -- .vtt subtitle file

  -- Content metadata
  key_messages JSONB, -- ["Your Smart Wallet = Your Identity", ...]
  related_pages TEXT[], -- ['/identity/create', '/faucet']
  tags TEXT[], -- ['wallet', 'onboarding', 'beginner']

  -- Access control
  is_premium BOOLEAN DEFAULT false, -- Future: premium content
  required_role TEXT, -- Future: role-gated content

  -- Analytics
  total_views INTEGER DEFAULT 0,
  average_completion_rate DECIMAL(5,2), -- Percentage

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_kb_videos_category ON knowledge_base_videos(category_id);
CREATE INDEX idx_kb_videos_slug ON knowledge_base_videos(slug);
CREATE INDEX idx_kb_videos_tags ON knowledge_base_videos USING GIN(tags);
```

#### 3. `knowledge_base_articles`
Text-based guides, FAQs, troubleshooting docs.

```sql
CREATE TABLE knowledge_base_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES knowledge_base_categories(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown content
  article_type TEXT NOT NULL, -- 'guide', 'faq', 'troubleshooting', 'reference'

  -- Metadata
  author_user_id UUID REFERENCES user_profiles(user_id),
  related_video_ids UUID[], -- Links to related videos
  related_pages TEXT[], -- ['/pods', '/bounty']
  tags TEXT[],

  -- Search optimization
  search_vector TSVECTOR, -- Full-text search index

  -- Access control
  is_published BOOLEAN DEFAULT true,

  -- Analytics
  total_views INTEGER DEFAULT 0,
  helpful_votes INTEGER DEFAULT 0,
  unhelpful_votes INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX idx_kb_articles_search ON knowledge_base_articles USING GIN(search_vector);
CREATE INDEX idx_kb_articles_category ON knowledge_base_articles(category_id);
CREATE INDEX idx_kb_articles_slug ON knowledge_base_articles(slug);

-- Trigger to update search_vector on content changes
CREATE TRIGGER kb_articles_search_update
BEFORE INSERT OR UPDATE ON knowledge_base_articles
FOR EACH ROW EXECUTE FUNCTION
tsvector_update_trigger(search_vector, 'pg_catalog.english', title, content);
```

#### 4. `user_learning_progress`
Tracks individual user progress through tutorials.

```sql
CREATE TABLE user_learning_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  video_id UUID REFERENCES knowledge_base_videos(id) ON DELETE CASCADE,
  article_id UUID REFERENCES knowledge_base_articles(id) ON DELETE CASCADE,

  -- Progress tracking
  status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  completion_percentage INTEGER DEFAULT 0, -- 0-100
  watch_time_seconds INTEGER DEFAULT 0, -- Time spent watching video
  last_position_seconds INTEGER DEFAULT 0, -- Resume point for videos

  -- Engagement
  is_bookmarked BOOLEAN DEFAULT false,
  helpful_vote BOOLEAN, -- true = helpful, false = unhelpful, null = no vote
  notes TEXT, -- User's personal notes

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure user can only have one progress record per content item
  UNIQUE(user_id, video_id),
  UNIQUE(user_id, article_id),
  CHECK (
    (video_id IS NOT NULL AND article_id IS NULL) OR
    (video_id IS NULL AND article_id IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_ulp_user ON user_learning_progress(user_id);
CREATE INDEX idx_ulp_video ON user_learning_progress(video_id);
CREATE INDEX idx_ulp_status ON user_learning_progress(status);
```

#### 5. `knowledge_base_analytics`
Aggregate analytics for content performance.

```sql
CREATE TABLE knowledge_base_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  video_id UUID REFERENCES knowledge_base_videos(id) ON DELETE CASCADE,
  article_id UUID REFERENCES knowledge_base_articles(id) ON DELETE CASCADE,

  -- Daily metrics
  unique_viewers INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  total_watch_time_seconds BIGINT DEFAULT 0,
  average_completion_rate DECIMAL(5,2),
  completions INTEGER DEFAULT 0,
  drop_off_rate DECIMAL(5,2), -- % who didn't finish

  -- Engagement
  helpful_votes INTEGER DEFAULT 0,
  unhelpful_votes INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, video_id),
  UNIQUE(date, article_id),
  CHECK (
    (video_id IS NOT NULL AND article_id IS NULL) OR
    (video_id IS NULL AND article_id IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX idx_kba_date ON knowledge_base_analytics(date);
CREATE INDEX idx_kba_video ON knowledge_base_analytics(video_id);
```

#### 6. `contextual_help_triggers`
Defines when/where to show contextual help.

```sql
CREATE TABLE contextual_help_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL, -- 'pod-application-help'
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown or plain text
  trigger_type TEXT NOT NULL, -- 'page_load', 'element_click', 'first_visit', 'error_state'

  -- Trigger conditions
  page_path TEXT, -- '/pods/[id]' (exact match)
  page_path_pattern TEXT, -- '/pods/*' (wildcard match)
  element_selector TEXT, -- CSS selector for element
  trigger_delay_ms INTEGER DEFAULT 0, -- Delay before showing

  -- Display options
  tooltip_position TEXT, -- 'top', 'bottom', 'left', 'right'
  is_dismissible BOOLEAN DEFAULT true,
  show_once_per_user BOOLEAN DEFAULT false,

  -- Linked content
  related_video_id UUID REFERENCES knowledge_base_videos(id),
  related_article_id UUID REFERENCES knowledge_base_articles(id),

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example data:
INSERT INTO contextual_help_triggers (slug, title, content, trigger_type, page_path, related_video_id) VALUES
('first-bounty-help', 'New to Bounties?', 'Watch our 2-minute guide to get started!', 'first_visit', '/bounty', (SELECT id FROM knowledge_base_videos WHERE slug = 'video-4-1-discover-bounties'));
```

#### 7. `user_help_interactions`
Tracks user interactions with contextual help.

```sql
CREATE TABLE user_help_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES contextual_help_triggers(id) ON DELETE CASCADE,

  action TEXT NOT NULL, -- 'viewed', 'dismissed', 'clicked_video', 'clicked_article'
  page_path TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate "viewed" events
  UNIQUE(user_id, trigger_id, action)
);

CREATE INDEX idx_uhi_user ON user_help_interactions(user_id);
CREATE INDEX idx_uhi_trigger ON user_help_interactions(trigger_id);
```

---

## Video Hosting Strategy

### Option 1: Supabase Storage (RECOMMENDED) ✅

**Why Supabase Storage?**
- ✅ **Self-Hosted**: Full control, no external dependencies
- ✅ **Cost-Effective**: $0.021/GB storage, $0.09/GB bandwidth
- ✅ **CDN Included**: Fast global delivery
- ✅ **Simple Integration**: Already using Supabase
- ✅ **No Vendor Lock-In**: Can migrate easily

**Setup Steps**:

```typescript
// 1. Create storage bucket via Supabase Dashboard or SQL
INSERT INTO storage.buckets (id, name, public) VALUES
('tutorial-videos', 'tutorial-videos', true);

// 2. Set up RLS policies
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'tutorial-videos');

CREATE POLICY "Authenticated upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tutorial-videos' AND
  auth.role() = 'authenticated'
);
```

**Folder Structure**:
```
tutorial-videos/
├── track-1/
│   ├── 1.1-platform-overview-1080p.webm
│   ├── 1.1-platform-overview-720p.webm
│   ├── 1.1-platform-overview-480p.webm
│   ├── 1.1-platform-overview-fallback.mp4
│   ├── 1.1-platform-overview-thumb.jpg
│   ├── 1.1-platform-overview-subtitles.vtt
│   ├── 1.2-wallet-setup-1080p.webm
│   └── ...
├── track-2/
│   ├── 2.1-discover-pods-1080p.webm
│   └── ...
├── track-3/
├── track-4/
├── track-5/
├── track-6/
└── track-7/
```

**Video Encoding Pipeline**:

```bash
# Use FFmpeg to create multiple quality levels
# 1080p WebM (best quality)
ffmpeg -i source.mov -c:v libvpx-vp9 -b:v 2M -c:a libopus -b:a 128k -vf scale=1920:1080 output-1080p.webm

# 720p WebM (good quality, smaller size)
ffmpeg -i source.mov -c:v libvpx-vp9 -b:v 1M -c:a libopus -b:a 96k -vf scale=1280:720 output-720p.webm

# 480p WebM (mobile-friendly)
ffmpeg -i source.mov -c:v libvpx-vp9 -b:v 500k -c:a libopus -b:a 64k -vf scale=854:480 output-480p.webm

# MP4 fallback (Safari/iOS compatibility)
ffmpeg -i source.mov -c:v libx264 -b:v 1M -c:a aac -b:a 128k -vf scale=1280:720 output-fallback.mp4

# Generate thumbnail (frame at 2 seconds)
ffmpeg -i source.mov -ss 00:00:02 -vframes 1 -vf scale=640:360 thumbnail.jpg
```

**Upload Script**:

```typescript
// scripts/upload-video.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function uploadVideo(
  trackNumber: number,
  videoNumber: number,
  videoSlug: string,
  localPath: string
) {
  const qualities = ['1080p', '720p', '480p', 'fallback'];
  const extensions = ['webm', 'webm', 'webm', 'mp4'];

  const urls: Record<string, string> = {};

  for (let i = 0; i < qualities.length; i++) {
    const quality = qualities[i];
    const ext = extensions[i];
    const fileName = `${videoSlug}-${quality}.${ext}`;
    const storagePath = `track-${trackNumber}/${fileName}`;
    const filePath = path.join(localPath, fileName);

    console.log(`Uploading ${fileName}...`);

    const fileBuffer = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage
      .from('tutorial-videos')
      .upload(storagePath, fileBuffer, {
        contentType: `video/${ext}`,
        cacheControl: '31536000', // 1 year cache
        upsert: true,
      });

    if (error) {
      console.error(`Failed to upload ${fileName}:`, error);
      continue;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('tutorial-videos')
      .getPublicUrl(storagePath);

    urls[`video_url_${quality}`] = publicUrl;
  }

  // Upload thumbnail
  const thumbPath = path.join(localPath, `${videoSlug}-thumb.jpg`);
  if (fs.existsSync(thumbPath)) {
    const thumbBuffer = fs.readFileSync(thumbPath);
    await supabase.storage
      .from('tutorial-videos')
      .upload(`track-${trackNumber}/${videoSlug}-thumb.jpg`, thumbBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });

    const { data: { publicUrl } } = supabase.storage
      .from('tutorial-videos')
      .getPublicUrl(`track-${trackNumber}/${videoSlug}-thumb.jpg`);

    urls.thumbnail_url = publicUrl;
  }

  // Upload subtitles
  const subPath = path.join(localPath, `${videoSlug}-subtitles.vtt`);
  if (fs.existsSync(subPath)) {
    const subBuffer = fs.readFileSync(subPath);
    await supabase.storage
      .from('tutorial-videos')
      .upload(`track-${trackNumber}/${videoSlug}-subtitles.vtt`, subBuffer, {
        contentType: 'text/vtt',
        cacheControl: '31536000',
      });

    const { data: { publicUrl } } = supabase.storage
      .from('tutorial-videos')
      .getPublicUrl(`track-${trackNumber}/${videoSlug}-subtitles.vtt`);

    urls.subtitles_url = publicUrl;
  }

  return urls;
}

// Usage:
uploadVideo(1, 2, '1.2-wallet-setup', './encoded-videos/track-1/1.2/');
```

### Option 2: Cloudflare Stream (Alternative)

**Pros**:
- Built-in adaptive bitrate streaming
- Automatic encoding
- Analytics included

**Cons**:
- $1/1000 minutes delivered (more expensive at scale)
- External dependency
- Less control

**Only consider if**: Video quality/streaming performance is critical and budget allows.

---

## UI/UX Design Patterns

### 1. Knowledge Base Modal Component

**Location**: Accessible from top navigation + contextual triggers

**Design**:

```tsx
// src/features/knowledge-base/components/KnowledgeBaseModal.tsx
'use client';

import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { MagnifyingGlassIcon, XMarkIcon, BookOpenIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import VideoPlayer from './VideoPlayer';
import ArticleViewer from './ArticleViewer';
import TrackNavigator from './TrackNavigator';
import SearchBar from './SearchBar';

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: {
    type: 'video' | 'article';
    slug: string;
  };
}

export default function KnowledgeBaseModal({
  isOpen,
  onClose,
  initialContent,
}: KnowledgeBaseModalProps) {
  const [activeTab, setActiveTab] = useState<'browse' | 'search'>('browse');
  const [selectedContent, setSelectedContent] = useState(initialContent);

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

      {/* Modal Panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-5xl h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <BookOpenIcon className="w-6 h-6 text-blue-600" />
              <Dialog.Title className="text-xl font-bold text-gray-900">
                Knowledge Base
              </Dialog.Title>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('browse')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === 'browse'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Browse
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === 'search'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Search
              </button>
            </div>

            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar (Track Navigator) */}
            <div className="w-80 border-r border-gray-200 overflow-y-auto">
              {activeTab === 'browse' ? (
                <TrackNavigator
                  onSelectContent={(content) => setSelectedContent(content)}
                  selectedContent={selectedContent}
                />
              ) : (
                <SearchBar
                  onSelectContent={(content) => setSelectedContent(content)}
                />
              )}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {selectedContent ? (
                selectedContent.type === 'video' ? (
                  <VideoPlayer videoSlug={selectedContent.slug} />
                ) : (
                  <ArticleViewer articleSlug={selectedContent.slug} />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <BookOpenIcon className="w-16 h-16 mb-4" />
                  <p className="text-lg font-medium">Select a tutorial or guide to get started</p>
                </div>
              )}
            </div>
          </div>

        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
```

### 2. Video Player Component

**Features**:
- Adaptive quality selection
- Resume from last position
- Playback speed control
- Subtitle support
- Progress tracking

```tsx
// src/features/knowledge-base/components/VideoPlayer.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useVideoProgress } from '../hooks/useVideoProgress';
import { supabase } from '@/lib/supabase/client';

interface VideoPlayerProps {
  videoSlug: string;
}

export default function VideoPlayer({ videoSlug }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { currentUser } = useCurrentUser();
  const [video, setVideo] = useState<any>(null);
  const [quality, setQuality] = useState<'1080p' | '720p' | '480p'>('720p');

  const {
    progress,
    updateProgress,
    markComplete,
  } = useVideoProgress(currentUser?.id, video?.id);

  // Fetch video metadata
  useEffect(() => {
    async function loadVideo() {
      const { data } = await supabase
        .from('knowledge_base_videos')
        .select('*')
        .eq('slug', videoSlug)
        .single();

      setVideo(data);
    }
    loadVideo();
  }, [videoSlug]);

  // Resume from last position
  useEffect(() => {
    if (videoRef.current && progress?.last_position_seconds) {
      videoRef.current.currentTime = progress.last_position_seconds;
    }
  }, [progress, video]);

  // Track progress every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const currentTime = videoRef.current.currentTime;
        const duration = videoRef.current.duration;
        const percentage = Math.floor((currentTime / duration) * 100);

        updateProgress({
          completion_percentage: percentage,
          last_position_seconds: Math.floor(currentTime),
          watch_time_seconds: (progress?.watch_time_seconds || 0) + 5,
        });

        // Mark complete at 90% watched
        if (percentage >= 90 && progress?.status !== 'completed') {
          markComplete();
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [video, progress]);

  if (!video) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  const videoUrl = video[`video_url_${quality}`] || video.video_url_720p;

  return (
    <div className="p-6">
      {/* Video Title */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{video.title}</h2>
        <p className="text-gray-600">{video.description}</p>

        {/* Progress Badge */}
        {progress?.status === 'completed' && (
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            ✓ Completed
          </div>
        )}
      </div>

      {/* Video Player */}
      <div className="relative bg-black rounded-lg overflow-hidden mb-4">
        <video
          ref={videoRef}
          controls
          className="w-full"
          poster={video.thumbnail_url}
        >
          <source src={videoUrl} type="video/webm" />
          <source src={video.video_url_fallback_mp4} type="video/mp4" />
          {video.subtitles_url && (
            <track
              label="English"
              kind="subtitles"
              srcLang="en"
              src={video.subtitles_url}
              default
            />
          )}
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Quality Selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          <span className="text-sm text-gray-600">Quality:</span>
          {['480p', '720p', '1080p'].map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q as any)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                quality === q
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-600">
          Duration: {Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60).toString().padStart(2, '0')}
        </div>
      </div>

      {/* Key Messages */}
      {video.key_messages && video.key_messages.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Key Takeaways:</h3>
          <ul className="space-y-1">
            {video.key_messages.map((message: string, i: number) => (
              <li key={i} className="text-sm text-gray-700">
                • {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Related Pages */}
      {video.related_pages && video.related_pages.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="font-semibold text-gray-900 mb-2">Try it yourself:</h3>
          <div className="flex flex-wrap gap-2">
            {video.related_pages.map((page: string) => (
              <a
                key={page}
                href={page}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                {page}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 3. Track Navigator Component

**Design**: Expandable accordion showing 7 tracks with nested videos.

```tsx
// src/features/knowledge-base/components/TrackNavigator.tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronRightIcon, CheckCircleIcon, PlayCircleIcon } from '@heroicons/react/24/solid';
import { supabase } from '@/lib/supabase/client';
import { useCurrentUser } from '@coinbase/cdp-hooks';

interface Track {
  id: string;
  slug: string;
  title: string;
  tier: string;
  videos: Video[];
  userProgress: {
    totalVideos: number;
    completedVideos: number;
  };
}

interface Video {
  id: string;
  slug: string;
  title: string;
  duration_seconds: number;
  order_index: number;
  isCompleted: boolean;
  isInProgress: boolean;
}

export default function TrackNavigator({ onSelectContent, selectedContent }: any) {
  const { currentUser } = useCurrentUser();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [expandedTrack, setExpandedTrack] = useState<string | null>('track-1');

  useEffect(() => {
    loadTracks();
  }, [currentUser]);

  async function loadTracks() {
    // Fetch categories
    const { data: categories } = await supabase
      .from('knowledge_base_categories')
      .select('*')
      .eq('is_active', true)
      .order('order_index');

    if (!categories) return;

    // Fetch videos for each category
    const tracksWithVideos = await Promise.all(
      categories.map(async (cat) => {
        const { data: videos } = await supabase
          .from('knowledge_base_videos')
          .select('*')
          .eq('category_id', cat.id)
          .order('order_index');

        // Fetch user progress
        let userProgress = { totalVideos: videos?.length || 0, completedVideos: 0 };
        if (currentUser && videos) {
          const { data: progress } = await supabase
            .from('user_learning_progress')
            .select('video_id, status')
            .eq('user_id', currentUser.id)
            .in('video_id', videos.map(v => v.id))
            .eq('status', 'completed');

          userProgress.completedVideos = progress?.length || 0;

          // Attach progress to each video
          videos.forEach(video => {
            const videoProgress = progress?.find(p => p.video_id === video.id);
            (video as any).isCompleted = !!videoProgress;
          });
        }

        return {
          ...cat,
          videos: videos || [],
          userProgress,
        };
      })
    );

    setTracks(tracksWithVideos);
  }

  return (
    <div className="p-4 space-y-2">
      {tracks.map((track) => {
        const isExpanded = expandedTrack === track.slug;
        const progressPercentage = Math.round(
          (track.userProgress.completedVideos / track.userProgress.totalVideos) * 100
        );

        return (
          <div key={track.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Track Header */}
            <button
              onClick={() => setExpandedTrack(isExpanded ? null : track.slug)}
              className="w-full px-4 py-3 bg-white hover:bg-gray-50 flex items-center justify-between transition"
            >
              <div className="flex items-center gap-3 flex-1">
                <ChevronRightIcon
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
                <div className="text-left">
                  <div className="font-semibold text-gray-900">{track.title}</div>
                  <div className="text-xs text-gray-500">
                    {track.userProgress.completedVideos}/{track.userProgress.totalVideos} videos •{' '}
                    {track.estimated_duration_minutes}min
                  </div>
                </div>
              </div>

              {/* Progress Badge */}
              {progressPercentage > 0 && (
                <div className="text-xs font-medium text-blue-600">
                  {progressPercentage}%
                </div>
              )}
            </button>

            {/* Progress Bar */}
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            {/* Video List */}
            {isExpanded && (
              <div className="bg-gray-50 divide-y divide-gray-200">
                {track.videos.map((video: any) => (
                  <button
                    key={video.id}
                    onClick={() => onSelectContent({ type: 'video', slug: video.slug })}
                    className={`w-full px-4 py-3 text-left hover:bg-white transition flex items-center gap-3 ${
                      selectedContent?.slug === video.slug ? 'bg-blue-50' : ''
                    }`}
                  >
                    {/* Status Icon */}
                    {video.isCompleted ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <PlayCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}

                    {/* Video Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {video.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60)
                          .toString()
                          .padStart(2, '0')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### 4. Contextual Tooltip Component

**Design**: Appears on specific pages to guide users.

```tsx
// src/features/knowledge-base/components/ContextualTooltip.tsx
'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, PlayCircleIcon } from '@heroicons/react/24/solid';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { supabase } from '@/lib/supabase/client';

interface ContextualTooltipProps {
  triggerSlug: string;
  onOpenKnowledgeBase?: () => void;
}

export default function ContextualTooltip({ triggerSlug, onOpenKnowledgeBase }: ContextualTooltipProps) {
  const { currentUser } = useCurrentUser();
  const [trigger, setTrigger] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    loadTrigger();
  }, [triggerSlug, currentUser]);

  async function loadTrigger() {
    // Fetch trigger
    const { data: triggerData } = await supabase
      .from('contextual_help_triggers')
      .select('*')
      .eq('slug', triggerSlug)
      .eq('is_active', true)
      .single();

    if (!triggerData) return;

    // Check if user has already interacted
    if (currentUser && triggerData.show_once_per_user) {
      const { data: interaction } = await supabase
        .from('user_help_interactions')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('trigger_id', triggerData.id)
        .single();

      if (interaction) {
        setHasInteracted(true);
        return;
      }
    }

    setTrigger(triggerData);

    // Show tooltip after delay
    setTimeout(() => {
      setIsVisible(true);
      trackInteraction('viewed');
    }, triggerData.trigger_delay_ms || 0);
  }

  async function trackInteraction(action: string) {
    if (!currentUser || !trigger) return;

    await supabase.from('user_help_interactions').insert({
      user_id: currentUser.id,
      trigger_id: trigger.id,
      action,
      page_path: window.location.pathname,
    });
  }

  function handleDismiss() {
    trackInteraction('dismissed');
    setIsVisible(false);
  }

  function handleWatchVideo() {
    trackInteraction('clicked_video');
    if (onOpenKnowledgeBase) {
      onOpenKnowledgeBase();
    }
  }

  if (!trigger || !isVisible || hasInteracted) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm animate-slide-up">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <PlayCircleIcon className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">{trigger.title}</h3>
          </div>
          {trigger.is_dismissible && (
            <button
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-blue-100 transition"
            >
              <XMarkIcon className="w-4 h-4 text-blue-700" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-gray-700 mb-4">{trigger.content}</p>

          {trigger.related_video_id && (
            <button
              onClick={handleWatchVideo}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
            >
              Watch Tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 5. Global Help Button

**Location**: Fixed bottom-right corner of every page.

```tsx
// src/components/GlobalHelpButton.tsx
'use client';

import { useState } from 'react';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/solid';
import KnowledgeBaseModal from '@/features/knowledge-base/components/KnowledgeBaseModal';

export default function GlobalHelpButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-30 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
        aria-label="Open Knowledge Base"
      >
        <QuestionMarkCircleIcon className="w-6 h-6" />
      </button>

      <KnowledgeBaseModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
```

**Add to `src/app/layout.tsx`**:

```tsx
import GlobalHelpButton from '@/components/GlobalHelpButton';

export default function RootLayout({ children }: { children: React.Node }) {
  return (
    <html>
      <body>
        {children}
        <GlobalHelpButton />
      </body>
    </html>
  );
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goals**: Database setup, video encoding pipeline, upload scripts

**Tasks**:
- [ ] Create Supabase tables (all 7 tables)
- [ ] Set up `tutorial-videos` storage bucket
- [ ] Create video encoding scripts (FFmpeg pipeline)
- [ ] Build video upload automation
- [ ] Seed initial data (7 categories, 45 video records)

**Deliverables**:
- Database schema deployed
- Video encoding workflow documented
- Upload scripts ready

---

### Phase 2: Core Components (Week 3-4)

**Goals**: Build main UI components

**Tasks**:
- [ ] Build `KnowledgeBaseModal` component
- [ ] Build `VideoPlayer` component with progress tracking
- [ ] Build `TrackNavigator` component
- [ ] Build `ArticleViewer` component
- [ ] Create `useKnowledgeBase` hook
- [ ] Create `useVideoProgress` hook

**Deliverables**:
- Functional knowledge base modal
- Video playback with progress tracking
- Track navigation with completion badges

---

### Phase 3: Content Production (Week 5-8)

**Goals**: Record and encode all 45 videos

**Tasks**:
- [ ] Record Track 1 videos (6 videos, Getting Started)
- [ ] Encode Track 1 videos (all quality levels)
- [ ] Upload Track 1 videos to Supabase Storage
- [ ] Test Track 1 in production
- [ ] Record Tracks 2-4 (Core features)
- [ ] Record Tracks 5-7 (Advanced features)
- [ ] Create subtitles for all videos (.vtt files)

**Deliverables**:
- 45 videos encoded and uploaded
- All videos have subtitles
- All thumbnails generated

---

### Phase 4: Search & Discovery (Week 9-10)

**Goals**: Add search functionality and contextual help

**Tasks**:
- [ ] Build `SearchBar` component with fuzzy search
- [ ] Implement full-text search (PostgreSQL tsvector)
- [ ] Create search indexer for articles
- [ ] Build `ContextualTooltip` component
- [ ] Seed contextual help triggers (20+ triggers)
- [ ] Add `GlobalHelpButton` to all pages

**Deliverables**:
- Working search functionality
- Contextual help system active
- Help button on all pages

---

### Phase 5: Analytics & Optimization (Week 11-12)

**Goals**: Track usage, optimize performance

**Tasks**:
- [ ] Implement analytics tracking
- [ ] Build admin analytics dashboard
- [ ] Add video quality auto-selection (based on bandwidth)
- [ ] Optimize video CDN caching
- [ ] A/B test contextual help triggers
- [ ] Gather user feedback

**Deliverables**:
- Analytics dashboard for admins
- Performance optimizations deployed
- User feedback collected

---

## Content Management

### Admin Panel for Content Creators

**Location**: `/admin/knowledge-base`

**Features**:
- Upload new videos
- Create/edit articles
- Manage contextual help triggers
- View analytics
- Moderate user feedback

**Implementation**:

```tsx
// src/app/admin/knowledge-base/page.tsx
'use client';

import { useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import VideoUploadForm from '@/features/knowledge-base/admin/VideoUploadForm';
import ArticleEditor from '@/features/knowledge-base/admin/ArticleEditor';
import AnalyticsDashboard from '@/features/knowledge-base/admin/AnalyticsDashboard';

export default function KnowledgeBaseAdmin() {
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState('videos');

  // TODO: Add admin permission check

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Knowledge Base Admin</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {['videos', 'articles', 'analytics'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg font-medium capitalize ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'videos' && <VideoUploadForm />}
      {activeTab === 'articles' && <ArticleEditor />}
      {activeTab === 'analytics' && <AnalyticsDashboard />}
    </div>
  );
}
```

---

## Analytics & Tracking

### Key Metrics to Track

1. **Video Performance**:
   - Total views
   - Average completion rate
   - Drop-off points (where users stop watching)
   - Most watched videos
   - Least watched videos

2. **User Engagement**:
   - % of users who access knowledge base
   - Average time spent in knowledge base
   - Most common search queries
   - Contextual help click-through rate

3. **Learning Progress**:
   - Track completion rates by track
   - Time to complete Track 1 (onboarding)
   - % of users who complete all tracks
   - Badge unlocks

4. **Content Quality**:
   - Helpful/unhelpful votes
   - User feedback comments
   - Support ticket reduction

### Analytics Dashboard

```tsx
// src/features/knowledge-base/admin/AnalyticsDashboard.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Line, Bar } from 'react-chartjs-2';

export default function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    // Fetch aggregate analytics
    const { data: dailyMetrics } = await supabase
      .from('knowledge_base_analytics')
      .select('*')
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('date', { ascending: true });

    // Fetch top videos
    const { data: topVideos } = await supabase
      .from('knowledge_base_videos')
      .select('title, total_views, average_completion_rate')
      .order('total_views', { ascending: false })
      .limit(10);

    // Fetch user progress stats
    const { data: progressStats } = await supabase
      .from('user_learning_progress')
      .select('status')
      .eq('status', 'completed');

    setMetrics({
      dailyMetrics,
      topVideos,
      totalCompletions: progressStats?.length || 0,
    });
  }

  if (!metrics) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-gray-600 text-sm">Total Views (30d)</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {metrics.dailyMetrics.reduce((sum: number, m: any) => sum + m.total_views, 0)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-gray-600 text-sm">Avg Completion</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {(
              metrics.dailyMetrics.reduce((sum: number, m: any) => sum + (m.average_completion_rate || 0), 0) /
              metrics.dailyMetrics.length
            ).toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-gray-600 text-sm">Total Completions</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {metrics.totalCompletions}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-gray-600 text-sm">Active Users</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {metrics.dailyMetrics.reduce((sum: number, m: any) => sum + m.unique_viewers, 0)}
          </div>
        </div>
      </div>

      {/* Top Videos Table */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Top 10 Videos</h3>
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-600 border-b">
              <th className="pb-2">Title</th>
              <th className="pb-2">Views</th>
              <th className="pb-2">Completion Rate</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {metrics.topVideos.map((video: any, i: number) => (
              <tr key={i} className="border-b">
                <td className="py-3">{video.title}</td>
                <td className="py-3">{video.total_views}</td>
                <td className="py-3">{video.average_completion_rate?.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Views Over Time Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold mb-4">Views Over Time (30 Days)</h3>
        <Line
          data={{
            labels: metrics.dailyMetrics.map((m: any) => new Date(m.date).toLocaleDateString()),
            datasets: [
              {
                label: 'Daily Views',
                data: metrics.dailyMetrics.map((m: any) => m.total_views),
                borderColor: 'rgb(37, 99, 235)',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: {
              legend: { display: false },
            },
          }}
        />
      </div>
    </div>
  );
}
```

---

## Cost Analysis

### Supabase Storage Costs (Self-Hosted Videos)

**Assumptions**:
- 45 videos total
- Average 3 minutes per video
- 4 quality levels (1080p, 720p, 480p, MP4 fallback)
- Average 50MB per video (all qualities combined)

**Storage**:
- Total storage: 45 videos × 50MB = 2.25 GB
- Cost: 2.25 GB × $0.021/GB/month = **$0.047/month**

**Bandwidth** (assuming 1000 monthly views):
- Average video size: 20MB (720p default)
- Monthly bandwidth: 1000 views × 20MB = 20 GB
- Cost: 20 GB × $0.09/GB = **$1.80/month**

**Total Monthly Cost**: ~**$2/month** (scales with usage)

### Alternative: Cloudflare Stream

**Cost**: $5/1000 minutes delivered
- 45 videos × 3 min = 135 total minutes of content
- 1000 monthly views × 3 min avg watch = 3000 minutes delivered
- Cost: 3000/1000 × $5 = **$15/month**

**Verdict**: Supabase Storage is **7.5x cheaper** at current scale.

---

## Technical Specifications

### Video Encoding Specifications

**1080p WebM (VP9)**:
- Resolution: 1920×1080
- Video codec: VP9
- Video bitrate: 2 Mbps
- Audio codec: Opus
- Audio bitrate: 128 kbps
- File size: ~45 MB for 3-minute video

**720p WebM (VP9)** - Default:
- Resolution: 1280×720
- Video codec: VP9
- Video bitrate: 1 Mbps
- Audio codec: Opus
- Audio bitrate: 96 kbps
- File size: ~22 MB for 3-minute video

**480p WebM (VP9)** - Mobile:
- Resolution: 854×480
- Video codec: VP9
- Video bitrate: 500 kbps
- Audio codec: Opus
- Audio bitrate: 64 kbps
- File size: ~11 MB for 3-minute video

**MP4 Fallback (H.264)**:
- Resolution: 1280×720
- Video codec: H.264
- Video bitrate: 1 Mbps
- Audio codec: AAC
- Audio bitrate: 128 kbps
- File size: ~23 MB for 3-minute video

### Subtitles (WebVTT Format)

```vtt
WEBVTT

00:00:00.000 --> 00:00:03.000
Welcome to the CommApp platform tutorial!

00:00:03.000 --> 00:00:06.000
In this video, we'll show you how to create your account.

00:00:06.000 --> 00:00:10.000
First, click the "Connect Wallet" button in the top right corner.
```

### Browser Compatibility

| Browser | WebM (VP9) | MP4 (H.264) | WebVTT Subtitles |
|---------|------------|-------------|------------------|
| Chrome  | ✅ Yes     | ✅ Yes      | ✅ Yes           |
| Firefox | ✅ Yes     | ✅ Yes      | ✅ Yes           |
| Safari  | ❌ No      | ✅ Yes      | ✅ Yes           |
| Edge    | ✅ Yes     | ✅ Yes      | ✅ Yes           |
| Mobile  | ✅ Yes     | ✅ Yes      | ✅ Yes           |

**Note**: Safari will automatically fall back to MP4 version.

---

## Next Steps

1. **Review Architecture**: Confirm database schema and component design
2. **Set Up Infrastructure**: Create Supabase tables and storage bucket
3. **Record Pilot Videos**: Start with Track 1 (6 videos) for testing
4. **Build Core Components**: Develop `KnowledgeBaseModal` and `VideoPlayer`
5. **Launch Beta**: Roll out to bounty testers for feedback
6. **Iterate**: Refine based on usage analytics and feedback
7. **Scale Content**: Complete remaining tracks (Tracks 2-7)

---

**End of Knowledge Base Architecture Document**

---

**Document Author**: Claude Code
**Date**: January 14, 2026
**Version**: 1.0
**Status**: Ready for Implementation
