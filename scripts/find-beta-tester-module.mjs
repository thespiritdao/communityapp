#!/usr/bin/env node
/**
 * Find Beta Tester HAT module
 *
 * Searches the database for Beta Tester modules to help identify the correct ID.
 *
 * Usage: node scripts/find-beta-tester-module.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findBetaTesterModule() {
  console.log('🔍 Searching for Beta Tester modules...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Try multiple search patterns
  const searchPatterns = [
    { name: 'Beta Tester (exact, case-insensitive)', pattern: 'beta tester', method: 'ilike' },
    { name: 'Beta% (starts with)', pattern: 'beta%', method: 'ilike' },
    { name: '%tester% (contains)', pattern: '%tester%', method: 'ilike' },
    { name: '%beta% (contains)', pattern: '%beta%', method: 'ilike' },
  ];

  let allFoundModules = [];

  for (const search of searchPatterns) {
    console.log(`🔎 Trying: ${search.name}`);
    const { data, error } = await supabase
      .from('pod_modules')
      .select('*')
      .ilike('role_name', search.pattern);

    if (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
      continue;
    }

    if (data && data.length > 0) {
      console.log(`   ✅ Found ${data.length} module(s)\n`);
      allFoundModules = [...allFoundModules, ...data];
    } else {
      console.log(`   ⚠️  No modules found\n`);
    }
  }

  // Remove duplicates by ID
  const uniqueModules = Array.from(
    new Map(allFoundModules.map(m => [m.id, m])).values()
  );

  if (uniqueModules.length === 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('❌ No Beta Tester modules found with any pattern\n');
    console.log('💡 Let\'s try fetching ALL modules to see what exists:\n');

    const { data: allModules, error: allError } = await supabase
      .from('pod_modules')
      .select('id, role_name, pod_id, token_address, max_holders, current_holders, is_active')
      .order('created_at', { ascending: false })
      .limit(20);

    if (allError) {
      console.error('❌ Error fetching all modules:', allError);
      process.exit(1);
    }

    if (!allModules || allModules.length === 0) {
      console.log('❌ No modules found in pod_modules table at all!');
      console.log('   This might be a permissions issue or the table is empty.\n');
      process.exit(1);
    }

    console.log(`📋 Most recent ${allModules.length} modules in your database:\n`);
    allModules.forEach((mod, idx) => {
      console.log(`${idx + 1}. "${mod.role_name}"`);
      console.log(`   ID: ${mod.id}`);
      console.log(`   Pod ID: ${mod.pod_id}`);
      console.log(`   Token: ${mod.token_address || 'Not set'}`);
      console.log(`   Holders: ${mod.current_holders}/${mod.max_holders}`);
      console.log(`   Active: ${mod.is_active}`);
      console.log('');
    });

    console.log('💡 Look for your Beta Tester role in the list above.');
    console.log('   If you see it, copy its ID and use it in the update script.\n');
    process.exit(0);
  }

  // Display found modules
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Found ${uniqueModules.length} Beta Tester module(s):\n`);

  uniqueModules.forEach((mod, idx) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 Module ${idx + 1}: "${mod.role_name}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    console.log('🆔 IDs:');
    console.log(`   Module ID: ${mod.id}`);
    console.log(`   Pod ID: ${mod.pod_id}`);
    console.log(`   Token Address: ${mod.token_address || 'Not set'}`);
    console.log('');

    console.log('👥 Capacity:');
    console.log(`   Max Holders: ${mod.max_holders}`);
    console.log(`   Current Holders: ${mod.current_holders}`);
    console.log(`   Status: ${mod.is_active ? '✅ Active' : '❌ Inactive'}`);
    console.log('');

    console.log('🔐 Permissions:');
    try {
      const permissions = typeof mod.permissions === 'string'
        ? JSON.parse(mod.permissions)
        : mod.permissions;

      const enabledPerms = Object.entries(permissions)
        .filter(([_, value]) => value === true)
        .map(([key]) => key);

      console.log(`   Enabled (${enabledPerms.length}): ${enabledPerms.join(', ') || 'None'}`);
    } catch (e) {
      console.log(`   Error parsing permissions`);
    }
    console.log('');

    console.log('⏰ Time Restrictions:');
    try {
      const criteria = typeof mod.eligibility_criteria === 'string'
        ? JSON.parse(mod.eligibility_criteria)
        : mod.eligibility_criteria;

      if (Array.isArray(criteria)) {
        const timeBasedCriteria = criteria.find(c =>
          c.type === 'time_based' || c.id?.includes('time_based')
        );

        if (timeBasedCriteria) {
          console.log(`   Valid From: ${timeBasedCriteria.valid_from || 'Not set'}`);
          console.log(`   Valid Until: ${timeBasedCriteria.valid_until || 'Not set'}`);

          if (timeBasedCriteria.valid_until) {
            const expirationDate = new Date(timeBasedCriteria.valid_until);
            const now = new Date();
            const daysRemaining = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

            if (daysRemaining > 0) {
              console.log(`   Days Remaining: ${daysRemaining} days`);
            } else {
              console.log(`   Status: ❌ EXPIRED (${Math.abs(daysRemaining)} days ago)`);
            }
          }
        } else {
          console.log('   No time-based restrictions');
        }
      } else {
        console.log('   No eligibility criteria');
      }
    } catch (e) {
      console.log(`   Error parsing criteria: ${e.message}`);
    }
    console.log('');

    console.log('📅 Timestamps:');
    console.log(`   Created: ${new Date(mod.created_at).toLocaleString()}`);
    console.log(`   Updated: ${new Date(mod.updated_at).toLocaleString()}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (uniqueModules.length === 1) {
    console.log('✅ Found exactly one Beta Tester module!');
    console.log(`   Use this ID: ${uniqueModules[0].id}\n`);
    console.log('🚀 Ready to run the update script with this module.\n');
  } else {
    console.log('⚠️  Multiple Beta Tester modules found.');
    console.log('   Choose the correct one based on the details above.\n');
  }

  return uniqueModules;
}

// Run the search
findBetaTesterModule()
  .then(() => {
    console.log('✅ Search completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Search failed:', error);
    process.exit(1);
  });
