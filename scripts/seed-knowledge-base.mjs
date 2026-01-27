// scripts/seed-knowledge-base.mjs
// Seeds the knowledge base with initial categories and video content from files.spiritdao.org

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for admin operations
);

const VIDEO_BASE_URL = 'https://files.spiritdao.org/videos/Instructional';

// Define categories based on folder structure
const categories = [
  {
    name: 'Getting Started',
    description: 'Essential videos for new users',
    icon: '🚀',
    sort_order: 0,
  },
  {
    name: 'Identity',
    description: 'Profile and identity management',
    icon: '👤',
    sort_order: 1,
  },
  {
    name: 'Pods',
    description: 'Creating and managing pods',
    icon: '🏘️',
    sort_order: 2,
  },
  {
    name: 'Bounties',
    description: 'Working with bounties and bids',
    icon: '💰',
    sort_order: 3,
  },
  {
    name: 'Events',
    description: 'Event creation and registration',
    icon: '📅',
    sort_order: 4,
  },
  {
    name: 'Governance',
    description: 'Proposals and voting',
    icon: '🗳️',
    sort_order: 5,
  },
  {
    name: 'Marketplace',
    description: 'Using the marketplace',
    icon: '🛒',
    sort_order: 6,
  },
];

// Define videos based on actual files
// Format: { category, filename, title, description, duration_seconds }
const videos = [
  // Getting Started (root level videos)
  {
    category: 'Getting Started',
    filename: 'AppWalkthough.mp4',
    title: 'App Walkthrough',
    description: 'A complete walkthrough of the SpiritDAO application',
    duration_seconds: 180, // Estimate - update with actual duration
  },
  {
    category: 'Getting Started',
    filename: 'ClaimingTokens.mp4',
    title: 'Claiming Tokens',
    description: 'Learn how to claim your $SYSTEM and $SELF tokens',
    duration_seconds: 120,
  },
  // Note: Add more videos here as you create them
  // You'll need to manually add videos from each subdirectory
  // Or extend this script to scan the actual directory
];

async function seedKnowledgeBase() {
  console.log('🌱 Starting knowledge base seeding...\n');

  try {
    // Step 1: Insert categories
    console.log('📁 Creating categories...');
    const categoryMap = new Map(); // Store category_id by name

    for (const cat of categories) {
      const { data, error } = await supabase
        .from('knowledge_categories')
        .insert({
          pod_id: null, // Global category
          name: cat.name,
          description: cat.description,
          icon: cat.icon,
          sort_order: cat.sort_order,
          is_public: true,
          created_by: 'system',
        })
        .select()
        .single();

      if (error) {
        // Check if category already exists
        if (error.code === '23505') {
          console.log(`   ⚠️  Category "${cat.name}" already exists, skipping...`);
          // Fetch existing category ID
          const { data: existing } = await supabase
            .from('knowledge_categories')
            .select('id')
            .eq('name', cat.name)
            .is('pod_id', null)
            .single();
          if (existing) {
            categoryMap.set(cat.name, existing.id);
          }
        } else {
          throw error;
        }
      } else {
        console.log(`   ✅ Created category: ${cat.name}`);
        categoryMap.set(cat.name, data.id);
      }
    }

    // Step 2: Insert videos
    console.log('\n🎥 Creating video items...');
    let videoCount = 0;

    for (const video of videos) {
      const categoryId = categoryMap.get(video.category);
      if (!categoryId) {
        console.log(`   ⚠️  Category "${video.category}" not found for video "${video.title}"`);
        continue;
      }

      const videoUrl = `${VIDEO_BASE_URL}/${video.filename}`;

      const { data, error } = await supabase
        .from('knowledge_items')
        .insert({
          category_id: categoryId,
          pod_id: null, // Global content
          title: video.title,
          description: video.description,
          content_type: 'video',
          content_url: videoUrl,
          thumbnail_url: null, // Could generate thumbnails later
          duration_seconds: video.duration_seconds,
          is_public: true,
          view_count: 0,
          sort_order: videoCount,
          created_by: 'system',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          console.log(`   ⚠️  Video "${video.title}" already exists, skipping...`);
        } else {
          console.error(`   ❌ Error creating video "${video.title}":`, error);
        }
      } else {
        console.log(`   ✅ Created video: ${video.title}`);
        videoCount++;
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Categories: ${categoryMap.size}`);
    console.log(`   Videos: ${videoCount}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Add more videos to the videos array in this script');
    console.log('   2. Update duration_seconds with actual video lengths');
    console.log('   3. Generate and upload thumbnail images');
    console.log('   4. Run this script again to add new content');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run the seeding
seedKnowledgeBase();
