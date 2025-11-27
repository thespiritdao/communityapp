// Test script for marketplace access control
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

async function testMarketplaceAccess() {
  console.log('🧪 Testing Marketplace Access Control System\n');
  console.log('='.repeat(60));

  // 1. Test pod_permission_lookup view access
  console.log('\n1️⃣ Testing pod_permission_lookup view (public access):');
  try {
    const { data: permissions, error } = await supabase
      .from('pod_permission_lookup')
      .select('*')
      .eq('is_active', true)
      .limit(5);

    if (error) {
      console.error('❌ Error accessing pod_permission_lookup:', error);
    } else {
      console.log('✅ Successfully accessed pod_permission_lookup');
      console.log(`   Found ${permissions?.length || 0} active permissions`);

      // Show marketplace permissions
      const marketplacePerms = permissions?.filter((p) => {
        try {
          const perms =
            typeof p.permissions === 'string'
              ? JSON.parse(p.permissions)
              : p.permissions;
          return perms.marketplaceAccess === true;
        } catch {
          return false;
        }
      });

      console.log(
        `   ${marketplacePerms?.length || 0} roles have marketplace access:`,
      );
      marketplacePerms?.forEach((p) => {
        console.log(`   - ${p.role_name} in pod ${p.pod_id}`);
      });
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }

  // 2. Test token filtering (should exclude SELF/SYSTEM)
  console.log('\n2️⃣ Testing token filtering (excludes SELF/SYSTEM):');
  try {
    // Get all tokens
    const { data: allTokens, error: allError } = await supabase
      .from('tokens')
      .select('symbol, name');

    // Get filtered tokens (marketplace)
    const { data: marketTokens, error: marketError } = await supabase
      .from('tokens')
      .select('symbol, name')
      .not('symbol', 'in', '(SELF,SYSTEM)');

    if (!allError && !marketError) {
      console.log(`✅ Token filtering working:`);
      console.log(`   Total tokens: ${allTokens?.length || 0}`);
      console.log(`   Marketplace tokens: ${marketTokens?.length || 0}`);
      console.log(
        `   Filtered out: ${(allTokens?.length || 0) - (marketTokens?.length || 0)} tokens`,
      );

      // Show what was filtered
      const filtered = allTokens?.filter(
        (t) => t.symbol === 'SELF' || t.symbol === 'SYSTEM',
      );
      if (filtered?.length > 0) {
        console.log('   Excluded tokens:');
        filtered.forEach((t) => console.log(`   - ${t.symbol}: ${t.name}`));
      }
    } else {
      console.error(
        '❌ Error testing token filtering:',
        allError || marketError,
      );
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }

  // 3. Test pod_role_permissions access
  console.log('\n3️⃣ Testing pod_role_permissions table (public read):');
  try {
    const { data, error } = await supabase
      .from('pod_role_permissions')
      .select('pod_id, role_name, hat_id')
      .eq('is_active', true)
      .limit(5);

    if (error) {
      console.error('❌ Error accessing pod_role_permissions:', error);
    } else {
      console.log('✅ Successfully accessed pod_role_permissions');
      console.log(`   Found ${data?.length || 0} active role permissions`);
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }

  // 4. Show summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MARKETPLACE ACCESS CONTROL SUMMARY:\n');

  try {
    // Get stats
    const { count: podCount } = await supabase
      .from('pods')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { data: marketplaceRoles } = await supabase
      .from('pod_permission_lookup')
      .select('*')
      .eq('is_active', true);

    const rolesWithMarketplace = marketplaceRoles?.filter((r) => {
      try {
        const perms =
          typeof r.permissions === 'string'
            ? JSON.parse(r.permissions)
            : r.permissions;
        return perms.marketplaceAccess === true;
      } catch {
        return false;
      }
    });

    console.log(`✅ System Status:`);
    console.log(`   - Active Pods: ${podCount || 0}`);
    console.log(
      `   - Total Role Definitions: ${marketplaceRoles?.length || 0}`,
    );
    console.log(
      `   - Roles with Marketplace Access: ${rolesWithMarketplace?.length || 0}`,
    );

    if (rolesWithMarketplace && rolesWithMarketplace.length > 0) {
      console.log('\n📦 Marketplace Access Enabled For:');
      // Group by pod
      const byPod = {};
      rolesWithMarketplace.forEach((r) => {
        if (!byPod[r.pod_id]) byPod[r.pod_id] = [];
        byPod[r.pod_id].push(r.role_name);
      });

      Object.entries(byPod).forEach(([podId, roles]) => {
        console.log(`   Pod ${podId.slice(0, 8)}...`);
        roles.forEach((role) => console.log(`     - ${role}`));
      });
    }
  } catch (err) {
    console.error('Error generating summary:', err);
  }

  console.log('\n✅ Marketplace access control test complete!');
}

// Run the test
testMarketplaceAccess().catch(console.error);
