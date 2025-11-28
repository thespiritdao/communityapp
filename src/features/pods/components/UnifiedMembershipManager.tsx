'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { base } from 'viem/chains';
import {
  Shield,
  RefreshCw,
  CheckCircle,
  Info,
  MessageCircle,
  ShieldCheck,
  MessageSquare,
  Vote,
  Calendar,
  CircleDollarSign,
  HandCoins,
  Users,
  Plus,
  Crown,
  Landmark,
  Target,
  ArrowRightLeft,
  Store,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Import OnchainKit Transaction components for proper Smart Wallet support
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

// Import existing components - preserve the UX exactly
import { EligibilityCriteriaBuilder } from './EligibilityCriteriaBuilder';
import { HatsModuleManager } from './HatsModuleManager';

// Import services
import { PodRolePermissionsService } from '../services/PodRolePermissionsService';
import { EligibilityService } from '../services/EligibilityService';
import type { HatPermissions } from '@/services/hatPermissionsService';
import type { EligibilityCriteria } from '../services/EligibilityService';

interface UnifiedMembershipManagerProps {
  podId: string;
  podName: string;
  roleId: string;
  roleName: string;
  roleType: 'leader' | 'member';
  hatId?: string;
  onUpdate?: () => void;
}

export const UnifiedMembershipManager: React.FC<
  UnifiedMembershipManagerProps
> = ({ podId, podName, roleId, roleName, roleType, hatId, onUpdate }) => {
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [loading, setLoading] = useState(false);

  // 🚀 NEW: State for OnchainKit Transaction integration
  const [syncCalls, setSyncCalls] = useState<any[]>([]);
  const [showSyncTransaction, setShowSyncTransaction] = useState(false);
  const [syncMetadata, setSyncMetadata] = useState<{
    criteriaCount: number;
    podId?: string;
  }>({ criteriaCount: 0 });

  // State for permissions and criteria
  const [permissions, setPermissions] = useState<HatPermissions>({
    chatAccess: false,
    chatModeration: false,
    forumAccess: false,
    governanceParticipation: false,
    eventCreation: false,
    treasuryViewing: false,
    treasuryManagement: false,
    memberManagement: false,
    subPodCreation: false,
    roleAssignment: false,
    forumModeration: false,
    bountyManagement: false,
    marketplaceAccess: false,
    marketplaceManage: false,
  });

  const [eligibilityCriteria, setEligibilityCriteria] = useState<
    EligibilityCriteria[]
  >([]);
  const [activeTab, setActiveTab] = useState('permissions');

  // Load existing role data
  useEffect(() => {
    loadRoleData();
  }, [roleId]);

  // 🐛 DEBUG: Monitor syncCalls changes
  useEffect(() => {
    console.log('🔄 USEEFFECT: syncCalls or showSyncTransaction changed:', {
      syncCallsLength: syncCalls.length,
      showSyncTransaction,
      hasAddress: !!address,
      shouldShowUI: showSyncTransaction && syncCalls.length > 0 && !!address,
    });
  }, [syncCalls, showSyncTransaction, address]);

  // Helper function to convert old permission format to new format
  const convertPermissionsFormat = (dbPermissions: any): HatPermissions => {
    // If permissions is a string, parse it
    const perms =
      typeof dbPermissions === 'string'
        ? JSON.parse(dbPermissions)
        : dbPermissions;

    // Simply reflect what's in the database - no hard overrides
    // This allows flexibility for different permission configurations
    return {
      chatAccess: perms.chatAccess ?? false,
      chatModeration: perms.chatModeration ?? false,
      forumAccess: perms.forumAccess ?? false,
      governanceParticipation: perms.governanceParticipation ?? false,
      eventCreation: perms.eventCreation ?? false,
      treasuryViewing: perms.treasuryViewing ?? false,
      treasuryManagement: perms.treasuryManagement ?? false,
      memberManagement: perms.memberManagement ?? false,
      subPodCreation: perms.subPodCreation ?? false,
      roleAssignment: perms.roleAssignment ?? false,
      forumModeration: perms.forumModeration ?? false,
      bountyManagement: perms.bountyManagement ?? false,
      marketplaceAccess: perms.marketplaceAccess ?? false,
      marketplaceManage: perms.marketplaceManage ?? false,
    };
  };

  const loadRoleData = async () => {
    try {
      setLoading(true);

      // Get role permissions from database
      const roleData = await PodRolePermissionsService.getRolePermissionByHatId(
        podId,
        hatId || roleId,
      );

      if (roleData) {
        // Convert permissions from database format to component format
        const convertedPermissions = convertPermissionsFormat(
          roleData.permissions,
        );
        console.log('🔄 Loading permissions for role:', roleName);
        console.log('  Raw DB permissions:', roleData.permissions);
        console.log('  Converted permissions:', convertedPermissions);

        setPermissions(convertedPermissions);
        setEligibilityCriteria(roleData.eligibility_criteria || []);
      }
    } catch (error) {
      console.error('Failed to load role data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load membership configuration',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 🚀 NEW: Save to database and build transaction calls for OnchainKit
  const handleSaveToDatabase = async () => {
    try {
      setLoading(true);

      // Check wallet connection
      if (!isConnected || !address) {
        toast({
          title: 'Wallet Required',
          description: 'Please connect your wallet to save configuration',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Step 1: Update database
      await PodRolePermissionsService.updateRolePermission(roleId, {
        permissions,
        eligibility_criteria: eligibilityCriteria,
        updated_by: address || 'unknown_user',
      });

      console.log('✅ Database updated successfully');

      // Step 2: Build transaction calls for on-chain sync (if criteria exist)
      // OPTION A: Skip eligibility sync for Beta Tester role (legacy pod, no proxy)
      const isBetaTesterRole =
        roleName === 'Beta Tester' || roleName?.toLowerCase().includes('beta');

      if (isBetaTesterRole) {
        console.log(
          '🗝️ Beta Tester role detected - skipping eligibility sync (Option A)',
        );
        console.log('   Permissions granted via hat ownership only');

        toast({
          title: 'Beta Tester Permissions Updated',
          description:
            'Database saved! Beta testers receive permissions via hat ownership.',
        });

        return;
      }

      if (eligibilityCriteria.length > 0) {
        console.log('🔨 Building eligibility sync transaction calls...');

        try {
          const callResult = await EligibilityService.buildSyncCallsForRole(
            roleId,
            true, // Clear existing criteria on-chain before syncing
          );

          if (callResult.success && callResult.calls.length > 0) {
            console.log(
              `✅ Built ${callResult.calls.length} transaction calls for ${callResult.criteriaCount} criteria`,
            );
            console.log('🔍 Call objects:', callResult.calls);

            console.log(
              '🔍 TRACE: UnifiedMembershipManager received callResult:',
              {
                success: callResult.success,
                podId: callResult.podId,
                callsLength: callResult.calls.length,
                criteriaCount: callResult.criteriaCount,
              },
            );

            // 🚀 V3 FIX: Inject user's wallet address into calls
            // Replace __USER_ADDRESS__ placeholder with actual connected wallet
            const callsWithUserAddress = callResult.calls.map((call) => ({
              ...call,
              args: call.args.map((arg: any) =>
                arg === '__USER_ADDRESS__' ? address : arg,
              ),
            }));

            console.log('🔐 Injected user address into calls:', address);

            if (callsWithUserAddress.length > 0) {
              console.log('🔍 TRACE: Final call after address injection:', {
                address: callsWithUserAddress[0].address,
                functionName: callsWithUserAddress[0].functionName,
                args: callsWithUserAddress[0].args,
                arg0_podId: callsWithUserAddress[0].args?.[0],
                arg3_actualUser: callsWithUserAddress[0].args?.[3],
              });
            }

            // Store calls and metadata
            setSyncCalls(callsWithUserAddress);
            setSyncMetadata({
              criteriaCount: callResult.criteriaCount,
              podId: callResult.podId,
            });

            console.log('🔍 TRACE: State being set:', {
              syncCallsLength: callsWithUserAddress.length,
              syncMetadata: {
                criteriaCount: callResult.criteriaCount,
                podId: callResult.podId,
              },
            });
            setShowSyncTransaction(true);

            console.log(
              '🎯 State updated - Transaction UI should now be visible',
            );
            console.log('   - syncCalls.length:', callResult.calls.length);
            console.log('   - showSyncTransaction:', true);
            console.log('   - criteriaCount:', callResult.criteriaCount);

            toast({
              title: 'Ready to Sync',
              description: `Database saved! Click "Sync to Blockchain" below to publish ${callResult.criteriaCount} criteria on-chain.`,
            });
          } else if (callResult.errors.length > 0) {
            console.warn(
              '⚠️ Call building completed with errors:',
              callResult.errors,
            );

            toast({
              title: 'Saved (Sync Unavailable)',
              description: `Configuration saved to database. ${callResult.errors[0]}`,
              variant: 'default',
            });
          } else {
            // Success but no calls to make (e.g., all criteria are database-only)
            toast({
              title: 'Saved',
              description: 'Configuration saved successfully',
            });
          }
        } catch (buildError) {
          console.error('❌ Failed to build sync calls:', buildError);

          toast({
            title: 'Saved (Sync Unavailable)',
            description:
              'Configuration saved to database, but could not prepare blockchain sync.',
            variant: 'default',
          });
        }
      } else {
        // No criteria to sync
        toast({
          title: 'Saved',
          description: 'Membership configuration saved successfully',
        });

        // Only call onUpdate if there's no transaction to follow up with
        // (Transaction will call onUpdate after successful sync)
        onUpdate?.();
      }

      // 🐛 FIX: Do NOT call onUpdate here if transaction is pending
      // The parent's onUpdate causes component to remount, losing transaction state
      // onUpdate will be called by handleSyncSuccess after blockchain sync completes
    } catch (error) {
      console.error('Failed to save:', error);
      toast({
        title: 'Error',
        description: 'Failed to save configuration',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 🚀 NEW: Handle successful blockchain sync
  const handleSyncSuccess = async (response: any) => {
    console.log('✅ Blockchain sync transaction succeeded:', response);

    // Update database sync status
    await EligibilityService.updateSyncStatus(roleId, 'synced');

    toast({
      title: 'Synced Successfully',
      description: `${syncMetadata.criteriaCount} eligibility criteria now enforced on-chain!`,
    });

    // Hide transaction UI
    setShowSyncTransaction(false);
    setSyncCalls([]);

    onUpdate?.();
  };

  // 🚀 NEW: Handle blockchain sync error
  const handleSyncError = async (error: any) => {
    console.error('❌ Blockchain sync transaction failed:', error);

    // Update database sync status
    await EligibilityService.updateSyncStatus(roleId, 'failed');

    toast({
      title: 'Sync Failed',
      description:
        error?.message ||
        'Failed to sync criteria to blockchain. Try again or contact support.',
      variant: 'destructive',
    });
  };

  // 🐛 DEBUG: Log every render
  console.log('🖼️ RENDERING UnifiedMembershipManager:', {
    showSyncTransaction,
    syncCallsLength: syncCalls.length,
    hasAddress: !!address,
    shouldShowTransactionUI:
      showSyncTransaction && syncCalls.length > 0 && !!address,
    syncMetadata,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">{roleName} Membership</h3>
            <p className="text-sm text-gray-600">
              Configure permissions and access requirements for this role
            </p>
          </div>
        </div>
      </Card>

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="requirements">Requirements</TabsTrigger>
        </TabsList>

        {/* Permissions Tab - inline permissions grid */}
        <TabsContent value="permissions">
          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4">Role Permissions</h4>
            <div className="space-y-4">
              {/* Render permissions in logical order */}
              {(
                [
                  'chatAccess',
                  'chatModeration',
                  'forumAccess',
                  'forumModeration',
                  'governanceParticipation',
                  'eventCreation',
                  'bountyManagement',
                  'treasuryViewing',
                  'treasuryManagement',
                  'memberManagement',
                  'roleAssignment',
                  'subPodCreation',
                  'marketplaceAccess',
                  'marketplaceManage',
                ] as Array<keyof HatPermissions>
              ).map((permissionKey) => {
                const value = permissions[permissionKey];
                return (
                  <div
                    key={permissionKey}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      {permissionKey === 'chatAccess' && (
                        <MessageCircle
                          className="h-5 w-5"
                          style={{ color: '#2F5D50' }}
                        />
                      )}
                      {permissionKey === 'chatModeration' && (
                        <ShieldCheck
                          className="h-5 w-5"
                          style={{ color: '#3F7A5A' }}
                        />
                      )}
                      {permissionKey === 'forumAccess' && (
                        <MessageSquare
                          className="h-5 w-5"
                          style={{ color: '#2F5D50' }}
                        />
                      )}
                      {permissionKey === 'governanceParticipation' && (
                        <Vote
                          className="h-5 w-5"
                          style={{ color: '#3F7A5A' }}
                        />
                      )}
                      {permissionKey === 'eventCreation' && (
                        <Calendar
                          className="h-5 w-5"
                          style={{ color: '#6A5F7A' }}
                        />
                      )}
                      {permissionKey === 'treasuryViewing' && (
                        <CircleDollarSign
                          className="h-5 w-5"
                          style={{ color: '#C6933F' }}
                        />
                      )}
                      {permissionKey === 'treasuryManagement' && (
                        <HandCoins
                          className="h-5 w-5"
                          style={{ color: '#C6933F' }}
                        />
                      )}
                      {permissionKey === 'memberManagement' && (
                        <Users
                          className="h-5 w-5"
                          style={{ color: '#8B3A3A' }}
                        />
                      )}
                      {permissionKey === 'subPodCreation' && (
                        <Plus
                          className="h-5 w-5"
                          style={{ color: '#6A5F7A' }}
                        />
                      )}
                      {permissionKey === 'roleAssignment' && (
                        <Crown
                          className="h-5 w-5"
                          style={{ color: '#C6933F' }}
                        />
                      )}
                      {permissionKey === 'forumModeration' && (
                        <Landmark
                          className="h-5 w-5"
                          style={{ color: '#3F7A5A' }}
                        />
                      )}
                      {permissionKey === 'bountyManagement' && (
                        <Target
                          className="h-5 w-5"
                          style={{ color: '#6A5F7A' }}
                        />
                      )}
                      {permissionKey === 'marketplaceAccess' && (
                        <ArrowRightLeft
                          className="h-5 w-5"
                          style={{ color: '#2F5D50' }}
                        />
                      )}
                      {permissionKey === 'marketplaceManage' && (
                        <Store
                          className="h-5 w-5"
                          style={{ color: '#6A5F7A' }}
                        />
                      )}
                      <div>
                        <span className="font-medium capitalize">
                          {permissionKey
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, (str) => str.toUpperCase())}
                        </span>
                        <p className="text-sm text-gray-500">
                          {permissionKey === 'chatAccess' &&
                            'Access to community chat and messaging'}
                          {permissionKey === 'chatModeration' &&
                            'Moderate chat messages (delete, mute, pin)'}
                          {permissionKey === 'forumAccess' &&
                            'View and post in community forum discussions'}
                          {permissionKey === 'governanceParticipation' &&
                            'Participate in community governance'}
                          {permissionKey === 'eventCreation' &&
                            'Create and manage community events'}
                          {permissionKey === 'treasuryViewing' &&
                            'View pod treasury and transactions'}
                          {permissionKey === 'treasuryManagement' &&
                            'Manage fund distribution'}
                          {permissionKey === 'memberManagement' &&
                            'Manage pod members and roles'}
                          {permissionKey === 'subPodCreation' &&
                            'Create and manage sub-pods'}
                          {permissionKey === 'roleAssignment' &&
                            'Assign roles to other members'}
                          {permissionKey === 'forumModeration' &&
                            'Moderate forum posts and discussions'}
                          {permissionKey === 'bountyManagement' &&
                            'Create and manage bounties'}
                          {permissionKey === 'marketplaceAccess' &&
                            'View and purchase marketplace products'}
                          {permissionKey === 'marketplaceManage' &&
                            'Create, edit, and delete marketplace products'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) => {
                        setPermissions((prev) => ({
                          ...prev,
                          [permissionKey]: checked,
                        }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* Access Requirements Tab */}
        <TabsContent value="requirements">
          <Card className="p-6">
            <EligibilityCriteriaBuilder
              initialCriteria={eligibilityCriteria}
              podId={podId}
              onCriteriaChange={setEligibilityCriteria}
              roleType={roleType}
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex justify-center flex-col items-center gap-4">
        {/* Step 1: Save to Database Button */}
        {!showSyncTransaction && (
          <Button
            onClick={handleSaveToDatabase}
            disabled={loading}
            className="w-full md:w-auto"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        )}

        {/* Step 2: OnchainKit Transaction Component for Blockchain Sync */}
        {showSyncTransaction && syncCalls.length > 0 && address && (
          <Card className="w-full p-6 border-2 border-primary">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-primary" />
                <div>
                  <h4 className="text-lg font-semibold">Sync to Blockchain</h4>
                  <p className="text-sm text-gray-600">
                    Publish {syncMetadata.criteriaCount} eligibility{' '}
                    {syncMetadata.criteriaCount === 1
                      ? 'criterion'
                      : 'criteria'}{' '}
                    to Hats Protocol
                  </p>
                </div>
              </div>

              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: '#E8F1EE',
                  border: '1px solid #B8D9CA',
                }}
              >
                <div className="flex gap-2">
                  <Info
                    className="h-5 w-5 flex-shrink-0 mt-0.5"
                    style={{ color: '#2F5D50' }}
                  />
                  <div className="text-sm" style={{ color: '#1F453A' }}>
                    <p className="font-medium mb-1">Why sync to blockchain?</p>
                    <ul className="list-disc ml-4 space-y-1">
                      <li>
                        Criteria will be enforced by Hats Protocol smart
                        contracts
                      </li>
                      <li>
                        Eligibility checks will be trustless and transparent
                      </li>
                      <li>This transaction is sponsored (free for you!)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Transaction
                chainId={base.id}
                calls={syncCalls}
                isSponsored={true}
                onStatus={(status) => {
                  console.log('🔄 Sync transaction status:', status);
                  if (status.statusName === 'success' && status.statusData) {
                    handleSyncSuccess(status.statusData);
                  }
                }}
                onError={handleSyncError}
              >
                <TransactionButton
                  className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                  text="Sync to Blockchain"
                />
                <TransactionSponsor />
                <div className="mt-4">
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </div>
              </Transaction>

              <Button
                variant="outline"
                onClick={() => {
                  setShowSyncTransaction(false);
                  setSyncCalls([]);
                }}
                className="w-full"
              >
                Cancel Sync
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UnifiedMembershipManager;
