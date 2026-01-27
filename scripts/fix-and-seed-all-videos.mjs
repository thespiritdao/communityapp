// scripts/fix-and-seed-all-videos.mjs
// Fixes duplicates and seeds all 18 videos from the Instructional folder

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VIDEO_BASE_URL = 'https://files.spiritdao.org/videos/Instructional';

// All 18 videos found in the folder structure
const allVideos = [
  // Getting Started (root level)
  {
    category: 'Getting Started',
    filename: 'AppWalkthough.mp4',
    title: 'App Walkthrough',
    description: 'A complete walkthrough of the SpiritDAO application',
  },
  {
    category: 'Getting Started',
    filename: 'ClaimingTokens.mp4',
    title: 'Claiming Tokens',
    description: 'Learn how to claim your $SYSTEM and $SELF tokens',
  },

  // Identity
  {
    category: 'Identity',
    subfolder: 'identity',
    filename: 'ProfileSetup.mp4',
    title: 'Profile Setup',
    description: 'Set up your SpiritDAO profile and identity',
  },

  // Pods (5 videos)
  {
    category: 'Pods',
    subfolder: 'pods',
    filename: 'CreatingPods.mp4',
    title: 'Creating Pods',
    description: 'Learn how to create and configure your own pod',
  },
  {
    category: 'Pods',
    subfolder: 'pods',
    filename: 'ApplyToPod.mp4',
    title: 'Apply to Pod',
    description: 'How to apply and join existing pods',
  },
  {
    category: 'Pods',
    subfolder: 'pods',
    filename: 'RoleCreationandPermissions.mp4',
    title: 'Role Creation and Permissions',
    description: 'Manage roles and permissions within your pod',
  },
  {
    category: 'Pods',
    subfolder: 'pods',
    filename: 'PodModulesChatForum.mp4',
    title: 'Pod Modules: Chat & Forum',
    description: 'Enable and use chat and forum modules in your pod',
  },
  {
    category: 'Pods',
    subfolder: 'pods',
    filename: 'PodCreateTreasury.mp4',
    title: 'Pod Create Treasury',
    description: 'Set up and manage your pod treasury',
  },

  // Bounties (6 videos)
  {
    category: 'Bounties',
    subfolder: 'bounties',
    filename: 'IntroToBounties.mp4',
    title: 'Intro to Bounties',
    description: 'Introduction to the bounty system',
  },
  {
    category: 'Bounties',
    subfolder: 'bounties',
    filename: 'CreatingBounties.mp4',
    title: 'Creating Bounties',
    description: 'How to create and post a bounty',
  },
  {
    category: 'Bounties',
    subfolder: 'bounties',
    filename: 'ApplyToBounty.mp4',
    title: 'Apply to Bounty',
    description: 'Submit a bid to work on a bounty',
  },
  {
    category: 'Bounties',
    subfolder: 'bounties',
    filename: 'ReviewApproveBounty.mp4',
    title: 'Review & Approve Bounty',
    description: 'Review and approve bounty applications',
  },
  {
    category: 'Bounties',
    subfolder: 'bounties',
    filename: 'SubmittingWork.mp4',
    title: 'Submitting Work',
    description: 'Submit your completed bounty work',
  },
  {
    category: 'Bounties',
    subfolder: 'bounties',
    filename: 'ReviewWorkPayBounty.mp4',
    title: 'Review Work & Pay Bounty',
    description: 'Review submitted work and release payment',
  },

  // Events (2 videos)
  {
    category: 'Events',
    subfolder: 'events',
    filename: 'CreateEvents.mp4',
    title: 'Create Events',
    description: 'How to create and manage events',
  },
  {
    category: 'Events',
    subfolder: 'events',
    filename: 'EventsAttendanceCredentials.mp4',
    title: 'Events Attendance Credentials',
    description: 'Issue attendance NFTs and credentials',
  },

  // Governance (1 video)
  {
    category: 'Governance',
    subfolder: 'governance',
    filename: 'VotingProposals.mp4',
    title: 'Voting on Proposals',
    description: 'How to vote on governance proposals',
  },

  // Marketplace (1 video)
  {
    category: 'Marketplace',
    subfolder: 'marketplace',
    filename: 'Marketplace.mp4',
    title: 'Using the Marketplace',
    description: 'Buy and sell artifacts in the marketplace',
  },
];

