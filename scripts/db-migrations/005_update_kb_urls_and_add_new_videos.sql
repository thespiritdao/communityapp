-- ============================================================================
-- 005: Update KB video URLs + add 9 new videos
--
-- 1. Fix the "Claiming Tokens" URL (moved from root to donations/)
-- 2. Add 4 new categories: Donations, Forums, Pulse, SensemakerAI
-- 3. Insert 9 new video items
--
-- NOTE: All content_url values point to files.spiritdao.org which is now
--       backed by Cloudflare R2 (bucket: spiritdao-files).
--       The existing 21 videos keep the same URLs — just upload the files
--       to R2 using the same folder structure.
-- ============================================================================

-- Fix ClaimingTokens path (moved from root to donations/)
UPDATE knowledge_items
SET content_url = 'https://files.spiritdao.org/videos/Instructional/donations/ClaimingTokens.mp4'
WHERE title = 'Claiming Tokens'
  AND pod_id IS NULL
  AND content_url LIKE '%ClaimingTokens.mp4';

-- ============================================================================
-- NEW CATEGORIES + ITEMS
-- ============================================================================

DO $$
DECLARE
  cat_donations     uuid;
  cat_forums        uuid;
  cat_pulse         uuid;
  cat_sensemaker    uuid;
  cat_identity      uuid;
  cat_knowledgebase uuid;
BEGIN

  -- Create new categories
  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Donations', 'How to make donations and understand fee structures', '💝', 8, true, 'system')
  RETURNING id INTO cat_donations;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Forums', 'How to use community forums for discussion', '💬', 9, true, 'system')
  RETURNING id INTO cat_forums;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Pulse', 'Understanding the SpiritDAO activity feed', '💓', 10, true, 'system')
  RETURNING id INTO cat_pulse;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'SensemakerAI', 'How to use the AI assistant', '🧠', 11, true, 'system')
  RETURNING id INTO cat_sensemaker;

  -- Look up existing categories for new items in those categories
  SELECT id INTO cat_identity
  FROM knowledge_categories
  WHERE name = 'Identity & Profile' AND pod_id IS NULL
  LIMIT 1;

  -- Create Knowledge Base category (new)
  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Knowledge Base', 'How to use and manage the knowledge base', '📖', 12, true, 'system')
  RETURNING id INTO cat_knowledgebase;

  -- ============================================================================
  -- INSERT NEW VIDEOS
  -- ============================================================================

  -- Donations (2 videos)
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_donations, NULL, 'Donating for $SYSTEM',           'Donating for $SYSTEM.',                                'video', 'https://files.spiritdao.org/videos/Instructional/donations/donations.mp4',              true, 0, 1, 'system'),
    (cat_donations, NULL, 'Understanding Fee Structure',    'Understanding SpiritDAO''s fees.',                     'video', 'https://files.spiritdao.org/videos/Instructional/donations/donations-feestructure.mp4', true, 0, 2, 'system');

  -- Forums (1 video)
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_forums, NULL, 'Using Forums',                      'Using Forums for your Community.',                     'video', 'https://files.spiritdao.org/videos/Instructional/forums/forums.mp4',                    true, 0, 1, 'system');

  -- Identity (2 new videos in existing category)
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_identity, NULL, 'Using Invite Codes',              'Using your Invite Code for New Members.',              'video', 'https://files.spiritdao.org/videos/Instructional/identity/invite-codes.mp4',            true, 0, 4, 'system'),
    (cat_identity, NULL, 'Members Directory',               'SpiritDAO Members List.',                              'video', 'https://files.spiritdao.org/videos/Instructional/identity/members.mp4',                 true, 0, 5, 'system');

  -- Knowledge Base (2 videos)
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_knowledgebase, NULL, 'Knowledge Base Introduction', 'Using our Knowledge Base.',                           'video', 'https://files.spiritdao.org/videos/Instructional/knowledgebase/knowledgebase-intro.mp4',      true, 0, 1, 'system'),
    (cat_knowledgebase, NULL, 'Adding Content',              'Adding Community Content to the Knowledge Base.',     'video', 'https://files.spiritdao.org/videos/Instructional/knowledgebase/knowledgebase-addcontent.mp4', true, 0, 2, 'system');

  -- Pulse (1 video)
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_pulse, NULL, 'Understanding Pulse',                'Understanding Pulse - SpiritDAO''s Heartbeat.',        'video', 'https://files.spiritdao.org/videos/Instructional/pulse/pulse.mp4',                      true, 0, 1, 'system');

  -- SensemakerAI (1 video)
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_sensemaker, NULL, 'How to Use SensemakerAI',       'How to use SensemakerAI.',                            'video', 'https://files.spiritdao.org/videos/Instructional/sensemakerai/sensemakerai.mp4',         true, 0, 1, 'system');

END $$;
