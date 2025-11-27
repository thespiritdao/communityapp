#!/usr/bin/env node

/**
 * Generate Pod Role Permissions Migration SQL
 * This script creates a customized migration based on your environment variables
 */

const fs = require('fs');
const path = require('path');

// Read environment variables from .env.local or process.env
require('dotenv').config({ path: path.join(__dirname, '../../../..', '.env.local') });

const HAT_IDS = {
  EXECUTIVE_POD_LEADER: process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
  EXECUTIVE_POD_MEMBER: process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER,
  DEV_POD_LEADER: process.env.NEXT_PUBLIC_DEV_POD_LEADER,
  DEV_POD_MEMBER: process.env.NEXT_PUBLIC_DEV_POD_MEMBER,
  MARKET_MANAGEMENT: process.env.NEXT_PUBLIC_MARKET_MANAGEMENT,
  BOUNTY_MANAGEMENT: process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT,
  FORUM_MANAGEMENT: process.env.NEXT_PUBLIC_FORUM_MANAGEMENT,
  CHAT_MANAGEMENT: process.env.NEXT_PUBLIC_CHAT_MANAGEMENT,
  EVENT_MANAGEMENT: process.env.NEXT_PUBLIC_EVENT_MANAGEMENT,
};

const PERMISSION_TEMPLATES = {
  EXECUTIVE_LEADER: {
    chatAccess: true,
    governanceParticipation: true,
    eventCreation: true,
    treasuryViewing: true,
    memberManagement: true,
    subPodCreation: true,
    roleAssignment: true,
    forumModeration: true,
    bountyManagement: true,
    marketplaceAccess: true
  },
  EXECUTIVE_MEMBER: {
    chatAccess: true,
    governanceParticipation: true,
    eventCreation: false,
    treasuryViewing: false,
    memberManagement: false,
    subPodCreation: false,
    roleAssignment: false,
    forumModeration: false,
    bountyManagement: false,
    marketplaceAccess: true
  },
  DEV_LEADER: {
    chatAccess: true,
    governanceParticipation: true,
    eventCreation: true,
    treasuryViewing: true,
    memberManagement: true,
    subPodCreation: true,
    roleAssignment: true,
    forumModeration: false,
    bountyManagement: true,
    marketplaceAccess: true
  },
  DEV_MEMBER: {
    chatAccess: true,
    governanceParticipation: true,
    eventCreation: false,
    treasuryViewing: false,
    memberManagement: false,
    subPodCreation: false,
    roleAssignment: false,
    forumModeration: false,
    bountyManagement: false,
    marketplaceAccess: true
  },
  LEGACY_MANAGER: {
    chatAccess: true,
    governanceParticipation: false,
    eventCreation: false,
    treasuryViewing: false,
    memberManagement: false,
    subPodCreation: false,
    roleAssignment: false,
    forumModeration: false,
    bountyManagement: false,
    marketplaceAccess: true
  }
};

function generateInsertStatement(podId, hatId, roleName, permissions, maxHolders = 50) {
  return `INSERT INTO pod_role_permissions (
    pod_id, hat_id, role_name, permissions, eligibility_criteria, 
    max_holders, current_holders, is_active, created_by, updated_by
) VALUES (
    '${podId}'::uuid,
    '${hatId}',
    '${roleName}',
    '${JSON.stringify(permissions)}'::jsonb,
    '[{"type": "agreement_signed", "agreement_hash": "accountability_statement"}]'::jsonb,
    ${maxHolders},
    0,
    true,
    'system',
    'system'
) ON CONFLICT (pod_id, hat_id) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();`;
}

