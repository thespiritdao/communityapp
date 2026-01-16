/**
 * Script to delete the "Role 00000000" bad role from database
 *
 * Usage: node scripts/delete-bad-role.mjs [token_address]
 * Example: node scripts/delete-bad-role.mjs 0x000000880001000b000200000000000000000000000000000000000000000000
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { existsSync } from 'fs';

// Load environment variables - try .env.local first, then .env
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else {
  console.error('❌ No .env or .env.local file found');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Checked: .env.local and .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteBadRole(tokenAddress) {
  try {
    console.log(`🔍 Searching for role with token address: ${tokenAddress}`);

    // First, find the role
    const { data: role, error: findError } = await supabase
      .from('pod_role_permissions')
      .select('*')
      .eq('token_address', tokenAddress)
      .single();

    if (findError && findError.code === 'PGRST116') {
      console.log('❌ Role not found in pod_role_permissions table');
      return;
    }

    if (findError) {
      throw findError;
    }

    console.log(`\n📋 Found role:`, {
      id: role.id,
      role_name: role.role_name,
      token_address: role.token_address,
      pod_id: role.pod_id,
      is_active: role.is_active,
    });

    console.log(`\n⚠️  About to DELETE this role from database...`);
    console.log(`   This action CANNOT be undone!`);
    console.log(`   The role will be removed from pod_role_permissions table.`);
    console.log(`   Note: The role may still exist on-chain and will be re-synced if you run blockchain sync.`);

    // Delete the role
    const { error: deleteError } = await supabase
      .from('pod_role_permissions')
      .delete()
      .eq('token_address', tokenAddress);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`\n✅ Successfully deleted role: ${role.role_name}`);
    console.log(`   Token Address: ${tokenAddress}`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. The role should disappear from the UI immediately`);
    console.log(`   2. If you create a new role with this name, it will sync correctly from blockchain`);
    console.log(`   3. The blockchain HAT still exists - this only removes the database entry`);

  } catch (error) {
    console.error('❌ Error deleting role:', error);
    process.exit(1);
  }
}

async function listBadRoles() {
  try {
    console.log('🔍 Searching for roles with generic "Role 0..." names...\n');

    const { data: roles, error } = await supabase
      .from('pod_role_permissions')
      .select('id, role_name, token_address, pod_id, is_active')
      .ilike('role_name', 'Role 0%')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!roles || roles.length === 0) {
      console.log('✅ No bad roles found!');
      return;
    }

    console.log(`Found ${roles.length} role(s) with generic names:\n`);
    roles.forEach((role, index) => {
      console.log(`${index + 1}. ${role.role_name}`);
      console.log(`   Token Address: ${role.token_address}`);
      console.log(`   Pod ID: ${role.pod_id}`);
      console.log(`   Active: ${role.is_active}`);
      console.log(``);
    });

    console.log(`\nTo delete a specific role, run:`);
    console.log(`node scripts/delete-bad-role.mjs [token_address]`);
    console.log(`\nExample:`);
    console.log(`node scripts/delete-bad-role.mjs ${roles[0].token_address}`);

  } catch (error) {
    console.error('❌ Error listing roles:', error);
    process.exit(1);
  }
}

// Main execution
const tokenAddress = process.argv[2];

if (!tokenAddress) {
  console.log('🔍 No token address provided, listing all bad roles...\n');
  await listBadRoles();
} else {
  await deleteBadRole(tokenAddress);
}

process.exit(0);
