-- ============================================================================
-- 006: Set thumbnail_url for all global KB videos
--
-- Images uploaded to R2: files.spiritdao.org/videos/Instructional/thumbnails/
-- Each image covers all videos in its folder (one image per category).
-- Identity has two images: indentitykb.PNG (profile/editor/videochat/invite)
--                          memberskb.PNG (members directory)
-- ============================================================================

-- Getting Started: App Walkthrough
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/walkthroughkb.PNG'
WHERE title = 'App Walkthrough' AND pod_id IS NULL;

-- Donations (3 videos — Claiming Tokens, Donating for $SYSTEM, Understanding Fee Structure)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/donatekb.png'
WHERE title IN ('Claiming Tokens', 'Donating for $SYSTEM', 'Understanding Fee Structure')
  AND pod_id IS NULL;

-- Identity & Profile (4 videos use indentitykb.PNG)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/indentitykb.PNG'
WHERE title IN ('Profile Setup', 'Identity Editor', 'Video Chat Guide', 'Using Invite Codes')
  AND pod_id IS NULL;

-- Identity & Profile: Members Directory (has its own image)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/memberskb.PNG'
WHERE title = 'Members Directory' AND pod_id IS NULL;

-- Events (3 videos)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/eventskb.PNG'
WHERE title IN ('Creating Events', 'Attendance Credentials', 'Conference Rooms Guide')
  AND pod_id IS NULL;

-- Bounties (6 videos)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/bountykb.PNG'
WHERE title IN ('Intro to Bounties', 'Applying to a Bounty', 'Submitting Work', 'Creating Bounties', 'Reviewing & Approving Applications', 'Reviewing Work & Paying Out')
  AND pod_id IS NULL;

-- Pods (5 videos)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/podskb.PNG'
WHERE title IN ('Applying to a Pod', 'Creating a Pod', 'Pod Treasury', 'Pod Chat & Forum Modules', 'Role Creation & Permissions')
  AND pod_id IS NULL;

-- Governance (1 video)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/govkb.PNG'
WHERE title = 'Voting on Proposals' AND pod_id IS NULL;

-- Marketplace (1 video)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/marketplacekb.PNG'
WHERE title = 'Using the Marketplace' AND pod_id IS NULL;

-- Forums (1 video)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/forumkb.PNG'
WHERE title = 'Using Forums' AND pod_id IS NULL;

-- Knowledge Base (2 videos)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/kbkb.PNG'
WHERE title IN ('Knowledge Base Introduction', 'Adding Content')
  AND pod_id IS NULL;

-- Pulse (1 video)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/pulsekb.png'
WHERE title = 'Understanding Pulse' AND pod_id IS NULL;

-- SensemakerAI (1 video)
UPDATE knowledge_items
SET thumbnail_url = 'https://files.spiritdao.org/videos/Instructional/thumbnails/sensemakerkb.PNG'
WHERE title = 'How to Use SensemakerAI' AND pod_id IS NULL;
