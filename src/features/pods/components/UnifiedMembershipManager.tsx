'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { useWalletClient, usePublicClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import {
  buildAddAgreementCriterionCall,
  isCriterionOnChain,
  isOnChainAgreementConfigured,
} from '../services/OnChainAgreementService';
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
  ClipboardCheck,
  ClipboardList,
  KeyRound,
  Bot,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Palette,
  MapPin,
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
    surveyRespond: false,
    surveyManage: false,
    passwordsAccess: false,
    passwordsManage: false,
    agentManage: false,
    appearanceManage: false,
    placesManage: false,
  });

  // Pod module state — drives which add-on / paid permission groups
  // are shown. A permission group only appears if the corresponding
  // module is enabled on this pod.
  const [moduleFlags, setModuleFlags] = useState({
    surveys_enabled: false,
    passwords_enabled: false,
    community_agent_enabled: false,
    custom_appearance_enabled: false,
    places_enabled: false,
  });

  // Permission section collapse state — mirrors the Modules tab UX
  // (PodModulesManager.tsx Core/Add-Ons/Paid expanders) so the
  // permissions list stays manageable as more flags ship over time.
  const [permsCoreExpanded, setPermsCoreExpanded] = useState(false);
  const [permsAddonsExpanded, setPermsAddonsExpanded] = useState(false);
  const [permsPaidExpanded, setPermsPaidExpanded] = useState(false);
  useEffect(() => {
    if (!podId) return;
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('@/utils/supabaseClient');
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/pods/${podId}/modules`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setModuleFlags({
          surveys_enabled: json.modules?.surveys_enabled ?? false,
          passwords_enabled: json.modules?.passwords_enabled ?? false,
          community_agent_enabled:
            json.modules?.community_agent_enabled ?? false,
          custom_appearance_enabled:
            json.modules?.custom_appearance_enabled ?? false,
          places_enabled: json.modules?.places_enabled ?? false,
        });
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podId]);

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
      surveyRespond: perms.surveyRespond ?? false,
      surveyManage: perms.surveyManage ?? false,
      passwordsAccess: perms.passwordsAccess ?? false,
      passwordsManage: perms.passwordsManage ?? false,
      agentManage: perms.agentManage ?? false,
      appearanceManage: perms.appearanceManage ?? false,
      placesManage: perms.placesManage ?? false,
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

      // Record agreements on-chain. This is the durable, publicly verifiable
      // half of an agreement: addAgreementCriterion writes it against the role's
      // hat, and members later sign it with signAgreement. It goes direct to
      // the eligibility module, which authorises via Hats' own isAdminOfHat —
      // no pod proxy or factory involved, unlike the token/time criteria below.
      //
      // It does not switch on enforcement. A hat only consults this module once
      // its eligibility is re-pointed there, which is a separate deliberate act.
      const agreementCriteria = eligibilityCriteria.filter(
        (c: any) => c.type === 'agreement_signed' && c.agreement_cid,
      );

      if (agreementCriteria.length > 0 && hatId && isOnChainAgreementConfigured()) {
        try {
          const hatIdBig = BigInt(hatId);
          const pending: any[] = [];

          for (const criterion of agreementCriteria as any[]) {
            const already = publicClient
              ? await isCriterionOnChain(
                  publicClient as any,
                  hatIdBig,
                  criterion.agreement_cid,
                )
              : false;
            if (already) {
              console.log(
                'ℹ️ Agreement already recorded on-chain:',
                criterion.agreement_cid,
              );
              continue;
            }
            pending.push(
              buildAddAgreementCriterionCall(hatIdBig, criterion.agreement_cid),
            );
          }

          if (pending.length > 0) {
            toast({
              title: 'Recording agreement on-chain',
              description: 'Confirm the transaction to publish this agreement.',
              duration: 5000,
            });

            const res: any = await sendUserOperation({ calls: pending } as any);
            const txHash =
              res?.userOperationHash || res?.transactionHash || res?.hash || null;

            toast({
              title: 'Agreement published on-chain',
              description: txHash
                ? `Members can now sign it. Transaction ${String(txHash).slice(0, 10)}…`
                : 'Members can now sign it.',
              duration: 8000,
            });
          }
        } catch (chainErr: any) {
          // The agreement is already saved and usable in the app; only the
          // on-chain record failed. Say which, rather than implying data loss.
          console.error('❌ On-chain agreement write failed:', chainErr);
          // 0xea8e4eb5 is EligibilityModule's NotAuthorized() selector, which is
          // what a non-admin gets back. Confirmed by simulating the call.
          const notAdmin = /NotAuthorized|not authoriz|0xea8e4eb5/i.test(
            `${chainErr?.shortMessage || ''} ${chainErr?.message || ''} ${chainErr?.data ?? ''} ${chainErr?.cause?.data ?? ''}`,
          );
          toast({
            title: 'Saved, but not recorded on-chain',
            description: notAdmin
              ? 'Publishing an agreement requires admin of this role’s hat, which this wallet does not hold. The agreement is saved and enforced in the app.'
              : 'The agreement is saved and enforced in the app, but the on-chain record could not be written. You can retry by saving again.',
            variant: 'destructive',
            duration: 9000,
          });
        }
      }

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
              title: 'Saved',
              description: callResult.errors[0],
              variant: 'default',
              duration: 7000,
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

        {/* Permissions Tab — Core / Add-ons / Paid grouped UI.
            Add-on and Paid sections only render when the corresponding
            pod module is enabled; module-off path zeroes the flags
            server-side via the modules/route.ts sync blocks. */}
        <TabsContent value="permissions">
          {(() => {
            // Permission catalog. The bag of all permissions is kept
            // here so we can render them in semantic groups without a
            // sprawling switch.
            type PermissionDef = {
              key: keyof HatPermissions;
              label: string;
              description: string;
              icon: React.ComponentType<{ className?: string; style?: any }>;
              color: string;
            };

            const CORE: PermissionDef[] = [
              { key: 'chatAccess', label: 'Chat Access', description: 'Read and post in pod chat channels', icon: MessageCircle, color: '#2F5D50' },
              { key: 'chatModeration', label: 'Chat Moderation', description: 'Delete, mute, pin chat messages', icon: ShieldCheck, color: '#3F7A5A' },
              { key: 'forumAccess', label: 'Forum Access', description: 'View and post in pod forum', icon: MessageSquare, color: '#2F5D50' },
              { key: 'forumModeration', label: 'Forum Moderation', description: 'Moderate forum posts and discussions', icon: Landmark, color: '#3F7A5A' },
              { key: 'governanceParticipation', label: 'Governance Participation', description: 'Vote on pod proposals', icon: Vote, color: '#3F7A5A' },
              { key: 'memberManagement', label: 'Member Management', description: 'Add/remove members; broad leader access', icon: Users, color: '#8B3A3A' },
              { key: 'roleAssignment', label: 'Role Assignment', description: 'Assign roles to other members', icon: Crown, color: '#C6933F' },
              { key: 'subPodCreation', label: 'Sub-Pod Creation', description: 'Create and manage sub-pods', icon: GitBranch, color: '#6A5F7A' },
              { key: 'eventCreation', label: 'Event Creation', description: 'Create and manage pod events', icon: Calendar, color: '#6A5F7A' },
              { key: 'bountyManagement', label: 'Bounty Management', description: 'Create and manage bounties', icon: Target, color: '#6A5F7A' },
              { key: 'marketplaceAccess', label: 'Marketplace Access', description: 'View and purchase marketplace products', icon: ArrowRightLeft, color: '#2F5D50' },
              { key: 'marketplaceManage', label: 'Marketplace Manage', description: 'Create, edit, delete marketplace products', icon: Store, color: '#6A5F7A' },
              { key: 'knowledgeBaseAccess', label: 'Knowledge Base Access', description: 'View pod knowledge base content', icon: BookOpen, color: '#2F5D50' },
              { key: 'knowledgeBaseManage', label: 'Knowledge Base Manage', description: 'Create and manage knowledge base content', icon: BookMarked, color: '#6A5F7A' },
              { key: 'treasuryViewing', label: 'Treasury Viewing', description: 'View pod treasury balances and history', icon: CircleDollarSign, color: '#C6933F' },
              { key: 'treasuryManagement', label: 'Treasury Management', description: 'Distribute funds, deploy treasury', icon: HandCoins, color: '#C6933F' },
            ];

            type GroupDef = {
              title: string;
              show: boolean;
              perms: PermissionDef[];
              note?: string;
            };
            const ADD_ON_GROUPS: GroupDef[] = [
              {
                title: 'Surveys',
                show: moduleFlags.surveys_enabled,
                perms: [
                  { key: 'surveyRespond', label: 'Survey Respond', description: 'Respond to surveys distributed in this pod', icon: ClipboardList, color: '#6A5F7A' },
                  { key: 'surveyManage', label: 'Survey Manage', description: 'Create, edit, and close surveys', icon: ClipboardCheck, color: '#6A5F7A' },
                ],
              },
              {
                title: 'Password Vault',
                show: moduleFlags.passwords_enabled,
                perms: [
                  { key: 'passwordsAccess', label: 'Passwords Access', description: 'View / decrypt entries shared with this role', icon: KeyRound, color: '#1F453A' },
                  { key: 'passwordsManage', label: 'Passwords Manage', description: 'Add, edit, delete entries; grant access to newcomers', icon: KeyRound, color: '#C6933F' },
                ],
              },
              {
                title: 'Custom Appearance',
                show: moduleFlags.custom_appearance_enabled,
                perms: [
                  { key: 'appearanceManage', label: 'Appearance Manage', description: "Design and publish the pod's custom app face (colors and icons)", icon: Palette, color: '#6A5F7A' },
                ],
              },
              {
                title: 'Places',
                show: moduleFlags.places_enabled,
                perms: [
                  { key: 'placesManage', label: 'Places Manage', description: "Add, edit and remove pins on the pod's shared map. Every member can view it.", icon: MapPin, color: '#3F7A5A' },
                ],
              },
            ];
            const PAID_GROUPS: GroupDef[] = [
              {
                title: 'Community AI Agent',
                show: moduleFlags.community_agent_enabled,
                note: 'Subscription billing stays leader-only regardless of this flag.',
                perms: [
                  { key: 'agentManage', label: 'Agent Manage', description: 'Configure the AI agent (persona, channels, posting cadence)', icon: Bot, color: '#7A6E8F' },
                ],
              },
            ];

            const renderRow = (def: PermissionDef) => {
              const Icon = def.icon;
              const value = !!permissions[def.key];
              return (
                <div
                  key={def.key}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" style={{ color: def.color }} />
                    <div>
                      <span className="font-medium">{def.label}</span>
                      <p className="text-sm text-gray-500">{def.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) => {
                      setPermissions((prev) => ({
                        ...prev,
                        [def.key]: checked,
                      }));
                    }}
                  />
                </div>
              );
            };

            const renderGroup = (g: GroupDef) => {
              if (!g.show) return null;
              return (
                <div key={g.title} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h5 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#5F5A54' }}>
                      {g.title}
                    </h5>
                    {g.note && (
                      <span className="text-xs" style={{ color: '#9B948D' }}>
                        {g.note}
                      </span>
                    )}
                  </div>
                  {g.perms.map(renderRow)}
                </div>
              );
            };

            const visibleAddOns = ADD_ON_GROUPS.filter((g) => g.show);
            const visiblePaid = PAID_GROUPS.filter((g) => g.show);

            return (
              <Card className="p-6 space-y-4">
                <h4 className="text-lg font-semibold">Role Permissions</h4>

                {/* Core section (collapsible) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setPermsCoreExpanded((v) => !v)}
                    className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: '#5F5A54' }}
                    >
                      Core ({CORE.length})
                    </span>
                    {permsCoreExpanded ? (
                      <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
                    ) : (
                      <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />
                    )}
                  </button>
                  {permsCoreExpanded && (
                    <div className="space-y-2 mt-2">
                      {CORE.map(renderRow)}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t" style={{ borderColor: '#E8E4DC' }} />

                {/* Add-Ons section (collapsible). Only renders groups
                    whose module is on; if none are on, shows a hint. */}
                <div>
                  <button
                    type="button"
                    onClick={() => setPermsAddonsExpanded((v) => !v)}
                    className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: '#5F5A54' }}
                    >
                      Add-Ons{visibleAddOns.length > 0 ? ` (${visibleAddOns.reduce((n, g) => n + g.perms.length, 0)})` : ''}
                    </span>
                    {permsAddonsExpanded ? (
                      <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
                    ) : (
                      <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />
                    )}
                  </button>
                  {permsAddonsExpanded && (
                    <div className="space-y-4 mt-2">
                      {visibleAddOns.length === 0 ? (
                        <p className="text-xs italic px-1" style={{ color: '#9B948D' }}>
                          No add-on modules enabled. Turn one on in Pod
                          Modules to expose its permissions here.
                        </p>
                      ) : (
                        visibleAddOns.map(renderGroup)
                      )}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t" style={{ borderColor: '#E8E4DC' }} />

                {/* Paid section (collapsible). Same pattern. */}
                <div>
                  <button
                    type="button"
                    onClick={() => setPermsPaidExpanded((v) => !v)}
                    className="flex items-center justify-between w-full py-2 px-1 text-left rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: '#5F5A54' }}
                    >
                      Paid{visiblePaid.length > 0 ? ` (${visiblePaid.reduce((n, g) => n + g.perms.length, 0)})` : ''}
                    </span>
                    {permsPaidExpanded ? (
                      <ChevronUp className="h-4 w-4" style={{ color: '#5F5A54' }} />
                    ) : (
                      <ChevronDown className="h-4 w-4" style={{ color: '#5F5A54' }} />
                    )}
                  </button>
                  {permsPaidExpanded && (
                    <div className="space-y-4 mt-2">
                      {visiblePaid.length === 0 ? (
                        <p className="text-xs italic px-1" style={{ color: '#9B948D' }}>
                          No paid modules enabled. Billing actions for
                          paid modules always remain leader-only.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs italic px-1" style={{ color: '#9B948D' }}>
                            Billing actions remain leader-only regardless
                            of these flags.
                          </p>
                          {visiblePaid.map(renderGroup)}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}
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
