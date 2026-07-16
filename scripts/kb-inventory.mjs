// scripts/kb-inventory.mjs — one-off: dump knowledge base inventory + TreeGens pod id
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: pods } = await supabase
  .from('pods')
  .select('id, name, status')
  .ilike('name', '%tree%');
console.log('PODS matching tree:', JSON.stringify(pods));

const { data: cats } = await supabase
  .from('knowledge_categories')
  .select('id, pod_id, name, icon, sort_order, is_public')
  .order('sort_order');
console.log('\nCATEGORIES:');
for (const c of cats ?? []) {
  console.log(
    `  [${c.pod_id ? 'pod:' + c.pod_id.slice(0, 8) : 'GLOBAL'}] ${c.icon ?? ''} ${c.name} (${c.id.slice(0, 8)})`,
  );
}

const { data: items } = await supabase
  .from('knowledge_items')
  .select('id, category_id, pod_id, title, content_type, is_public, view_count')
  .order('category_id, sort_order');
console.log(`\nITEMS (${items?.length ?? 0}):`);
const byCat = {};
for (const i of items ?? []) {
  (byCat[i.category_id] ??= []).push(i);
}
for (const [catId, list] of Object.entries(byCat)) {
  const cat = (cats ?? []).find((c) => c.id === catId);
  console.log(`  ${cat?.name ?? catId}:`);
  for (const i of list) {
    console.log(
      `    - [${i.content_type}] ${i.title} (views: ${i.view_count})${i.pod_id ? ' [pod-scoped]' : ''}`,
    );
  }
}
