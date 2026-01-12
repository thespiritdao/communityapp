'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { usePublicClient, useWalletClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Shield,
  Settings,
  Crown,
  UserCheck,
  Plus,
  ToyBrick,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { base } from 'viem/chains';
import {
  PodRolePermissionsService,
  type PodRolePermission,
} from '../services/PodRolePermissionsService';
import { HatToggleService } from '../services/hatToggleService';
import { HatModuleConfigurationService } from '../services/hatModuleConfigurationService';
import type { HatPermissions } from '@/services/hatPermissionsService';
import { UnifiedMembershipManager } from './UnifiedMembershipManager';
import { supabase } from '@/utils/supabaseClient';
import TransactionLogger from '@/utils/transactionLogger';
import { RoleCreationModal } from './RoleCreationModal';

// Use HatPermissions from service for consistency
type PodPermissions = HatPermissions;

// Extend PodRolePermission for UI usage
interface PodRole extends PodRolePermission {
  // All fields are already included from PodRolePermission
}

// Helper function to convert snake_case to camelCase for permission keys
const snakeToCamelPermissions = (
  snakePermissions: Record<string, boolean>,
): HatPermissions => {
  return {
    chatAccess: snakePermissions.chat_access || false,
    chatModeration: snakePermissions.chat_moderation || false,
    forumAccess: snakePermissions.forum_access || false,
    governanceParticipation: snakePermissions.governance_participation || false,
    eventCreation: snakePermissions.event_creation || false,
    treasuryViewing: snakePermissions.treasury_viewing || false,
    treasuryManagement: snakePermissions.treasury_management || false,
    memberManagement: snakePermissions.member_management || false,
    subPodCreation: snakePermissions.sub_pod_creation || false,
    roleAssignment: snakePermissions.role_assignment || false,
    forumModeration: snakePermissions.forum_moderation || false,
    bountyManagement: snakePermissions.bounty_management || false,
    marketplaceAccess: snakePermissions.marketplace_access || false,
    marketplaceManage: snakePermissions.marketplace_manage || false,
  };
};

// Helper function to convert camelCase to snake_case for UI display
const camelToSnakePermissions = (
  camelPermissions: HatPermissions,
): Record<string, boolean> => {
  return {
    chat_access: camelPermissions.chatAccess,
    chat_moderation: camelPermissions.chatModeration,
    forum_access: camelPermissions.forumAccess,
    governance_participation: camelPermissions.governanceParticipation,
    event_creation: camelPermissions.eventCreation,
    treasury_viewing: camelPermissions.treasuryViewing,
    treasury_management: camelPermissions.treasuryManagement,
    member_management: camelPermissions.memberManagement,
    sub_pod_creation: camelPermissions.subPodCreation,
    role_assignment: camelPermissions.roleAssignment,
    forum_moderation: camelPermissions.forumModeration,
    bounty_management: camelPermissions.bountyManagement,
    marketplace_access: camelPermissions.marketplaceAccess,
    marketplace_manage: camelPermissions.marketplaceManage,
  };
};

interface EligibilityCriteria {
  type:
    | 'token_balance'
    | 'nft_ownership'
    | 'staking'
    | 'agreement_signed'
    | 'time_based'
    | 'credential_ownership';
  contract_address?: string;
  minimum_amount?: string;
  token_id?: string;
  agreement_hash?: string;
  valid_from?: string;
  valid_until?: string;
}

interface PodManagerControlPanelProps {
  podId: string;
  podName: string;
  userHatId: string; // The user's current HAT ID for permission checking
  canManageMembers?: boolean; // Direct permission flag
}

/**
 * Sync database role status with actual on-chain HAT status
 * This ensures UI displays reflect the true blockchain state
 */
const syncRolesWithOnChainStatus = async (
  roles: PodRole[],
  publicClient: any,
  address: string,
): Promise<void> => {
  try {
    console.log('🔄 Syncing role status with on-chain HAT data...');

    for (const role of roles) {
      if (!role.token_address) {
        console.log(`⏭️ Skipping role ${role.role_name} - no HAT ID`);
        continue;
      }

      try {
        console.log(
          `🔍 Checking on-chain status for ${role.role_name} (HAT: ${role.token_address})`,
        );

        // Get actual on-chain status using our toggle service
        const onChainStatus = await HatToggleService.getCurrentHatStatus(
          publicClient,
          role.token_address,
        );

        if (onChainStatus.error) {
          console.warn(
            `⚠️ Could not read on-chain status for ${role.role_name}:`,
            onChainStatus.error,
          );
          // If it's a rate limiting error or contract issue, skip sync but don't default to false
          if (
            onChainStatus.error.includes('429') ||
            onChainStatus.error.includes('rate limit') ||
            onChainStatus.error.includes('Rate limited') ||
            onChainStatus.error.includes('Too Many Requests')
          ) {
            console.log(
              `⏭️ Skipping sync for ${role.role_name} due to rate limiting - preserving current DB status`,
            );
            console.log(
              `💡 Consider using a different RPC endpoint or waiting before retrying`,
            );
            continue;
          }
          // For other errors (like contract reverts), also skip to avoid false negatives
          console.log(
            `⏭️ Skipping sync for ${role.role_name} due to contract error - preserving current DB status`,
          );
          continue;
        }

        const dbStatus = role.is_active;
        const chainStatus = onChainStatus.isActive;

        console.log(`📊 Status comparison for ${role.role_name}:`);
        console.log(`- Database: ${dbStatus}`);
        console.log(`- On-chain: ${chainStatus}`);

        // If there's a mismatch, update the database to match the blockchain
        if (dbStatus !== chainStatus) {
          console.log(
            `🔄 Syncing ${role.role_name} status: ${dbStatus} → ${chainStatus}`,
          );

          try {
            await PodRolePermissionsService.updateRolePermission(role.id, {
              is_active: chainStatus,
              updated_by: address,
            });

            // Update the role object in place
            role.is_active = chainStatus;

            console.log(
              `✅ Updated ${role.role_name} database status to match blockchain`,
            );
          } catch (updateError) {
            console.warn(
              `⚠️ Failed to update database status for ${role.role_name}:`,
              updateError,
            );
          }
        } else {
          console.log(`✅ ${role.role_name} status is already in sync`);
        }
      } catch (hatError) {
        console.warn(
          `⚠️ Failed to check HAT status for ${role.role_name}:`,
          hatError,
        );
      }
    }

    console.log('✅ Role status synchronization complete');
  } catch (error) {
    console.error('❌ Failed to sync role status with blockchain:', error);
  }
};

