/**
 * Apply RLS policies for forum_post_reactions
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('🔐 Applying RLS policies for forum_post_reactions...\n');

  try {
    // Step 1: Enable RLS
    console.log('1️⃣ Enabling RLS on forum_post_reactions...');
    const { error: enableError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE forum_post_reactions ENABLE ROW LEVEL SECURITY;'
    });

    if (enableError && !enableError.message.includes('already exists')) {
      console.error('❌ Error enabling RLS:', enableError);
    } else {
      console.log('✅ RLS enabled\n');
    }

    // Step 2: Drop existing policies if they exist
    console.log('2️⃣ Dropping existing policies (if any)...');
    const dropPolicies = [
      'DROP POLICY IF EXISTS "Anyone can read forum reactions" ON forum_post_reactions;',
      'DROP POLICY IF EXISTS "Users can create their own reactions" ON forum_post_reactions;',
      'DROP POLICY IF EXISTS "Users can delete their own reactions" ON forum_post_reactions;'
    ];

    for (const sql of dropPolicies) {
      await supabase.rpc('exec_sql', { sql });
    }
    console.log('✅ Old policies dropped\n');

    // Step 3: Create SELECT policy
    console.log('3️⃣ Creating SELECT policy (anyone can read)...');
    const { error: selectError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Anyone can read forum reactions"
        ON forum_post_reactions
        FOR SELECT
        USING (true);
      `
    });

    if (selectError) {
      console.error('❌ Error creating SELECT policy:', selectError);
    } else {
      console.log('✅ SELECT policy created\n');
    }

    // Step 4: Create INSERT policy
    console.log('4️⃣ Creating INSERT policy (users can create own reactions)...');
    const { error: insertError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Users can create their own reactions"
        ON forum_post_reactions
        FOR INSERT
        WITH CHECK (
          lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address')::text) = lower(reactor_address)
        );
      `
    });

    if (insertError) {
      console.error('❌ Error creating INSERT policy:', insertError);
    } else {
      console.log('✅ INSERT policy created\n');
    }

    // Step 5: CREATE DELETE policy
    console.log('5️⃣ Creating DELETE policy (users can delete own reactions)...');
    const { error: deleteError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Users can delete their own reactions"
        ON forum_post_reactions
        FOR DELETE
        USING (
          lower((auth.jwt() -> 'user_metadata' ->> 'wallet_address')::text) = lower(reactor_address)
        );
      `
    });

    if (deleteError) {
      console.error('❌ Error creating DELETE policy:', deleteError);
    } else {
      console.log('✅ DELETE policy created\n');
    }

    console.log('🎉 All RLS policies applied successfully!\n');
    console.log('📋 Testing: Go to a forum thread and try clicking an emoji reaction.');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);
