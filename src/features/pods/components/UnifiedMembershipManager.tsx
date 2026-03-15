'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { useWalletClient, usePublicClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
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
  Loader2,
  BookOpen,
  BookMarked,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Import existing components - preserve the UX exactly
import { EligibilityCriteriaBuilder } from './EligibilityCriteriaBuilder';
import { HatsModuleManager } from './HatsModuleManager';
import { SetHatExpirationButton } from './SetHatExpirationButton';

// Import services
import { PodRolePermissionsService } from '../services/PodRolePermissionsService';
import { EligibilityService } from '../services/EligibilityService';
import type { HatPermissions } from '@/services/hatPermissionsService';
import type { EligibilityCriteria } from '../services/EligibilityService';
import { getClientHatId } from '@/lib/hatRegistryClient';

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
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [loading, setLoading] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // 🚀 State for CDP Transaction integration
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
    knowledgeBaseAccess: false,
    knowledgeBaseManage: false,
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
      hasAddress: !!evmAddress,
      shouldShowUI: showSyncTransaction && syncCalls.length > 0 && !!evmAddress,
    });
  }, [syncCalls, showSyncTransaction, evmAddress]);

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
      knowledgeBaseAccess: perms.knowledgeBaseAccess ?? false,
      knowledgeBaseManage: perms.knowledgeBaseManage ?? false,
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

  // 🚀 Save to database and build transaction calls for CDP
  const handleSaveToDatabase = async () => {
    try {
      setLoading(true);

      // Check wallet connection
      if (!evmAddress) {
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
        updated_by: evmAddress || 'unknown_user',
      });

      console.log('✅ Database updated successfully');

      // Step 2: Build transaction calls for on-chain sync (if criteria exist)
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
                arg === '__USER_ADDRESS__' ? evmAddress : arg,
              ),
            }));

            console.log('🔐 Injected user address into calls:', evmAddress);

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

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleSyncToBlockchain = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for blockchain sync:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your Smart Wallet to sync to blockchain.',
        variant: 'destructive',
      });
      return;
    }

    if (syncCalls.length === 0) {
      console.error('❌ No sync calls to execute');
      toast({
        title: 'No Changes',
        description: 'No eligibility criteria to sync.',
        variant: 'destructive',
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for eligibility sync...');
      console.log('💼 Smart Account:', smartAccount);
      console.log(`🎯 Syncing ${syncMetadata.criteriaCount} eligibility criteria`);
      console.log(`⛽ Paymaster: ENABLED (gasless transaction)`);
      console.log(`📝 ${syncCalls.length} contract calls to execute`);

      // EXACT FAUCET PATTERN: Prepare calls for sendUserOperation
      // syncCalls already have {address, abi, functionName, args} format
      const callsFormatted = syncCalls.map((call) => ({
        to: call.address,
        value: 0n,
        data: encodeFunctionData({
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        }),
      }));

      console.log('📋 Formatted calls for User Operation:', callsFormatted.length);

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: callsFormatted,           // ← Multiple calls (batched)
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        console.log('✅ Blockchain sync transaction succeeded:', resultWithReceipt.receipt);

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
      } else {
        console.warn('⚠️ No receipt found in result');
        toast({
          title: 'Transaction Completed',
          description: 'Sync completed but receipt not found. Please refresh.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
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
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  };

  // 🐛 DEBUG: Log every render
  console.log('🖼️ RENDERING UnifiedMembershipManager:', {
    showSyncTransaction,
    syncCallsLength: syncCalls.length,
    hasAddress: !!evmAddress,
    shouldShowTransactionUI:
      showSyncTransaction && syncCalls.length > 0 && !!evmAddress,
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
              {/* Render permissions in alphabetical order */}
              {(
                [
                  'bountyManagement',
                  'chatAccess',
                  'chatModeration',
                  'eventCreation',
                  'forumAccess',
                  'forumModeration',
                  'governanceParticipation',
                  'knowledgeBaseAccess',
                  'knowledgeBaseManage',
                  'marketplaceAccess',
                  'marketplaceManage',
                  'memberManagement',
                  'roleAssignment',
                  'subPodCreation',
                  'treasuryManagement',
                  'treasuryViewing',
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
                      {permissionKey === 'knowledgeBaseAccess' && (
                        <BookOpen
                          className="h-5 w-5"
                          style={{ color: '#2F5D50' }}
                        />
                      )}
                      {permissionKey === 'knowledgeBaseManage' && (
                        <BookMarked
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
                          {permissionKey === 'knowledgeBaseAccess' &&
                            'View pod knowledge base content'}
                          {permissionKey === 'knowledgeBaseManage' &&
                            'Create and manage knowledge base content'}
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


        {/* Step 2: CDP Smart Account Transaction for Blockchain Sync */}
        {showSyncTransaction && syncCalls.length > 0 && evmAddress && (
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
                    to token
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
                        Expiration will be enforced by the role token itself
                      </li>
                      <li>
                        Role will automatically become inactive after expiration
                      </li>
                      <li>
                        Prevents users from bypassing the time restriction
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* CDP Smart Account Transaction Button */}
              {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
                <Button
                  onClick={handleSyncToBlockchain}
                  disabled={isTransactionPending}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTransactionPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                      Syncing to Blockchain...
                    </>
                  ) : (
                    `Sync to Blockchain (Gasless)`
                  )}
                </Button>
              ) : (
                <div
                  className="p-4 border rounded-lg"
                  style={{
                    backgroundColor: '#F5E6E6',
                    borderColor: '#D9B3B3',
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: '#5C1F1F' }}>
                    Wallet Not Connected
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                    Please connect your Smart Wallet to sync to blockchain.
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  setShowSyncTransaction(false);
                  setSyncCalls([]);
                }}
                disabled={isTransactionPending}
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