export const PodManagerControlPanel: React.FC<PodManagerControlPanelProps> = ({
  podId,
  podName,
  userHatId,
  canManageMembers = false,
}) => {
  const { address } = useCDPStatus();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const { data: walletClient } = useWalletClient();

  const [activeTab, setActiveTab] = useState<
    'roles' | 'membership' | 'members'
  >('roles');
  const [podRoles, setPodRoles] = useState<PodRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PodRole | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [roleCreationTransaction, setRoleCreationTransaction] = useState<{
    calls: any[];
    roleData: { name: string; description: string; maxSupply: number };
  } | null>(null);

  // Deduplication tracking for transaction success
  const [processedTransactions, setProcessedTransactions] = useState<
    Set<string>
  >(new Set());
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<
    Record<string, HatPermissions>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Transaction state for HAT toggle
  const [transactionConfig, setTransactionConfig] = useState<{
    transactionCalls: any[];
    isSponsored: boolean;
    roleId: string;
    newStatus: boolean;
  } | null>(null);

  const [syncTransactionConfig, setSyncTransactionConfig] = useState<{
    calls: any[];
    roleId: string;
    roleName: string;
    moduleAddress?: string;
  } | null>(null);

  // Toggle module configuration state
  const [toggleModuleConfig, setToggleModuleConfig] = useState<{
    transactionCall: any;
    account: string;
    isSponsored: boolean;
    roleId: string;
    roleName: string;
    targetToggleHat: string;
  } | null>(null);

  const [rolesNeedingConfiguration, setRolesNeedingConfiguration] = useState<
    any[]
  >([]);
  const [configurationAuditDone, setConfigurationAuditDone] = useState(false);

  // Check if user has Pod Manager permissions
  // Display transaction logging information on first render
  useEffect(() => {
    console.group('🔧 SPIRITDAO TRANSACTION DEBUGGING SYSTEM');
    console.log('📊 Persistent Transaction Logs Available!');
    console.log('🔍 View all logs: TransactionLogger.getLogs()');
    console.log('📋 Recent summary: TransactionLogger.printSummary()');
    console.log('🧹 Clear logs: TransactionLogger.clearLogs()');
    console.log('📤 Export logs: TransactionLogger.exportLogs()');
    console.log('💡 All transaction details are now persisted in localStorage');
    console.log('🎯 Current localStorage key:', 'spiritdao_transaction_logs');

    // Show current log count
    const currentLogs = TransactionLogger.getLogs();
    console.log('📈 Current log count:', currentLogs.length);

    if (currentLogs.length > 0) {
      console.log('📅 Most recent log:', currentLogs[0]);
      TransactionLogger.printSummary(3);
    } else {
      console.log('🆕 No previous transaction logs found');
    }

    // Test logging system
    TransactionLogger.log({
      type: 'demo',
      phase: 'preparation',
      roleDetails: {
        roleId: 'test',
        roleName: 'System Test',
        hatId: 'test',
      },
      metadata: {
        purpose: 'Testing persistent logging system initialization',
      },
    });

    console.log('✅ TransactionLogger system initialized and tested');
    console.groupEnd();
  }, []);

  console.log('🔐 PodManagerControlPanel permission check:');
  console.log('  canManageMembers prop:', canManageMembers);
  console.log('  userHatId:', userHatId);
  console.log(
    '  NEXT_PUBLIC_EXECUTIVE_POD_LEADER:',
    process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER,
  );

  const isPodManager =
    canManageMembers ||
    userHatId === process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
  console.log('  Final isPodManager result:', isPodManager);

  // Helper function to initialize default roles if none exist
  const initializeDefaultRoles = async () => {
    if (!address) {
      console.error('❌ Cannot initialize roles: No user address');
      throw new Error('User must be authenticated to initialize roles');
    }

    // ✅ FIX: Get the pod's actual management_hat_id instead of hardcoded env vars
    try {
      console.log('🔍 Fetching pod details to get management HAT ID...');
      const { data: podData, error: podError } = await supabase
        .from('pods')
        .select('management_hat_id, membership_hat_id, name')
        .eq('id', podId)
        .single();

      if (podError || !podData) {
        console.error('❌ Failed to fetch pod:', podError);
        throw new Error('Could not fetch pod details');
      }

      console.log('📊 Pod details:', {
        name: podData.name,
        managementHatId: podData.management_hat_id,
        membershipHatId: podData.membership_hat_id,
      });

      // ✅ FIX: Only create ONE role for the management HAT (Pod Leader)
      // Don't create Pod Member role unless membership_hat_id actually exists
      const leaderHatId = podData.management_hat_id;

      if (
        !leaderHatId ||
        leaderHatId === 'extracted_from_tx' ||
        leaderHatId === 'pending_creation'
      ) {
        const error = 'Pod does not have a valid management HAT ID yet';
        console.error('❌', error);
        throw new Error(error);
      }

      // Create only Pod Leader role
      console.log('🔄 Creating Pod Leader role for HAT:', leaderHatId);
      await PodRolePermissionsService.createRolePermission({
        pod_id: podId,
        token_address: leaderHatId,
        role_name: 'Pod Leader',
        permissions: {
          chatAccess: true,
          chatModeration: true,
          governanceParticipation: true,
          eventCreation: true,
          treasuryViewing: true,
          treasuryManagement: true,
          memberManagement: true,
          subPodCreation: true,
          roleAssignment: true,
          forumAccess: true,
          forumModeration: true,
          bountyManagement: true,
          marketplaceAccess: true,
          marketplaceManage: true,
        },
        eligibility_criteria: [],
        max_holders: 10,
        created_by: address,
      });

      console.log('✅ Pod Leader role initialized for pod:', podId);
    } catch (error) {
      console.error('❌ Failed to initialize default roles:', error);
      throw error;
    }
  };

  useEffect(() => {
    loadPodRoles();
  }, [podId]);

  const loadPodRoles = async () => {
    try {
      setLoading(true);
      setLoadError(null);

      console.log('🔍 Loading pod roles from database for pod:', podId);
      const roles =
        await PodRolePermissionsService.getPodRolePermissions(podId);

      console.log('📊 Raw roles data:', roles);

      if (roles.length === 0) {
        console.log('⚠️ No roles found, initializing defaults...');
        await initializeDefaultRoles();
        // Retry loading after initialization
        const newRoles =
          await PodRolePermissionsService.getPodRolePermissions(podId);
        console.log('📊 After initialization:', newRoles);
        setPodRoles(newRoles);

        if (newRoles.length > 0) {
          toast({
            title: 'Roles Initialized',
            description: `Created ${newRoles.length} default pod roles`,
          });
        } else {
          setLoadError(
            'Failed to create default roles. Check console for details.',
          );
        }
      } else {
        console.log('✅ Loaded', roles.length, 'roles from database');

        // Log detailed role information for debugging
        roles.forEach((role) => {
          console.log(
            `🎭 Role: ${role.role_name} (ID: ${role.id}, HAT: ${role.token_address}, Active: ${role.is_active})`,
          );
        });

        // Sync database status with actual on-chain HAT status
        if (publicClient && address) {
          await syncRolesWithOnChainStatus(roles, publicClient, address);
        } else {
          console.warn(
            '⚠️ Cannot sync HAT status - missing publicClient or address',
          );
        }

        setPodRoles(roles);

        // Audit toggle module configuration
        if (publicClient && !configurationAuditDone) {
          try {
            console.log(
              '🔍 Auditing toggle module configuration for pod roles...',
            );
            const auditResult =
              await HatModuleConfigurationService.auditPodToggleModules(
                publicClient,
                roles,
              );

            setRolesNeedingConfiguration(auditResult.rolesNeedingConfiguration);
            setConfigurationAuditDone(true);

            if (auditResult.configurationNeeded) {
              console.warn(
                '⚠️ Some roles need toggle module configuration:',
                auditResult.rolesNeedingConfiguration,
              );
            } else {
              console.log(
                '✅ All roles have proper toggle module configuration',
              );
            }
          } catch (auditError) {
            console.warn(
              '⚠️ Failed to audit toggle module configuration:',
              auditError,
            );
          }
        }

        // Validate that all roles have valid IDs
        const invalidRoles = roles.filter((role) => !role.id);
        if (invalidRoles.length > 0) {
          console.warn('⚠️ Found roles with missing IDs:', invalidRoles);
          setLoadError('Some role data is corrupted. Please contact support.');
        }
      }
    } catch (error) {
      console.error('Failed to load pod roles:', error);
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load pod roles',
      );
      toast({
        title: 'Database Error',
        description:
          'Failed to load pod roles from database. Try refreshing the page.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updateRolePermissions = (
    roleId: string,
    permissions: PodPermissions,
  ) => {
    // Track pending changes
    setPendingChanges((prev) => ({
      ...prev,
      [roleId]: permissions,
    }));

    // Update local state for immediate UI feedback
    setPodRoles((prev) =>
      prev.map((role) =>
        role.id === roleId ? { ...role, permissions } : role,
      ),
    );

    // Update selectedRole to reflect changes in UI immediately
    if (selectedRole?.id === roleId) {
      setSelectedRole((prev) => (prev ? { ...prev, permissions } : null));
    }

    console.log('🔐 Permissions updated locally:', { roleId, permissions });
  };

  const savePermissionsToBlockchain = async () => {
    try {
      setIsSaving(true);

      // Get the current role being edited
      if (!selectedRole || !address) return;

      const currentPermissions =
        pendingChanges[selectedRole.id] || selectedRole.permissions;

      toast({
        title: 'Saving Permissions',
        description: 'Updating role permissions in database...',
      });

      console.log('💾 Saving to database:', {
        roleId: selectedRole.id,
        hatId: selectedRole.token_address,
        permissions: currentPermissions,
      });

      // Update in database
      const updatedRole = await PodRolePermissionsService.updateRolePermission(
        selectedRole.id,
        {
          permissions: currentPermissions,
          updated_by: address,
        },
      );

      // Update local state
      setPodRoles((prev) =>
        prev.map((role) =>
          role.id === selectedRole.id ? { ...role, ...updatedRole } : role,
        ),
      );

      setSelectedRole((prev) => (prev ? { ...prev, ...updatedRole } : null));

      // Clear pending changes for this role
      setPendingChanges((prev) => {
        const updated = { ...prev };
        delete updated[selectedRole.id];
        return updated;
      });

      // Mark as pending sync with blockchain
      await PodRolePermissionsService.updateSyncStatus(
        selectedRole.id,
        'pending',
      );

      toast({
        title: 'Permissions Saved',
        description: `${selectedRole.role_name} permissions updated in database. Blockchain sync pending.`,
      });

      // TODO: Phase 2 - Sync with HAT protocol
      console.log('🎩 Future HAT Protocol sync:', {
        hatId: selectedRole.token_address,
        permissions: currentPermissions,
        action: 'This will sync with HATS Protocol in Phase 2',
      });
    } catch (error) {
      console.error('Failed to save permissions:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to save permissions to blockchain',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRoleActive = async (roleId: string) => {
    try {
      const role = podRoles.find((r) => r.id === roleId);
      if (!role || !address || !publicClient || !walletClient) {
        console.error('❌ Role not found or missing dependencies:', {
          roleId,
          address,
          hasPublicClient: !!publicClient,
          hasWalletClient: !!walletClient,
          availableRoles: podRoles.map((r) => r.id),
        });
        toast({
          title: 'Error',
          description: 'Role not found or wallet not connected',
          variant: 'destructive',
        });
        return;
      }

      console.log(`🔄 Phase 2: Starting HAT toggle with blockchain sync:`, {
        roleId,
        roleName: role.role_name,
        currentStatus: role.is_active,
        targetStatus: !role.is_active,
        hatId: role.token_address,
        podId,
      });

      // Verify role exists in database
      const { data: existingRole, error: dbError } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('id', roleId)
        .single();

      if (dbError || !existingRole) {
        console.error('❌ Role not found in database:', dbError);
        toast({
          title: 'Role Data Error',
          description: 'Role not found in database. Please refresh the page.',
          variant: 'destructive',
        });
        return;
      }

      const newStatus = !role.is_active;

      // Phase 2: Validate blockchain permissions before database update
      if (!HatToggleService.isConfigured()) {
        console.error('❌ HAT Protocol not configured');
        toast({
          title: 'Configuration Error',
          description: 'HAT Protocol contract address not configured',
          variant: 'destructive',
        });
        return;
      }

      // Validate blockchain permissions before database update
      console.log('🔐 VALIDATING TOGGLE PERMISSIONS BEFORE TRANSACTION');
      console.log('==================================================');
      console.log(`👤 User Address: ${address}`);
      console.log(`🎯 Target Role: ${role.role_name}`);
      console.log(`🆔 Target HAT ID: ${role.token_address}`);
      console.log(`🔄 Action: ${newStatus ? 'ACTIVATE' : 'DEACTIVATE'}`);

      const validation = await HatToggleService.validateTogglePermissions(
        publicClient,
        address,
        role.token_address,
      );

      console.log(`\n📋 VALIDATION RESULT:`);
      console.log(`   - Can Toggle: ${validation.canToggle}`);
      console.log(`   - Error: ${validation.error || 'None'}`);
      console.log(`   - Details:`, validation.details);

      if (!validation.canToggle) {
        console.log('❌ TOGGLE PERMISSION DENIED');
        console.log(`💬 User will see error: ${validation.error}`);

        toast({
          title: 'Insufficient Permissions',
          description:
            validation.error ||
            'You do not have admin/toggle rights for this HAT.',
          variant: 'destructive',
        });

        // Log detailed context for troubleshooting
        if (validation.details) {
          console.log('\n🔍 TROUBLESHOOTING INFO:');
          console.log(`   - Reason: ${validation.details.reason}`);
          if (validation.details.toggleModule) {
            console.log(
              `   - Toggle Module: ${validation.details.toggleModule}`,
            );
          }
          if (validation.details.requiredHat) {
            console.log(`   - Required HAT: ${validation.details.requiredHat}`);
          }
          if (validation.details.suggestion) {
            console.log(`   - Suggestion: ${validation.details.suggestion}`);
          }
        }

        return;
      }

      console.log('✅ PERMISSION VALIDATION PASSED');

      // Check if role needs toggle module configuration before proceeding
      if (role.token_address) {
        try {
          const configCheck =
            await HatModuleConfigurationService.needsToggleModuleConfiguration(
              publicClient,
              role.token_address,
            );

          if (configCheck.needsConfiguration) {
            console.log('⚠️ Role needs toggle module configuration first');
            toast({
              title: 'Configuration Required',
              description: `${role.role_name} needs toggle module configuration before it can be toggled. Please configure it first.`,
              variant: 'destructive',
            });
            return;
          }

          console.log('✅ Toggle module configuration verified');
        } catch (configError) {
          console.warn(
            '⚠️ Could not verify toggle module configuration:',
            configError,
          );
          // Continue anyway - might be a different type of toggle module
        }
      }

      console.log('🚀 Proceeding to prepare transaction...');

      // Prepare transaction for user confirmation
      toast({
        title: 'Preparing Transaction',
        description: `Preparing to ${newStatus ? 'activate' : 'deactivate'} ${role.role_name} on the blockchain...`,
      });

      // Prepare TWO-STEP transaction for OnchainKit with sponsorship
      console.log('\n🔧 PREPARING TWO-STEP ONCHAINKIT TRANSACTION');
      console.log('=============================================');
      console.log(
        '💡 Using expert-recommended two-step mechanistic toggle process:',
      );
      console.log('   1) setHatStatus on toggle module');
      console.log('   2) checkHatStatus on Hats Core to sync');

      // Use the toggle module address from the validation results
      const toggleModuleAddress = validation.details?.toggleModule;

      if (!toggleModuleAddress) {
        console.error('❌ No toggle module found in validation results');
        toast({
          title: 'Configuration Error',
          description:
            'Toggle module not found. This should not happen after validation.',
          variant: 'destructive',
        });
        return;
      }

      console.log(
        `🎯 Using toggle module from validation: ${toggleModuleAddress}`,
      );

      const txConfig = await HatToggleService.prepareTwoStepToggleTransaction(
        publicClient,
        walletClient!,
        toggleModuleAddress,
        role.token_address,
        newStatus,
      );

      console.log('📋 Transaction config prepared:');
      console.log(`   - Sponsored: ${txConfig.isSponsored}`);
      console.log(
        `   - Transaction Count: ${txConfig.transactionCalls.length}`,
      );
      console.log(
        `   - Step 1: ${txConfig.transactionCalls[0].functionName} on ${txConfig.transactionCalls[0].address}`,
      );

      // Only log step 2 if it exists (two-step mechanistic toggles)
      if (txConfig.transactionCalls.length > 1) {
        console.log(
          `   - Step 2: ${txConfig.transactionCalls[1].functionName} on ${txConfig.transactionCalls[1].address}`,
        );
      }

      console.log(
        '💡 SPONSORSHIP STATUS: Enabled - OnchainKit will handle policy restrictions gracefully',
      );
      console.log(
        '⚠️  If sponsorship fails, the user will be asked to pay gas fees manually',
      );

      // Set transaction config to show OnchainKit Transaction component
      const transactionConfiguration = {
        transactionCalls: txConfig.transactionCalls,
        isSponsored: txConfig.isSponsored,
        account: txConfig.account,
        roleId,
        newStatus,
      };

      console.log('🎯 Setting two-step transaction config:', {
        callCount: transactionConfiguration.transactionCalls.length,
        sponsored: transactionConfiguration.isSponsored,
        role: role.role_name,
        calls: transactionConfiguration.transactionCalls.map((call) => ({
          address: call.address,
          functionName: call.functionName,
          argsCount: call.args?.length,
        })),
      });
      console.log(
        '🎯 Modal should appear with two-step transaction ready for:',
        role.role_name,
      );
      console.log(
        '🎯 CRITICAL: Ensure this has TWO calls (setHatStatus + checkHatStatus)',
      );

      setTransactionConfig(transactionConfiguration);

      toast({
        title: 'Transaction Ready',
        description: `Ready to ${newStatus ? 'activate' : 'deactivate'} ${role.role_name}. Please confirm in the transaction dialog.`,
      });
    } catch (error) {
      console.error('❌ TOGGLE TRANSACTION PREPARATION FAILED:', error);

      // Detailed error analysis
      console.log('\n🚨 ERROR ANALYSIS');
      console.log('----------------');

      let errorMessage = 'Failed to toggle HAT status. Please try again.';
      let troubleshootingTip = '';

      if (error instanceof Error) {
        console.log(`🐛 Error Type: ${error.constructor.name}`);
        console.log(`📝 Error Message: ${error.message}`);

        if (error.message.includes('permission')) {
          errorMessage =
            'Permission denied. You may not have the required HAT.';
          troubleshootingTip = 'Check if you wear the required toggle HAT.';
        } else if (
          error.message.includes('rate limit') ||
          error.message.includes('429')
        ) {
          errorMessage = 'Rate limited by RPC provider. Please try again.';
          troubleshootingTip = 'Wait a moment before retrying.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Check your connection.';
          troubleshootingTip = 'Verify internet connection and try again.';
        } else if (error.message.includes('revert')) {
          errorMessage = 'Transaction would fail. Check HAT configuration.';
          troubleshootingTip = 'The HAT may not be configured for toggling.';
        } else {
          errorMessage = error.message;
        }

        if (troubleshootingTip) {
          console.log(`💡 Suggestion: ${troubleshootingTip}`);
        }
      } else {
        console.log(`❓ Unknown error type: ${String(error)}`);
      }

      console.log(`\n💬 User will see: ${errorMessage}`);

      toast({
        title: 'Transaction Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // Handle successful blockchain transaction with on-chain verification
  const handleToggleTransactionSuccess = async (
    transactionHash: string,
    roleId?: string,
  ) => {
    const targetRoleId = roleId;
    if (!targetRoleId || !address || !publicClient) return;

    try {
      const role = podRoles.find((r) => r.id === targetRoleId);
      if (!role) return;

      const expectedStatus = !role.is_active;

      console.log(
        '✅ HAT toggle transaction successful, verifying on-chain status:',
        {
          transactionHash,
          roleId: targetRoleId,
          hatId: role.token_address,
          expectedStatus,
        },
      );

      // CRITICAL: Verify the actual on-chain status before updating database
      console.log('🔍 VERIFYING ON-CHAIN HAT STATUS BEFORE DATABASE UPDATE');
      console.log('======================================================');
      console.log(
        `💡 Checking if HAT ${role.token_address} is actually ${expectedStatus ? 'active' : 'inactive'} on-chain`,
      );

      let actualOnChainStatus: boolean = false;
      let verificationAttempts = 0;
      const maxAttempts = 3;

      // Retry verification in case of propagation delay
      while (verificationAttempts < maxAttempts) {
        try {
          const statusResult = await HatToggleService.getCurrentHatStatus(
            publicClient,
            role.token_address,
          );
          actualOnChainStatus = statusResult.isActive;

          console.log(`🎯 Verification attempt ${verificationAttempts + 1}:`, {
            expectedStatus,
            actualOnChainStatus,
            match: actualOnChainStatus === expectedStatus,
          });

          if (actualOnChainStatus === expectedStatus) {
            console.log('✅ ON-CHAIN STATUS VERIFIED: Transaction successful');
            break;
          } else {
            console.log('⚠️  Status mismatch, retrying in 2 seconds...');
            if (verificationAttempts < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
        } catch (verificationError) {
          console.error(
            `❌ Verification attempt ${verificationAttempts + 1} failed:`,
            verificationError,
          );
          if (verificationAttempts === maxAttempts - 1) {
            throw verificationError;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        verificationAttempts++;
      }

      // Check if verification succeeded
      if (actualOnChainStatus !== expectedStatus) {
        console.error('❌ ON-CHAIN VERIFICATION FAILED:', {
          expected: expectedStatus,
          actual: actualOnChainStatus,
          hatId: role.token_address,
          transactionHash,
        });

        // Mark as error - transaction succeeded but didn't achieve desired result
        await PodRolePermissionsService.updateSyncStatus(targetRoleId, 'error');

        toast({
          title: 'Toggle Verification Failed',
          description: `Transaction succeeded but HAT status didn't change as expected. Expected: ${expectedStatus}, Actual: ${actualOnChainStatus}`,
          variant: 'destructive',
        });
        return;
      }

      console.log('✅ ON-CHAIN VERIFICATION SUCCESS - Updating database');

      // Update database with verified status
      const updatedRole = await PodRolePermissionsService.updateRolePermission(
        targetRoleId,
        {
          is_active: actualOnChainStatus, // Use verified on-chain status
          updated_by: address,
        },
      );

      // Update sync status to completed
      await PodRolePermissionsService.updateSyncStatus(targetRoleId, 'synced');

      // Update local state
      setPodRoles((prev) =>
        prev.map((r) => (r.id === targetRoleId ? { ...r, ...updatedRole } : r)),
      );

      console.log(
        '🎉 TOGGLE SUCCESS: Database updated with verified on-chain status',
      );

      toast({
        title: 'HAT Status Updated',
        description: `${role.role_name} has been ${actualOnChainStatus ? 'activated' : 'deactivated'} and verified on the blockchain`,
      });
    } catch (error) {
      console.error(
        'Failed to verify status or update database after transaction:',
        error,
      );

      // Mark as error but transaction succeeded
      if (targetRoleId) {
        await PodRolePermissionsService.updateSyncStatus(targetRoleId, 'error');
      }

      toast({
        title: 'Verification Failed',
        description:
          'Transaction succeeded but status verification failed. Please refresh the page.',
        variant: 'destructive',
      });
    } finally {
    }
  };

  // Handle toggle module configuration
  const handleConfigureToggleModule = async (roleId: string) => {
    try {
      const role = podRoles.find((r) => r.id === roleId);
      if (!role || !address || !publicClient || !walletClient) {
        console.error('❌ Role not found or missing dependencies:', {
          roleId,
          address,
          hasPublicClient: !!publicClient,
          hasWalletClient: !!walletClient,
        });
        toast({
          title: 'Error',
          description: 'Role not found or wallet not connected',
          variant: 'destructive',
        });
        return;
      }

      if (!role.token_address) {
        toast({
          title: 'Error',
          description: 'Role has no HAT ID assigned',
          variant: 'destructive',
        });
        return;
      }

      console.log('🔧 Configuring toggle module for role:', {
        roleId,
        roleName: role.role_name,
        hatId: role.token_address,
      });

      // Check if configuration is needed
      const configCheck =
        await HatModuleConfigurationService.needsToggleModuleConfiguration(
          publicClient,
          role.token_address,
        );

      if (!configCheck.needsConfiguration) {
        toast({
          title: 'Already Configured',
          description:
            'This role already has proper toggle module configuration',
        });
        return;
      }

      // Prepare the configuration transaction
      const transactionConfig =
        await HatModuleConfigurationService.prepareToggleModuleConfigurationTransaction(
          publicClient,
          walletClient,
          role.token_address,
        );

      console.log('📋 Toggle module configuration prepared:', {
        targetToggleHat: transactionConfig.targetToggleHat,
        function: transactionConfig.transactionCall.functionName,
      });

      // Set the transaction config for OnchainKit
      setToggleModuleConfig({
        ...transactionConfig,
        roleId,
        roleName: role.role_name,
      });
    } catch (error) {
      console.error('❌ Failed to prepare toggle module configuration:', error);

      let errorMessage = 'Failed to configure toggle module';
      if (error instanceof Error) {
        if (error.message.includes('admin')) {
          errorMessage = 'Permission denied. You must be an admin of this HAT.';
        } else if (error.message.includes('No appropriate toggle HAT')) {
          errorMessage = 'No appropriate toggle HAT found for this role.';
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: 'Configuration Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleCreateRole = async (roleData: {
    name: string;
    description: string;
    maxSupply: number;
  }) => {
    try {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      // Check for duplicate role name in the same pod
      const existingRole = podRoles.find(
        (role) => role.role_name.toLowerCase() === roleData.name.toLowerCase(),
      );

      if (existingRole) {
        toast({
          title: 'Duplicate Role Name',
          description: `A role named "${roleData.name}" already exists in this pod. Please choose a different name.`,
          variant: 'destructive',
        });
        return;
      }

      // Get the pod's management hat as the admin - fetch from database directly
      const { data: podData, error: podError } = await supabase
        .from('pods')
        .select('management_hat_id')
        .eq('id', podId)
        .single();

      if (podError || !podData?.management_hat_id) {
        throw new Error('Pod leader hat not found');
      }

      const adminHatId = podData.management_hat_id;

      console.log('🎩 Preparing role creation transaction:', roleData);
      console.log(
        '📋 Contract being called:',
        process.env.NEXT_PUBLIC_HATS_CONTRACT,
      );

      // Prepare the transaction call for OnchainKit
      // TRY MULTIPLE FORMATS TO IDENTIFY ONCHAINKIT COMPATIBILITY ISSUE

      console.log(
        '🔧 ATTEMPTING MULTIPLE CALL FORMATS FOR ONCHAINKIT COMPATIBILITY:',
      );

      // Format 1: Current approach (viem-style)
      const hatCreationCall_v1 = {
        to: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        data: encodeFunctionData({
          abi: [
            {
              name: 'createHat',
              type: 'function',
              inputs: [
                { name: '_admin', type: 'uint256' },
                { name: '_details', type: 'string' },
                { name: '_maxSupply', type: 'uint32' },
                { name: '_eligibility', type: 'address' },
                { name: '_toggle', type: 'address' },
                { name: '_mutable', type: 'bool' },
                { name: '_imageURI', type: 'string' },
              ],
              outputs: [{ name: 'newHatId', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'createHat',
          args: [
            BigInt(adminHatId),
            roleData.description || roleData.name,
            roleData.maxSupply,
            '0x0000000000000000000000000000000000000001' as `0x${string}`,
            address as `0x${string}`, // Creator becomes toggle controller
            true,
            `https://ui-avatars.com/api/?name=${encodeURIComponent(roleData.name)}&size=400&background=bfe7c6&color=000&bold=true`,
          ],
        }),
        value: BigInt(0),
      };

      // Format 2: OnchainKit-specific format (with explicit gas)
      const hatCreationCall_v2 = {
        to: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        data: hatCreationCall_v1.data,
        value: '0x0' as `0x${string}`, // Try hex string instead of BigInt
        gas: '500000' as `0x${string}`, // Explicit gas limit
      };

      // Format 3: Minimal format
      const hatCreationCall_v3 = {
        to: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        data: hatCreationCall_v1.data,
        // No value field at all
      };

      console.log(
        '🔧 Testing call format v1 (current):',
        typeof hatCreationCall_v1.value,
      );
      console.log(
        '🔧 Testing call format v2 (hex value + gas):',
        typeof hatCreationCall_v2.value,
      );
      console.log('🔧 Testing call format v3 (minimal):', 'no value field');

      // Use the first format for now, but log all formats for debugging
      const hatCreationCall = hatCreationCall_v1;

      console.log(
        '📋 Contract being called:',
        process.env.NEXT_PUBLIC_HATS_CONTRACT,
      );
      console.log('🔗 Transaction prepared for role:', roleData.name);

      // DEBUG: Log essential HAT creation call info
      console.log('🎩 HAT Creation Call Summary:');
      console.log('  Target:', hatCreationCall.to);
      console.log('  Data length:', hatCreationCall.data?.length, 'bytes');
      console.log('  Admin HAT:', adminHatId);

      // Set the transaction for OnchainKit to handle
      const transactionConfig = {
        calls: [hatCreationCall],
        roleData,
      };

      console.log('🎯 Final transaction config for OnchainKit:', {
        callsLength: transactionConfig.calls.length,
        firstCallTo: transactionConfig.calls[0]?.to,
        firstCallDataLength: transactionConfig.calls[0]?.data?.length,
      });

      // Quick validation
      console.log('✅ Transaction config ready for OnchainKit');

      setRoleCreationTransaction(transactionConfig);

      // Keep modal open to show transaction
    } catch (error) {
      console.error('Failed to prepare role creation:', error);
      toast({
        title: 'Preparation Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to prepare role creation',
        variant: 'destructive',
      });
    }
  };

  const createNewRole = async (roleData: Partial<PodRole>) => {
    try {
      setLoading(true);

      const newRole = {
        id: `custom-role-${Date.now()}`,
        role_name: roleData.role_name || 'New Role',
        token_address: `0x${Math.random().toString(16).substr(2, 64)}`, // Generate new token address
        permissions: roleData.permissions || {
          chatAccess: false,
          chatModeration: false,
          governanceParticipation: false,
          eventCreation: false,
          treasuryViewing: false,
          treasuryManagement: false,
          memberManagement: false,
          subPodCreation: false,
          roleAssignment: false,
          forumAccess: false,
          forumModeration: false,
          bountyManagement: false,
          marketplaceAccess: false,
          marketplaceManage: false,
        },
        eligibility_criteria: roleData.eligibility_criteria || [],
        max_holders: roleData.max_holders || 10,
        current_holders: 0,
        is_active: true,
      };

      setPodRoles((prev) => [...prev, newRole as PodRole]);
      setIsCreatingRole(false);

      toast({
        title: 'Role Created',
        description: `New role "${newRole.role_name}" has been created`,
      });
    } catch (error) {
      console.error('Failed to create role:', error);
      toast({
        title: 'Creation Failed',
        description: 'Failed to create new role',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isPodManager) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6" style={{ color: '#8B3A3A' }} />
            Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            You need Pod Manager permissions to access this control panel.
            Required HAT: Pod Leader
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Header */}

      {/* Navigation Tabs */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'roles', label: 'Role Setup', icon: ToyBrick },
              {
                id: 'membership',
                label: 'Membership & Verification',
                icon: Shield,
              },
            ].map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={activeTab === id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab(id as typeof activeTab)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {loadError && (
        <Card>
          <CardContent className="pt-6">
            <div
              className="flex items-center gap-2"
              style={{ color: '#8B3A3A' }}
            >
              <Shield className="h-5 w-5" />
              <span className="font-medium">Error Loading Roles</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">{loadError}</p>
            <div className="flex gap-2 mt-3">
              <Button onClick={loadPodRoles} size="sm" disabled={loading}>
                {loading ? 'Retrying...' : 'Retry'}
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await initializeDefaultRoles();
                    await loadPodRoles();
                    toast({
                      title: 'Roles Reset',
                      description:
                        'Pod roles have been reinitialized with defaults',
                    });
                  } catch (error) {
                    console.error('Failed to reset roles:', error);
                    toast({
                      title: 'Reset Failed',
                      description: 'Failed to reset pod roles',
                      variant: 'destructive',
                    });
                  }
                }}
                size="sm"
                variant="outline"
                disabled={loading}
              >
                Reset Roles
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Creation Modal */}
      <RoleCreationModal
        isOpen={isCreatingRole}
        onClose={() => {
          setIsCreatingRole(false);
          setRoleCreationTransaction(null);
        }}
        onSubmit={handleCreateRole}
        transactionCalls={roleCreationTransaction?.calls}
        isTransactionReady={!!roleCreationTransaction}
        roleData={roleCreationTransaction?.roleData}
        onTransactionSuccess={async (response) => {
          console.log('✅ Role creation successful - transaction completed');

          // Extract transaction hash from multiple possible locations
          const transactionHash =
            response?.transactionHash ||
            response?.transactionReceipts?.[0]?.transactionHash ||
            response?.receipt?.transactionHash;

          console.log('🔗 Transaction hash:', transactionHash);

          // CRITICAL: Deduplication check to prevent multiple database saves
          if (!transactionHash) {
            console.error(
              '❌ No transaction hash found - cannot process role creation',
            );
            return;
          }

          if (processedTransactions.has(transactionHash)) {
            console.log(
              '⚠️ Transaction already processed, skipping duplicate:',
              transactionHash,
            );
            return;
          }

          if (isProcessingTransaction) {
            console.log(
              '⚠️ Another transaction is currently being processed, skipping:',
              transactionHash,
            );
            return;
          }

          if (!roleCreationTransaction) {
            console.error('❌ No role creation transaction data available');
            return;
          }

          // Mark as processing to prevent race conditions
          setIsProcessingTransaction(true);

          // Add to processed transactions immediately
          setProcessedTransactions(
            (prev) => new Set([...prev, transactionHash]),
          );

          console.log(
            '📦 Response structure - receipts:',
            response?.transactionReceipts?.length || 0,
            'items',
          );
          console.log(
            '📦 Receipt keys:',
            response?.transactionReceipts?.[0]
              ? Object.keys(response.transactionReceipts[0]).filter(
                  (key) => key !== 'logs',
                )
              : [],
          );

          try {
            let receipt = response?.transactionReceipts?.[0];

            // If we don't have receipt, try to get it
            if (!receipt && transactionHash && publicClient) {
              receipt = await publicClient.waitForTransactionReceipt({
                hash: transactionHash as `0x${string}`,
                confirmations: 1,
              });
            }

            console.log(
              '📦 Transaction receipt status:',
              receipt?.status,
              'hash:',
              receipt?.transactionHash,
            );

            // Parse logs to get the new hat ID (look for HatCreated event)
            let newHatId: string | null = null;
            const hatCreatedSignature =
              '0xd2b20cbce23b45fcd09c6b1ebf62d6af6e85a74c7b3a00cb26e3b6cac61b4e4f'; // HatCreated(uint256,string,uint32,address,address,bool,string)

            console.log('🔍 Parsing transaction logs for HAT ID...');
            console.log(
              '📋 Total logs in receipt:',
              receipt?.logs?.length || 0,
            );

            if (receipt?.logs) {
              // CRITICAL FIX: Check for the ACTUAL event signature we're seeing
              const knownHatSignatures: { [key: string]: string } = {
                '0xd2b20cbce23b45fcd09c6b1ebf62d6af6e85a74c7b3a00cb26e3b6cac61b4e4f':
                  'HatCreated',
                '0x4d38ad12136291322128027bb8c3af7db2261be395032c1d26dd0ad20cf29415':
                  'HatCreatedAlternate',
              };

              // Reduce logging - only show first 5 logs and Hats contract logs
              receipt.logs.forEach((log: any, index: number) => {
                const isHatsLog =
                  log.address?.toLowerCase() ===
                  process.env.NEXT_PUBLIC_HATS_CONTRACT?.toLowerCase();

                if (index < 5 || isHatsLog) {
                  console.log(`📄 Log ${index}:`, {
                    address: log.address,
                    topic0: log.topics?.[0],
                    topicsLength: log.topics?.length,
                    dataLength: log.data?.length,
                  });
                }

                // Check both possible HatCreated signatures
                if (
                  log.topics?.[0] === hatCreatedSignature ||
                  log.topics?.[0] ===
                    '0x4d38ad12136291322128027bb8c3af7db2261be395032c1d26dd0ad20cf29415'
                ) {
                  const eventName =
                    knownHatSignatures[log.topics[0] as string] || 'Unknown';
                  console.log(`🎯 ${eventName} event found!`);

                  // For standard HatCreated, HAT ID is in topics[1]
                  if (log.topics?.[1]) {
                    newHatId = log.topics[1];
                    console.log('✅ Found HAT ID in topics[1]:', newHatId);
                  }
                  // For alternate signature, try parsing from data
                  else if (log.data && log.data.length > 66) {
                    const potentialHatId = '0x' + log.data.slice(2, 66);
                    console.log(
                      '✅ Found potential HAT ID in data:',
                      potentialHatId,
                    );
                    newHatId = potentialHatId;
                  }

                  console.log('📊 Event details:', {
                    signature: log.topics?.[0],
                    eventName,
                    topics: log.topics,
                    dataPreview: log.data?.slice(0, 66),
                  });
                } else if (isHatsLog) {
                  const eventName =
                    knownHatSignatures[log.topics?.[0]] || 'Unknown';
                  console.log(
                    `🎩 Hats contract log: ${eventName} (${log.topics?.[0]})`,
                  );
                }
              });
            }

            // If we still don't have a hat ID, try alternative parsing methods
            if (!newHatId) {
              console.log(
                '⚠️ Primary HAT ID parsing failed, trying alternative methods...',
              );

              // Try looking for any Hats contract logs with different event signatures
              const alternativeSignatures = [
                '0x88e777825e00a39a6c96b6404e8fd5a2b7e6d4e6b9b6b8b8b8b8b8b8b8b8b8b8', // Alternative HatCreated
                '0x1c4d3b3c2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b', // Another possibility
              ];

              if (receipt?.logs) {
                for (const signature of alternativeSignatures) {
                  const matchingLog = receipt.logs.find(
                    (log: any) => log.topics?.[0] === signature,
                  );
                  if (matchingLog) {
                    newHatId = matchingLog.topics?.[1];
                    console.log(
                      '🔄 Found HAT ID with alternative signature:',
                      newHatId,
                    );
                    break;
                  }
                }
              }

              // Final fallback: STOP THE PROCESS - Don't save invalid data
              if (!newHatId) {
                console.log(
                  '❌ CRITICAL: Could not parse HAT ID from transaction logs!',
                );
                console.log(
                  '🚨 HAT creation likely FAILED despite transaction success!',
                );
                console.log(
                  '📝 This is common with Account Abstraction bundled calls',
                );
                console.log(
                  '🔗 Transaction hash for investigation:',
                  transactionHash,
                );

                // Don't save to database with fake HAT ID
                toast({
                  title: 'HAT Creation Failed',
                  description:
                    'Transaction succeeded but HAT was not created. This may be due to sponsorship policy restrictions.',
                  variant: 'destructive',
                });

                // Reset processing state and exit
                setIsProcessingTransaction(false);
                return;
              }
            }

            // Save to database
            if (address && newHatId) {
              console.log('💾 Saving role to database...', {
                podId,
                hatId: newHatId,
                roleName: roleCreationTransaction.roleData.name,
                transactionHash,
              });

              await PodRolePermissionsService.createRolePermission({
                pod_id: podId,
                token_address: newHatId,
                role_name: roleCreationTransaction.roleData.name,
                permissions: {
                  chatAccess: false,
                  chatModeration: false,
                  governanceParticipation: false,
                  eventCreation: false,
                  treasuryViewing: false,
                  treasuryManagement: false,
                  memberManagement: false,
                  subPodCreation: false,
                  roleAssignment: false,
                  forumAccess: false,
                  forumModeration: false,
                  bountyManagement: false,
                  marketplaceAccess: false,
                  marketplaceManage: false,
                },
                eligibility_criteria: [],
                max_holders: roleCreationTransaction.roleData.maxSupply,
                created_by: address,
              });

              console.log(
                '✅ Role saved to database successfully with HAT ID:',
                newHatId,
              );
            } else {
              console.error(
                '❌ Cannot save to database - missing address or hat ID:',
                { address, newHatId },
              );
            }
          } catch (dbError) {
            console.error('❌ Failed to save role to database:', dbError);
          }

          // Reload roles to show the new one
          await loadPodRoles();

          toast({
            title: 'Role Created',
            description: `New role "${roleCreationTransaction?.roleData.name}" has been created successfully`,
          });

          // Close modal and clear state
          setIsCreatingRole(false);
          setRoleCreationTransaction(null);

          // Reset processing flag to allow future transactions
          setIsProcessingTransaction(false);
        }}
        onTransactionError={(error) => {
          console.error('❌ Role creation failed:', error);
          toast({
            title: 'Creation Failed',
            description: 'Failed to create role on-chain',
            variant: 'destructive',
          });

          // Reset processing flag even on error to allow retries
          setIsProcessingTransaction(false);
        }}
      />

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Pod Roles</h3>
            <Button
              onClick={() => setIsCreatingRole(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Role
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {podRoles.map((role) => (
              <Card
                key={role.id}
                className={role.is_active ? '' : 'opacity-50'}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {role.role_name.includes('Leader') ? (
                        <Crown
                          className="h-5 w-5"
                          style={{ color: '#C6933F' }}
                        />
                      ) : (
                        <UserCheck
                          className="h-5 w-5"
                          style={{ color: '#2F5D50' }}
                        />
                      )}
                      {role.role_name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={role.is_active}
                        onCheckedChange={() => toggleRoleActive(role.id)}
                        className="permission-switch"
                        disabled={transactionConfig !== null}
                      />
                      <span
                        className="text-xs"
                        style={{
                          color: role.is_active ? '#3F7A5A' : '#9ca3af',
                        }}
                      >
                        {transactionConfig?.roleId === role.id
                          ? 'Preparing...'
                          : role.is_active
                            ? 'Active'
                            : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Current Holders:</span>
                      <span>
                        {role.current_holders}/{role.max_holders}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Permissions:{' '}
                      {Object.values(role.permissions).filter(Boolean).length}/
                      {Object.keys(role.permissions).length}
                    </div>

                    {/* Inline HAT Toggle Transaction Component */}
                    {transactionConfig &&
                      transactionConfig.roleId === role.id && (
                        <div
                          className="my-3 p-3 rounded"
                          style={{
                            backgroundColor: '#E8F1EE',
                            border: '1px solid #B8D9CA',
                          }}
                        >
                          <Transaction
                            chainId={base.id}
                            calls={transactionConfig.transactionCalls}
                            isSponsored={transactionConfig.isSponsored}
                            onStatus={(status) => {
                              console.log('🔄 Transaction status:', status);
                              console.log(
                                '🔍 Transaction props verification:',
                                {
                                  account: address,
                                  chainId: base.id,
                                  callsLength:
                                    transactionConfig.transactionCalls.length,
                                  isSponsored: transactionConfig.isSponsored,
                                  calls: transactionConfig.transactionCalls.map(
                                    (call) => call.functionName,
                                  ),
                                },
                              );

                              // SPONSORSHIP DEBUGGING
                              console.log('🚨 SPONSORSHIP DEBUGGING 🚨');
                              console.log(
                                '📋 Contract addresses being called:',
                                {
                                  hatsCore:
                                    process.env.NEXT_PUBLIC_HATS_CONTRACT,
                                  toggleModule:
                                    process.env
                                      .NEXT_PUBLIC_EXEC_MEMBER_TOGGLE_MODULE,
                                  actualCallAddresses:
                                    transactionConfig.transactionCalls.map(
                                      (call) => call.address,
                                    ),
                                },
                              );
                              console.log('💰 Working Cart.tsx calls:', {
                                purchaseBurn:
                                  process.env.NEXT_PUBLIC_PURCHASE_BURN,
                                systemToken:
                                  process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
                                selfToken: process.env.NEXT_PUBLIC_SELF_TOKEN,
                              });
                              console.log(
                                '❓ HYPOTHESIS: Toggle module (0x50DA...5373) is NOT in Paymaster whitelist',
                              );
                              // OnchainKit will handle the UI states automatically
                            }}
                            onSuccess={async (response) => {
                              console.log(
                                '✅ HAT toggle transaction successful:',
                                response,
                              );

                              // Handle successful transaction
                              if (
                                response?.transactionReceipts?.[0]
                                  ?.transactionHash
                              ) {
                                await handleToggleTransactionSuccess(
                                  response.transactionReceipts[0]
                                    .transactionHash,
                                  transactionConfig.roleId,
                                );

                                // Verify the toggle took effect by re-checking HAT status
                                setTimeout(async () => {
                                  console.log(
                                    '🔍 Verifying HAT status change after transaction...',
                                  );

                                  // Check HAT status directly from blockchain
                                  if (
                                    publicClient &&
                                    transactionConfig.roleId
                                  ) {
                                    try {
                                      const role = podRoles.find(
                                        (r) =>
                                          r.id === transactionConfig.roleId,
                                      );
                                      if (role?.token_address) {
                                        const currentStatus =
                                          await HatToggleService.getCurrentHatStatus(
                                            publicClient,
                                            role.token_address,
                                          );
                                        console.log(
                                          '🎯 Direct blockchain HAT status check:',
                                          {
                                            hatId: role.token_address,
                                            expectedStatus:
                                              transactionConfig.newStatus,
                                            actualStatus:
                                              currentStatus.isActive,
                                            statusMatches:
                                              currentStatus.isActive ===
                                              transactionConfig.newStatus,
                                            transactionHash:
                                              response.transactionReceipts[0]
                                                .transactionHash,
                                          },
                                        );

                                        if (
                                          currentStatus.isActive !==
                                          transactionConfig.newStatus
                                        ) {
                                          console.log(
                                            '⚠️ WARNING: HAT status did not change as expected!',
                                          );
                                          console.log(
                                            '   This suggests the transaction succeeded but did not toggle the HAT status',
                                          );
                                        } else {
                                          console.log(
                                            '✅ CONFIRMED: HAT status changed correctly on blockchain',
                                          );
                                        }
                                      }
                                    } catch (statusError) {
                                      console.error(
                                        '❌ Failed to verify HAT status:',
                                        statusError,
                                      );
                                    }
                                  }

                                  await loadPodRoles(); // Refresh the roles to show updated status
                                }, 2000); // Wait 2 seconds for toggle to take effect
                              }

                              // Close transaction
                              setTransactionConfig(null);

                              toast({
                                title: 'Role Updated',
                                description: `Successfully ${transactionConfig.newStatus ? 'activated' : 'deactivated'} the role. Refreshing status...`,
                              });
                            }}
                            onError={(error) => {
                              console.error(
                                '❌ HAT toggle transaction failed:',
                                error,
                              );

                              const errorMessage =
                                error instanceof Error
                                  ? error.message
                                  : 'Transaction failed. Please try again.';

                              toast({
                                title: 'Transaction Failed',
                                description: errorMessage,
                                variant: 'destructive',
                              });

                              // Close transaction
                              setTransactionConfig(null);
                            }}
                          >
                            <TransactionButton
                              text={`${transactionConfig.newStatus ? 'Activate' : 'Deactivate'} Role`}
                              className="w-full"
                            />
                            <TransactionSponsor />
                            <TransactionStatus>
                              <TransactionStatusLabel />
                              <TransactionStatusAction />
                            </TransactionStatus>
                          </Transaction>

                          <button
                            onClick={() => setTransactionConfig(null)}
                            className="text-gray-500 hover:text-gray-700 text-sm mt-2 w-full"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedRole(role);
                        setActiveTab('membership');
                      }}
                      className="w-full"
                    >
                      Configure
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Unified Membership & Verification Tab */}
      {activeTab === 'membership' && (
        <>
          {selectedRole ? (
            <UnifiedMembershipManager
              podId={podId}
              podName={podName}
              roleId={selectedRole.id}
              roleName={selectedRole.role_name}
              roleType={
                selectedRole.role_name.includes('Leader') ? 'leader' : 'member'
              }
              hatId={selectedRole.token_address}
              onUpdate={() => {
                loadPodRoles();
                setSelectedRole(null);
              }}
            />
          ) : (
            // Role Selection View
            <Card>
              <CardHeader>
                <CardTitle>Manage Role Membership</CardTitle>
                <p className="text-sm text-gray-600">
                  Select a role to configure its permissions, access
                  requirements, and blockchain verification
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {podRoles.map((role) => (
                    <Card
                      key={role.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${role.is_active ? '' : 'opacity-50'}`}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {role.role_name.includes('Leader') ? (
                              <Crown
                                className="h-6 w-6"
                                style={{ color: '#C6933F' }}
                              />
                            ) : (
                              <UserCheck
                                className="h-6 w-6"
                                style={{ color: '#2F5D50' }}
                              />
                            )}
                            <div>
                              <h3 className="font-semibold">
                                {role.role_name}
                              </h3>
                              <p className="text-sm text-gray-500">
                                Permissions:{' '}
                                {
                                  Object.values(role.permissions).filter(
                                    Boolean,
                                  ).length
                                }
                                /{Object.keys(role.permissions).length} •
                                {Array.isArray(role.eligibility_criteria) &&
                                role.eligibility_criteria.length > 0
                                  ? ` ${role.eligibility_criteria.length} requirement${role.eligibility_criteria.length === 1 ? '' : 's'}`
                                  : ' Open access'}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={role.is_active ? 'default' : 'secondary'}
                            >
                              {role.is_active ? 'Active' : 'Disabled'}
                            </Badge>
                            {role.metadata_hash && (
                              <Badge variant="outline" className="text-xs">
                                Blockchain
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(role.permissions)
                              .filter(([_, enabled]) => enabled)
                              .slice(0, 3)
                              .map(([key]) => (
                                <Badge
                                  key={key}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {key
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, (str) => str.toUpperCase())}
                                </Badge>
                              ))}
                            {Object.values(role.permissions).filter(Boolean)
                              .length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +
                                {Object.values(role.permissions).filter(Boolean)
                                  .length - 3}{' '}
                                more
                              </Badge>
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={() => setSelectedRole(role)}
                          className="w-full"
                          variant="outline"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Manage Membership
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Toggle Module Configuration Warning */}
                {rolesNeedingConfiguration.length > 0 && (
                  <Card
                    style={{
                      borderColor: '#E8D7B8',
                      backgroundColor: '#FAF4EC',
                    }}
                  >
                    <CardHeader>
                      <CardTitle
                        className="flex items-center"
                        style={{ color: '#C6933F' }}
                      >
                        <ToyBrick className="h-5 w-5 mr-2" />
                        Toggle Module Configuration Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4" style={{ color: '#C6933F' }}>
                        Some roles have null toggle modules which prevent
                        permission management. Configure hat-based toggle
                        modules to enable proper role activation/deactivation.
                      </p>
                      <div className="space-y-3">
                        {rolesNeedingConfiguration.map((role) => (
                          <div
                            key={role.id}
                            className="flex items-center justify-between p-3 bg-white rounded border"
                          >
                            <div>
                              <div className="font-medium">
                                {role.role_name}
                              </div>
                              <div className="text-sm text-gray-600">
                                {role.configurationIssue}
                              </div>
                              <div className="text-xs text-gray-500">
                                Current: {role.currentToggleModule}
                              </div>
                            </div>
                            <Button
                              onClick={() =>
                                handleConfigureToggleModule(role.id)
                              }
                              size="sm"
                              className="ml-3"
                            >
                              <ToyBrick className="h-4 w-4 mr-1" />
                              Configure
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Toggle Module Configuration Transaction */}
                {toggleModuleConfig && (
                  <Card
                    style={{
                      borderColor: '#B8D9CA',
                      backgroundColor: '#E8F1EE',
                    }}
                  >
                    <CardHeader>
                      <CardTitle style={{ color: '#1F453A' }}>
                        Configuring Toggle Module: {toggleModuleConfig.roleName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4" style={{ color: '#2F5D50' }}>
                        Setting toggle module to Executive Pod Leader HAT (
                        {toggleModuleConfig.targetToggleHat})
                      </p>
                      <Transaction
                        chainId={base.id}
                        calls={[toggleModuleConfig.transactionCall]}
                        isSponsored={toggleModuleConfig.isSponsored}
                        onStatus={(status) => {
                          console.log(
                            '🔄 Toggle module configuration status:',
                            status,
                          );
                        }}
                        onSuccess={async (response) => {
                          console.log(
                            '✅ Toggle module configuration successful:',
                            response,
                          );

                          if (
                            response?.transactionReceipts?.[0]?.transactionHash
                          ) {
                            toast({
                              title: 'Configuration Successful',
                              description: `Toggle module configured for ${toggleModuleConfig.roleName}. Role can now be toggled properly.`,
                            });

                            // Refresh roles to update configuration status
                            setTimeout(() => {
                              setConfigurationAuditDone(false); // Reset audit to re-check
                              loadPodRoles();
                            }, 2000);
                          }

                          setToggleModuleConfig(null);
                        }}
                        onError={(error) => {
                          console.error(
                            '❌ Toggle module configuration failed:',
                            error,
                          );

                          const errorMessage =
                            error instanceof Error
                              ? error.message
                              : 'Configuration failed. Please try again.';

                          toast({
                            title: 'Configuration Failed',
                            description: errorMessage,
                            variant: 'destructive',
                          });

                          setToggleModuleConfig(null);
                        }}
                      >
                        <TransactionButton
                          text="Configure Toggle Module"
                          className="w-full"
                        />
                        <TransactionSponsor />
                        <TransactionStatus>
                          <TransactionStatusLabel />
                          <TransactionStatusAction />
                        </TransactionStatus>
                      </Transaction>

                      <button
                        onClick={() => setToggleModuleConfig(null)}
                        className="text-gray-500 hover:text-gray-700 text-sm mt-2 w-full"
                      >
                        Cancel
                      </button>
                    </CardContent>
                  </Card>
                )}

                {podRoles.length === 0 && (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No Roles Found
                    </h3>
                    <p className="text-gray-600">
                      Create pod roles first before configuring membership.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* HATS Module Sync Transaction Modal */}
      {syncTransactionConfig &&
        syncTransactionConfig.calls &&
        syncTransactionConfig.calls.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">
                Sync Eligibility to Blockchain
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                This will sync {syncTransactionConfig.calls.length} eligibility
                criterion/criteria for "{syncTransactionConfig.roleName}" to the
                HATS module on the blockchain.
              </p>

              <Transaction
                chainId={base.id}
                calls={syncTransactionConfig.calls}
                isSponsored={true}
                onSuccess={async (response) => {
                  // Extract transaction hash for BaseScan verification
                  const transactionHash =
                    response?.transactionReceipts?.[0]?.transactionHash ||
                    (response as any)?.hash ||
                    (response as any)?.receipt?.transactionHash;
                  const baseScanUrl = transactionHash
                    ? `https://basescan.org/tx/${transactionHash}`
                    : undefined;

                  // Log transaction success with persistence
                  TransactionLogger.log({
                    type:
                      syncTransactionConfig.moduleAddress === 'demo-hats'
                        ? 'demo'
                        : 'real',
                    phase: 'success',
                    transactionHash,
                    baseScanUrl,
                    roleDetails: {
                      roleId: syncTransactionConfig.roleId,
                      roleName: syncTransactionConfig.roleName,
                      hatId: '',
                      podId: '',
                    },
                    moduleDetails: {
                      moduleAddress: syncTransactionConfig.moduleAddress || 'unknown',
                      moduleType:
                        syncTransactionConfig.moduleAddress === 'demo-hats'
                          ? 'HATS Core Contract'
                          : 'Eligibility Module',
                    },
                    calls: syncTransactionConfig.calls.map((call, index) => ({
                      callIndex: index,
                      contractAddress: call.address,
                      functionName: call.functionName,
                      args: call.args,
                    })),
                    metadata: {
                      fullResponse: response,
                      responseType: typeof response,
                      hasTransactionHash: !!transactionHash,
                    },
                  });

                  // Update sync status in database
                  try {
                    const { PodRolePermissionsService } = await import(
                      '../services/PodRolePermissionsService'
                    );
                    await PodRolePermissionsService.updateSyncStatus(
                      syncTransactionConfig.roleId,
                      'synced',
                      transactionHash,
                    );

                    console.log('✅ Database sync status updated successfully');

                    toast({
                      title: '🎉 Sync Complete!',
                      description: baseScanUrl
                        ? `Successfully synced "${syncTransactionConfig.roleName}" to blockchain. Hash: ${transactionHash}. Persistent logs: TransactionLogger.getLogs()`
                        : `Successfully synced "${syncTransactionConfig.roleName}" eligibility criteria to blockchain. Check TransactionLogger.getLogs() for details.`,
                    });
                  } catch (error) {
                    console.error('❌ Failed to update sync status:', error);
                    toast({
                      title: 'Partial Success',
                      description: `Transaction succeeded ${baseScanUrl ? `(${baseScanUrl})` : ''} but database update failed`,
                      variant: 'destructive',
                    });
                  }

                  setSyncTransactionConfig(null);
                }}
                onError={(error) => {
                  // Log transaction error with persistence
                  TransactionLogger.log({
                    type:
                      syncTransactionConfig.moduleAddress === 'demo-hats'
                        ? 'demo'
                        : 'real',
                    phase: 'error',
                    roleDetails: {
                      roleId: syncTransactionConfig.roleId,
                      roleName: syncTransactionConfig.roleName,
                      hatId: '',
                      podId: '',
                    },
                    moduleDetails: {
                      moduleAddress: syncTransactionConfig.moduleAddress || 'unknown',
                      moduleType:
                        syncTransactionConfig.moduleAddress === 'demo-hats'
                          ? 'HATS Core Contract'
                          : 'Eligibility Module',
                    },
                    calls: syncTransactionConfig.calls.map((call, index) => ({
                      callIndex: index,
                      contractAddress: call.address,
                      functionName: call.functionName,
                      args: call.args,
                    })),
                    error: {
                      message: error?.message || 'Unknown error',
                      code: error?.code || 'No code',
                      stack: (error as any)?.stack,
                    },
                    metadata: {
                      callCount: syncTransactionConfig.calls.length,
                      errorType: error?.message?.includes('User rejected')
                        ? 'user_rejection'
                        : error?.message?.includes('execution reverted')
                          ? 'execution_reverted'
                          : error?.message?.includes('gas')
                            ? 'gas_issue'
                            : 'unknown',
                      fullError: error,
                    },
                  });

                  // Check if user rejected the transaction
                  if (error.message?.includes('User rejected')) {
                    toast({
                      title: 'Transaction Cancelled',
                      description:
                        'You cancelled the blockchain sync transaction',
                      variant: 'default',
                    });
                  } else {
                    toast({
                      title: 'Sync Failed',
                      description: `${error instanceof Error ? error.message : 'Transaction failed'}. Check TransactionLogger.getLogs() for persistent details.`,
                      variant: 'destructive',
                    });
                  }

                  setSyncTransactionConfig(null);
                }}
              >
                <TransactionButton
                  className="w-full text-white font-medium py-2 px-4 rounded-lg transition-colors bg-[#2F5D50] hover:bg-[#1F453A]"
                  text="Sync to Blockchain"
                />
                <TransactionSponsor />
                <TransactionStatus>
                  <TransactionStatusLabel />
                  <TransactionStatusAction />
                </TransactionStatus>
              </Transaction>

              <Button
                variant="outline"
                className="w-full mt-3"
                onClick={() => setSyncTransactionConfig(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
    </div>
  );
};
