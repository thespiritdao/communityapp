// scripts/diagnose-knowledge-issues.mjs
// Diagnoses the knowledge base issues: duplicates and missing videos

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnose() {
  console.log('🔍 Diagnosing knowledge base issues...\n');

  // Issue 1: Check for duplicate categories
  console.log('📁 Checking categories...');
  const { data: allCategories, error: catError } = await supabase
    .from('knowledge_categories')
    .select('*')
    .order('sort_order');

  if (catError) {
    console.error('❌ Error loading categories:', catError);
    return;
  }

  console.log(`Total categories in DB: ${allCategories.length}\n`);

  // Group by name to find duplicates
  const categoryByName = {};
  allCategories.forEach(cat => {
    if (!categoryByName[cat.name]) {
      categoryByName[cat.name] = [];
    }
    categoryByName[cat.name].push(cat);
  });

  // Check for duplicates
  let hasDuplicates = false;
  Object.entries(categoryByName).forEach(([name, cats]) => {
    if (cats.length > 1) {
      hasDuplicates = true;
      console.log(`⚠️  DUPLICATE: "${name}" appears ${cats.length} times:`);
      cats.forEach(cat => {
        console.log(`   - ID: ${cat.id}, pod_id: ${cat.pod_id || 'null'}, public: ${cat.is_public}`);
      });
    }
  });

  if (!hasDuplicates) {
    console.log('✅ No duplicate category names found\n');
  } else {
    console.log('\n💡 FIX: Delete duplicate categories manually in Supabase\n');
  }

  // Show what the frontend sees
  console.log('📺 Categories visible to public (pod_id IS NULL AND is_public = true):');
  const publicGlobalCats = allCategories.filter(c => !c.pod_id && c.is_public);
  console.log(`Count: ${publicGlobalCats.length}`);
  publicGlobalCats.forEach(cat => {
    console.log(`   - ${cat.icon} ${cat.name}`);
  });

  // Issue 2: Check videos
  console.log('\n🎥 Checking videos...');
  const { data: allItems, error: itemError } = await supabase
    .from('knowledge_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (itemError) {
    console.error('❌ Error loading items:', itemError);
    return;
  }

  console.log(`Total videos in DB: ${allItems.length}\n`);

  // Break down by visibility
  const publicGlobal = allItems.filter(i => !i.pod_id && i.is_public);
  const privateGlobal = allItems.filter(i => !i.pod_id && !i.is_public);
  const podItems = allItems.filter(i => i.pod_id);

  console.log(`Public Global (visible to all): ${publicGlobal.length}`);
  console.log(`Private Global (is_public=false): ${privateGlobal.length}`);
  console.log(`Pod-Specific (has pod_id): ${podItems.length}\n`);

  console.log('📺 Videos visible to public frontend:');
  publicGlobal.forEach((item, idx) => {
    const cat = allCategories.find(c => c.id === item.category_id);
    console.log(`   ${idx + 1}. "${item.title}" (${cat?.name || 'No category'})`);
  });

  if (publicGlobal.length < allItems.length) {
    console.log('\n⚠️  Some videos are not visible because:');
    if (privateGlobal.length > 0) {
      console.log(`   - ${privateGlobal.length} videos have is_public = false`);
      privateGlobal.forEach(item => {
        console.log(`      • "${item.title}"`);
      });
    }
    if (podItems.length > 0) {
      console.log(`   - ${podItems.length} videos have a pod_id set`);
      podItems.forEach(item => {
        console.log(`      • "${item.title}" (pod_id: ${item.pod_id})`);
      });
    }
    console.log('\n💡 FIX: Update is_public to true and pod_id to null for global videos');
  }

  // Issue 3: Check for orphaned videos (category doesn't exist)
  console.log('\n🔗 Checking for orphaned videos...');
  let orphanCount = 0;
  allItems.forEach(item => {
    const cat = allCategories.find(c => c.id === item.category_id);
    if (!cat) {
      orphanCount++;
      console.log(`   ⚠️  "${item.title}" has invalid category_id: ${item.category_id}`);
    }
  });

  if (orphanCount === 0) {
    console.log('✅ All videos have valid categories');
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log('='.repeat(60));
  console.log(`Categories in DB: ${allCategories.length}`);
  console.log(`Videos in DB: ${allItems.length}`);
  console.log(`Videos visible on frontend: ${publicGlobal.length}`);
  console.log(`Hidden videos: ${allItems.length - publicGlobal.length}`);
}

diagnose();
