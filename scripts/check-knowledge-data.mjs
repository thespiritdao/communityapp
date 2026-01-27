// scripts/check-knowledge-data.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkKnowledgeData() {
  console.log('🔍 Checking knowledge base data...\n');

  // Check categories
  const { data: categories, error: catError } = await supabase
    .from('knowledge_categories')
    .select('id, name, icon, is_public, pod_id')
    .order('sort_order');

  if (catError) {
    console.error('❌ Error loading categories:', catError);
  } else {
    console.log(`📁 Total categories: ${categories.length}`);
    console.log('Categories:');
    categories.forEach((cat, idx) => {
      console.log(`  ${idx + 1}. ${cat.icon} ${cat.name} (${cat.is_public ? 'public' : 'private'}, pod_id: ${cat.pod_id || 'global'})`);
    });
  }

  console.log('\n');

  // Check items
  const { data: items, error: itemError } = await supabase
    .from('knowledge_items')
    .select('id, title, category_id, is_public, pod_id, content_url')
    .order('created_at', { ascending: false });

  if (itemError) {
    console.error('❌ Error loading items:', itemError);
  } else {
    console.log(`🎥 Total videos: ${items.length}`);
    console.log('\nVideos by category:');

    const publicGlobal = items.filter(i => i.is_public && !i.pod_id);
    console.log(`\n  Public Global Videos: ${publicGlobal.length}`);

    const privateGlobal = items.filter(i => !i.is_public && !i.pod_id);
    console.log(`  Private Global Videos: ${privateGlobal.length}`);

    const podVideos = items.filter(i => i.pod_id);
    console.log(`  Pod-Specific Videos: ${podVideos.length}`);

    console.log('\n  Public Global Videos List:');
    publicGlobal.forEach((item, idx) => {
      const cat = categories?.find(c => c.id === item.category_id);
      console.log(`    ${idx + 1}. ${item.title} (${cat?.name || 'No category'})`);
      console.log(`       URL: ${item.content_url}`);
    });
  }
}

checkKnowledgeData();
