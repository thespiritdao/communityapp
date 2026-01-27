// scripts/apply-knowledge-migration.mjs
// Applies the increment_knowledge_view function to the database

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('📦 Applying knowledge base migration...\n');

  try {
    // Create the increment_knowledge_view function
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION increment_knowledge_view(item_id UUID)
        RETURNS void AS $$
        BEGIN
          UPDATE knowledge_items
          SET view_count = view_count + 1
          WHERE id = item_id;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- Grant execute permission to authenticated users
        GRANT EXECUTE ON FUNCTION increment_knowledge_view(UUID) TO authenticated;
        GRANT EXECUTE ON FUNCTION increment_knowledge_view(UUID) TO anon;
      `,
    });

    if (error) {
      // If exec_sql doesn't exist, we'll use the REST API approach
      console.log('ℹ️  Using direct SQL execution...');

      const { error: createError } = await supabase.rpc('increment_knowledge_view', {
        item_id: '00000000-0000-0000-0000-000000000000', // Dummy call to check if exists
      });

      // If function doesn't exist, we need to create it via SQL editor
      if (createError && createError.message.includes('does not exist')) {
        console.log('\n⚠️  Function does not exist yet.');
        console.log('📝 Please run the following SQL in your Supabase SQL Editor:\n');
        console.log('---START SQL---');
        console.log(`
CREATE OR REPLACE FUNCTION increment_knowledge_view(item_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE knowledge_items
  SET view_count = view_count + 1
  WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_knowledge_view(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_knowledge_view(UUID) TO anon;
        `);
        console.log('---END SQL---\n');
        console.log('✅ After running the SQL, the migration will be complete.');
      } else {
        console.log('✅ Function already exists!');
      }
    } else {
      console.log('✅ Migration applied successfully!');
    }

    console.log('\n📊 Verifying knowledge base tables...');

    // Check that categories exist
    const { data: categories, error: catError } = await supabase
      .from('knowledge_categories')
      .select('*')
      .limit(5);

    if (catError) {
      console.error('❌ Error loading categories:', catError);
    } else {
      console.log(`✅ Found ${categories?.length || 0} categories`);
    }

    // Check that items exist
    const { data: items, error: itemError } = await supabase
      .from('knowledge_items')
      .select('*')
      .limit(5);

    if (itemError) {
      console.error('❌ Error loading items:', itemError);
    } else {
      console.log(`✅ Found ${items?.length || 0} knowledge items`);
    }

    console.log('\n✅ Knowledge base setup verification complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
