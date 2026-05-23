import { supabase } from '@/utils/supabaseClient';
import type { HatPermissions } from '@/services/hatPermissionsService';
import {
  EligibilityService,
  type EligibilityCriteria,
} from './EligibilityService';

export interface PodRolePermission {
  id: string;
  pod_id: string;
  token_address: string; // ERC-1155 token ID (formerly hat_id)
  role_name: string;
  permissions: HatPermissions;
  eligibility_criteria: EligibilityCriteria[];
  max_holders: number;
  current_holders: number;
  is_active: boolean;
  hat_level?: number;
  parent_hat_id?: string;
  template_name?: string;
  inherits_from?: string;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  last_synced_at?: string;
  sync_status: 'synced' | 'pending' | 'error';
  metadata_hash?: string;
}

export class PodRolePermissionsService {
  /**
   * Get all role permissions for a pod with enhanced eligibility criteria
   */
  static async getPodRolePermissions(
    podId: string,
  ): Promise<PodRolePermission[]> {
    try {
      console.log(`🔍 Fetching role permissions for pod: ${podId}`);

      const { data, error } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('pod_id', podId)
        .order('role_name');

      if (error) {
        console.error('Failed to fetch pod role permissions:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log(`📭 No role permissions found for pod: ${podId}`);
        return [];
      }

      console.log(`✅ Found ${data.length} role permissions for pod: ${podId}`);

      // Enhance eligibility criteria with token names from database
      const enhancedData = await Promise.all(
        data.map(async (rolePermission) => {
          // Parse eligibility_criteria if it's a string
          let parsedCriteria = rolePermission.eligibility_criteria;
          if (typeof parsedCriteria === 'string') {
            try {
              parsedCriteria = JSON.parse(parsedCriteria);
            } catch (e) {
              console.error('Failed to parse eligibility_criteria:', e);
              parsedCriteria = [];
            }
          }

          // Ensure it's an array
          if (!Array.isArray(parsedCriteria)) {
            parsedCriteria = [];
          }

          if (parsedCriteria && parsedCriteria.length > 0) {
            const enhancedCriteria = await Promise.all(
              parsedCriteria.map(
                async (criterion: any) => {
                  // If criterion has contract_address but no token_name, look it up
                  if (criterion.contract_address && !criterion.token_name) {
                    try {
                      const { data: tokenData, error: tokenError } =
                        await supabase
                          .from('tokens')
                          .select('id, name, symbol')
                          .eq('contract_address', criterion.contract_address)
                          .eq('is_active', true)
                          .single();

                      if (tokenData && !tokenError) {
                        console.log(
                          `🎫 Found token for ${criterion.contract_address}: ${tokenData.name}`,
                        );
                        return {
                          ...criterion,
                          token_name: tokenData.name,
                          token_symbol: tokenData.symbol,
                          token_id: tokenData.id,
                        };
                      } else {
                        console.log(
                          `⚠️ No token found for contract: ${criterion.contract_address}`,
                        );
                      }
                    } catch (tokenLookupError) {
                      console.warn('Error looking up token:', tokenLookupError);
                    }
                  }
                  return criterion;
                },
              ),
            );

            return {
              ...rolePermission,
              eligibility_criteria: enhancedCriteria,
            };
          }
          return rolePermission;
        }),
      );

      console.log(
        `🎯 Enhanced ${enhancedData.length} role permissions with token data`,
      );
      return enhancedData;
    } catch (error) {
      console.error(`Failed to get role permissions for pod ${podId}:`, error);
      throw error;
    }
  }

  /**
   * Get specific role permission by HAT ID
   */
  static async getRolePermissionByHatId(
    podId: string,
    hatId: string,
  ): Promise<PodRolePermission | null> {
    try {
      const { data, error } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('pod_id', podId)
        .eq('token_address', hatId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error(`Failed to get role permission for HAT ${hatId}:`, error);
      throw error;
    }
  }

  /**
   * Create new role permission
   */
  static async createRolePermission(rolePermission: {
    pod_id: string;
    token_address: string;
    role_name: string;
    permissions: HatPermissions;
    eligibility_criteria?: any[];
    max_holders?: number;
    created_by: string;
  }): Promise<PodRolePermission> {
    try {
      const { data, error } = await supabase
        .from('pod_role_permissions')
        .insert({
          ...rolePermission,
          updated_by: rolePermission.created_by,
          eligibility_criteria: rolePermission.eligibility_criteria || [],
          max_holders: rolePermission.max_holders || 50,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create role permission:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to create role permission:', rolePermission, error);
      throw error;
    }
  }

  /**
   * Update role permission
   */
  static async updateRolePermission(
    id: string,
    updates: {
      permissions?: HatPermissions;
      eligibility_criteria?: any[];
      max_holders?: number;
      is_active?: boolean;
      updated_by: string;
    },
  ): Promise<PodRolePermission> {
    try {
      console.log(`🔧 Attempting to update role permission ${id}:`, updates);

      // First check if the record exists
      const { data: existing, error: checkError } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('id', id)
        .single();

      if (checkError && checkError.code === 'PGRST116') {
        console.error(`❌ Role permission ${id} not found in database`);
        throw new Error(
          `Role permission with ID ${id} not found. Please refresh the page and try again.`,
        );
      }

      if (checkError) {
        console.error('Error checking existing role permission:', checkError);
        throw checkError;
      }

      console.log(`✅ Found existing role permission:`, existing.role_name);

      // Update the record - debug version with detailed logging
      console.log('🔍 About to execute update with:', {
        table: 'pod_role_permissions',
        id,
        updates: {
          ...updates,
          updated_at: new Date().toISOString(),
        },
      });

      // Use regular client with fixed RLS policies
      const {
        data: updateData,
        error: updateError,
        count,
      } = await supabase
        .from('pod_role_permissions')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*');

      console.log('📊 Update result:', {
        affectedRows: count,
        data: updateData,
        error: updateError,
      });

      if (updateError) {
        console.error('❌ Update failed:', updateError);
        throw updateError;
      }

      if (!updateData || updateData.length === 0) {
        throw new Error(
          `No rows were updated. This might be a Row Level Security (RLS) policy issue. Record ID: ${id}`,
        );
      }

      if (updateData.length > 1) {
        console.warn('⚠️ Multiple rows updated, returning first:', updateData);
      }

      const data = updateData[0];

      console.log(`✅ Successfully updated role permission ${id}`);
      return data;
    } catch (error) {
      console.error(`Failed to update role permission ${id}:`, updates, error);
      throw error;
    }
  }

  /**
   * Update role from blockchain sync
   * This method updates fields that should match blockchain state (role_name, max_holders, is_active)
   */
  static async updateRoleFromBlockchain(
    tokenAddress: string,
    updates: {
      role_name?: string;
      max_holders?: number;
      is_active?: boolean;
      updated_by: string;
    },
  ): Promise<PodRolePermission> {
    try {
      console.log(`🔄 Syncing role from blockchain (${tokenAddress}):`, updates);

      const { data, error } = await supabase
        .from('pod_role_permissions')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString(),
          sync_status: 'synced',
        })
        .eq('token_address', tokenAddress)
        .select()
        .single();

      if (error) {
        console.error('Failed to update role from blockchain:', error);
        throw error;
      }

      console.log(`✅ Successfully synced role from blockchain: ${data.role_name}`);
      return data;
    } catch (error) {
      console.error(
        `Failed to update role from blockchain (${tokenAddress}):`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update permission sync status
   */
  static async updateSyncStatus(
    id: string,
    syncStatus: 'synced' | 'pending' | 'error',
    syncError?: string,
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('pod_role_permissions')
        .update({
          sync_status: syncStatus,
          sync_error: syncError || null,
          last_synced_at:
            syncStatus === 'synced' ? new Date().toISOString() : undefined,
        })
        .eq('id', id);

      if (error) {
        console.error('Failed to update sync status:', error);
        throw error;
      }
    } catch (error) {
      console.error(
        `Failed to update sync status for permission ${id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete role permission by ID
   */
  static async deleteRolePermission(id: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting role permission: ${id}`);

      const { error } = await supabase
        .from('pod_role_permissions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Failed to delete role permission:', error);
        throw error;
      }

      console.log(`✅ Successfully deleted role permission: ${id}`);
    } catch (error) {
      console.error(`Failed to delete role permission ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete role permission by token address
   */
  static async deleteRoleByTokenAddress(tokenAddress: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting role by token address: ${tokenAddress}`);

      const { error } = await supabase
        .from('pod_role_permissions')
        .delete()
        .eq('token_address', tokenAddress);

      if (error) {
        console.error('Failed to delete role by token address:', error);
        throw error;
      }

      console.log(`✅ Successfully deleted role: ${tokenAddress}`);
    } catch (error) {
      console.error(`Failed to delete role by token ${tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has specific permission
   */
  static async checkUserPermission(
    userWallet: string,
    podId: string,
    permissionKey: keyof HatPermissions,
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('check_pod_permission', {
        p_user_wallet: userWallet,
        p_pod_id: podId,
        p_permission_key: permissionKey,
      });

      if (error) {
        console.error('Failed to check user permission:', error);
        return false;
      }

      return data || false;
    } catch (error) {
      console.error(
        `Failed to check permission ${permissionKey} for ${userWallet}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get permission history for a role
   */
  static async getPermissionHistory(permissionId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('pod_role_permissions_history')
        .select('*')
        .eq('permission_id', permissionId)
        .order('changed_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch permission history:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(
        `Failed to get history for permission ${permissionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Initialize default role permissions for a pod
   */
  static async initializeDefaultRoles(
    podId: string,
    leaderHatId: string,
    memberHatId: string,
    createdBy: string,
  ): Promise<void> {
    try {
      // Create leader role permissions
      await this.createRolePermission({
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
          forumModeration: false,
          bountyManagement: true,
          marketplaceAccess: true,
          marketplaceManage: true,
          knowledgeBaseAccess: true,
          knowledgeBaseManage: true,
          surveyManage: true,
          surveyRespond: true,
          // Password Vault (off by default at pod creation — the vault
          // module is opt-in. When a pod enables the module, these flags
          // get auto-set to true via the modules toggle sync block.)
          passwordsAccess: false,
          passwordsManage: false,
        },
        max_holders: 5,
        created_by: createdBy,
      });

      // Create member role permissions
      await this.createRolePermission({
        pod_id: podId,
        token_address: memberHatId,
        role_name: 'Pod Member',
        permissions: {
          chatAccess: true,
          chatModeration: false,
          governanceParticipation: true,
          eventCreation: false,
          treasuryViewing: false,
          treasuryManagement: false,
          memberManagement: false,
          subPodCreation: false,
          roleAssignment: false,
          forumAccess: true,
          forumModeration: false,
          bountyManagement: false,
          marketplaceAccess: true,
          marketplaceManage: false,
          knowledgeBaseAccess: false,
          knowledgeBaseManage: false,
          surveyManage: false,
          surveyRespond: true,
          // Members get passwordsAccess when the module turns on; never
          // get passwordsManage by default (only leaders can grant /
          // rotate).
          passwordsAccess: false,
          passwordsManage: false,
        },
        max_holders: 100,
        created_by: createdBy,
      });
    } catch (error) {
      console.error(
        `Failed to initialize default roles for pod ${podId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update eligibility criteria for a role
   */
  static async updateEligibilityCriteria(
    roleId: string,
    criteria: EligibilityCriteria[],
    updatedBy: string,
  ): Promise<PodRolePermission> {
    try {
      console.log(
        `🔧 Updating eligibility criteria for role ${roleId}:`,
        criteria,
      );

      const updatedRole = await this.updateRolePermission(roleId, {
        updated_by: updatedBy,
        // Add criteria as part of the update - the eligibility_criteria field should be updated directly
      });

      // Update the eligibility_criteria field directly
      const { data, error } = await supabase
        .from('pod_role_permissions')
        .update({
          eligibility_criteria: criteria,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', roleId)
        .select()
        .single();

      if (error) {
        console.error('Failed to update eligibility criteria:', error);
        throw error;
      }

      console.log('✅ Successfully updated eligibility criteria');
      return data;
    } catch (error) {
      console.error(
        `Failed to update eligibility criteria for role ${roleId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if user meets eligibility requirements for a role
   */
  static async checkUserEligibility(
    userAddress: string,
    roleId: string,
  ): Promise<{ eligible: boolean; evaluation: any }> {
    try {
      // Get the role and its criteria
      const { data: role, error } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('id', roleId)
        .single();

      if (error || !role) {
        throw new Error('Role not found');
      }

      // If no eligibility criteria, user is eligible by default
      if (
        !role.eligibility_criteria ||
        role.eligibility_criteria.length === 0
      ) {
        return {
          eligible: true,
          evaluation: {
            eligible: true,
            criteriaResults: {},
            overallResult: {
              passed: 0,
              total: 0,
              message: 'No eligibility criteria defined - access granted',
            },
            evaluatedAt: new Date().toISOString(),
            userAddress,
            roleId,
          },
        };
      }

      // Evaluate eligibility using the EligibilityService
      const evaluation = await EligibilityService.evaluateCriteria({
        userAddress,
        podId: role.pod_id,
        roleId,
        criteria: role.eligibility_criteria,
      });

      return {
        eligible: evaluation.eligible,
        evaluation,
      };
    } catch (error) {
      console.error(`Failed to check eligibility for role ${roleId}:`, error);
      throw error;
    }
  }

  /**
   * Get roles that a user is eligible for in a pod
   */
  static async getEligibleRolesForUser(
    userAddress: string,
    podId: string,
  ): Promise<
    { role: PodRolePermission; eligible: boolean; evaluation: any }[]
  > {
    try {
      // Get all active roles for the pod
      const roles = await this.getPodRolePermissions(podId);

      const results = await Promise.allSettled(
        roles.map(async (role) => {
          const eligibilityCheck = await this.checkUserEligibility(
            userAddress,
            role.id,
          );
          return {
            role,
            eligible: eligibilityCheck.eligible,
            evaluation: eligibilityCheck.evaluation,
          };
        }),
      );

      return results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<any>).value);
    } catch (error) {
      console.error(
        `Failed to get eligible roles for user ${userAddress} in pod ${podId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Auto-assign eligible roles to a user (if auto-assignment is enabled)
   */
  static async autoAssignEligibleRoles(
    userAddress: string,
    podId: string,
  ): Promise<string[]> {
    try {
      const eligibleRoles = await this.getEligibleRolesForUser(
        userAddress,
        podId,
      );
      const assignedRoles: string[] = [];

      for (const { role, eligible } of eligibleRoles) {
        if (eligible && role.is_active) {
          // Here you would integrate with the actual role assignment system
          // For now, we'll just log the eligible role
          console.log(
            `✅ User ${userAddress} is eligible for role ${role.role_name}`,
          );
          assignedRoles.push(role.id);
        }
      }

      return assignedRoles;
    } catch (error) {
      console.error(
        `Failed to auto-assign roles for user ${userAddress}:`,
        error,
      );
      throw error;
    }
  }
}