function generateMigrationSQL() {
  let sql = `-- Generated Pod Role Permissions Migration
-- Generated on: ${new Date().toISOString()}
-- Based on environment variables from .env.local

-- Step 1: First check what pods exist
SELECT id, name, management_hat_id, membership_hat_id, pod_leads FROM pods ORDER BY name;

-- Step 2: Insert role permissions based on environment variables

`;

  // Executive Pod roles
  if (HAT_IDS.EXECUTIVE_POD_LEADER && HAT_IDS.EXECUTIVE_POD_MEMBER) {
    sql += `-- Executive Pod Roles\n`;
    sql += `-- TODO: Replace 'EXECUTIVE_POD_UUID_HERE' with actual pod UUID\n\n`;
    
    sql += generateInsertStatement(
      'EXECUTIVE_POD_UUID_HERE',
      HAT_IDS.EXECUTIVE_POD_LEADER,
      'Executive Pod Leader',
      PERMISSION_TEMPLATES.EXECUTIVE_LEADER,
      5
    ) + '\n\n';
    
    sql += generateInsertStatement(
      'EXECUTIVE_POD_UUID_HERE', 
      HAT_IDS.EXECUTIVE_POD_MEMBER,
      'Executive Pod Member',
      PERMISSION_TEMPLATES.EXECUTIVE_MEMBER,
      100
    ) + '\n\n';
  }

  // Dev Pod roles  
  if (HAT_IDS.DEV_POD_LEADER && HAT_IDS.DEV_POD_MEMBER) {
    sql += `-- Development Pod Roles\n`;
    sql += `-- TODO: Replace 'DEV_POD_UUID_HERE' with actual pod UUID\n\n`;
    
    sql += generateInsertStatement(
      'DEV_POD_UUID_HERE',
      HAT_IDS.DEV_POD_LEADER,
      'Development Pod Leader', 
      PERMISSION_TEMPLATES.DEV_LEADER,
      3
    ) + '\n\n';
    
    sql += generateInsertStatement(
      'DEV_POD_UUID_HERE',
      HAT_IDS.DEV_POD_MEMBER,
      'Development Pod Member',
      PERMISSION_TEMPLATES.DEV_MEMBER,
      50
    ) + '\n\n';
  }

  // Legacy management roles
  const legacyRoles = [
    { env: 'MARKET_MANAGEMENT', name: 'Market Manager' },
    { env: 'BOUNTY_MANAGEMENT', name: 'Bounty Manager' },
    { env: 'FORUM_MANAGEMENT', name: 'Forum Manager' },
    { env: 'CHAT_MANAGEMENT', name: 'Chat Manager' },
    { env: 'EVENT_MANAGEMENT', name: 'Event Manager' }
  ];

  legacyRoles.forEach(role => {
    if (HAT_IDS[role.env]) {
      sql += `-- Legacy ${role.name} Role\n`;
      sql += `-- TODO: Replace 'LEGACY_POD_UUID_HERE' with actual pod UUID\n\n`;
      
      const permissions = { ...PERMISSION_TEMPLATES.LEGACY_MANAGER };
      
      // Customize permissions based on role type
      if (role.env === 'BOUNTY_MANAGEMENT') permissions.bountyManagement = true;
      if (role.env === 'FORUM_MANAGEMENT') permissions.forumModeration = true;
      if (role.env === 'EVENT_MANAGEMENT') permissions.eventCreation = true;
      
      sql += generateInsertStatement(
        'LEGACY_POD_UUID_HERE',
        HAT_IDS[role.env],
        role.name,
        permissions,
        10
      ) + '\n\n';
    }
  });

  sql += `-- Step 3: Verify the migration
SELECT 
    p.name as pod_name,
    prp.role_name,
    prp.hat_id,
    prp.is_active,
    jsonb_pretty(prp.permissions) as permissions
FROM pods p
JOIN pod_role_permissions prp ON p.id = prp.pod_id
ORDER BY p.name, prp.role_name;

-- Step 4: Check summary
SELECT 
    COUNT(*) as total_roles,
    COUNT(CASE WHEN is_active THEN 1 END) as active_roles,
    COUNT(DISTINCT pod_id) as pods_with_roles
FROM pod_role_permissions;`;

  return sql;
}

// Generate the migration
console.log('🔧 Generating Pod Role Permissions Migration...');
console.log('📋 Found HAT IDs:', Object.entries(HAT_IDS).filter(([k,v]) => v).map(([k,v]) => `${k}: ${v}`));

const migrationSQL = generateMigrationSQL();
const outputPath = path.join(__dirname, '..', 'sql', 'generated-migration.sql');

fs.writeFileSync(outputPath, migrationSQL);
console.log(`✅ Migration generated: ${outputPath}`);
console.log('\n📝 Next steps:');
console.log('1. Review the generated SQL file');  
console.log('2. Replace UUID placeholders with actual pod IDs');
console.log('3. Run the migration in your Supabase SQL editor');
console.log('4. Test with PodManagerControlPanel');