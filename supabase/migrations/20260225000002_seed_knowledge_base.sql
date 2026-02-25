-- Seed global knowledge base categories and items.
-- All rows have pod_id = NULL and is_public = true so they appear to all users.
-- content_url values are relative paths served by Next.js from src/guides/Instructional/
-- UUIDs are generated via gen_random_uuid() to satisfy the uuid column type.

-- ============================================================================
-- CATEGORIES
-- Use DO $$ block so we can capture the generated IDs for item foreign keys.
-- ============================================================================

DO $$
DECLARE
  cat_getting_started uuid;
  cat_identity        uuid;
  cat_events          uuid;
  cat_bounties        uuid;
  cat_pods            uuid;
  cat_governance      uuid;
  cat_marketplace     uuid;
BEGIN

  -- Insert categories, capturing generated IDs
  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Getting Started',    'Orientation guides for new SpiritDAO members', '🚀', 1, true, 'system')
  RETURNING id INTO cat_getting_started;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Identity & Profile', 'How to set up and manage your identity',        '🪪', 2, true, 'system')
  RETURNING id INTO cat_identity;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Events',             'How to create, attend, and manage events',      '📅', 3, true, 'system')
  RETURNING id INTO cat_events;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Bounties',           'How to find, claim, and complete bounties',     '💰', 4, true, 'system')
  RETURNING id INTO cat_bounties;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Pods',               'How to create and manage working groups',       '🏘️', 5, true, 'system')
  RETURNING id INTO cat_pods;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Governance',         'How to vote and create proposals',              '🏛️', 6, true, 'system')
  RETURNING id INTO cat_governance;

  INSERT INTO knowledge_categories (pod_id, name, description, icon, sort_order, is_public, created_by)
  VALUES (NULL, 'Marketplace',        'How to buy and sell artifacts',                 '🛍️', 7, true, 'system')
  RETURNING id INTO cat_marketplace;

  -- ============================================================================
  -- ITEMS
  -- ============================================================================

  -- Getting Started
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_getting_started, NULL, 'App Walkthrough',   'A complete walkthrough of the SpiritDAO app and all its features.', 'video', '/guides/Instructional/AppWalkthough.mp4',      true, 0, 1, 'system'),
    (cat_getting_started, NULL, 'Claiming Tokens',   'How to claim your $SELF and $SYSTEM tokens.',                       'video', '/guides/Instructional/ClaimingTokens.mp4',      true, 0, 2, 'system');

  -- Identity & Profile
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_identity, NULL, 'Profile Setup',     'How to set up your community profile, name, picture, and interests.',    'video', '/guides/Instructional/identity/ProfileSetup.mp4', true, 0, 1, 'system'),
    (cat_identity, NULL, 'Identity Editor',   'How to use the identity editor to customize your profile.',              'video', '/guides/Instructional/identity/Editor.mp4',        true, 0, 2, 'system'),
    (cat_identity, NULL, 'Video Chat Guide',  'Learn how to use the video chat and conference features in SpiritDAO.',  'video', '/guides/Instructional/identity/videochat.mp4',    true, 0, 3, 'system');

  -- Events
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_events, NULL, 'Creating Events',          'How to create events with role gating and fund distribution.',          'video', '/guides/Instructional/events/CreateEvents.mp4',                 true, 0, 1, 'system'),
    (cat_events, NULL, 'Attendance Credentials',   'How proof-of-participation credentials work for events.',               'video', '/guides/Instructional/events/EventsAttendanceCredentials.mp4',  true, 0, 2, 'system'),
    (cat_events, NULL, 'Conference Rooms Guide',   'Learn how to create and join conference rooms for events.',             'video', '/guides/Instructional/events/conferences.mp4',                  true, 0, 3, 'system');

  -- Bounties
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_bounties, NULL, 'Intro to Bounties',               'An introduction to the bounties system in SpiritDAO.',        'video', '/guides/Instructional/bounties/IntroToBounties.mp4',       true, 0, 1, 'system'),
    (cat_bounties, NULL, 'Applying to a Bounty',            'How to find and apply for available bounties.',               'video', '/guides/Instructional/bounties/ApplyToBounty.mp4',         true, 0, 2, 'system'),
    (cat_bounties, NULL, 'Submitting Work',                  'How to submit completed work for a bounty.',                  'video', '/guides/Instructional/bounties/SubmittingWork.mp4',         true, 0, 3, 'system'),
    (cat_bounties, NULL, 'Creating Bounties',                'How pod leaders can create and publish bounties.',            'video', '/guides/Instructional/bounties/CreatingBounties.mp4',       true, 0, 4, 'system'),
    (cat_bounties, NULL, 'Reviewing & Approving Applications','How to review and approve bounty applicants.',              'video', '/guides/Instructional/bounties/ReviewApproveBounty.mp4',    true, 0, 5, 'system'),
    (cat_bounties, NULL, 'Reviewing Work & Paying Out',      'How to review submitted work and release payment.',          'video', '/guides/Instructional/bounties/ReviewWorkPayBounty.mp4',   true, 0, 6, 'system');

  -- Pods
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_pods, NULL, 'Applying to a Pod',           'How to find and apply to join a working group.',                    'video', '/guides/Instructional/pods/ApplyToPod.mp4',                  true, 0, 1, 'system'),
    (cat_pods, NULL, 'Creating a Pod',              'How to create a new working group with treasury and governance.',   'video', '/guides/Instructional/pods/CreatingPods.mp4',                 true, 0, 2, 'system'),
    (cat_pods, NULL, 'Pod Treasury',                'How to deploy and manage your pod treasury.',                      'video', '/guides/Instructional/pods/PodCreateTreasury.mp4',             true, 0, 3, 'system'),
    (cat_pods, NULL, 'Pod Chat & Forum Modules',    'How to use the chat and forum modules within a pod.',              'video', '/guides/Instructional/pods/PodModulesChatForum.mp4',            true, 0, 4, 'system'),
    (cat_pods, NULL, 'Role Creation & Permissions', 'How to create roles and assign permissions within a pod.',         'video', '/guides/Instructional/pods/RoleCreationandPermissions.mp4',    true, 0, 5, 'system');

  -- Governance
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_governance, NULL, 'Voting on Proposals', 'How to vote on DAO-wide governance proposals.', 'video', '/guides/Instructional/governance/VotingProposals.mp4', true, 0, 1, 'system');

  -- Marketplace
  INSERT INTO knowledge_items (category_id, pod_id, title, description, content_type, content_url, is_public, view_count, sort_order, created_by)
  VALUES
    (cat_marketplace, NULL, 'Using the Marketplace', 'How to buy and sell artifacts using $SELF and $SYSTEM tokens.', 'video', '/guides/Instructional/marketplace/Marketplace.mp4', true, 0, 1, 'system');

END $$;