async function fixAndSeed() {
  console.log('🔧 Fixing duplicates and seeding all videos...\n');

  // Step 1: Remove duplicate categories
  console.log('📁 Fixing duplicate categories...');
  const { data: allCategories } = await supabase
    .from('knowledge_categories')
    .select('*')
    .order('created_at');

  const categoryByName = {};
  allCategories?.forEach(cat => {
    if (!categoryByName[cat.name]) {
      categoryByName[cat.name] = [];
    }
    categoryByName[cat.name].push(cat);
  });

  const categoriesToDelete = [];
  const categoryIdMapping = {};

  for (const [name, cats] of Object.entries(categoryByName)) {
    if (cats.length > 1) {
      const keepCategory = cats[0];
      const deleteCategories = cats.slice(1);

      deleteCategories.forEach(cat => {
        categoriesToDelete.push(cat.id);
        categoryIdMapping[cat.id] = keepCategory.id;
      });
    }
  }

  // Update videos that reference deleted categories
  if (Object.keys(categoryIdMapping).length > 0) {
    const { data: allItems } = await supabase
      .from('knowledge_items')
      .select('*');

    for (const item of allItems || []) {
      if (categoryIdMapping[item.category_id]) {
        await supabase
          .from('knowledge_items')
          .update({ category_id: categoryIdMapping[item.category_id] })
          .eq('id', item.id);
      }
    }
  }

  // Delete duplicate categories
  for (const id of categoriesToDelete) {
    await supabase.from('knowledge_categories').delete().eq('id', id);
  }

  console.log(`   ✅ Removed ${categoriesToDelete.length} duplicate categories\n`);

  // Step 2: Remove duplicate videos
  console.log('🎥 Fixing duplicate videos...');
  const { data: allItems } = await supabase
    .from('knowledge_items')
    .select('*')
    .order('created_at');

  const videoByKey = {};
  allItems?.forEach(item => {
    const key = `${item.title}|${item.content_url}`;
    if (!videoByKey[key]) {
      videoByKey[key] = [];
    }
    videoByKey[key].push(item);
  });

  const videosToDelete = [];
  for (const [key, videos] of Object.entries(videoByKey)) {
    if (videos.length > 1) {
      videosToDelete.push(...videos.slice(1).map(v => v.id));
    }
  }

  for (const id of videosToDelete) {
    await supabase.from('knowledge_items').delete().eq('id', id);
  }

  console.log(`   ✅ Removed ${videosToDelete.length} duplicate videos\n`);

  // Step 3: Get clean category map
  const { data: cleanCategories } = await supabase
    .from('knowledge_categories')
    .select('*');

  const categoryMap = new Map();
  cleanCategories?.forEach(cat => {
    categoryMap.set(cat.name, cat.id);
  });

  // Step 4: Seed all 18 videos
  console.log('🎬 Seeding all videos...');
  let addedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < allVideos.length; i++) {
    const video = allVideos[i];
    const categoryId = categoryMap.get(video.category);

    if (!categoryId) {
      console.log(`   ⚠️  Category "${video.category}" not found for "${video.title}"`);
      continue;
    }

    const videoUrl = video.subfolder
      ? `${VIDEO_BASE_URL}/${video.subfolder}/${video.filename}`
      : `${VIDEO_BASE_URL}/${video.filename}`;

    // Check if video already exists
    const { data: existing } = await supabase
      .from('knowledge_items')
      .select('id')
      .eq('title', video.title)
      .eq('content_url', videoUrl)
      .single();

    if (existing) {
      console.log(`   ⏭️  "${video.title}" already exists`);
      skippedCount++;
      continue;
    }

    const { error } = await supabase
      .from('knowledge_items')
      .insert({
        category_id: categoryId,
        pod_id: null,
        title: video.title,
        description: video.description,
        content_type: 'video',
        content_url: videoUrl,
        thumbnail_url: null,
        duration_seconds: null,
        is_public: true,
        view_count: 0,
        sort_order: i,
        created_by: 'system',
      });

    if (error) {
      console.error(`   ❌ Error creating "${video.title}":`, error.message);
    } else {
      console.log(`   ✅ Added "${video.title}"`);
      addedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Complete!');
  console.log('='.repeat(60));
  console.log(`Videos added: ${addedCount}`);
  console.log(`Videos skipped (already exist): ${skippedCount}`);
  console.log(`Total videos should be: ${allVideos.length}`);
  console.log('\n🔍 Run diagnose script to verify:');
  console.log('   node scripts/diagnose-knowledge-issues.mjs');
}

fixAndSeed();
