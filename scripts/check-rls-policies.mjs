#!/usr/bin/env node
/**
 * Check RLS Policies - Display current RLS policies for pod_modules and chat_groups
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRLSPolicies() {
  console.log('\n🔍 Checking RLS Policies\n');
  console.log('='.repeat(80));

  // Query to get RLS policies
  const { data: policies, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE tablename IN ('pod_modules', 'chat_groups')
      ORDER BY tablename, policyname;
    `
  });

  if (error) {
    console.error('❌ Error fetching policies:', error);
    console.log('\n💡 Trying alternative method...\n');

    // Alternative: Direct query
    const query = `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE tablename IN ('pod_modules', 'chat_groups')
      ORDER BY tablename, policyname;
    `;

    console.log('Run this SQL query in your Supabase SQL editor:\n');
    console.log(query);
    return;
  }

  if (!policies || policies.length === 0) {
    console.log('❌ No RLS policies found for pod_modules or chat_groups');
    console.log('\n💡 This might mean:');
    console.log('   1. The migrations haven\'t been applied');
    console.log('   2. RLS is not enabled on these tables');
    return;
  }

  // Group by table
  const byTable = {};
  policies.forEach(policy => {
    if (!byTable[policy.tablename]) {
      byTable[policy.tablename] = [];
    }
    byTable[policy.tablename].push(policy);
  });

  // Display policies
  Object.keys(byTable).sort().forEach(table => {
    console.log(`\n📋 Table: ${table}`);
    console.log('-'.repeat(80));

    byTable[table].forEach(policy => {
      console.log(`\n  Policy: ${policy.policyname}`);
      console.log(`  Command: ${policy.cmd}`);
      console.log(`  Roles: ${policy.roles}`);
      console.log(`  Using (qual): ${policy.qual || 'NULL'}`);
      console.log(`  With Check: ${policy.with_check || 'NULL'}`);
    });
  });

  console.log('\n' + '='.repeat(80));

  // Check for specific problematic policies
  const podModulesInsert = policies.find(p =>
    p.tablename === 'pod_modules' && p.cmd === 'INSERT'
  );

  const chatGroupsInsert = policies.find(p =>
    p.tablename === 'chat_groups' && p.cmd === 'INSERT'
  );

  console.log('\n🔍 Policy Analysis:\n');

  if (podModulesInsert) {
    console.log('✅ pod_modules INSERT policy exists');
    if (podModulesInsert.with_check?.includes('wallet_address')) {
      console.log('   ✅ Checks wallet_address (correct)');
    } else if (podModulesInsert.with_check?.includes('auth.uid()')) {
      console.log('   ❌ Checks auth.uid() directly (WRONG - this is the bug!)');
    }
  } else {
    console.log('❌ No INSERT policy found for pod_modules');
  }

  if (chatGroupsInsert) {
    console.log('\n✅ chat_groups INSERT policy exists');
    if (chatGroupsInsert.with_check?.includes('wallet_address')) {
      console.log('   ✅ Checks wallet_address (correct)');
    } else if (chatGroupsInsert.with_check?.includes('auth.uid()')) {
      console.log('   ❌ Checks auth.uid() directly (WRONG - this is the bug!)');
    }
  } else {
    console.log('\n❌ No INSERT policy found for chat_groups');
  }

  console.log('\n');
}

checkRLSPolicies().catch(console.error);
