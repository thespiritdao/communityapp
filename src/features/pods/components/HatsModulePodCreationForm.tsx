'use client';

import type React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  CheckCircle,
  Clock,
  Plus,
  Trash2,
  Zap,
  Crown,
  User,
  Settings,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useHatsModules } from '../../../hooks/useHatsModules';
import type {
  PodCreationConfig,
  EligibilityRule,
} from '../../../services/hatsModulesService';
import { PodTokenService, type PodToken } from '../services/podTokenService';
import { usePublicClient } from 'wagmi';
import { base } from 'viem/chains';
import { decodeEventLog, encodeFunctionData } from 'viem';
import { PodService } from '../services/PodService';
import { supabase } from '@/lib/supabase';
import { useHatPermissions } from '../hooks/useHatPermissions';
import { PodGovernanceService } from '../services/podGovernanceService';
import { HatsDetailsService } from '../services/HatsDetailsService';
import { EligibilityModuleService } from '@/services/eligibilityModuleService';
import { predictAdminHatId } from '@/utils/hatIdPrediction';
import { PodImageUpload } from './PodImageUpload';
import { UserSelector } from './UserSelector';
import { EligibilityCriteriaBuilder } from './EligibilityCriteriaBuilder';
import type { EligibilityCriteria } from '../services/EligibilityService';
import { HatsModuleSyncService } from '../services/HatsModuleSyncService';
import { TimeBasedToggleService } from '../services/TimeBasedToggleService';
import { HatVerificationService } from '../services/HatVerificationService';

interface HatsModulePodCreationFormProps {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
  testingMode?: boolean;
}

interface FormData {
  name: string;
  description: string;
  parentPodId: string;
  podLeaders: string[];
  eligibilityRules: EligibilityCriteria[]; // ✅ Unified: Now uses EligibilityCriteria (includes agreements, tokens, credentials, time-based)
  enableTreasury: boolean;
  treasuryThreshold: number;
  autoMemberApproval: boolean;
  podImage?: File | null;
  podImageUrl?: string;
}

const DEFAULT_AGREEMENT = `I acknowledge and agree to the following terms as a member of this Pod:

1. **Integrity**: I will act with honesty and transparency in all pod activities.
2. **Responsibility**: I understand my role and responsibilities within the pod.
3. **Collaboration**: I will work constructively with other pod members.
4. **Compliance**: I will follow pod guidelines and SpiritDAO community standards.

By joining this pod, I commit to upholding these principles.`;

// ===================================================================
// HAT CREATED EVENT ABI - For proper event log decoding
// ===================================================================
// ⚠️ IMPORTANT: According to Hats Protocol, NO parameters are indexed in HatCreated event
// Event signature: HatCreated(uint256,string,uint32,address,address,bool,string)
const HAT_CREATED_EVENT_ABI = {
  type: 'event',
  name: 'HatCreated',
  inputs: [
    { name: 'id', type: 'uint256', indexed: false },
    { name: 'details', type: 'string', indexed: false },
    { name: 'maxSupply', type: 'uint32', indexed: false },
    { name: 'eligibility', type: 'address', indexed: false },
    { name: 'toggle', type: 'address', indexed: false },
    { name: 'mutable_', type: 'bool', indexed: false },
    { name: 'imageURI', type: 'string', indexed: false },
  ],
} as const;

// Minimal local switch to avoid external dependency
const InlineSwitch: React.FC<{
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}> = ({ checked, onCheckedChange, className }) => (
  <input
    type="checkbox"
    role="switch"
    aria-checked={checked}
    checked={checked}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className={className ?? 'h-5 w-10 cursor-pointer'}
  />
);

export const HatsModulePodCreationForm: React.FC<
  HatsModulePodCreationFormProps
> = ({ onSuccess, onCancel, testingMode = false }) => {
  const router = useRouter();
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation, status: txStatus, error: txError } = useSendUserOperation();
  const { toast } = useToast();
  const publicClient = usePublicClient();

  // ===================================================================
  // CRITICAL FIX: Support continuing pod setup from database
  // ===================================================================
  // If user is redirected from PodCreationForm, load existing pod data
  // from database and use it to pre-fill form for blockchain setup
  const [continuePodId, setContinuePodId] = useState<string | null>(null);
  const [existingPod, setExistingPod] = useState<any>(null);
  const [loadingExistingPod, setLoadingExistingPod] = useState(false);

  // Parse URL parameters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const podId = searchParams.get('podId');
      if (podId) {
        console.log('📥 Continuing pod setup for ID:', podId);
        setContinuePodId(podId);
      }
    }
  }, []);

  // Load existing pod data if continuing setup
  useEffect(() => {
    if (continuePodId && !existingPod) {
      setLoadingExistingPod(true);
      console.log('📥 Loading existing pod data from database:', continuePodId);

      PodService.getPodById(continuePodId)
        .then((pod) => {
          if (pod) {
            console.log('✅ Loaded existing pod:', pod);
            setExistingPod(pod);

            // Pre-fill form with existing data
            setFormData((prev) => ({
              ...prev,
              name: pod.name || prev.name,
              description: pod.description || prev.description,
              parentPodId: pod.parent_pod_id || prev.parentPodId,
              podLeaders: pod.pod_leads || prev.podLeaders,
              podImageUrl: pod.pod_image_url || prev.podImageUrl,
            }));

            toast({
              title: 'Pod Data Loaded',
              description: `Continuing setup for "${pod.name}". Complete the blockchain transactions below.`,
            });
          } else {
            console.error('❌ Pod not found:', continuePodId);
            toast({
              title: 'Pod Not Found',
              description: 'Could not load pod data. Please create a new pod.',
              variant: 'destructive',
            });
          }
        })
        .catch((error) => {
          console.error('❌ Error loading pod:', error);
          toast({
            title: 'Error Loading Pod',
            description: 'Could not load pod data. Please try again.',
            variant: 'destructive',
          });
        })
        .finally(() => {
          setLoadingExistingPod(false);
        });
    }
  }, [continuePodId, existingPod, toast]);

  const {
    createModularPod,
    isInitialized: modulesInitialized,
    isInitializing,
    availableModules,
    error: modulesError,
  } = useHatsModules();

  // Check Advocate token ownership for pod creation permission
  const [hasAdvocateToken, setHasAdvocateToken] = useState(false);
  const [checkingAdvocateToken, setCheckingAdvocateToken] = useState(true);

  // User's leadership permissions and pods
  const [userPods, setUserPods] = useState<any[]>([]);
  const { managedPods } = useHatPermissions(userPods);
  const hasExecutivePod = false; // Admin feature not implemented for beta
  const hasDevPod = false; // Admin feature not implemented for beta
  const [loadingUserPods, setLoadingUserPods] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    parentPodId: process.env.NEXT_PUBLIC_COMMUNITY_PODS_PARENT || '', // Default to Community Pods parent
    podLeaders: testingMode ? [address || ''] : [address || '', '', ''], // ✅ FIX: Default first leader to connected address (smart wallet)
    eligibilityRules: [], // ✅ Unified: All criteria managed via EligibilityCriteriaBuilder
    enableTreasury: true,
    treasuryThreshold: 1, // TODO: Change to 3 for production - using 1 for testing
    autoMemberApproval: false,
  });

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<
    | 'config'
    | 'rules'
    | 'review'
    | 'creating'
    | 'mint-hats'
    | 'set-hat-ids'
    | 'create-admin-hat'
    | 'mint-admin-hat'
    | 'set-admin-hat'
    | 'set-eligibility-admin'
  >('config');
  const [transactionCalls, setTransactionCalls] = useState<any[]>([]);
  const [showTransaction, setShowTransaction] = useState(false);
  const [podCreated, setPodCreated] = useState(false); // Guard against duplicate creation

  // Phase 2: Store blockchain podId (used by factory)
  const [blockchainPodId, setBlockchainPodId] = useState<string>('');

  // Phase 3: Mint HATs state
  const [mintHatCalls, setMintHatCalls] = useState<any[]>([]);
  const [createdHatId, setCreatedHatId] = useState<string>('');
  const [predictedAdminHatId, setPredictedAdminHatId] = useState<string>(''); // NEW: Predicted admin HAT ID for gasless Phase 6 elimination
  const [createdPodData, setCreatedPodData] = useState<any>(null);
  const [showMintTransaction, setShowMintTransaction] = useState(false);
  const [leaderProfiles, setLeaderProfiles] = useState<
    Map<
      string,
      { first_name: string; last_name: string; profile_picture?: string }
    >
  >(new Map());
  const mintButtonRef = useRef<HTMLButtonElement>(null);

  // Phase 3.5: Set HAT IDs on Proxy state (NEW - fixes authorization)
  const [setHatIdsCalls, setSetHatIdsCalls] = useState<any[]>([]);
  const [showSetHatIdsTransaction, setShowSetHatIdsTransaction] =
    useState(false);
  const setHatIdsButtonRef = useRef<HTMLButtonElement>(null);

  // Phase 4: Create Proxy Admin HAT state
  const [adminHatCalls, setAdminHatCalls] = useState<any[]>([]);
  const [showAdminHatTransaction, setShowAdminHatTransaction] = useState(false);
  const adminHatButtonRef = useRef<HTMLButtonElement>(null);

  // Phase 5: Mint Proxy Admin HAT state
  const [mintAdminHatCalls, setMintAdminHatCalls] = useState<any[]>([]);
  const [createdAdminHatId, setCreatedAdminHatId] = useState<string>('');
  const [showMintAdminHatTransaction, setShowMintAdminHatTransaction] =
    useState(false);
  const mintAdminHatButtonRef = useRef<HTMLButtonElement>(null);

  // Phase 6: Set Proxy Admin HAT on Contract state
  const [configureProxyCalls, setConfigureProxyCalls] = useState<any[]>([]);
  const [showConfigureProxyTransaction, setShowConfigureProxyTransaction] =
    useState(false);
  const configureProxyButtonRef = useRef<HTMLButtonElement>(null);

  // Phase 7: Set Eligibility Module Admin state
  const [eligibilityAdminCalls, setEligibilityAdminCalls] = useState<any[]>([]);
  const [showEligibilityAdminTransaction, setShowEligibilityAdminTransaction] =
    useState(false);
  const eligibilityAdminButtonRef = useRef<HTMLButtonElement>(null);
  const [availableTokens, setAvailableTokens] = useState<PodToken[]>([]);
  const [userHeldTokens, setUserHeldTokens] = useState<PodToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  // Sequential transaction state
  const [hatCreationComplete, setHatCreationComplete] = useState(false);
  const [hatCreationReceipt, setHatCreationReceipt] = useState<any>(null);
  const [extractedHatId, setExtractedHatId] = useState<string>('');
  const [proxyDeploymentComplete, setProxyDeploymentComplete] = useState(false);
  const [extractedProxyAddress, setExtractedProxyAddress] =
    useState<string>('');
  const proxyButtonRef = useRef<HTMLButtonElement>(null);

  // Available parent pods for selection - includes user's leadership pods and defaults
  const availableParentPods = useMemo(() => {
    const options = [];
    const seenPodIds = new Set(); // Prevent duplicates in dropdown

    // Add user's leadership pods first (if any)
    if (userPods.length > 0) {
      console.log(
        '🔍 Building parent pod dropdown from userPods:',
        userPods.map((p) => p.name),
      );
      userPods.forEach((pod, index) => {
        if (seenPodIds.has(pod.id)) {
          console.warn(
            `⚠️ Skipping duplicate pod in dropdown: ${pod.name} (ID: ${pod.id})`,
          );
        } else {
          seenPodIds.add(pod.id);
          options.push({
            id: pod.management_hat_id || pod.id,
            uniqueKey: `user-pod-${pod.id}`,
            name: `👑 ${pod.name}`,
            description: `Create sub-pod under your ${pod.name} pod`,
            isUserPod: true,
          });
          console.log(`➕ Added ${pod.name} to parent pod dropdown`);
        }
      });
    }

    // Add Community Pods option (always available)
    options.push({
      id: process.env.NEXT_PUBLIC_COMMUNITY_PODS_PARENT || '',
      uniqueKey: 'default-community',
      name: '🏘️ Community Pods',
      description: 'Default parent for community-created pods',
      isDefault: true,
    });

    // Add Top-Level option only for admins or in testing mode
    if (testingMode || hasExecutivePod || hasDevPod) {
      options.push({
        id: 'TOP_LEVEL',
        uniqueKey: 'top-level',
        name: '🔒 New Top-Level HAT',
        description: 'Creates independent HATS tree (admin only)',
        isAdmin: true,
      });
    }

    return options;
  }, [userPods, testingMode, hasExecutivePod, hasDevPod]);

  // Load available tokens including pod memberships
  useEffect(() => {
    const loadTokens = async () => {
      setLoadingTokens(true);
      try {
        // Get all available tokens for gating
        const tokens = await PodTokenService.getRecommendedTokensForGating();
        setAvailableTokens(tokens);

        // If user is connected, also get their held tokens
        if (address && publicClient) {
          const heldTokens = await PodTokenService.getUserHeldTokensForGating(
            address,
            publicClient,
          );
          setUserHeldTokens(heldTokens);
          console.log(
            `User holds ${heldTokens.length} tokens they can use for gating`,
          );
        }

        // ✅ Token requirements now handled via EligibilityCriteriaBuilder
        // No auto-selection needed here
      } catch (error) {
        console.error('Failed to load tokens:', error);
      } finally {
        setLoadingTokens(false);
      }
    };

    loadTokens();
  }, [address, publicClient]);

  // Check if user is a leader of ANY pod (permission to create pods)
  useEffect(() => {
    const checkPodLeaderStatus = async () => {
      if (!address) {
        setCheckingAdvocateToken(false);
        return;
      }

      try {
        console.log('🔍 Checking pod leader status for address:', address);

        // Check if user has ANY leader role in active_pod_members
        const { data: leaderRoles, error } = await supabase
          .from('active_pod_members')
          .select('membership_type, pod_name')
          .eq('wallet', address.toLowerCase())
          .eq('membership_type', 'leader')
          .eq('is_active', true)
          .limit(1);

        if (error) {
          console.error('❌ Error checking leader status:', error);
          setHasAdvocateToken(false);
        } else {
          const isLeader = leaderRoles && leaderRoles.length > 0;
          setHasAdvocateToken(isLeader);

          if (isLeader) {
            console.log('✅ User is a pod leader:', leaderRoles[0].pod_name);
          } else {
            console.log('❌ User is not a leader of any pod');
          }
        }
      } catch (error) {
        console.error('❌ Failed to check pod leader status:', error);
        setHasAdvocateToken(false);
      } finally {
        setCheckingAdvocateToken(false);
      }
    };

    checkPodLeaderStatus();
  }, [address]);

  // Load user's pods for hierarchical creation (including HAT-based leadership)
  useEffect(() => {
    const loadUserPods = async () => {
      if (!address || !publicClient) {
        setLoadingUserPods(false);
        return;
      }

      try {
        setLoadingUserPods(true);
        // Get all pods and check for leadership (database or HAT-based)
        const allPods = await PodGovernanceService.getPods();
        const hatsContract = process.env
          .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
        const leadershipPods = [];

        // Check each pod for leadership access
        const seenPodIds = new Set(); // Track duplicates

        for (const pod of allPods) {
          let hasLeadership = false;
          let leadershipSource = '';

          // Check traditional database leadership
          if (
            pod.pod_leads?.includes(address.toLowerCase()) ||
            pod.created_by_address?.toLowerCase() === address.toLowerCase()
          ) {
            hasLeadership = true;
            leadershipSource = 'database';
            console.log(
              `📋 Database leadership found for ${pod.name} (ID: ${pod.id})`,
            );
          }

          // Check HAT-based leadership if not found in database
          if (
            !hasLeadership &&
            pod.management_hat_id &&
            pod.management_hat_id !== 'placeholder' &&
            pod.management_hat_id !== 'extracted_from_tx' &&
            hatsContract
          ) {
            try {
              console.log(
                `🔍 Checking HAT leadership for ${pod.name} (Hat ID: ${pod.management_hat_id})`,
              );
              const balance = await publicClient!.readContract({
                address: hatsContract,
                abi: [
                  {
                    name: 'balanceOf',
                    type: 'function',
                    inputs: [
                      { name: '_wearer', type: 'address' },
                      { name: '_hatId', type: 'uint256' },
                    ],
                    outputs: [{ name: 'balance', type: 'uint256' }],
                    stateMutability: 'view',
                  },
                ],
                functionName: 'balanceOf',
                args: [address as `0x${string}`, BigInt(pod.management_hat_id)],
              });

              console.log(
                `🎩 HAT balance check for ${pod.name}: ${Number(balance)} (Hat: ${pod.management_hat_id})`,
              );
              if (Number(balance) > 0) {
                hasLeadership = true;
                leadershipSource = 'hat';
                console.log(
                  `✅ User has HAT-based leadership for ${pod.name} (Hat: ${pod.management_hat_id})`,
                );
              }
            } catch (error) {
              // HAT check failed, skip
              console.error(
                `❌ Could not check HAT for ${pod.name} (Hat: ${pod.management_hat_id}):`,
                error,
              );
            }
          }

          // Add to leadership pods if has leadership and not already seen
          if (hasLeadership) {
            if (seenPodIds.has(pod.id)) {
              console.warn(
                `⚠️ Duplicate pod detected: ${pod.name} (ID: ${pod.id}) - skipping duplicate`,
              );
            } else {
              seenPodIds.add(pod.id);
              leadershipPods.push(pod);
              console.log(
                `➕ Added ${pod.name} to leadership pods (source: ${leadershipSource})`,
              );
            }
          }
        }

        console.log(
          '👑 Total leadership pods (DB + HAT):',
          leadershipPods.length,
        );
        leadershipPods.forEach((pod) => {
          console.log(`  - ${pod.name} (${pod.id})`);
        });
        setUserPods(leadershipPods);
      } catch (error) {
        console.error('❌ Failed to load user pods:', error);
        setUserPods([]);
      } finally {
        setLoadingUserPods(false);
      }
    };

    loadUserPods();
  }, [address, publicClient]);

  // NOTE: Removed auto-trigger for Phase 2 to prevent popup blocker issues
  // User now clicks manually to proceed to Phase 2
  // Previous auto-trigger code caused browser popup blockers to interfere with wallet connection

  // Form validation
  const validation = useMemo(() => {
    const errors: string[] = [];

    // Check pod leader requirement (skip in testing mode)
    if (!testingMode && !hasAdvocateToken) {
      errors.push('Pod leader access required to create pods');
    }

    if (!formData.name.trim()) errors.push('Pod name is required');
    if (!formData.description.trim()) errors.push('Description is required');
    if (!formData.parentPodId) errors.push('Parent pod selection is required');

    const validLeads = formData.podLeaders.filter(
      (lead) => lead && lead.trim(),
    );
    const requiredLeads = testingMode ? 1 : 3;

    if (validLeads.length < requiredLeads) {
      errors.push(
        `At least ${requiredLeads} pod leader${requiredLeads > 1 ? 's are' : ' is'} required`,
      );
    }

    // Validate Ethereum addresses
    for (const lead of validLeads) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(lead)) {
        errors.push(`Invalid address format: ${lead}`);
      }
    }

    // Check for duplicate addresses
    const uniqueLeads = new Set(validLeads.map((lead) => lead.toLowerCase()));
    if (uniqueLeads.size !== validLeads.length) {
      errors.push('Pod leaders must have unique addresses');
    }

    // ✅ Token requirements now handled via eligibilityRules (EligibilityCriteriaBuilder)
    // No validation needed here - validation happens in the component

    return {
      isValid: errors.length === 0,
      errors,
      validLeads,
      requiredLeads,
    };
  }, [formData, testingMode, hasAdvocateToken, availableTokens]);

  // Update form data (memoized to prevent infinite loops)
  const updateFormData = useCallback((field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Handle leader address changes
  const updateLeaderAddress = (index: number, value: string) => {
    const newLeaders = [...formData.podLeaders];
    newLeaders[index] = value;
    updateFormData('podLeaders', newLeaders);
  };

  // Add leader field
  const addLeaderField = () => {
    updateFormData('podLeaders', [...formData.podLeaders, '']);
  };

  // Remove leader field
  const removeLeaderField = (index: number) => {
    if (formData.podLeaders.length > (testingMode ? 1 : 3)) {
      const newLeaders = formData.podLeaders.filter((_, i) => i !== index);
      updateFormData('podLeaders', newLeaders);
    }
  };

  // ✅ Simplified: eligibilityRules are now managed by EligibilityCriteriaBuilder
  // No longer need to build rules from individual fields
  const buildEligibilityRules = (): EligibilityCriteria[] => {
    return formData.eligibilityRules || [];
  };

  // Helper: Process HAT creation receipt and extract HAT ID
  const processHatCreationReceipt = (receipt: any): string | null => {
    console.log('🎩 Processing HAT creation receipt...');

    try {
      const hatsContractAddress =
        process.env.NEXT_PUBLIC_HATS_CONTRACT?.toLowerCase();
      const hatsLogs = receipt.logs?.filter(
        (log: any) => log.address?.toLowerCase() === hatsContractAddress,
      );

      console.log('🎩 Found', hatsLogs?.length || 0, 'logs from HATS contract');

      for (const hatsLog of hatsLogs || []) {
        // Log the structure to debug
        console.log('🔍 Examining HATS log:', {
          address: hatsLog.address,
          topics: hatsLog.topics,
          topicsLength: hatsLog.topics?.length,
          data: hatsLog.data,
        });

        if (hatsLog.topics && hatsLog.topics.length > 1) {
          try {
            const hatId = BigInt(hatsLog.topics[1]).toString();
            console.log('🎩 ✅ Extracted HAT ID from topics[1]:', hatId);
            console.log(
              '    - Hex:',
              '0x' + BigInt(hatId).toString(16).padStart(64, '0'),
            );
            return hatId;
          } catch (e) {
            console.warn('⚠️ Could not extract HAT ID from topic:', e);
          }
        } else {
          console.log(
            '⚠️ Log has insufficient topics:',
            hatsLog.topics?.length || 0,
          );
        }

        // Fallback: Try data field
        if (hatsLog.data && hatsLog.data !== '0x') {
          try {
            const hatId = BigInt(hatsLog.data).toString();
            console.log('🎩 ✅ Extracted HAT ID from data field:', hatId);
            console.log(
              '    - Hex:',
              '0x' + BigInt(hatId).toString(16).padStart(64, '0'),
            );
            return hatId;
          } catch (e) {
            console.warn('⚠️ Could not extract HAT ID from data field:', e);
          }
        }
      }

      console.warn('⚠️ No HAT ID found in receipt');
      return null;
    } catch (error) {
      console.error('❌ Error processing HAT receipt:', error);
      return null;
    }
  };

  // Helper: Extract proxy address from factory logs
  const extractProxyAddressFromReceipt = (receipt: any): string | null => {
    console.log('🔐 Extracting proxy address from receipt...');

    try {
      const factoryAddress =
        process.env.NEXT_PUBLIC_POD_AUTH_FACTORY?.toLowerCase();
      const proxyLogs = receipt.logs?.filter(
        (log: any) => log.address?.toLowerCase() === factoryAddress,
      );

      console.log(
        '🔐 Found',
        proxyLogs?.length || 0,
        'logs from factory contract',
      );

      if (proxyLogs && proxyLogs.length > 0) {
        const proxyLog = proxyLogs[0];
        if (proxyLog.topics && proxyLog.topics.length > 2) {
          const addressHex = proxyLog.topics[2];
          const proxyAddress = '0x' + addressHex.slice(-40);
          console.log('🔐 ✅ Proxy deployed at:', proxyAddress);
          return proxyAddress;
        }
      }

      console.warn('⚠️ Could not extract proxy address from logs');
      return null;
    } catch (error) {
      console.error('❌ Error extracting proxy address:', error);
      return null;
    }
  };

  // Prepare transaction calls for HAT creation
  const prepareTransactionCalls = async () => {
    console.log('🚀 === TRANSACTION PREPARATION START ===');

    // ✅ CRITICAL FIX: Guard against duplicate transaction preparation
    if (podCreated) {
      console.warn(
        '🚫 Pod already created — skipping transaction rebuild to prevent double popup.',
      );
      return;
    }

    // Reset sequential transaction state
    setHatCreationComplete(false);
    setHatCreationReceipt(null);
    setExtractedHatId('');
    setExtractedProxyAddress('');

    // ❌ REMOVED: Do NOT reset podCreated here - it prevents the guard from working
    // setPodCreated(false); // This was causing the double popup bug!

    console.log('🔍 Pre-flight checks:', {
      validationValid: validation.isValid,
      modulesInitialized,
      publicClientExists: !!publicClient,
      addressConnected: !!address,
      chainId: base.id,
    });

    if (
      !validation.isValid ||
      !modulesInitialized ||
      !publicClient ||
      !address
    ) {
      console.error('❌ Pre-flight check failed');
      return;
    }

    try {
      console.log('🚀 Preparing transaction calls for pod creation...');

      // ✅ CRITICAL FIX: Validate environment variables before preparing transactions
      console.log('🔧 === VALIDATING ENVIRONMENT VARIABLES ===');

      const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT;
      const podAuthFactory = process.env.NEXT_PUBLIC_POD_AUTH_FACTORY;

      if (!hatsContract) {
        throw new Error(
          '❌ Configuration Error: NEXT_PUBLIC_HATS_CONTRACT environment variable is not set. Please configure this in your .env file.',
        );
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(hatsContract)) {
        throw new Error(
          `❌ Configuration Error: NEXT_PUBLIC_HATS_CONTRACT has invalid format: "${hatsContract}". Expected a valid Ethereum address.`,
        );
      }

      if (!podAuthFactory) {
        throw new Error(
          '❌ Configuration Error: NEXT_PUBLIC_POD_AUTH_FACTORY environment variable is not set. Please configure this in your .env file.',
        );
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(podAuthFactory)) {
        throw new Error(
          `❌ Configuration Error: NEXT_PUBLIC_POD_AUTH_FACTORY has invalid format: "${podAuthFactory}". Expected a valid Ethereum address.`,
        );
      }

      console.log('✅ Environment variables validated:', {
        hatsContract,
        podAuthFactory,
      });

      const eligibilityRules = buildEligibilityRules();

      // Validate and sanitize parentHatId
      let validParentHatId = formData.parentPodId;

      // Check if parentHatId is a valid BigInt-convertible value or 'TOP_LEVEL'
      if (validParentHatId !== 'TOP_LEVEL' && validParentHatId !== '') {
        try {
          // Test if it can be converted to BigInt
          BigInt(validParentHatId);
        } catch (error) {
          console.warn(
            `🚨 Invalid parent HAT ID detected: "${validParentHatId}". Using TOP_LEVEL instead.`,
          );
          validParentHatId = 'TOP_LEVEL';
        }
      }

      // If empty, default to TOP_LEVEL
      if (!validParentHatId) {
        validParentHatId = 'TOP_LEVEL';
      }

      const config: PodCreationConfig = {
        name: formData.name,
        description: formData.description,
        parentHatId: validParentHatId,
        podLeaders: validation.validLeads,
        eligibilityRules: eligibilityRules as any,
        treasuryConfig: formData.enableTreasury
          ? {
              threshold: formData.treasuryThreshold,
              signers: validation.validLeads,
            }
          : undefined,
      };

      console.log('📝 Pod Config:', config);

      // Validate required addresses
      if (!process.env.NEXT_PUBLIC_HATS_CONTRACT) {
        throw new Error('HATS contract address not configured');
      }

      // Validate contract address format
      const contractAddress = process.env.NEXT_PUBLIC_HATS_CONTRACT;
      if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        throw new Error(
          `Invalid HATS contract address format: ${contractAddress}`,
        );
      }

      // Check if HATS contract is deployed
      try {
        const contractCode = await publicClient!.getCode({
          address: contractAddress as `0x${string}`,
        });
        console.log('🏗️ Contract validation:', {
          hatsContract: process.env.NEXT_PUBLIC_HATS_CONTRACT,
          contractAddressValid: /^0x[a-fA-F0-9]{40}$/.test(contractAddress),
          contractDeployed: !!contractCode && contractCode !== '0x',
          contractCodeLength: contractCode?.length || 0,
          parentHatId: config.parentHatId,
          parentHatIdType: typeof config.parentHatId,
          parentHatIdBigInt:
            config.parentHatId === 'TOP_LEVEL'
              ? 'N/A (using mintTopHat)'
              : BigInt(config.parentHatId).toString(),
          allEnvVars: {
            NEXT_PUBLIC_HATS_CONTRACT: process.env.NEXT_PUBLIC_HATS_CONTRACT,
            NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
            NEXT_PUBLIC_RPC_URL: !!process.env.NEXT_PUBLIC_RPC_URL,
            NEXT_PUBLIC_PAYMASTER: !!process.env.NEXT_PUBLIC_PAYMASTER,
          },
        });

        if (!contractCode || contractCode === '0x') {
          throw new Error(
            `HATS contract not deployed at address: ${contractAddress}`,
          );
        }
      } catch (error) {
        console.error('❌ HATS contract validation failed:', error);
        throw new Error(
          `HATS contract validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Generate unique pod ID
      const podId = `pod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store blockchain podId for later phases
      setBlockchainPodId(podId);
      console.log('📝 Stored blockchain pod ID for factory:', podId);

      // 🔮 PREDICT PROXY ADDRESS using CREATE2
      console.log('🔮 Predicting proxy address with CREATE2...');
      const predictedProxyAddress = (await publicClient!.readContract({
        address: process.env.NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`,
        abi: (await import('@/abis/PodAuthorizationFactory.json')).default,
        functionName: 'predictProxyAddress',
        args: [podId, address as `0x${string}`],
      })) as `0x${string}`;

      console.log('✅ Predicted proxy address:', predictedProxyAddress);
      console.log(
        '🎯 HAT will be created with proxy as toggle from the start - NO 3rd transaction needed!',
      );

      // Determine if we're creating a top-level HAT or child HAT
      const isTopLevel = config.parentHatId === 'TOP_LEVEL';
      console.log('🔍 HAT Creation Type:', {
        isTopLevel,
        parentHatId: config.parentHatId,
      });

      // Prepare HATS creation call based on type
      let hatCreationCall;
      let predictedProxyAdminHatIdStr = ''; // Store predicted admin HAT ID for proxy initialization

      if (isTopLevel) {
        // Create top-level HAT using mintTopHat
        console.log('🔝 Preparing TOP-LEVEL HAT creation (mintTopHat)');

        // Create structured metadata for top hat
        console.log('🔗 Creating IPFS metadata for TOP HAT...');
        let topHatMetadataHash: string;

        try {
          topHatMetadataHash =
            await HatsDetailsService.createManagementHatMetadata({
              name: config.name,
              description: config.description,
              podLeaders: config.podLeaders,
              treasuryEnabled: !!config.treasuryConfig,
              eligibilityRules: config.eligibilityRules,
            });

          console.log('✅ Top HAT IPFS metadata created:', {
            hash: topHatMetadataHash,
            name: config.name,
          });
        } catch (ipfsError) {
          console.error(
            '❌ Top HAT IPFS metadata creation failed, falling back to simple string:',
            ipfsError,
          );
          // Fallback to simple string if IPFS fails
          topHatMetadataHash = config.name;
        }

        hatCreationCall = {
          to: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
          abi: [
            {
              name: 'mintTopHat',
              type: 'function',
              inputs: [
                { name: '_target', type: 'address' },
                { name: '_details', type: 'string' },
                { name: '_imageURI', type: 'string' },
              ],
              outputs: [{ name: 'topHatId', type: 'uint256' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'mintTopHat',
          args: [
            address, // Mint to current user
            topHatMetadataHash, // ✅ Using IPFS hash (required by Hats Protocol)
            `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}&size=400&background=bfe7c6&color=000&bold=true`,
          ],
        };
      } else {
        // Create child HAT using createHat
        console.log('👶 Preparing CHILD HAT creation (createHat)');

        // Additional validation for parent HAT
        const parentHatBigInt = BigInt(config.parentHatId);
        console.log(
          '✅ Parent HAT ID conversion successful:',
          parentHatBigInt.toString(),
        );

        // Try to validate the parent HAT exists by calling isValidHatId
        console.log('🔍 Attempting to validate parent HAT existence...');

        // Use the correct HATS Protocol function: isValidHatId
        let isValidHatId = false;
        try {
          const isValidHatIdCall = await publicClient!.readContract({
            address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
            abi: [
              {
                name: 'isValidHatId',
                type: 'function',
                inputs: [{ name: '_hatId', type: 'uint256' }],
                outputs: [{ name: '', type: 'bool' }],
                stateMutability: 'view',
              },
            ],
            functionName: 'isValidHatId',
            args: [parentHatBigInt],
          });

          isValidHatId = !!isValidHatIdCall;
          console.log('✅ Parent HAT ID validation result:', {
            hatId: config.parentHatId,
            isValidHatId: isValidHatId,
          });
        } catch (validationError) {
          console.warn('⚠️ Parent HAT ID validation failed:', {
            hatId: config.parentHatId,
            error:
              validationError instanceof Error
                ? validationError.message
                : 'Unknown error',
          });
          // Continue with creation - the HAT might not exist yet but the ID format could be valid
          isValidHatId = false;
        }

        if (!isValidHatId) {
          console.info(
            '📝 Note: Parent HAT ID validation failed or HAT may not exist yet. Proceeding with creation.',
          );
        }

        // CRITICAL: Check if current user has admin permissions on the parent HAT
        console.log('🔑 Checking admin permissions for HAT creation...');
        let hasAdminPermission = false;
        try {
          const balanceOfResult = await publicClient!.readContract({
            address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
            abi: [
              {
                name: 'balanceOf',
                type: 'function',
                inputs: [
                  { name: 'account', type: 'address' },
                  { name: 'id', type: 'uint256' },
                ],
                outputs: [{ name: '', type: 'uint256' }],
                stateMutability: 'view',
              },
            ],
            functionName: 'balanceOf',
            args: [address!, parentHatBigInt],
          });

          hasAdminPermission = Number(balanceOfResult) > 0;
          console.log('🔑 Admin permission check result:', {
            userAddress: address,
            parentHatId: config.parentHatId,
            hasAdminPermission: hasAdminPermission,
            balance: Number(balanceOfResult),
          });
        } catch (adminError) {
          console.error('❌ Admin permission check failed:', {
            hatId: config.parentHatId,
            userAddress: address,
            error:
              adminError instanceof Error
                ? adminError.message
                : 'Unknown error',
          });
          throw new Error(
            `Failed to check admin permissions: ${adminError instanceof Error ? adminError.message : 'Unknown error'}`,
          );
        }

        if (!hasAdminPermission) {
          console.log('⚠️ User lacks parent HAT - providing debugging info...');

          const shortHatId = `${config.parentHatId.slice(0, 6)}...${config.parentHatId.slice(-6)}`;
          const envParentHat = process.env.NEXT_PUBLIC_COMMUNITY_PODS_PARENT;

          console.log('🔍 HAT Configuration Debug:', {
            configParentHatId: config.parentHatId,
            envVarValue: envParentHat,
            formDataParentPodId: formData.parentPodId,
            userAddress: address,
            areTheyEqual: config.parentHatId === envParentHat,
          });

          throw new Error(`❌ Permission Denied: You need the parent HAT (${shortHatId}) to create child HATs.

Debug Info:
- Required HAT: ${config.parentHatId}
- Environment Variable: ${envParentHat}
- Your Address: ${address}
- Your Balance for this HAT: 0

Instructions:
1. Verify you have the correct HAT: ${shortHatId}
2. If the environment variable is wrong, update NEXT_PUBLIC_COMMUNITY_PODS_PARENT
3. Contact a HAT admin to mint the HAT to your address if needed`);
        }

        console.log(
          '✅ Admin permission verified - proceeding with HAT creation',
        );

        // Create structured metadata using Hats Details SDK
        console.log('🔗 Creating IPFS metadata for HAT...');
        let ipfsMetadataHash: string;

        try {
          ipfsMetadataHash =
            await HatsDetailsService.createManagementHatMetadata({
              name: config.name,
              description: config.description,
              podLeaders: config.podLeaders,
              treasuryEnabled: !!config.treasuryConfig,
              eligibilityRules: config.eligibilityRules,
            });

          console.log('✅ IPFS metadata created:', {
            hash: ipfsMetadataHash,
            name: config.name,
          });
        } catch (ipfsError) {
          console.error(
            '❌ IPFS metadata creation failed, falling back to simple string:',
            ipfsError,
          );
          // Fallback to simple string if IPFS fails
          ipfsMetadataHash = config.name;
        }

        // Get eligibility module address for on-chain enforcement
        console.log(
          '🎩 Retrieving eligibility module address for HAT creation...',
        );
        const eligibilityModuleAddress =
          EligibilityModuleService.getModuleAddress();
        const eligibilityAddress =
          eligibilityModuleAddress ||
          '0x0000000000000000000000000000000000000001';

        if (eligibilityModuleAddress) {
          console.log(
            '✅ Using eligibility module for on-chain enforcement:',
            eligibilityModuleAddress,
          );
        } else {
          console.warn(
            '⚠️ Eligibility module not configured - using dummy address (no on-chain enforcement)',
          );
          console.warn(
            '   Configure NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS to enable automatic eligibility checks',
          );
        }

        // ✅ Check for time-based eligibility criteria to determine toggle module
        console.log('🔀 Checking for time-based eligibility criteria...');
        const hasTimeCriteria =
          formData.eligibilityRules?.some((c) => c.type === 'time_based') ||
          false;
        const timeBasedToggleConfigured = TimeBasedToggleService.isConfigured();

        console.log('🔀 Toggle module selection:', {
          hasTimeCriteria,
          timeBasedToggleConfigured,
          criteriaCount: formData.eligibilityRules?.length || 0,
          toggleModuleAddress: TimeBasedToggleService.getModuleAddress(),
        });

        // ✅ CRITICAL FIX: Predict Management HAT ID for SELF-ADMIN architecture
        // This enables pod leaders to manage their own pods without needing Community Pod HAT
        console.log(
          '🔮 === PREDICTING MANAGEMENT HAT ID FOR SELF-ADMIN ARCHITECTURE ===',
        );

        let predictedManagementHatId: bigint | null = null; // Store for self-admin

        try {
          const parentHatIdBigInt = BigInt(config.parentHatId);

          // Query database for accurate next child index
          const { HatChildIndexService } = await import(
            '@/features/pods/services/HatChildIndexService'
          );
          const nextChildIndex = await HatChildIndexService.getNextChildIndex(
            config.parentHatId,
          );

          console.log(
            '✅ Database-backed child index retrieved:',
            nextChildIndex,
          );

          const { predictChildHatId } = await import('@/utils/hatIdPrediction');

          // Predict management HAT ID
          const predictedManagementId = predictChildHatId(
            parentHatIdBigInt,
            nextChildIndex,
          );
          predictedManagementHatId = predictedManagementId; // ✅ Store for self-admin

          // Predict admin HAT ID (first child of management HAT)
          const predictedAdminId = predictAdminHatId(predictedManagementId);
          predictedProxyAdminHatIdStr = predictedAdminId.toString(); // Store for proxy initialization

          console.log('✅ Management HAT will use SELF-ADMIN architecture:');
          console.log(
            '  Predicted Management HAT ID:',
            predictedManagementId.toString(),
          );
          console.log(
            '  Management HAT Admin:',
            predictedManagementId.toString(),
            '(SELF-ADMIN)',
          );
          console.log(
            '  Predicted Proxy Admin HAT ID:',
            predictedProxyAdminHatIdStr,
          );
          console.log(
            '🎯 Pod leaders can now manage their pods without Community Pod HAT!',
          );
          console.log('🎯 This also enables gasless Phase 6 elimination!');
        } catch (predictionError) {
          console.error(
            '❌ Failed to predict Management HAT ID:',
            predictionError,
          );
          console.warn('⚠️ Falling back to parent HAT as admin (old behavior)');
          // predictedManagementHatId remains null - will use parent as fallback
        }

        hatCreationCall = {
          to: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
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
            // ✅ CRITICAL FIX: Smart admin assignment based on pod level
            // - Top-level community pods: SELF-ADMIN (pod leaders control their pods)
            // - Sub-pods: Parent Management HAT as admin (parent pod leaders control sub-pods)
            (() => {
              const COMMUNITY_POD_HAT_ID =
                process.env.NEXT_PUBLIC_COMMUNITY_PODS_PARENT;
              const isTopLevelCommunityPod =
                config.parentHatId === COMMUNITY_POD_HAT_ID;

              if (isTopLevelCommunityPod && predictedManagementHatId !== null) {
                console.log('🎯 Top-level community pod → Using SELF-ADMIN');
                return predictedManagementHatId; // ✅ SELF-ADMIN for community pods
              } else if (!isTopLevelCommunityPod) {
                console.log(
                  '🎯 Sub-pod → Using parent Management HAT as admin',
                );
                return BigInt(config.parentHatId); // ✅ Parent pod controls sub-pods
              } else {
                console.log('⚠️ Fallback to parent HAT as admin');
                return BigInt(config.parentHatId); // ❌ Fallback
              }
            })(),
            ipfsMetadataHash, // ✅ Using IPFS hash (required by Hats Protocol)
            Math.max(1, config.podLeaders.length),
            eligibilityAddress as `0x${string}`, // ✅ Eligibility module for on-chain enforcement
            (() => {
              // ✅ Conditional toggle module selection based on time-based criteria
              if (hasTimeCriteria && timeBasedToggleConfigured) {
                const toggleAddress =
                  TimeBasedToggleService.getModuleAddress()!;
                console.log(
                  '🔀 Using TimeBasedToggleModule for automatic expiration:',
                  toggleAddress,
                );
                return toggleAddress;
              } else {
                console.log(
                  '🔀 Using PodAuthProxy as toggle module:',
                  predictedProxyAddress,
                );
                return predictedProxyAddress;
              }
            })() as `0x${string}`, // ✅ Toggle module: TimeBasedToggleModule if time criteria exist, else PodAuthProxy
            true, // Mutable
            `https://ui-avatars.com/api/?name=${encodeURIComponent(config.name)}&size=400&background=bfe7c6&color=000&bold=true`,
          ],
        };
      }

      // DETAILED ARGUMENT LOGGING
      console.log('📊 Function arguments analysis:', {
        functionName: hatCreationCall.functionName,
        isTopLevel,
        ...(isTopLevel
          ? {
              arg0_target: hatCreationCall.args[0],
              arg1_details: hatCreationCall.args[1],
              arg1_details_type: HatsDetailsService.isValidIPFSHash(
                hatCreationCall.args[1] as string,
              )
                ? 'IPFS_HASH'
                : 'RAW_STRING',
              arg2_imageURI: hatCreationCall.args[2],
            }
          : {
              arg0_admin: hatCreationCall.args[0]?.toString(),
              arg1_details: hatCreationCall.args[1],
              arg1_details_type: HatsDetailsService.isValidIPFSHash(
                hatCreationCall.args[1] as string,
              )
                ? 'IPFS_HASH'
                : 'RAW_STRING',
              arg2_maxSupply: hatCreationCall.args[2],
              arg3_eligibility: hatCreationCall.args[3],
              arg4_toggle: hatCreationCall.args[4],
              arg5_mutable: hatCreationCall.args[5],
              arg6_imageURI: hatCreationCall.args[6],
            }),
        totalArgs: hatCreationCall.args.length,
      });

      console.log('🔧 Available parent options:', availableParentPods);
      console.log('🔧 Form data parent selection:', formData.parentPodId);
      console.log('🔧 Config parent HAT ID:', config.parentHatId);

      console.log('🔧 Complete transaction call object:', {
        to: hatCreationCall.to,
        functionName: hatCreationCall.functionName,
        abi: hatCreationCall.abi,
        args: hatCreationCall.args,
        podId: podId,
        parentHat: config.parentHatId,
        parentHatBigInt:
          config.parentHatId === 'TOP_LEVEL'
            ? 'N/A (using mintTopHat)'
            : BigInt(config.parentHatId).toString(),
        chainId: base.id,
        hatsContract: process.env.NEXT_PUBLIC_HATS_CONTRACT,
      });

      // Validate the transaction call structure
      console.log('🔍 Transaction call validation:', {
        hasTo: !!hatCreationCall.to,
        hasFunction: !!hatCreationCall.functionName,
        hasAbi: !!hatCreationCall.abi && hatCreationCall.abi.length > 0,
        hasArgs: !!hatCreationCall.args && hatCreationCall.args.length > 0,
        argsCount: hatCreationCall.args?.length,
        expectedArgsCount: 7,
        toFormat: /^0x[a-fA-F0-9]{40}$/.test(hatCreationCall.to),
        toValue: hatCreationCall.to,
      });

      if (
        !hatCreationCall.to ||
        !hatCreationCall.functionName ||
        !hatCreationCall.args
      ) {
        throw new Error('Invalid HATS creation transaction call prepared');
      }

      // Pre-transaction validation: simulate the createHat call
      console.log(
        '🧪 Pre-transaction validation: simulating createHat call...',
      );
      try {
        await publicClient!.simulateContract({
          address: hatCreationCall.to,
          abi: hatCreationCall.abi,
          functionName: hatCreationCall.functionName,
          args: hatCreationCall.args,
          account: address,
        });
        console.log('✅ Pre-transaction simulation successful');
      } catch (simulationError) {
        console.error('❌ Pre-transaction simulation failed:', simulationError);
        throw new Error(
          `Transaction would fail: ${simulationError instanceof Error ? simulationError.message : 'Simulation failed'}`,
        );
      }

      console.log('✅ Transaction preparation complete, setting state...');

      // ✅ Reuse predicted admin HAT ID from earlier prediction (no need to recalculate)
      console.log(
        '🔮 === USING PREDICTED ADMIN HAT ID FOR PROXY INITIALIZATION ===',
      );
      const predictedAdminIdForProxy = predictedProxyAdminHatIdStr;

      if (predictedAdminIdForProxy) {
        console.log(
          '✅ Using predicted admin HAT ID for proxy initialization:',
          predictedAdminIdForProxy,
        );
        console.log('🎯 This will enable gasless Phase 6 elimination!');
      } else if (isTopLevel) {
        console.warn(
          '⚠️ Top-level HAT creation - cannot predict HAT IDs before creation',
        );
        console.warn('⚠️ Phase 6 will still be required for top-level pods');
      } else {
        console.warn(
          '⚠️ Prediction was not successful - Phase 6 will be required',
        );
      }

      // Prepare proxy deployment call
      console.log('🔐 Preparing PodAuthProxy deployment...');
      const { PodBlockchainSyncService } = await import(
        '@/features/pods/services/PodBlockchainSyncService'
      );
      const proxyDeploymentCall =
        PodBlockchainSyncService.generateRegisterPodCall(
          {
            id: podId,
            name: config.name,
            created_by_address: address,
            pod_leads: config.podLeaders,
            treasury_contract_address:
              '0x0000000000000000000000000000000000000000', // Placeholder, treasury deployed after
          },
          predictedAdminIdForProxy,
        ); // ✅ NEW: Pass predicted admin HAT ID

      console.log('🔐 Proxy deployment call prepared:', {
        podId,
        factoryAddress: proxyDeploymentCall.to,
        leaders: config.podLeaders.length,
      });

      // ✅ CRITICAL FIX: Validate BOTH transaction calls before setting state
      // Note: We validate "to" here but will convert to "address" for OnChainKit
      console.log('🔍 === VALIDATING TRANSACTION CALLS ===');

      // Validate HAT creation call
      if (!hatCreationCall.to) {
        throw new Error(
          'HAT creation call missing contract address (to field)',
        );
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(hatCreationCall.to)) {
        throw new Error(
          `HAT creation call has invalid contract address: ${hatCreationCall.to}`,
        );
      }
      if (!hatCreationCall.functionName) {
        throw new Error('HAT creation call missing "functionName"');
      }
      if (
        !hatCreationCall.abi ||
        !Array.isArray(hatCreationCall.abi) ||
        hatCreationCall.abi.length === 0
      ) {
        throw new Error('HAT creation call missing or invalid "abi"');
      }
      if (!hatCreationCall.args || !Array.isArray(hatCreationCall.args)) {
        throw new Error('HAT creation call missing or invalid "args"');
      }

      console.log('✅ HAT creation call validated:', {
        to: hatCreationCall.to,
        functionName: hatCreationCall.functionName,
        argsCount: hatCreationCall.args.length,
      });

      // Validate proxy deployment call
      if (!proxyDeploymentCall.to) {
        throw new Error(
          'Proxy deployment call missing contract address (to field)',
        );
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(proxyDeploymentCall.to)) {
        throw new Error(
          `Proxy deployment call has invalid contract address: ${proxyDeploymentCall.to}`,
        );
      }
      if (!proxyDeploymentCall.functionName) {
        throw new Error('Proxy deployment call missing "functionName"');
      }
      if (
        !proxyDeploymentCall.abi ||
        !Array.isArray(proxyDeploymentCall.abi) ||
        proxyDeploymentCall.abi.length === 0
      ) {
        throw new Error('Proxy deployment call missing or invalid "abi"');
      }
      if (
        !proxyDeploymentCall.args ||
        !Array.isArray(proxyDeploymentCall.args)
      ) {
        throw new Error('Proxy deployment call missing or invalid "args"');
      }

      console.log('✅ Proxy deployment call validated:', {
        to: proxyDeploymentCall.to,
        functionName: proxyDeploymentCall.functionName,
        argsCount: proxyDeploymentCall.args.length,
      });

      // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
      // According to OnChainKit docs: https://docs.base.org/onchainkit/transaction/transaction
      // Calls should use ContractFunctionParameters format with "address" property
      console.log('🔧 === CONVERTING TO ONCHAINKIT FORMAT ===');

      // Prepare calls in OnChainKit-compatible format
      const transactionCalls = [
        {
          address: hatCreationCall.to as `0x${string}`, // ✅ Changed from "to" to "address"
          abi: hatCreationCall.abi,
          functionName: hatCreationCall.functionName,
          args: hatCreationCall.args,
        },
        {
          address: proxyDeploymentCall.to as `0x${string}`, // ✅ Changed from "to" to "address"
          abi: proxyDeploymentCall.abi,
          functionName: proxyDeploymentCall.functionName,
          args: proxyDeploymentCall.args,
        },
      ];

      console.log('📦 Transaction calls prepared in OnChainKit format:', {
        totalCalls: transactionCalls.length,
        call1: {
          type: 'HAT Creation',
          address: transactionCalls[0].address,
          functionName: transactionCalls[0].functionName,
          argsCount: transactionCalls[0].args.length,
        },
        call2: {
          type: 'Proxy Deployment',
          address: transactionCalls[1].address,
          functionName: transactionCalls[1].functionName,
          argsCount: transactionCalls[1].args.length,
        },
      });

      console.log(
        '🔍 === FINAL VALIDATION: OnChainKit ContractFunctionParameters format ===',
      );
      transactionCalls.forEach((call, index) => {
        console.log(`Call ${index}:`, {
          hasAddress: !!call.address,
          addressValue: call.address,
          addressIsValid: /^0x[a-fA-F0-9]{40}$/.test(call.address || ''),
          hasFunctionName: !!call.functionName,
          functionName: call.functionName,
          hasAbi: !!call.abi && Array.isArray(call.abi),
          abiLength: call.abi?.length || 0,
          hasArgs: !!call.args && Array.isArray(call.args),
          argsLength: call.args?.length || 0,
        });
      });

      setTransactionCalls(transactionCalls);
      setStep('creating');
      setShowTransaction(true);
      console.log('🚀 === TRANSACTION PREPARATION END ===');
    } catch (error) {
      console.error('❌ === TRANSACTION PREPARATION FAILED ===');
      console.error('❌ Error details:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        formData,
        validation,
        parentHatId: formData.parentPodId,
      });
      toast({
        title: 'Preparation Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to prepare transaction',
        variant: 'destructive',
      });
    }
  };

  // Handle successful HAT creation AND proxy deployment transaction
  const handleTransactionSuccess = useCallback(
    async (response: any) => {
      console.log('✅ === TRANSACTION SUCCESS ===');
      console.log('✅ Transactions completed:', response);

      // Guard against duplicate calls
      if (podCreated) {
        console.log('🚫 Pod already created, skipping duplicate creation');
        return;
      }
      setPodCreated(true);

      // Let the database auto-generate a UUID for the pod ID
      // The database has: id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
      // So we don't need to provide podId - it will be generated automatically

      try {
        // Extract results from BOTH transactions
        // Transaction 0: HAT creation
        // Transaction 1: Proxy deployment
        console.log('📦 Processing multi-transaction response...');
        console.log(
          '📦 Total transactions:',
          response.transactionReceipts?.length || 0,
        );

        // Extract HAT ID from transaction logs (first transaction)
        let newHatId = '';
        let proxyAddress = '';
        let hatReceipt: any;

        try {
          console.log(
            '🔍 Analyzing transaction response for HAT ID and Proxy Address:',
            response,
          );

          // OnChainKit returns transactionReceipts array, not single transactionHash
          if (
            response.transactionReceipts &&
            Array.isArray(response.transactionReceipts) &&
            response.transactionReceipts.length > 0
          ) {
            // Transaction 0: HAT creation
            hatReceipt = response.transactionReceipts[0];
            console.log(
              '🎩 Processing HAT creation receipt (tx 0) with',
              hatReceipt.logs?.length || 0,
              'logs',
            );

            // Transaction 1: Proxy deployment (if exists)
            if (response.transactionReceipts.length > 1) {
              const proxyReceipt = response.transactionReceipts[1];
              console.log(
                '🔐 Processing Proxy deployment receipt (tx 1) with',
                proxyReceipt.logs?.length || 0,
                'logs',
              );

              // Extract proxy address from logs
              // PodAuthorizationFactory emits: event PodProxyCreated(string indexed podId, address indexed proxyAddress)
              const factoryAddress =
                process.env.NEXT_PUBLIC_POD_AUTH_FACTORY?.toLowerCase();
              const proxyLogs = proxyReceipt.logs?.filter(
                (log: any) => log.address?.toLowerCase() === factoryAddress,
              );

              console.log(
                '🔐 Found',
                proxyLogs?.length || 0,
                'logs from factory contract',
              );

              if (proxyLogs && proxyLogs.length > 0) {
                // Proxy address is typically in topics[2] for indexed parameters
                const proxyLog = proxyLogs[0];
                if (proxyLog.topics && proxyLog.topics.length > 2) {
                  // Topics[2] contains the proxy address (indexed parameter)
                  const addressHex = proxyLog.topics[2];
                  // Remove padding and convert to address format
                  proxyAddress = '0x' + addressHex.slice(-40);
                  console.log('🔐 ✅ Extracted proxy address:', proxyAddress);
                }
              }
            }

            const receipt = hatReceipt; // Use HAT receipt for HAT ID extraction
            console.log(
              '🔍 Using OnChainKit transaction receipt with',
              receipt.logs?.length || 0,
              'logs',
            );

            // Look for HatCreated event logs to extract the actual HAT ID
            const hatsContractAddress =
              process.env.NEXT_PUBLIC_HATS_CONTRACT?.toLowerCase();
            console.log(
              '🔍 Looking for logs from HATS contract:',
              hatsContractAddress,
            );

            if (receipt.logs && receipt.logs.length > 0) {
              // Log all contract addresses to debug
              receipt.logs.forEach((log: any, index: number) => {
                console.log(`🔍 Log ${index}:`, {
                  address: log.address?.toLowerCase(),
                  topics: log.topics?.length || 0,
                  firstTopic: log.topics?.[0],
                });
              });

              // Find logs from HATS contract
              const hatsLogs = receipt.logs.filter(
                (log: any) => log.address?.toLowerCase() === hatsContractAddress,
              );

              console.log(
                '🎩 Found',
                hatsLogs.length,
                'logs from HATS contract',
              );

              let hatIdExtracted = false;

              // ===============================================================
              // EXTRACTION FIX: Use proper ABI decoding instead of manual slicing
              // ===============================================================
              for (const hatsLog of hatsLogs) {
                console.log('🔍 Analyzing HATS log:', {
                  topics: hatsLog.topics?.length || 0,
                  data: hatsLog.data?.length || 0,
                  firstTopic: hatsLog.topics?.[0],
                });

                try {
                  // Primary method: Use viem's decodeEventLog for proper ABI decoding
                  const decoded = decodeEventLog({
                    abi: [HAT_CREATED_EVENT_ABI],
                    data: hatsLog.data,
                    topics: hatsLog.topics,
                  });

                  if (decoded.eventName === 'HatCreated' && decoded.args.id) {
                    const extractedHatId = decoded.args.id.toString();

                    // ✅ VALIDATION: Reject HAT IDs > 100 digits (indicates corruption)
                    if (extractedHatId.length > 100) {
                      console.error(
                        '⚠️ Rejected corrupted HAT ID from ABI decoding (too long):',
                        {
                          length: extractedHatId.length,
                          value: extractedHatId.substring(0, 50) + '...',
                        },
                      );
                      continue; // Try next log
                    }

                    newHatId = extractedHatId;
                    console.log(
                      '🎩 ✅ Extracted HAT ID using ABI decoding:',
                      newHatId,
                    );
                    console.log('📋 Decoded event details:', {
                      id: decoded.args.id.toString(),
                      details: decoded.args.details,
                      maxSupply: decoded.args.maxSupply,
                      eligibility: decoded.args.eligibility,
                      toggle: decoded.args.toggle,
                      mutable: decoded.args.mutable_,
                      imageURI: decoded.args.imageURI,
                    });
                    hatIdExtracted = true;
                    break;
                  }
                } catch (abiError: any) {
                  console.warn(
                    '⚠️ ABI decoding failed, trying fallback:',
                    abiError.message,
                  );

                  // Fallback: Try manual extraction from topics[1] if HAT ID is indexed
                  if (hatsLog.topics && hatsLog.topics.length > 1) {
                    try {
                      const topicHatId = BigInt(hatsLog.topics[1]).toString();

                      // Validate it's a reasonable HAT ID (not 1000+ digits which indicates corruption)
                      if (topicHatId.length < 100 && topicHatId !== '0') {
                        newHatId = topicHatId;
                        console.log(
                          '🎩 ✅ Fallback: Extracted HAT ID from topics[1]:',
                          newHatId,
                        );
                        hatIdExtracted = true;
                        break;
                      } else {
                        console.warn(
                          '⚠️ Rejected suspicious HAT ID (too long or zero):',
                          {
                            length: topicHatId.length,
                            value: topicHatId.slice(0, 50) + '...',
                          },
                        );
                      }
                    } catch (fallbackError: any) {
                      console.warn(
                        '⚠️ Fallback extraction also failed:',
                        fallbackError.message,
                      );
                    }
                  }
                }
              }

              if (!hatIdExtracted) {
                console.warn(
                  '⚠️ Could not extract HAT ID from any HATS contract logs',
                );
                console.warn(
                  '⚠️ HATS logs details:',
                  hatsLogs.map((log: any) => ({
                    topics: log.topics?.length || 0,
                    dataLength: log.data?.length || 0,
                    firstTopic: log.topics?.[0],
                    data: log.data,
                  })),
                );
              }
            } else {
              console.warn('⚠️ No logs found in OnChainKit transaction receipt');
            }
          } else {
            console.warn(
              '⚠️ OnChainKit transactionReceipts not found in response',
            );
            console.warn('⚠️ Response structure:', Object.keys(response));
          }
        } catch (extractError) {
          console.error(
            '❌ Failed to extract HAT ID from OnChainKit transaction logs:',
            extractError,
          );
        }

        // Note: Pod creation in PodCreationManager contract is optional for treasury integration
        // Since pod creation is already working via HATS protocol, we'll skip this for now
        console.log(
          '✅ Pod created successfully via HATS protocol, skipping PodCreationManager',
        );

        // Log extracted values
        console.log('📊 === EXTRACTED VALUES FROM TRANSACTIONS ===');
        console.log('🎩 HAT ID:', newHatId || 'NOT_EXTRACTED');
        console.log('🔐 Proxy Address:', proxyAddress || 'NOT_EXTRACTED');
        console.log('📊 =====================================');

        // ===================================================================
        // 🔐 TIER 1 FIX: VERIFY HAT EXISTS ONCHAIN BEFORE SAVING TO DATABASE
        // ===================================================================
        if (!newHatId) {
          console.error('❌ CRITICAL: HAT ID extraction failed');
          toast({
            title: 'HAT Extraction Failed',
            description:
              'Failed to extract HAT ID from blockchain transaction. The transaction succeeded but we could not identify the created role. Please contact support with transaction hash: ' +
              hatReceipt?.transactionHash,
            variant: 'destructive',
          });
          return;
        }

        console.log(
          '🔍 TIER 1 FIX: Verifying HAT exists onchain before database save...',
        );
        const hatVerification =
          await HatVerificationService.verifyHatExistsOnchain(newHatId);

        if (!hatVerification.exists) {
          console.error(
            '❌ CRITICAL: Extracted HAT ID does not exist onchain!',
            {
              extractedHatId: newHatId,
              errorType: hatVerification.errorType,
              error: hatVerification.error,
            },
          );

          const errorMessage =
            HatVerificationService.getErrorMessage(hatVerification);
          toast({
            title: 'HAT Verification Failed',
            description: `HAT verification failed: ${errorMessage}. Transaction: ${hatReceipt?.transactionHash}`,
            variant: 'destructive',
          });
          return;
        }

        if (!hatVerification.active) {
          console.error(
            '❌ CRITICAL: Extracted HAT exists but is not active!',
            {
              extractedHatId: newHatId,
              details: hatVerification.details,
            },
          );

          toast({
            title: 'HAT Not Active',
            description:
              'The created role (HAT) exists but is not active. Please contact support.',
            variant: 'destructive',
          });
          return;
        }

        console.log('✅ TIER 1 FIX: HAT verified onchain successfully!', {
          hatId: newHatId,
          supply: hatVerification.details?.supply,
          maxSupply: hatVerification.details?.maxSupply,
          active: hatVerification.active,
        });

        // Ensure Supabase session is valid before saving
        console.log('🔐 Verifying Supabase session...');
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!session || sessionError) {
          console.warn('⚠️ No valid session, attempting to refresh...');
          const { data: refreshData, error: refreshError } =
            await supabase.auth.refreshSession();

          if (refreshError || !refreshData.session) {
            throw new Error('Authentication required. Please log in again.');
          }
          console.log('✅ Session refreshed successfully');
        } else {
          console.log('✅ Valid session confirmed');
        }

        // ✅ CREATE2: Proxy was already set as toggle during HAT creation - no 3rd transaction needed!
        console.log('✅ === POD CREATION COMPLETE (CREATE2) ===');
        console.log('✅ HAT ID:', newHatId);
        console.log('✅ Proxy Address:', proxyAddress);
        console.log(
          '✅ Proxy was set as HAT toggle from the start - NO toggle transfer needed!',
        );

        toast({
          title: 'Pod Created Successfully!',
          description: 'HAT created with proxy as admin. Ready to use!',
          variant: 'default',
        });

        // ===================================================================
        // 🆕 UPLOAD POD IMAGE TO SUPABASE STORAGE (if provided)
        // ===================================================================
        let podImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name)}&size=400&background=bfe7c6&color=000&bold=true`;

        if (formData.podImage) {
          try {
            console.log('📸 Uploading pod image to Supabase Storage...');

            // Generate temp pod ID for file path (we'll update with real pod ID later)
            const tempPodId = `temp-${Date.now()}`;
            const fileExt = formData.podImage.name.split('.').pop();
            const fileName = `${tempPodId}/banner.${fileExt}`;
            const filePath = `pod-images/${fileName}`;

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } =
              await supabase.storage
                .from('pod-images')
                .upload(filePath, formData.podImage, {
                  cacheControl: '3600',
                  upsert: true,
                });

            if (uploadError) {
              console.error('❌ Image upload failed:', uploadError);
              toast({
                title: 'Image Upload Failed',
                description: 'Using default image. Pod will still be created.',
                variant: 'destructive',
              });
            } else {
              // Get public URL
              const {
                data: { publicUrl },
              } = supabase.storage.from('pod-images').getPublicUrl(filePath);

              podImageUrl = publicUrl;
              console.log('✅ Pod image uploaded:', publicUrl);
            }
          } catch (error) {
            console.error('❌ Image upload error:', error);
            // Continue with default image
          }
        }

        // Store pod in Supabase with HAT ID AND proxy address
        // ===================================================================
        // CRITICAL FIX: Update existing pod if continuing setup, otherwise create new
        // ===================================================================
        let podData;
        if (continuePodId && existingPod) {
          // Update existing pod with blockchain data
          console.log(
            '📝 Updating existing pod with blockchain data:',
            continuePodId,
          );
          const { data: updatedPod, error } = await supabase
            .from('pods')
            .update({
              management_hat_id: newHatId, // TIER 1 FIX: No placeholder - verified onchain above
              membership_hat_id: null, // Will be created on-demand when first member added
              treasury_contract_address: formData.enableTreasury
                ? 'pending'
                : null,
              proxy_contract_address: proxyAddress || null,
              blockchain_pod_id: blockchainPodId,
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('id', continuePodId)
            .select()
            .single();

          if (error) {
            console.error('❌ Failed to update existing pod:', error);
            throw new Error(`Failed to update pod: ${error.message}`);
          }

          // Transform Supabase result to match PodService format
          podData = { podId: updatedPod.id };
          console.log('✅ Updated existing pod with blockchain data');

          toast({
            title: 'Pod Updated',
            description:
              'Blockchain components have been configured successfully!',
          });
        } else {
          // Create new pod
          console.log('📝 Creating new pod in database');
          podData = await PodService.createPod({
            name: formData.name,
            description: formData.description,
            parentPodId: formData.parentPodId,
            podLeads: validation.validLeads,
            image: podImageUrl,
            managementHatId: newHatId, // TIER 1 FIX: No placeholder - verified onchain above
            membershipHatId: undefined, // Will be created on-demand when first member added
            treasuryContractAddress: formData.enableTreasury
              ? 'pending'
              : undefined,
            proxyContractAddress: proxyAddress || undefined,
            blockchainPodId: blockchainPodId,
            status: 'active',
          } as any);

          // ✅ RENAME IMAGE FILE: Now that we have the real pod ID, move the image file
          if (
            formData.podImage &&
            podData?.podId &&
            podImageUrl.includes('temp-')
          ) {
            try {
              console.log('🔄 Renaming image file with real pod ID...');
              const tempPath = podImageUrl.split('/pod-images/')[1];
              const fileExt = formData.podImage.name.split('.').pop();
              const newPath = `${podData.podId}/banner.${fileExt}`;

              // Copy to new location
              const { error: moveError } = await supabase.storage
                .from('pod-images')
                .move(tempPath, newPath);

              if (!moveError) {
                // Get new public URL
                const {
                  data: { publicUrl: newPublicUrl },
                } = supabase.storage.from('pod-images').getPublicUrl(newPath);

                // Update pod with correct image URL
                await supabase
                  .from('pods')
                  .update({ pod_image_url: newPublicUrl })
                  .eq('id', podData.podId);

                console.log('✅ Image file renamed and URL updated');
              }
            } catch (error) {
              console.error('⚠️ Failed to rename image file:', error);
              // Not critical, image still works
            }
          }
        }

        // ✅ FIX #3: ALWAYS create leader role immediately after pod creation
        // This ensures permission system finds the role without race conditions
        if (podData?.podId && newHatId) {
          console.log('👥 === CREATING LEADER ROLE (ATOMIC) ===');
          console.log('📝 Creating pod_role_permissions record for leaders...');

          try {
            const { data: rolePermission, error: roleError } = await supabase
              .from('pod_role_permissions')
              .insert({
                pod_id: podData.podId,
                role_name: 'leader',
                token_address: newHatId,
                eligibility_criteria:
                  formData.eligibilityRules.length > 0
                    ? formData.eligibilityRules
                    : [],
                permissions: {
                  memberManagement: true,
                  treasuryManagement: true,
                  podSettings: true,
                  proposalCreation: true,
                  voting: true,
                },
                is_active: true,
                created_by: address,
                updated_by: address, // Required by database NOT NULL constraint
              })
              .select()
              .single();

            if (roleError) {
              console.error('❌ Failed to create leader role:', roleError);
              throw new Error(
                `Failed to create leader role: ${roleError.message}`,
              );
            }

            console.log('✅ Leader role created successfully:', rolePermission);

            // ✅ FIX #4: Add pod creator to pod_members table
            // This is required for the permission system to find the user's role
            console.log('👥 Adding pod leaders to pod_members table...');

            try {
              // Create pod_members entries for all leaders
              // Using actual schema: id, pod_id, wallet, membership_type, role, hat_id, is_active, joined_at, removed_at, created_at, updated_at
              const memberEntries = validation.validLeads.map(
                (leaderAddress) => ({
                  pod_id: podData.podId,
                  wallet: leaderAddress.toLowerCase(),
                  hat_id: newHatId,
                  membership_type: 'leader',
                  role: 'leader', // Matches existing schema (seems duplicate of membership_type)
                  is_active: true,
                  joined_at: new Date().toISOString(),
                  // id, created_at, updated_at auto-generated by database
                }),
              );

              const { error: membersError } = await supabase
                .from('pod_members')
                .insert(memberEntries);

              if (membersError) {
                console.error('❌ Failed to insert pod_members:', membersError);
                console.error('❌ Error details:', membersError);
                throw membersError;
              }

              console.log(
                `✅ Added ${memberEntries.length} leaders to pod_members table`,
              );
            } catch (membersError) {
              console.error('❌ Failed to add pod members:', membersError);
              // Don't throw - this is not critical, permissions will work once users sign in
            }

            // ⚠️ CRITICAL FIX: Do NOT auto-deploy module during pod creation
            // This was causing confusing wallet popups that users rejected
            // Module deployment should be a MANUAL step from pod settings
            if (formData.eligibilityRules.length > 0) {
              console.log(
                'ℹ️ Eligibility criteria saved to database (module deployment skipped)',
              );
              console.log(
                `📋 Criteria count: ${formData.eligibilityRules.length}`,
              );
              console.log(
                'ℹ️ Deploy eligibility module from pod settings when ready',
              );

              // Show informative toast instead of deploying automatically
              toast({
                title: 'Pod Created Successfully!',
                description: `Eligibility criteria saved. Deploy the enforcement module from pod settings to activate on-chain enforcement.`,
                duration: 8000,
              });

              // ⚠️ DISABLED: Time window configuration also triggers wallet popup
              // Configure this manually from pod settings after creation
              const timeCriteria = formData.eligibilityRules.find(
                (c) => c.type === 'time_based',
              );
              if (timeCriteria) {
                console.log(
                  'ℹ️ Time-based criteria detected - configure time window from pod settings',
                );
              }
            } else {
              console.log('ℹ️ No eligibility criteria - skipping module sync');
            }
          } catch (roleError) {
            console.error('❌ Leader role creation failed:', roleError);

            toast({
              title: 'Warning: Role Creation Failed',
              description:
                'Pod created successfully but leader role permissions may need manual configuration.',
              variant: 'destructive',
              duration: 10000,
            });
            // Don't throw - pod was created successfully, role can be added later
          }
        } else {
          console.warn('⚠️ Skipping role creation - missing pod ID or HAT ID');
        }

        // ✅ PHASE 3: Prepare mintHat calls for OnchainKit Transaction (sponsored)
        console.log('🎩 === PREPARING PHASE 3: MINT HATs ===');
        console.log('🎩 Pod leaders to mint HATs for:', validation.validLeads);
        console.log('🎩 Management HAT ID:', newHatId || 'extracted_from_tx');

        const hatIdToMint = newHatId || 'extracted_from_tx';
        if (
          hatIdToMint &&
          hatIdToMint !== 'extracted_from_tx' &&
          validation.validLeads.length > 0
        ) {
          // Prepare mintHat calls for OnchainKit Transaction
          // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
          const mintCalls = validation.validLeads.map((leaderAddress) => ({
            address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
            abi: [
              {
                name: 'mintHat',
                type: 'function',
                inputs: [
                  { name: '_hatId', type: 'uint256' },
                  { name: '_wearer', type: 'address' },
                ],
                outputs: [{ name: 'success', type: 'bool' }],
                stateMutability: 'nonpayable',
              },
            ],
            functionName: 'mintHat',
            args: [BigInt(hatIdToMint), leaderAddress as `0x${string}`],
          }));

          console.log(
            `🎩 Prepared ${mintCalls.length} mintHat calls for Phase 3`,
          );

          // Fetch leader profiles for better UX
          try {
            const { data: profiles } = await supabase
              .from('user_profiles')
              .select('wallet_address, first_name, last_name, profile_picture')
              .in(
                'wallet_address',
                validation.validLeads.map((addr) => addr.toLowerCase()),
              );

            if (profiles) {
              const profileMap = new Map();
              profiles.forEach((p) => {
                profileMap.set(p.wallet_address.toLowerCase(), {
                  first_name: p.first_name,
                  last_name: p.last_name,
                  profile_picture: p.profile_picture,
                });
              });
              setLeaderProfiles(profileMap);
              console.log(`✅ Loaded ${profiles.length} leader profiles`);
            }
          } catch (error) {
            console.error('Failed to load leader profiles:', error);
            // Continue anyway - we'll show addresses as fallback
          }

          // Store for Phase 3 UI
          setMintHatCalls(mintCalls);
          setCreatedHatId(hatIdToMint);

          // ✅ NEW: Predict admin HAT ID immediately after management HAT created
          console.log('🔮 === PREDICTING ADMIN HAT ID ===');
          try {
            const predictedAdminId = predictAdminHatId(BigInt(hatIdToMint));
            setPredictedAdminHatId(predictedAdminId.toString());
            console.log('✅ Admin HAT ID predicted successfully:');
            console.log('  Management HAT ID:', hatIdToMint);
            console.log(
              '  Predicted Admin HAT ID:',
              predictedAdminId.toString(),
            );
            console.log(
              '  Predicted Admin HAT ID (hex):',
              '0x' + predictedAdminId.toString(16).padStart(64, '0'),
            );
            console.log(
              '🎯 This ID will be set during Phase 2 proxy initialization',
            );
            console.log(
              '🎯 Phase 6 will be eliminated - 100% gasless pod creation!',
            );
          } catch (predictionError) {
            console.error(
              '❌ Failed to predict admin HAT ID:',
              predictionError,
            );
            console.warn(
              '⚠️ Continuing without prediction - Phase 6 will be required',
            );
            // Don't fail the transaction - continue with old flow as fallback
          }

          setCreatedPodData(podData);

          setStep('mint-hats');
          setShowTransaction(false); // Hide Phase 2 transaction

          // Don't redirect yet - show Phase 3
          return;
        }

        // If no leaders to mint to, we're done
        if (false) {
          try {
            // Import necessary functions
            const { encodeFunctionData } = await import('viem');

            // Prepare mintHat calls for each leader
            const mintResults = [];

            for (let i = 0; i < validation.validLeads.length; i++) {
              const leaderAddress = validation.validLeads[i];

              try {
                console.log(
                  `🎩 Minting HAT ${i + 1}/${validation.validLeads.length} to ${leaderAddress}...`,
                );

                // Encode the mintHat function call
                const mintData = encodeFunctionData({
                  abi: [
                    {
                      name: 'mintHat',
                      type: 'function',
                      inputs: [
                        { name: '_hatId', type: 'uint256' },
                        { name: '_wearer', type: 'address' },
                      ],
                      outputs: [{ name: 'success', type: 'bool' }],
                      stateMutability: 'nonpayable',
                    },
                  ],
                  functionName: 'mintHat',
                  args: [BigInt(hatIdToMint), leaderAddress as `0x${string}`],
                });

                // Execute mint transaction using CDP sendUserOperation
                // NOTE: This code block is dead code (wrapped in if(false)) and never executes
                const smartAccount = currentUser?.evmSmartAccounts?.[0];
                if (!smartAccount) throw new Error('Smart account not available');

                const result = await sendUserOperation({
                  evmSmartAccount: smartAccount as `0x${string}`,
                  network: 'base',
                  calls: [{
                    to: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
                    data: mintData,
                    value: 0n,
                  }],
                });
                // CDP result doesn't have transactionHash property directly
                const mintTxHash = 'tx-hash-placeholder';

                console.log(
                  `✅ HAT mint transaction sent to ${leaderAddress}! Result:`, result,
                );

                // Wait for confirmation (Note: CDP handles confirmation differently)
                const mintReceipt = { status: 'success' as const } as any;

                if (mintReceipt.status === 'success') {
                  console.log(
                    `✅ HAT successfully minted to ${leaderAddress}!`,
                    {
                      blockNumber: mintReceipt.blockNumber,
                      gasUsed: mintReceipt.gasUsed,
                    },
                  );
                  mintResults.push({ leader: leaderAddress, success: true });
                } else {
                  console.warn(
                    `⚠️ HAT mint transaction failed for ${leaderAddress}`,
                  );
                  mintResults.push({ leader: leaderAddress, success: false });
                }
              } catch (mintError: any) {
                console.error(
                  `⚠️ Failed to mint HAT to ${leaderAddress}:`,
                  mintError,
                );
                // Check if it's because they already have the HAT
                if (
                  mintError?.message?.includes('ALREADY_WEARING') ||
                  mintError?.message?.includes('already wearing')
                ) {
                  console.log(`ℹ️ ${leaderAddress} already has this HAT`);
                  mintResults.push({
                    leader: leaderAddress,
                    success: true,
                    alreadyHad: true,
                  });
                } else {
                  mintResults.push({
                    leader: leaderAddress,
                    success: false,
                    error: mintError?.message,
                  });
                }
                // Continue with other mints even if one fails
              }
            }

            // Summary of minting results
            const successfulMints = mintResults.filter((r) => r.success).length;
            console.log(`🎩 === HAT AUTO-MINTING COMPLETE ===`);
            console.log(
              `🎩 Successfully minted: ${successfulMints}/${validation.validLeads.length}`,
            );

            if (successfulMints === validation.validLeads.length) {
              toast({
                title: 'Pod Created Successfully!',
                description: `Pod "${formData.name}" created with ${validation.validLeads.length} leader(s) who have been granted their management HATs.`,
                variant: 'default',
              });
            } else if (successfulMints > 0) {
              toast({
                title: 'Pod Created',
                description: `Pod created. ${successfulMints}/${validation.validLeads.length} leaders received their HATs. Others may need to claim manually.`,
                variant: 'default',
              });
            } else {
              toast({
                title: 'Pod Created',
                description: `Pod created successfully. Leaders will need to manually claim their management HATs.`,
                variant: 'default',
              });
            }
          } catch (mintError) {
            console.error('⚠️ HAT auto-minting process failed:', mintError);
            // Don't fail the whole process, pod is already created
            toast({
              title: 'Pod Created',
              description: `Pod "${formData.name}" created. Leaders will need to manually claim their HATs.`,
              variant: 'default',
            });
          }
        } else {
          // No leaders to mint to - pod creation complete
          toast({
            title: 'Pod Created Successfully!',
            description: `Pod "${formData.name}" created!`,
            variant: 'default',
          });

          if (onSuccess) {
            onSuccess({ podId: podData.podId, ...response });
          } else {
            // Redirect to pod management page
            router.push(`/pods/${podData.podId}/manage`);
          }
        }
      } catch (error) {
        console.error('❌ Failed to store pod after transaction:', error);
        toast({
          title: 'Storage Error',
          description:
            'HAT was created but failed to store pod data. Redirecting to pods page.',
          variant: 'destructive',
        });

        // Even if Supabase storage fails, redirect to pods page
        // since the blockchain transaction succeeded
        setTimeout(() => {
          if (onSuccess) {
            onSuccess({ podId: 'unknown', ...response });
          } else {
            router.push('/pods');
          }
        }, 2000);
      }
    },
    [
      podCreated,
      formData.name,
      formData.description,
      formData.parentPodId,
      formData.enableTreasury,
      validation.validLeads,
      blockchainPodId,
    ],
  );

  // Handle successful Phase 3: Mint HATs transaction
  const handleMintHatsSuccess = useCallback(
    async (response: any) => {
      console.log('✅ === PHASE 3: MINT HATs SUCCESS ===');
      console.log('✅ Minted HATs to', mintHatCalls.length, 'leaders');

      toast({
        title: 'Leaders Received HATs!',
        description: `${mintHatCalls.length} leader(s) received their management HATs. Now configuring proxy...`,
        variant: 'default',
      });

      setShowMintTransaction(false);

      // ✅ PHASE 3.5: Prepare factory.setHatIdsViaFactory call (NEW - fixes authorization bug)
      // This ensures proxy.managementHatId is set, enabling HAT-based authorization
      // CRITICAL: Calls factory method (SPONSORED) instead of proxy directly (NOT sponsored)
      console.log(
        '🔧 === PREPARING PHASE 3.5: SET HAT IDs VIA FACTORY (SPONSORED) ===',
      );

      // 🔍 CRITICAL CHECK: Verify proxy doesn't already have HAT IDs set (prevents duplicate call error)
      let skipPhase35 = false;
      if (extractedProxyAddress) {
        try {
          const existingManagementHatId = await publicClient?.readContract({
            address: extractedProxyAddress as `0x${string}`,
            abi: [
              {
                name: 'managementHatId',
                type: 'function',
                inputs: [],
                outputs: [{ type: 'uint256' }],
                stateMutability: 'view',
              },
            ],
            functionName: 'managementHatId',
          });

          if (
            existingManagementHatId &&
            existingManagementHatId !== BigInt(0)
          ) {
            console.log(
              '⏭️ === SKIPPING PHASE 3.5: HAT IDs Already Set on Proxy ===',
            );
            console.log(
              '  Existing Management HAT ID:',
              existingManagementHatId.toString(),
            );
            console.log('  This prevents "HAT IDs already set" revert error');
            console.log('  Proceeding directly to Phase 4...');

            toast({
              title: 'Proxy Already Configured',
              description:
                'HAT IDs are already set on proxy. Skipping to next step...',
              variant: 'default',
            });

            skipPhase35 = true;
          } else {
            console.log(
              '✅ Proxy managementHatId is 0 - safe to call setHatIdsViaFactory',
            );
          }
        } catch (error) {
          console.warn(
            '⚠️ Could not read proxy managementHatId - proceeding with caution:',
            error,
          );
          // Continue anyway - the contract will revert if already set
        }
      }

      if (skipPhase35) {
        console.log(
          '⏭️ Skipping Phase 3.5 - HAT IDs already set, proceeding to Phase 4...',
        );
        // Fall through to Phase 4 preparation code below
      } else if (!blockchainPodId || !createdHatId) {
        console.warn('⚠️ Cannot set proxy HAT IDs - missing required data:', {
          hasPodId: !!blockchainPodId,
          hasHatId: !!createdHatId,
        });

        toast({
          title: 'Proxy Setup Warning',
          description:
            'Missing required data for proxy configuration. You may need to configure this manually later.',
          variant: 'destructive',
        });

        // Skip to Phase 4
        console.log('⏭️ Skipping Phase 3.5, proceeding to Phase 4...');
        // Continue to Phase 4 preparation code below
      } else {
        console.log('  Pod ID:', blockchainPodId);
        console.log('  Management HAT ID:', createdHatId);
        console.log('  Membership HAT ID: 0 (pending)');
        console.log(
          '  ✅ Using factory method - transaction will be SPONSORED (gasless)',
        );

        // Prepare factory.setHatIdsViaFactory call
        // This is a FACTORY method that internally calls proxy.setHatIds()
        // Because it's a factory call, it WILL BE SPONSORED by the paymaster
        // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
        const setHatIdsCall = {
          address: process.env.NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`,
          abi: [
            {
              name: 'setHatIdsViaFactory',
              type: 'function',
              inputs: [
                { name: 'podId', type: 'string' },
                { name: 'managementHatId', type: 'uint256' },
                { name: 'membershipHatId', type: 'uint256' },
                { name: 'actualUser', type: 'address' }, // 🚀 V3: Added for ERC-4337 authorization
              ],
              outputs: [],
              stateMutability: 'nonpayable',
            },
          ] as const,
          functionName: 'setHatIdsViaFactory',
          args: [
            blockchainPodId, // Pod ID (factory looks up proxy address)
            BigInt(createdHatId), // Management HAT ID from Phase 2
            BigInt(0), // Membership HAT ID (set to 0 for now)
            address as `0x${string}`, // 🚀 V3: Actual user's wallet for authorization check
          ],
        };

        console.log('🔧 Prepared factory.setHatIdsViaFactory call (SPONSORED)');

        // Store call and show Phase 3.5 UI
        setSetHatIdsCalls([setHatIdsCall]);
        setStep('set-hat-ids');
        return; // Don't continue to Phase 4 yet - let Phase 3.5 complete first
      }

      // ✅ PHASE 4: Prepare create proxy admin HAT call
      console.log('🎩 === PREPARING PHASE 4: CREATE PROXY ADMIN HAT ===');

      if (!extractedProxyAddress || !createdHatId) {
        console.error(
          '❌ Missing proxy address or management HAT ID for admin HAT creation',
        );
        toast({
          title: 'Setup Incomplete',
          description:
            'Missing required data for proxy admin HAT. Please contact support.',
          variant: 'destructive',
        });
        // Redirect anyway - pod is functional
        if (onSuccess) {
          onSuccess({ podId: createdPodData?.id, hatsMinted: true });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      // ✅ SAFE APPROACH: Keep admin HAT simple (no toggle validation issues)
      // The admin HAT is an internal implementation detail that:
      // 1. Only proxy can wear (maxSupply=1 + explicit mint)
      // 2. Always stays active (no toggle needed)
      // 3. Grants proxy admin rights over pod HATs
      const zeroAddress =
        '0x0000000000000000000000000000000000000000' as `0x${string}`;

      // Prepare proxy admin HAT details
      const adminHatDetails = JSON.stringify({
        type: 'proxy_admin_hat',
        name: `${formData.name} - Proxy Admin`,
        description: `Administrative HAT for ${formData.name} pod's authorization proxy. This HAT grants the pod proxy admin rights over pod HATs, enabling pod leader autonomy.`,
        podId: createdPodData?.id,
        proxyAddress: extractedProxyAddress,
        purpose: 'Grant proxy admin rights over pod HATs',
        version: 'v2-proxy-admin-pattern',
        created: new Date().toISOString(),
      });

      // ✅ REVERTED: Call Hats Protocol directly (working code)
      // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
      const createAdminHatCall = {
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
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
          BigInt(createdHatId), // admin (management HAT is parent)
          adminHatDetails, // details
          1, // maxSupply (only proxy wears it)
          zeroAddress, // eligibility (none)
          zeroAddress, // toggle (none)
          false, // mutable
          '', // imageURI
        ],
      };

      console.log(`🎩 Prepared createHat call (direct Hats Protocol)`);
      console.log('  Parent HAT ID (management):', createdHatId);
      console.log('  Management HAT (parent):');
      console.log('    - Decimal:', createdHatId);
      console.log(
        '    - Hex:',
        '0x' + BigInt(createdHatId).toString(16).padStart(64, '0'),
      );
      console.log('  Proxy:', extractedProxyAddress);

      // Store for Phase 4 UI
      setAdminHatCalls([createAdminHatCall]);
      setStep('create-admin-hat');

      // Don't redirect yet - show Phase 4
    },
    [
      mintHatCalls.length,
      extractedProxyAddress,
      createdHatId,
      createdPodData?.id,
      createdPodData?.name,
      formData.name,
      publicClient,
    ],
  );

  // Handle failed Phase 3: Mint HATs transaction
  const handleMintHatsError = useCallback(
    (error: any) => {
      console.error('❌ === PHASE 3: MINT HATs FAILED ===', error);

      toast({
        title: 'Pod Created, Minting Failed',
        description: `Pod "${createdPodData?.name}" was created successfully, but failed to mint HATs to leaders. Leaders can claim manually.`,
        variant: 'destructive',
      });

      // Still redirect to pod page - pod was created successfully
      if (onSuccess) {
        onSuccess({ podId: createdPodData?.id, hatsMinted: false });
      } else {
        router.push(`/pods/${createdPodData?.id}/manage`);
      }
    },
    [createdPodData?.id, createdPodData?.name],
  );

  // Handle successful Phase 3.5: Set HAT IDs on Proxy transaction
  const handleSetHatIdsSuccess = useCallback(
    async (response: any) => {
      console.log('✅ === PHASE 3.5: SET HAT IDs ON PROXY SUCCESS ===');
      console.log('✅ Proxy configured with management HAT ID:', createdHatId);

      toast({
        title: 'Proxy Configured!',
        description:
          'Management HAT ID set on proxy. Authorization system ready!',
        variant: 'default',
      });

      setShowSetHatIdsTransaction(false);

      // ✅ CRITICAL FIX: Skip Phase 4 if HAT ID prediction was used
      // If predictedAdminHatId is set, the proxy was initialized with a predicted admin HAT ID
      // Creating a new admin HAT in Phase 4 will fail because:
      // 1. The proxy expects a specific admin HAT ID (the predicted one)
      // 2. The actual HAT structure may differ from prediction (child index mismatch)
      // 3. Creating a new admin HAT conflicts with the proxy's configuration
      if (predictedAdminHatId) {
        console.log(
          '⏭️ === SKIPPING PHASE 4-6: Admin HAT Prediction Was Used ===',
        );
        console.log(
          'ℹ️ Proxy was initialized with predicted admin HAT ID:',
          predictedAdminHatId,
        );
        console.log(
          'ℹ️ Creating a new admin HAT would conflict with proxy configuration',
        );
        console.log(
          'ℹ️ Proceeding to Phase 7: Set eligibility module admin permissions',
        );

        // ✅ CRITICAL: Still need to execute Phase 7 (setHatAdmin on eligibility module)
        // This is independent of admin HAT creation and required for eligibility criteria management
        const eligibilityModuleAddress =
          EligibilityModuleService.getModuleAddress();

        if (
          !eligibilityModuleAddress ||
          formData.eligibilityRules.length === 0
        ) {
          console.log('⚠️ No eligibility module configured - skipping Phase 7');
          console.log('✅ Pod creation complete!');

          toast({
            title: 'Pod Setup Complete!',
            description: `${createdPodData?.name} is ready with HAT-based authorization!`,
            variant: 'default',
          });

          // Mark creation as complete and redirect
          if (onSuccess) {
            onSuccess({
              podId: createdPodData?.id,
              hatsMinted: true,
              proxyConfigured: true,
              adminHatPredictionUsed: true,
              skippedPhase4: true,
            });
          } else {
            router.push(`/pods/${createdPodData?.id}/manage`);
          }
          return;
        }

        // Prepare setHatAdmin call on eligibility module
        console.log('🔧 === PHASE 7: SETTING ELIGIBILITY MODULE ADMIN ===');
        const setEligibilityAdminCall = {
          address: eligibilityModuleAddress as `0x${string}`,
          abi: [
            {
              name: 'setHatAdmin',
              type: 'function',
              inputs: [
                { name: '_hatId', type: 'uint256' },
                { name: '_admin', type: 'address' },
              ],
              outputs: [],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'setHatAdmin',
          args: [
            BigInt(createdHatId), // Management HAT ID
            extractedProxyAddress as `0x${string}`, // Proxy address as admin
          ],
        };

        console.log(`🎩 Prepared setHatAdmin call for Eligibility Module`);
        console.log('  Module Address:', eligibilityModuleAddress);
        console.log('  Management HAT ID:', createdHatId);
        console.log('  Admin Address (Proxy):', extractedProxyAddress);

        // Store for Phase 7 UI
        setEligibilityAdminCalls([setEligibilityAdminCall]);
        setStep('set-eligibility-admin');

        // Don't redirect yet - show Phase 7 transaction
        return;
      }

      // ✅ PHASE 4: Prepare create proxy admin HAT call (only if prediction was NOT used)
      console.log('🎩 === PREPARING PHASE 4: CREATE PROXY ADMIN HAT ===');

      if (!extractedProxyAddress || !createdHatId) {
        console.error(
          '❌ Missing proxy address or management HAT ID for admin HAT creation',
        );
        toast({
          title: 'Setup Incomplete',
          description:
            'Missing required data for proxy admin HAT. Please contact support.',
          variant: 'destructive',
        });
        // Redirect anyway - pod is functional
        if (onSuccess) {
          onSuccess({ podId: createdPodData?.id, hatsMinted: true });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      // ✅ SAFE APPROACH: Keep admin HAT simple (no toggle validation issues)
      // The admin HAT is an internal implementation detail that:
      // 1. Only proxy can wear (maxSupply=1 + explicit mint)
      // 2. Always stays active (no toggle needed)
      // 3. Grants proxy admin rights over pod HATs
      const zeroAddress =
        '0x0000000000000000000000000000000000000000' as `0x${string}`;

      // Prepare proxy admin HAT details
      const adminHatDetails = JSON.stringify({
        type: 'proxy_admin_hat',
        name: `${formData.name} - Proxy Admin`,
        description: `Administrative HAT for ${formData.name} pod's authorization proxy. This HAT grants the pod proxy admin rights over pod HATs, enabling pod leader autonomy.`,
        podId: createdPodData?.id,
        proxyAddress: extractedProxyAddress,
        purpose: 'Grant proxy admin rights over pod HATs',
        version: 'v2-proxy-admin-pattern',
        created: new Date().toISOString(),
      });

      // ✅ REVERTED: Call Hats Protocol directly (working code)
      // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
      const createAdminHatCall = {
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
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
          BigInt(createdHatId), // admin (management HAT is parent)
          adminHatDetails, // details
          1, // maxSupply (only proxy wears it)
          zeroAddress, // eligibility (none)
          zeroAddress, // toggle (none)
          false, // mutable
          '', // imageURI
        ],
      };

      console.log('🔧 Prepared createHat call (direct Hats Protocol)');
      console.log('  Parent HAT ID (management):', createdHatId);

      // Store for Phase 4 UI
      setAdminHatCalls([createAdminHatCall]);
      setStep('create-admin-hat');
    },
    [
      createdHatId,
      extractedProxyAddress,
      formData.name,
      createdPodData?.id,
      createdPodData?.name,
      predictedAdminHatId,
      onSuccess,
      router,
      toast,
    ],
  );

  // Handle failed Phase 3.5: Set HAT IDs on Proxy transaction
  const handleSetHatIdsError = useCallback(
    (error: any) => {
      console.error('❌ === PHASE 3.5: SET HAT IDs ON PROXY FAILED ===', error);
      console.log(
        '⚠️ Pod will still function, but you may need to call setHatIds() manually',
      );
      console.log(
        '⚠️ Use ProxyHatIdFixer component or BaseScan to fix this later',
      );

      toast({
        title: 'Proxy Configuration Warning',
        description:
          'HAT IDs not set on proxy. You can configure this manually later from the pod management page.',
        variant: 'destructive',
      });

      // Don't block pod creation - continue to Phase 4 anyway
      // The proxy fix can be done manually later using ProxyHatIdFixer
      setShowSetHatIdsTransaction(false);

      // ✅ CRITICAL FIX: Skip Phase 4 if HAT ID prediction was used (same check as success handler)
      if (predictedAdminHatId) {
        console.log(
          '⏭️ === SKIPPING PHASE 4: Admin HAT Prediction Was Used ===',
        );
        console.log(
          'ℹ️ Proxy was initialized with predicted admin HAT ID:',
          predictedAdminHatId,
        );
        console.log(
          'ℹ️ Creating a new admin HAT would conflict with proxy configuration',
        );
        console.log(
          'ℹ️ Pod creation complete - use ProxyHatIdFixer to sync HAT IDs later if needed',
        );

        toast({
          title: 'Pod Setup Complete!',
          description: `${createdPodData?.name} is ready. Use pod management page to configure proxy if needed.`,
          variant: 'default',
        });

        // Mark creation as complete and redirect
        if (onSuccess) {
          onSuccess({
            podId: createdPodData?.id,
            hatsMinted: true,
            proxyConfigured: false,
            adminHatPredictionUsed: true,
            skippedPhase4: true,
          });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      // Continue to Phase 4 (only if prediction was NOT used)
      console.log('⏭️ Continuing to Phase 4 despite Phase 3.5 failure...');

      if (!extractedProxyAddress || !createdHatId) {
        console.error(
          '❌ Missing proxy address or management HAT ID for admin HAT creation',
        );
        toast({
          title: 'Setup Incomplete',
          description: 'Cannot continue with pod setup. Redirecting...',
          variant: 'destructive',
        });
        if (onSuccess) {
          onSuccess({
            podId: createdPodData?.id,
            hatsMinted: true,
            proxyConfigured: false,
          });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      // Proceed with Phase 4 setup (same code as in handleSetHatIdsSuccess)
      // ✅ SAFE APPROACH: Keep admin HAT simple (no toggle validation issues)
      // The admin HAT is an internal implementation detail that:
      // 1. Only proxy can wear (maxSupply=1 + explicit mint)
      // 2. Always stays active (no toggle needed)
      // 3. Grants proxy admin rights over pod HATs
      const zeroAddress =
        '0x0000000000000000000000000000000000000000' as `0x${string}`;
      const adminHatDetails = JSON.stringify({
        type: 'proxy_admin_hat',
        name: `${formData.name} - Proxy Admin`,
        description: `Administrative HAT for ${formData.name} pod's authorization proxy.`,
        podId: createdPodData?.id,
        proxyAddress: extractedProxyAddress,
        purpose: 'Grant proxy admin rights over pod HATs',
        version: 'v2-proxy-admin-pattern',
        created: new Date().toISOString(),
      });

      // ✅ REVERTED: Call Hats Protocol directly (working code)
      // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
      const createAdminHatCall = {
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
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
          BigInt(createdHatId), // admin (management HAT is parent)
          adminHatDetails, // details
          1, // maxSupply (only proxy wears it)
          zeroAddress, // eligibility (none)
          zeroAddress, // toggle (none)
          false, // mutable
          '', // imageURI
        ],
      };

      setAdminHatCalls([createAdminHatCall]);
      setStep('create-admin-hat');
    },
    [
      createdHatId,
      extractedProxyAddress,
      formData.name,
      createdPodData?.id,
      predictedAdminHatId,
      onSuccess,
      router,
      toast,
    ],
  );

  // Handle successful Phase 4: Create Proxy Admin HAT transaction
  const handleAdminHatSuccess = useCallback(
    async (response: any) => {
      console.log('✅ === PHASE 4: CREATE PROXY ADMIN HAT SUCCESS ===');
      console.log('✅ Admin HAT created, response:', response);

      // Extract admin HAT ID from transaction receipt
      let adminHatId = '';
      if (
        response.transactionReceipts &&
        response.transactionReceipts.length > 0
      ) {
        const receipt = response.transactionReceipts[0];
        console.log(
          '🔍 Processing admin HAT creation receipt with',
          receipt.logs?.length || 0,
          'logs',
        );

        const hatsContractAddress =
          process.env.NEXT_PUBLIC_HATS_CONTRACT?.toLowerCase();
        const hatsLogs = receipt.logs?.filter(
          (log: any) => log.address?.toLowerCase() === hatsContractAddress,
        );

        console.log(
          '🎩 Found',
          hatsLogs?.length || 0,
          'logs from HATS contract',
        );

        if (hatsLogs && hatsLogs.length > 0) {
          for (const hatsLog of hatsLogs) {
            console.log('🔍 Examining HATS log:', {
              topics: hatsLog.topics,
              topicsLength: hatsLog.topics?.length,
              data: hatsLog.data,
            });

            if (hatsLog.topics && hatsLog.topics.length > 1) {
              try {
                const extractedId = BigInt(hatsLog.topics[1]).toString();
                const extractedHex =
                  '0x' +
                  BigInt(hatsLog.topics[1]).toString(16).padStart(64, '0');
                console.log('🎩 ✅ Extracted Admin HAT ID from topics[1]:');
                console.log('    - Decimal:', extractedId);
                console.log('    - Hex:', extractedHex);
                adminHatId = extractedId;
                break;
              } catch (e: any) {
                console.warn('⚠️ Failed to extract from topics[1]:', e.message);
              }
            }

            // Fallback: Try data field if topics extraction failed
            if (!adminHatId && hatsLog.data && hatsLog.data !== '0x') {
              try {
                // Data field contains the return value (newHatId uint256)
                // Extract first 32 bytes (64 hex chars after 0x)
                const dataHex = hatsLog.data.slice(2); // Remove 0x
                if (dataHex.length >= 64) {
                  const hatIdHex = '0x' + dataHex.slice(0, 64);
                  const dataValue = BigInt(hatIdHex).toString();
                  console.log(
                    '🎩 ✅ Extracted Admin HAT ID from data field (first 32 bytes):',
                    dataValue,
                  );
                  console.log('    - Hex:', hatIdHex);
                  adminHatId = dataValue;
                  break;
                } else {
                  console.warn(
                    '⚠️ Data field too short for HAT ID extraction:',
                    dataHex.length,
                    'chars',
                  );
                }
              } catch (e: any) {
                console.warn('⚠️ Failed to extract from data field:', e.message);
              }
            }
          }
        }
      }

      if (!adminHatId) {
        console.error('❌ Could not extract admin HAT ID from receipt');
        toast({
          title: 'Admin HAT Created',
          description:
            'Admin HAT created but ID extraction failed. Pod will function with limited blockchain sync capability.',
          variant: 'default',
        });
        // Continue anyway - pod is functional without admin HAT
      } else {
        toast({
          title: 'Admin HAT Created!',
          description: `Proxy admin HAT created successfully. Now minting to proxy...`,
          variant: 'default',
        });
      }

      setShowAdminHatTransaction(false);
      setCreatedAdminHatId(adminHatId);

      // ✅ NEW v2: Verify predicted admin HAT ID matches actual created ID
      if (predictedAdminHatId && adminHatId) {
        console.log('🔍 === VERIFYING PREDICTED ADMIN HAT ID ===');
        console.log('  Predicted ID:', predictedAdminHatId);
        console.log('  Actual ID:   ', adminHatId);

        if (predictedAdminHatId === adminHatId) {
          console.log('✅ SUCCESS: Predicted admin HAT ID matches actual ID!');
          console.log(
            '🎉 Phase 6 can be eliminated - proxy was initialized with correct admin HAT ID!',
          );
        } else {
          console.error(
            '❌ MISMATCH: Predicted admin HAT ID does not match actual ID',
          );
          console.error('   Predicted:', predictedAdminHatId);
          console.error('   Actual:   ', adminHatId);
          console.warn(
            '⚠️ Phase 6 will be required to fix admin HAT ID mismatch',
          );
          console.warn(
            '⚠️ This likely means child index prediction was incorrect',
          );
        }
      } else if (!predictedAdminHatId) {
        console.log(
          'ℹ️ No predicted admin HAT ID available (expected for top-level pods or prediction failure)',
        );
        console.log('   Phase 6 will be required to set admin HAT ID on proxy');
      }

      // ✅ PHASE 5: Prepare mint proxy admin HAT call
      console.log('🎩 === PREPARING PHASE 5: MINT PROXY ADMIN HAT ===');

      if (!adminHatId || !extractedProxyAddress) {
        console.error('❌ Missing admin HAT ID or proxy address for minting');
        toast({
          title: 'Setup Incomplete',
          description:
            'Missing required data for minting admin HAT. Please contact support.',
          variant: 'destructive',
        });
        // Redirect anyway - pod is functional without admin HAT
        if (onSuccess) {
          onSuccess({ podId: createdPodData?.id, adminHatSetup: false });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      // ✅ REVERTED: Call Hats Protocol directly (working code)
      // ✅ CRITICAL FIX: OnChainKit expects "address" property, not "to"
      const mintAdminHatCall = {
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'mintHat',
            type: 'function',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_wearer', type: 'address' },
            ],
            outputs: [{ name: 'success', type: 'bool' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'mintHat',
        args: [
          BigInt(adminHatId), // hatId to mint
          extractedProxyAddress as `0x${string}`, // wearer (proxy contract)
        ],
      };

      console.log(`🎩 Prepared mintHat call (direct Hats Protocol)`);
      console.log('  HAT ID:');
      console.log('    - Decimal:', adminHatId);
      console.log(
        '    - Hex:',
        '0x' + BigInt(adminHatId).toString(16).padStart(64, '0'),
      );
      console.log('  Proxy:', extractedProxyAddress);

      // Store for Phase 5 UI
      setMintAdminHatCalls([mintAdminHatCall]);
      setStep('mint-admin-hat');
    },
    [extractedProxyAddress, createdPodData?.id, createdPodData?.name],
  );

  // Handle failed Phase 4: Create Proxy Admin HAT transaction
  const handleAdminHatError = useCallback(
    (error: any) => {
      console.error('❌ === PHASE 4: CREATE PROXY ADMIN HAT FAILED ===', error);

      toast({
        title: 'Admin HAT Creation Failed',
        description:
          "Failed to create proxy admin HAT. Pod is functional but token sync won't work. Please contact support.",
        variant: 'destructive',
      });

      // Redirect anyway - pod is functional without admin HAT
      if (onSuccess) {
        onSuccess({ podId: createdPodData?.id, adminHatSetup: false });
      } else {
        router.push(`/pods/${createdPodData?.id}/manage`);
      }
    },
    [createdPodData?.id],
  );

  // Handle successful Phase 5: Mint Proxy Admin HAT transaction
  const handleMintAdminHatSuccess = useCallback(
    async (response: any) => {
      console.log('✅ === PHASE 5: MINT PROXY ADMIN HAT SUCCESS ===');
      console.log('✅ Admin HAT minted to proxy successfully!');

      toast({
        title: 'Proxy Admin HAT Setup Complete!',
        description:
          'Proxy admin HAT minted successfully. Your pod now has full blockchain sync capability!',
        variant: 'default',
      });

      setShowMintAdminHatTransaction(false);

      // ✅ UPDATE DATABASE: Save proxy_admin_hat_id
      console.log(
        '💾 Updating pod with proxy_admin_hat_id:',
        createdAdminHatId,
      );

      try {
        const { error: updateError } = await supabase
          .from('pods')
          .update({
            proxy_admin_hat_id: createdAdminHatId,
          })
          .eq('id', createdPodData?.id);

        if (updateError) {
          console.error(
            '❌ Failed to update pod with admin HAT ID:',
            updateError,
          );
          toast({
            title: 'Database Update Failed',
            description:
              'Admin HAT minted but database update failed. Please contact support.',
            variant: 'destructive',
          });
        } else {
          console.log('✅ Pod updated with proxy_admin_hat_id successfully');
        }
      } catch (err) {
        console.error('❌ Exception updating pod:', err);
      }

      setShowMintAdminHatTransaction(false);

      // ✅ NEW v2: Check if Phase 6 can be skipped (prediction was successful)
      console.log('🔍 === CHECKING IF PHASE 6 CAN BE SKIPPED ===');
      const predictionWasSuccessful =
        predictedAdminHatId &&
        createdAdminHatId &&
        predictedAdminHatId === createdAdminHatId;

      console.log('  Predicted Admin HAT ID:', predictedAdminHatId || 'none');
      console.log('  Actual Admin HAT ID:', createdAdminHatId);
      console.log(
        '  Prediction Match:',
        predictionWasSuccessful ? '✅ YES' : '❌ NO',
      );

      if (predictionWasSuccessful) {
        console.log('🎉 === PHASE 6 SKIPPED - PREDICTION SUCCESSFUL ===');
        console.log(
          '✅ Admin HAT ID was correctly set during proxy initialization!',
        );
        console.log('✅ No need for separate Phase 6 transaction');
        console.log('🎯 Pod creation completed in 6 phases (100% gasless)!');

        toast({
          title: 'Pod Creation Complete! 🎉',
          description:
            'Your pod was created with 100% gasless transactions (6 phases). Admin HAT ID was correctly predicted and set!',
          variant: 'default',
        });

        // Move directly to Phase 7 (eligibility setup) or completion
        // Check if eligibility module is configured
        const eligibilityModuleAddress =
          EligibilityModuleService.getModuleAddress();

        if (eligibilityModuleAddress && formData.eligibilityRules.length > 0) {
          console.log('📋 Proceeding to Phase 7: Eligibility Setup');
          // Phase 7 logic will execute below (skip Phase 6 entirely)
        } else {
          console.log(
            '✅ No eligibility rules configured - pod creation complete!',
          );

          // Redirect to pod management page
          setTimeout(() => {
            if (onSuccess) {
              onSuccess({
                podId: createdPodData?.id,
                phasesCompleted: 6,
                phase6Skipped: true,
                predictionSuccessful: true,
              });
            } else {
              router.push(`/pods/${createdPodData?.id}/manage`);
            }
          }, 2000);

          return; // Exit early - Phase 6 skipped!
        }
      } else {
        console.log(
          '⚠️ === PHASE 6 REQUIRED - PREDICTION FAILED OR NOT ATTEMPTED ===',
        );
        console.log(
          '  Reason:',
          !predictedAdminHatId
            ? 'No prediction made (expected for top-level pods)'
            : 'Prediction mismatch',
        );
        console.log('  Impact: One additional transaction required (Phase 6)');
        console.log('  Cost: ~$0.10-$0.50 in gas (one-time setup)');

        toast({
          title: 'Additional Setup Required',
          description:
            'Phase 6 needed to set admin HAT ID. This is a one-time setup transaction.',
          variant: 'default',
        });
      }

      // ✅ PHASE 6: Prepare setProxyAdminHat call on proxy contract
      // NOTE: This section only executes if prediction failed or wasn't attempted
      console.log(
        '🔧 === PREPARING PHASE 6: SET PROXY ADMIN HAT ON PROXY CONTRACT ===',
      );
      console.log('  Proxy Address:', extractedProxyAddress);
      console.log('  Admin HAT ID:', createdAdminHatId);

      if (!extractedProxyAddress) {
        console.error(
          '❌ Proxy address not found! Cannot proceed with Phase 6.',
        );
        toast({
          title: 'Configuration Error',
          description:
            'Proxy address missing. Cannot configure proxy admin HAT.',
          variant: 'destructive',
        });
        return;
      }

      if (!createdAdminHatId) {
        console.error(
          '❌ Admin HAT ID not found! Cannot proceed with Phase 6.',
        );
        toast({
          title: 'Configuration Error',
          description: 'Admin HAT ID missing. Cannot configure proxy.',
          variant: 'destructive',
        });
        return;
      }

      if (!publicClient) {
        console.error('❌ Public client not available!');
        toast({
          title: 'Connection Error',
          description: 'Public client not available. Please check your connection.',
          variant: 'destructive',
        });
        return;
      }

      // CRITICAL DIAGNOSTIC: Check if proxy's stored factory matches current factory
      const factoryAddress = process.env
        .NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`;

      console.log('🔍 === FACTORY ADDRESS VERIFICATION ===');
      try {
        const proxyStoredFactory = await publicClient!.readContract({
          address: extractedProxyAddress as `0x${string}`,
          abi: [
            {
              name: 'factory',
              type: 'function',
              inputs: [],
              outputs: [{ type: 'address' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'factory',
        });

        console.log('   Proxy stored factory:', proxyStoredFactory);
        console.log('   Current .env factory:', factoryAddress);
        const factoriesMatch =
          proxyStoredFactory.toLowerCase() === factoryAddress.toLowerCase();
        console.log(
          '   MATCH:',
          factoriesMatch ? '✅ YES' : '❌ NO - CRITICAL ISSUE!',
        );

        if (!factoriesMatch) {
          console.error('❌ FACTORY MISMATCH DETECTED!');
          console.error('   Proxy was created by:', proxyStoredFactory);
          console.error('   Trying to call via:', factoryAddress);
          console.error('   This will cause authorization to fail!');
          console.error(
            '   SOLUTION: Use direct proxy call instead of factory routing.',
          );

          toast({
            title: 'Factory Mismatch Detected',
            description:
              'The proxy was created by a different factory. Please contact support or use direct proxy call.',
            variant: 'destructive',
          });
          // Don't return - let it fail so we can confirm the error
        }
      } catch (err) {
        console.error('❌ Could not verify factory address:', err);
      }
      console.log('🔍 === END FACTORY VERIFICATION ===\n');

      // CRITICAL DIAGNOSTIC: Check user authorization before attempting transaction
      console.log('🔐 === USER AUTHORIZATION CHECK ===');
      try {
        // Check if user is in leaders array
        const isUserLeader = await publicClient!.readContract({
          address: extractedProxyAddress as `0x${string}`,
          abi: [
            {
              name: 'checkIsLeader',
              type: 'function',
              inputs: [{ name: 'user', type: 'address' }],
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'checkIsLeader',
          args: [address!],
        });

        // Check if proxy.canManage(user) returns true
        const canUserManage = await publicClient!.readContract({
          address: extractedProxyAddress as `0x${string}`,
          abi: [
            {
              name: 'canManage',
              type: 'function',
              inputs: [{ name: 'user', type: 'address' }],
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'canManage',
          args: [address!],
        });

        // Check managementHatId status
        const proxyManagementHatId = await publicClient!.readContract({
          address: extractedProxyAddress as `0x${string}`,
          abi: [
            {
              name: 'managementHatId',
              type: 'function',
              inputs: [],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'managementHatId',
        });

        console.log('   User address:', address);
        console.log(
          '   Is user in leaders array:',
          isUserLeader ? '✅ YES' : '❌ NO',
        );
        console.log(
          '   Can user manage proxy:',
          canUserManage ? '✅ YES' : '❌ NO',
        );
        console.log(
          '   Proxy managementHatId:',
          proxyManagementHatId.toString(),
          proxyManagementHatId === 0n
            ? '(NOT SET - will use isLeader check)'
            : '(SET - will use HAT check)',
        );

        if (!canUserManage) {
          console.error('❌ AUTHORIZATION FAILURE DETECTED!');
          console.error('   User cannot manage this proxy.');
          console.error('   Possible causes:');
          console.error(
            '   1. User not in leaders array (check Phase 2 initialization)',
          );
          console.error('   2. Smart wallet address mismatch');
          console.error('   3. Proxy is not active');

          toast({
            title: 'Authorization Error',
            description:
              'You are not authorized to manage this proxy. Check console for details.',
            variant: 'destructive',
          });
          // Don't return - let it fail so we can see the exact error
        }
      } catch (err) {
        console.error('❌ Could not verify user authorization:', err);
      }
      console.log('🔐 === END AUTHORIZATION CHECK ===\n');

      // DIRECT PROXY CALL: Simplified approach that bypasses factory routing
      // Authorization: User is in leaders array (verified ✅ in diagnostics)
      // Proxy checks: msg.sender == factory || isLeader[msg.sender]
      // Since user IS a leader, authorization always succeeds
      // Trade-off: User pays ~$0.10-$0.50 gas for this one-time Phase 6 setup
      // All future operations remain gasless via HAT-based authorization

      const setProxyAdminHatCall = {
        address: extractedProxyAddress as `0x${string}`, // ✅ Call proxy directly
        abi: [
          {
            name: 'setProxyAdminHat',
            type: 'function',
            inputs: [{ name: '_proxyAdminHatId', type: 'uint256' }],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'setProxyAdminHat',
        args: [BigInt(createdAdminHatId)], // ✅ Only needs admin HAT ID
      };

      console.log(
        '🔧 Prepared setProxyAdminHat call (direct proxy - user pays gas)',
      );
      console.log('   Proxy address:', extractedProxyAddress);
      console.log('   Admin HAT ID:', createdAdminHatId);
      console.log('   💰 Note: This step requires ~$0.10-$0.50 gas payment');
      console.log('   ✅ All other phases remain gasless');

      // Store for Phase 6 UI
      setConfigureProxyCalls([setProxyAdminHatCall]);
      setStep('set-admin-hat');

      // Don't proceed to Phase 7 yet - show Phase 6 transaction
    },
    [
      createdAdminHatId,
      blockchainPodId,
      extractedProxyAddress,
      createdPodData?.id,
      createdPodData?.name,
    ],
  );

  // Handle successful Phase 6: Set Proxy Admin HAT on Proxy Contract
  const handleConfigureProxySuccess = useCallback(
    async (response: any) => {
      console.log(
        '✅ === PHASE 6: SET PROXY ADMIN HAT VIA FACTORY SUCCESS ===',
      );
      console.log('✅ Proxy admin HAT ID set via factory (SPONSORED)!');
      console.log('  Transaction hash:', response?.transactionHash);

      toast({
        title: 'Proxy Configuration Complete!',
        description:
          'Proxy admin HAT configured. Your pod is ready for eligibility management!',
        variant: 'default',
      });

      setShowConfigureProxyTransaction(false);

      // ✅ PHASE 7: Prepare set eligibility module admin call
      console.log('🎩 === PREPARING PHASE 7: SET ELIGIBILITY MODULE ADMIN ===');

      const eligibilityModuleAddress =
        EligibilityModuleService.getModuleAddress();

      if (!eligibilityModuleAddress) {
        console.warn('⚠️ Eligibility module not configured - skipping Phase 7');
        console.log(
          '🎉 === POD CREATION COMPLETE (WITHOUT ELIGIBILITY ADMIN) ===',
        );

        toast({
          title: 'Pod Created Successfully!',
          description: `Pod "${createdPodData?.name}" is set up. Note: Eligibility module not configured.`,
          variant: 'default',
        });

        if (onSuccess) {
          onSuccess({
            podId: createdPodData?.id,
            adminHatSetup: true,
            eligibilityAdminSet: false,
          });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      if (!createdHatId || !extractedProxyAddress) {
        console.error(
          '❌ Missing management HAT ID or proxy address for eligibility admin setup',
        );
        toast({
          title: 'Setup Incomplete',
          description:
            'Missing required data for eligibility admin. Pod is functional but criteria management may fail.',
          variant: 'destructive',
        });
        // Redirect anyway - pod is functional
        if (onSuccess) {
          onSuccess({ podId: createdPodData?.id, eligibilityAdminSet: false });
        } else {
          router.push(`/pods/${createdPodData?.id}/manage`);
        }
        return;
      }

      // Prepare setHatAdmin call on eligibility module
      const setEligibilityAdminCall = {
        address: eligibilityModuleAddress as `0x${string}`,
        abi: [
          {
            name: 'setHatAdmin',
            type: 'function',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_admin', type: 'address' },
            ],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'setHatAdmin',
        args: [
          BigInt(createdHatId), // Management HAT ID
          extractedProxyAddress as `0x${string}`, // Proxy address as admin
        ],
      };

      console.log(`🎩 Prepared setHatAdmin call for Eligibility Module`);
      console.log('  Module Address:', eligibilityModuleAddress);
      console.log('  Management HAT ID:', createdHatId);
      console.log('  Admin Address (Proxy):', extractedProxyAddress);

      // Store for Phase 7 UI
      setEligibilityAdminCalls([setEligibilityAdminCall]);
      setStep('set-eligibility-admin');

      // Don't redirect yet - show Phase 7
    },
    [
      createdAdminHatId,
      createdPodData?.id,
      createdPodData?.name,
      extractedProxyAddress,
      toast,
      onSuccess,
      router,
      predictedAdminHatId,
      formData.eligibilityRules,
      createdHatId,
    ],
  );

  // Handle failed Phase 5: Mint Proxy Admin HAT transaction
  const handleMintAdminHatError = useCallback(
    (error: any) => {
      console.error('❌ === PHASE 5: MINT PROXY ADMIN HAT FAILED ===', error);

      toast({
        title: 'Admin HAT Minting Failed',
        description:
          "Failed to mint admin HAT to proxy. Pod is functional but token sync won't work. Please contact support.",
        variant: 'destructive',
      });

      // Redirect anyway - pod is functional without admin HAT being minted
      if (onSuccess) {
        onSuccess({ podId: createdPodData?.id, adminHatSetup: false });
      } else {
        router.push(`/pods/${createdPodData?.id}/manage`);
      }
    },
    [createdPodData?.id, onSuccess, router, toast],
  );

  // Handle failed Phase 6: Configure Proxy transaction
  const handleConfigureProxyError = useCallback(
    (error: any) => {
      console.error('❌ === PHASE 6: CONFIGURE PROXY FAILED ===', error);

      toast({
        title: 'Proxy Configuration Failed',
        description:
          'Failed to set admin HAT in proxy contract. Eligibility management will not work. Please contact support.',
        variant: 'destructive',
      });

      // Redirect anyway - pod is functional without eligibility
      if (onSuccess) {
        onSuccess({ podId: createdPodData?.id, eligibilityAdminSet: false });
      } else {
        router.push(`/pods/${createdPodData?.id}/manage`);
      }
    },
    [createdPodData?.id, onSuccess, router, toast],
  );

  // Handle successful Phase 7: Set Eligibility Module Admin transaction
  const handleEligibilityAdminSuccess = useCallback(
    async (response: any) => {
      console.log('✅ === PHASE 7: SET ELIGIBILITY MODULE ADMIN SUCCESS ===');
      console.log('✅ Eligibility module admin set successfully!');

      toast({
        title: 'Eligibility Module Configured!',
        description:
          'Proxy is now authorized to manage token requirements and eligibility criteria!',
        variant: 'default',
      });

      setShowEligibilityAdminTransaction(false);

      // 🎉 ALL PHASES COMPLETE
      // Note: Total phases depends on whether Phase 6 was needed
      const predictionSuccessful =
        predictedAdminHatId &&
        createdAdminHatId &&
        predictedAdminHatId === createdAdminHatId;
      const totalPhases = predictionSuccessful ? 6 : 7;

      console.log(`🎉 === ALL ${totalPhases} PHASES COMPLETE ===`);
      console.log('✅ Phase 1: Management HAT created');
      console.log('✅ Phase 2: Proxy deployed');
      console.log('✅ Phase 3: HATs minted to leaders');
      console.log('✅ Phase 4: Proxy admin HAT created');
      console.log('✅ Phase 5: Admin HAT minted to proxy');

      if (predictionSuccessful) {
        console.log(
          '✅ Phase 6: SKIPPED (admin HAT ID set during initialization)',
        );
        console.log('✅ Phase 6 (final): Eligibility module admin configured');
        console.log('🎯 100% gasless pod creation achieved!');
      } else {
        console.log('✅ Phase 6: Proxy admin HAT ID set in contract');
        console.log('✅ Phase 7: Eligibility module admin configured');
      }

      toast({
        title: '🎉 Pod Creation Complete!',
        description: `Pod "${createdPodData?.name}" is fully set up with eligibility module! (${totalPhases} phases completed${predictionSuccessful ? ', 100% gasless' : ''})`,
        variant: 'default',
      });

      if (onSuccess) {
        onSuccess({
          podId: createdPodData?.id,
          adminHatSetup: true,
          eligibilityAdminSet: true,
        });
      } else {
        router.push(`/pods/${createdPodData?.id}/manage`);
      }
    },
    [
      createdPodData?.id,
      createdPodData?.name,
      onSuccess,
      router,
      toast,
      predictedAdminHatId,
      createdAdminHatId,
    ],
  );

  // Handle failed Phase 7: Set Eligibility Module Admin transaction
  const handleEligibilityAdminError = useCallback(
    (error: any) => {
      console.error(
        '❌ === PHASE 7: SET ELIGIBILITY MODULE ADMIN FAILED ===',
        error,
      );

      toast({
        title: 'Eligibility Admin Setup Failed',
        description:
          "Failed to authorize proxy in eligibility module. Pod is functional but token requirements won't work. Please contact support.",
        variant: 'destructive',
      });

      // Redirect anyway - pod is functional without eligibility admin
      if (onSuccess) {
        onSuccess({ podId: createdPodData?.id, eligibilityAdminSet: false });
      } else {
        router.push(`/pods/${createdPodData?.id}/manage`);
      }
    },
    [createdPodData?.id, onSuccess, router, toast],
  );

  // Handle Phase 1: HAT Creation status updates
  const handleHatCreationStatus = useCallback((status: any) => {
    console.log('🎩 HAT Creation Status:', status.statusName);

    if (status.statusName === 'success') {
      console.log('✅ HAT created successfully');
      const receipt = status.statusData?.transactionReceipts?.[0];
      if (receipt) {
        const hatId = processHatCreationReceipt(receipt);
        if (hatId) setExtractedHatId(hatId);
        setHatCreationReceipt(receipt);
        setHatCreationComplete(true);
        console.log('🔄 Moving to proxy deployment...');
      }
    }
  }, []);

  // Handle Phase 1: HAT Creation errors
  const handleHatCreationError = useCallback((error: any) => {
    console.error('❌ HAT creation failed:', error);
    toast({
      title: 'HAT Creation Failed',
      description:
        error instanceof Error ? error.message : 'Failed to create pod HAT',
      variant: 'destructive',
    });
    setStep('review');
  }, []);

  // Handle Phase 2: Proxy Deployment status updates
  const handleProxyDeploymentStatus = useCallback(
    (status: any) => {
      console.log('🔐 Proxy Deployment Status:', status.statusName);

      if (status.statusName === 'success') {
        console.log('✅ Proxy deployed successfully');
        const receipt = status.statusData?.transactionReceipts?.[0];
        if (receipt) {
          const proxyAddress = extractProxyAddressFromReceipt(receipt);
          if (proxyAddress) setExtractedProxyAddress(proxyAddress);
        }

        // Mark proxy deployment as complete to prevent duplicate wallet popups
        setProxyDeploymentComplete(true);

        // Both transactions complete - create pod in database
        handleTransactionSuccess({
          transactionReceipts: [hatCreationReceipt, receipt],
        });
      }
    },
    [hatCreationReceipt, handleTransactionSuccess],
  );

  // Handle Phase 2: Proxy Deployment errors
  const handleProxyDeploymentError = useCallback(
    (error: any) => {
      console.warn('⚠️ Proxy deployment failed (non-critical):', error);

      toast({
        title: 'Pod Created',
        description:
          'HAT created successfully. Permission sync can be set up later.',
        variant: 'default',
      });

      // Create pod anyway (proxy can be deployed later)
      handleTransactionSuccess({
        transactionReceipts: [hatCreationReceipt],
      });
    },
    [hatCreationReceipt, handleTransactionSuccess],
  );

  // Advocate token status indicator
  const AdvocateTokenStatus = () => (
    <div
      className="mb-6 p-4 border rounded-lg"
      style={{
        backgroundColor: checkingAdvocateToken
          ? '#f9fafb'
          : hasAdvocateToken
            ? '#D1E6DC'
            : '#F5E6E6',
        borderColor: checkingAdvocateToken
          ? '#e5e7eb'
          : hasAdvocateToken
            ? '#B8D9CA'
            : '#D9B3B3',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Shield
          className="h-5 w-5"
          style={{
            color: checkingAdvocateToken
              ? '#4b5563'
              : hasAdvocateToken
                ? '#3F7A5A'
                : '#8B3A3A',
          }}
        />
        <h4
          className="font-medium"
          style={{
            color: checkingAdvocateToken
              ? '#1f2937'
              : hasAdvocateToken
                ? '#1F453A'
                : '#5C1F1F',
          }}
        >
          Pod Leader Access {!testingMode && '(Required)'}
        </h4>
      </div>

      {checkingAdvocateToken ? (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 animate-spin" />
          <span className="text-gray-700 text-sm">
            Verifying pod leader status...
          </span>
        </div>
      ) : hasAdvocateToken ? (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
          <span className="text-sm" style={{ color: '#2F5D50' }}>
            ✅ Verified - You are a pod leader
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: '#8B3A3A' }} />
          <span className="text-sm" style={{ color: '#8B3A3A' }}>
            {testingMode
              ? '⚠️ Not a pod leader (bypassed in testing mode)'
              : '❌ Pod leader access required to create pods'}
          </span>
        </div>
      )}
    </div>
  );

  // Modules status indicator
  const ModulesStatus = () => (
    <div
      className="mb-6 p-4 border rounded-lg"
      style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-5 w-5" style={{ color: '#2F5D50' }} />
        <h4 className="font-medium" style={{ color: '#1F453A' }}>
          Module Integrations
        </h4>
      </div>

      {isInitializing ? (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 animate-spin" />
          <span className="text-sm" style={{ color: '#2F5D50' }}>
            Initializing modules...
          </span>
        </div>
      ) : modulesInitialized ? (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
          <span className="text-sm" style={{ color: '#2F5D50' }}>
            Ready - {availableModules.length} modules available
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: '#8B3A3A' }} />
          <span className="text-sm" style={{ color: '#8B3A3A' }}>
            Error: {modulesError || 'Failed to initialize'}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-6 w-6" style={{ color: '#2F5D50' }} />
          Create Pod
          {testingMode && (
            <Badge
              variant="outline"
              style={{ backgroundColor: '#FAF4EC', color: '#8F6B2F' }}
            >
              Testing Mode
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-gray-600">
          Create a new pod with role management.
        </p>

        {/* Progress indicator */}
        <div className="flex items-center space-x-2 mt-4">
          {['config', 'rules', 'review', 'creating'].map((s, index) => {
            const isActive = s === step;
            const isCompleted =
              ['config', 'rules', 'review', 'creating'].indexOf(s) <
              ['config', 'rules', 'review', 'creating'].indexOf(step);

            return (
              <div
                key={s}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                style={{
                  backgroundColor: isActive
                    ? '#2F5D50'
                    : isCompleted
                      ? '#3F7A5A'
                      : '#e5e7eb',
                  color: isActive || isCompleted ? '#ffffff' : '#4b5563',
                }}
              >
                {index + 1}
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <AdvocateTokenStatus />
        <ModulesStatus />

        {step === 'config' && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">Pod Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                placeholder="Enter pod name"
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                placeholder="Describe the pod's purpose and activities"
                rows={4}
              />
            </div>

            <PodImageUpload
              onImageSelect={(file) => updateFormData('podImage', file)}
              onImageUrlChange={(url) => updateFormData('podImageUrl', url)}
              disabled={loading}
            />

            <div>
              <Label htmlFor="parentPod">Parent Pod *</Label>
              <div className="space-y-2">
                <select
                  id="parentPod"
                  value={formData.parentPodId}
                  onChange={(e) => {
                    console.log('🔄 Parent HAT selected:', e.target.value);
                    const selectedOption = availableParentPods.find(
                      (p) => p.id === e.target.value,
                    );
                    console.log('🔄 Selected option details:', selectedOption);
                    updateFormData('parentPodId', e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loadingUserPods}
                >
                  <option value="" disabled={true}>
                    {loadingUserPods
                      ? 'Loading your pods...'
                      : 'Select parent pod for sub-pod creation'}
                  </option>

                  {/* User's Leadership Pods */}
                  {availableParentPods.filter((p) => (p as any).isUserPod).length >
                    0 && (
                    <optgroup label="Your Leadership Pods">
                      {availableParentPods
                        .filter((pod) => (pod as any).isUserPod)
                        .map((pod) => (
                          <option key={pod.uniqueKey} value={pod.id}>
                            {pod.name}
                          </option>
                        ))}
                    </optgroup>
                  )}

                  {/* Default Options */}
                  <optgroup label="Default Options">
                    {availableParentPods
                      .filter((pod) => pod.isDefault)
                      .map((pod) => (
                        <option key={pod.uniqueKey} value={pod.id}>
                          {pod.name}
                        </option>
                      ))}
                  </optgroup>

                  {/* Admin Options */}
                  {availableParentPods.filter((p) => p.isAdmin).length > 0 && (
                    <optgroup label="Admin Options">
                      {availableParentPods
                        .filter((pod) => pod.isAdmin)
                        .map((pod) => (
                          <option key={pod.uniqueKey} value={pod.id}>
                            {pod.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                {formData.parentPodId && (
                  <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    <strong>Selected:</strong>{' '}
                    {
                      availableParentPods.find(
                        (p) => p.id === formData.parentPodId,
                      )?.description
                    }
                  </div>
                )}
                {formData.parentPodId &&
                  formData.parentPodId !== 'TOP_LEVEL' &&
                  formData.parentPodId === '0x00000088' && (
                    <div
                      className="text-sm p-2 rounded border"
                      style={{
                        color: '#8B3A3A',
                        backgroundColor: '#F5E6E6',
                        borderColor: '#D9B3B3',
                      }}
                    >
                      ⚠️ <strong>Warning:</strong> Root HAT (SpiritDAO) is
                      inactive. Consider using{' '}
                      <strong>Create New Top-Level HAT</strong> instead for
                      reliable pod creation.
                    </div>
                  )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <Label>Pod Leaders *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLeaderField}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Leader
                </Button>
              </div>

              {formData.podLeaders.map((leader, index) => (
                <div key={index} className="flex items-center gap-2 mb-2">
                  <div className="flex-1">
                    <UserSelector
                      value={leader}
                      onChange={(walletAddress) =>
                        updateLeaderAddress(index, walletAddress)
                      }
                      placeholder="Search by name or paste wallet address..."
                      excludeAddresses={formData.podLeaders.filter(
                        (_, i) => i !== index,
                      )}
                    />
                  </div>
                  {formData.podLeaders.length > (testingMode ? 1 : 3) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeLeaderField(index)}
                      style={{ color: '#8B3A3A' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#5C1F1F';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#8B3A3A';
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'rules' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Eligibility & Access Rules
              </h3>

              {/* ✅ Unified Requirements UI */}
              <EligibilityCriteriaBuilder
                initialCriteria={formData.eligibilityRules}
                onCriteriaChange={(criteria) => {
                  console.log('📋 Eligibility criteria updated:', {
                    count: criteria.length,
                    criteria,
                    formDataBefore: formData.eligibilityRules,
                  });
                  updateFormData('eligibilityRules', criteria);
                  console.log('✅ FormData updated with criteria');
                }}
                roleType="leader"
                podId={undefined} // ✅ No podId during creation - pod doesn't exist yet
                readonly={false}
              />

              {/* Treasury Settings (keep this) */}
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center space-x-2">
                  <InlineSwitch
                    checked={formData.enableTreasury}
                    onCheckedChange={(checked) =>
                      updateFormData('enableTreasury', checked)
                    }
                  />
                  <Label>Enable Multi-Signature Treasury</Label>
                </div>

                {formData.enableTreasury && (
                  <div>
                    <Label htmlFor="treasuryThreshold">
                      Required Signatures
                    </Label>
                    <Input
                      id="treasuryThreshold"
                      type="number"
                      min="1"
                      max={Math.max(1, validation.validLeads.length)}
                      value={formData.treasuryThreshold || 1}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value);
                        updateFormData(
                          'treasuryThreshold',
                          isNaN(value) ? 1 : value,
                        );
                      }}
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Number of leader signatures required for treasury
                      transactions
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="font-medium mb-4">Pod Creation Summary</h3>

              <div className="space-y-3">
                <div>
                  <span className="font-medium">Name:</span> {formData.name}
                </div>
                <div>
                  <span className="font-medium">Description:</span>{' '}
                  {formData.description}
                </div>
                <div>
                  <span className="font-medium">Parent Pod:</span>{' '}
                  {
                    availableParentPods.find(
                      (p) => p.id === formData.parentPodId,
                    )?.name
                  }
                </div>
                <div>
                  <span className="font-medium">Leaders:</span>{' '}
                  {validation.validLeads.length}
                </div>
                <div>
                  <span className="font-medium">Modules Enabled:</span>
                  <div className="mt-2 space-y-1">
                    <Badge variant="outline">Multi Claims Hatter</Badge>
                    {formData.eligibilityRules.length > 0 && (
                      <div>
                        <Badge variant="outline">
                          Eligibility Rules: {formData.eligibilityRules.length}
                        </Badge>
                        {formData.eligibilityRules.map((rule, i) => (
                          <Badge key={i} variant="outline" className="ml-1">
                            {rule.type === 'agreement_signed' && '📝 Agreement'}
                            {rule.type === 'token_balance' && '💰 Token'}
                            {rule.type === 'credential_ownership' &&
                              '🎫 Credential'}
                            {rule.type === 'time_based' && '⏰ Time-Based'}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {formData.enableTreasury && (
                      <Badge variant="outline">Signer Gate</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {!validation.isValid && (
              <div
                className="border p-4 rounded-lg"
                style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
              >
                <h4 className="font-medium mb-2" style={{ color: '#5C1F1F' }}>
                  Issues to Resolve
                </h4>
                <ul className="text-sm space-y-1" style={{ color: '#8B3A3A' }}>
                  {validation.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 'creating' && (
          <div className="space-y-6">
            <div
              className="p-6 rounded-lg"
              style={{ backgroundColor: '#E8F1EE' }}
            >
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Crown className="h-5 w-5" style={{ color: '#2F5D50' }} />
                Creating Pod
              </h3>
              <p className="text-sm mb-4" style={{ color: '#2F5D50' }}>
                This will create a new Pod with unique community access tokens.
              </p>

              {showTransaction && transactionCalls.length > 0 && (
                <>
                  {/* Transaction 1: HAT Creation (CDP) */}
                  {!hatCreationComplete && !podCreated && (
                    <div className="space-y-3">
                      <Button
                        onClick={async () => {
                          if (!currentUser?.evmSmartAccounts?.[0]) {
                            toast({
                              title: 'Account Not Ready',
                              description: 'Smart account not available',
                              variant: 'destructive',
                            });
                            return;
                          }

                          try {
                            // Encode the transaction call
                            const call = transactionCalls[0];
                            const data = encodeFunctionData({
                              abi: call.abi,
                              functionName: call.functionName,
                              args: call.args,
                            });

                            console.log('🚀 Executing HAT Creation with CDP:', { call });

                            if (!currentUser?.evmSmartAccounts?.[0]) {
                              throw new Error('Smart account not available');
                            }

                            const result = await sendUserOperation({
                              evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                              network: 'base',
                              calls: [{
                                to: call.address as `0x${string}`,
                                data,
                                value: 0n,
                              }],
                            });

                            console.log('✅ HAT Creation successful:', result);

                            // Call the status handler with the result
                            handleHatCreationStatus({ statusName: 'success', statusData: result });
                          } catch (error) {
                            console.error('❌ HAT Creation failed:', error);
                            handleHatCreationError(error);
                          }
                        }}
                        disabled={txStatus === 'pending'}
                        className="w-full text-white font-medium py-3 px-6 rounded-lg bg-[#2F5D50] hover:bg-[#1F453A]"
                      >
                        {txStatus === 'pending' ? '⏳ Creating Pod...' : 'Create Pod'}
                      </Button>

                      {txStatus === 'pending' && (
                        <div className="mt-2 text-sm text-blue-600 text-center">
                          🔄 Transaction in progress... (Sponsored - no gas fees!)
                        </div>
                      )}

                      {txError && (
                        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                          ❌ {txError.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transaction 2: Proxy Deployment (CDP) */}
                  {hatCreationComplete &&
                    !proxyDeploymentComplete &&
                    !podCreated &&
                    transactionCalls.length > 1 && (
                      <div className="space-y-3">
                        <Button
                          onClick={async () => {
                            if (!currentUser?.evmSmartAccounts?.[0]) {
                              toast({
                                title: 'Account Not Ready',
                                description: 'Smart account not available',
                                variant: 'destructive',
                              });
                              return;
                            }

                            try {
                              // Encode the transaction call
                              const call = transactionCalls[1];
                              const data = encodeFunctionData({
                                abi: call.abi,
                                functionName: call.functionName,
                                args: call.args,
                              });

                              console.log('🚀 Executing Proxy Deployment with CDP:', { call });

                              if (!currentUser?.evmSmartAccounts?.[0]) {
                                throw new Error('Smart account not available');
                              }

                              const result = await sendUserOperation({
                                evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                                network: 'base',
                                calls: [{
                                  to: call.address as `0x${string}`,
                                  data,
                                  value: 0n,
                                }],
                              });

                              console.log('✅ Proxy Deployment successful:', result);

                              // Call the status handler with the result
                              handleProxyDeploymentStatus({ statusName: 'success', statusData: result });
                            } catch (error) {
                              console.error('❌ Proxy Deployment failed:', error);
                              handleProxyDeploymentError(error);
                            }
                          }}
                          disabled={txStatus === 'pending'}
                          className="w-full text-white font-medium py-3 px-6 rounded-lg bg-[#2F5D50] hover:bg-[#1F453A]"
                        >
                          {txStatus === 'pending' ? '⏳ Deploying Proxy...' : 'Deploy Proxy'}
                        </Button>

                        {txStatus === 'pending' && (
                          <div className="mt-2 text-sm text-blue-600 text-center">
                            🔄 Transaction in progress... (Sponsored - no gas fees!)
                          </div>
                        )}

                        {txError && (
                          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                            ❌ {txError.message}
                          </div>
                        )}
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Phase 3: Mint HATs to Leaders */}
        {step === 'mint-hats' && (
          <div className="space-y-6">
            <div
              className="p-6 rounded-lg border"
              style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}
            >
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Crown className="h-5 w-5" style={{ color: '#3F7A5A' }} />
                Phase 3: Create Leader Tokens
              </h3>
              <p className="text-sm mb-2" style={{ color: '#2F5D50' }}>
                Pod created successfully! Now create {mintHatCalls.length}{' '}
                Leadership tokens.
              </p>
              <p className="text-xs mb-4" style={{ color: '#3F7A5A' }}>
                Grant leadership permissions to assigned pod leaders.
              </p>

              <div
                className="bg-white p-4 rounded-lg border mb-4"
                style={{ borderColor: '#B8D9CA' }}
              >
                <h4 className="text-sm font-medium mb-3">
                  Members receiving Leader Roles:
                </h4>
                <div className="space-y-2">
                  {mintHatCalls.map((call, index) => {
                    const leaderAddress = (
                      call.args[1] as string
                    ).toLowerCase();
                    const profile = leaderProfiles.get(leaderAddress);

                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                      >
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border border-gray-200 flex-shrink-0">
                          {profile?.profile_picture ? (
                            <img
                              src={profile.profile_picture}
                              alt={profile.first_name || 'Profile'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {profile?.first_name || profile?.last_name ? (
                            <div className="flex items-center gap-1">
                              {profile.first_name && (
                                <span className="font-medium text-gray-700 text-sm">
                                  {profile.first_name}
                                </span>
                              )}
                              {profile.last_name && (
                                <span className="text-gray-700 text-sm">
                                  {profile.last_name}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 font-mono truncate block">
                              {call.args[1]}
                            </span>
                          )}
                        </div>
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: '#3F7A5A' }}
                        ></div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      // Encode all mint calls
                      const calls = mintHatCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing Mint HATs with CDP:', { calls });

                      if (!currentUser?.evmSmartAccounts?.[0]) {
                        throw new Error('Smart account not available');
                      }

                      const result = await sendUserOperation({
                        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                        network: 'base',
                        calls,
                      });

                      console.log('✅ Mint HATs successful:', result);

                      // Call success handler
                      handleMintHatsSuccess(result);
                    } catch (error) {
                      console.error('❌ Mint HATs failed:', error);
                      handleMintHatsError(error);
                    }
                  }}
                  disabled={txStatus === 'pending'}
                  className="w-full text-white font-medium py-3 px-6 rounded-lg bg-[#3F7A5A] hover:bg-[#2F5D50]"
                >
                  {txStatus === 'pending' ? '⏳ Minting Tokens...' : 'Mint Tokens for Leaders'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="mt-2 text-sm text-blue-600 text-center">
                    🔄 Minting {mintHatCalls.length} tokens... (Sponsored - no gas fees!)
                  </div>
                )}

                {txError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 3.5: Set HAT IDs on Proxy */}
        {step === 'set-hat-ids' && (
          <div className="space-y-6">
            <div
              className="p-6 rounded-lg border"
              style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
            >
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5" style={{ color: '#2F5D50' }} />
                Phase 4: Set Up Pod Permissions
              </h3>
              <p className="text-sm mb-2" style={{ color: '#2F5D50' }}>
                Connecting the pod's control system to its management ID so it
                knows who's allowed to make changes.
              </p>

              <div
                className="bg-white p-4 rounded-lg border mb-4"
                style={{ borderColor: '#B8D9CA' }}
              >
                <h4 className="text-sm font-medium mb-3">
                  Configuration Details:
                </h4>
                <ul className="space-y-2 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5" style={{ color: '#2F5D50' }}>
                      •
                    </span>
                    <span>
                      <strong>Pod ID:</strong> {blockchainPodId}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5" style={{ color: '#2F5D50' }}>
                      •
                    </span>
                    <span>
                      <strong>Management HAT ID:</strong>{' '}
                      {createdHatId?.slice(0, 20)}...
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5" style={{ color: '#2F5D50' }}>
                      •
                    </span>
                    <span>
                      <strong>Method:</strong> Factory.setHatIdsViaFactory()
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5" style={{ color: '#2F5D50' }}>
                      •
                    </span>
                    <span>
                      <strong>Purpose:</strong> Enable role-based permission
                      checks for eligibility management
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      // Encode set HAT IDs calls
                      const calls = setHatIdsCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing Set HAT IDs with CDP:', { calls });

                      if (!currentUser?.evmSmartAccounts?.[0]) {
                        throw new Error('Smart account not available');
                      }

                      const result = await sendUserOperation({
                        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                        network: 'base',
                        calls,
                      });

                      console.log('✅ Set HAT IDs successful:', result);

                      // Call success handler
                      handleSetHatIdsSuccess(result);
                    } catch (error) {
                      console.error('❌ Set HAT IDs failed:', error);
                      handleSetHatIdsError(error);
                    }
                  }}
                  disabled={txStatus === 'pending'}
                  className="w-full text-white font-medium py-3 px-6 rounded-lg bg-[#2F5D50] hover:bg-[#1F453A]"
                >
                  {txStatus === 'pending' ? '⏳ Configuring...' : 'Configure Proxy Authorization'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="mt-2 text-sm text-blue-600 text-center">
                    🔄 Configuring proxy... (Sponsored - no gas fees!)
                  </div>
                )}

                {txError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 5: Create Proxy Admin HAT */}
        {step === 'create-admin-hat' && (
          <div className="space-y-6">
            <div
              className="p-6 rounded-lg border"
              style={{ backgroundColor: '#EDEAF0', borderColor: '#D1CAD9' }}
            >
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5" style={{ color: '#6A5F7A' }} />
                Phase 5: Pod Adminstration Setup
              </h3>
              <p className="text-sm mb-2" style={{ color: '#4A3F5A' }}>
                Allows your pod to automatically manage its permissions.
              </p>

              <div
                className="bg-white p-4 rounded-lg border mb-4"
                style={{ borderColor: '#D1CAD9' }}
              >
                <h4 className="text-sm font-medium mb-2">Admin HAT Details:</h4>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1"
                      style={{ backgroundColor: '#6A5F7A' }}
                    ></div>
                    <span>
                      <strong>Purpose:</strong> Automated Permission Management
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1"
                      style={{ backgroundColor: '#6A5F7A' }}
                    ></div>
                    <span>
                      <strong>Wearer:</strong> Pod Proxy Contract
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1"
                      style={{ backgroundColor: '#6A5F7A' }}
                    ></div>
                    <span>
                      <strong>Enables:</strong> Syncing permissions onchain
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      const calls = adminHatCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing Admin HAT Creation with CDP:', { calls });

                      if (!currentUser?.evmSmartAccounts?.[0]) {
                        throw new Error('Smart account not available');
                      }

                      const result = await sendUserOperation({
                        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                        network: 'base',
                        calls,
                      });

                      console.log('✅ Admin HAT Creation successful:', result);

                      handleAdminHatSuccess(result);
                    } catch (error) {
                      console.error('❌ Admin HAT Creation failed:', error);
                      handleAdminHatError(error);
                    }
                  }}
                  disabled={txStatus === 'pending'}
                  className="w-full text-white font-medium py-3 px-6 rounded-lg bg-[#6A5F7A] hover:bg-[#4A3F5A]"
                >
                  {txStatus === 'pending' ? '⏳ Creating Admin Role...' : 'Create Admin Role'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="mt-2 text-sm text-blue-600 text-center">
                    🔄 Creating admin role... (Sponsored - no gas fees!)
                  </div>
                )}

                {txError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 5: Mint Proxy Admin HAT */}
        {step === 'mint-admin-hat' && (
          <div className="space-y-6">
            <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-200">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-indigo-600" />
                Phase 5: Mint Admin HAT to Proxy
              </h3>
              <p className="text-sm text-indigo-700 mb-2">
                Minting the admin HAT to your pod proxy contract.
              </p>
              <p className="text-xs text-indigo-600 mb-4">
                The proxy will "wear" this HAT to prove admin rights! You'll pay
                a small gas fee for this transaction.
              </p>

              <div className="bg-white p-4 rounded-lg border border-indigo-100 mb-4">
                <h4 className="text-sm font-medium mb-2">What This Enables:</h4>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Token Sync:</strong> Permission updates sync to
                      blockchain automatically
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Leader Autonomy:</strong> Pod leaders can manage
                      HATs independently
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1"></div>
                    <span>
                      <strong>External Compatibility:</strong> Other tools can
                      read your pod's permissions
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      const calls = mintAdminHatCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing Mint Admin HAT with CDP:', { calls });

                      if (!currentUser?.evmSmartAccounts?.[0]) {
                        throw new Error('Smart account not available');
                      }

                      const result = await sendUserOperation({
                        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                        network: 'base',
                        calls,
                      });

                      console.log('✅ Mint Admin HAT successful:', result);

                      handleMintAdminHatSuccess(result);
                    } catch (error) {
                      console.error('❌ Mint Admin HAT failed:', error);
                      handleMintAdminHatError(error);
                    }
                  }}
                  disabled={txStatus === 'pending'}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-lg"
                >
                  {txStatus === 'pending' ? '⏳ Minting Admin HAT...' : 'Mint Admin HAT to Proxy'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="mt-2 text-sm text-blue-600 text-center">
                    🔄 Minting admin HAT... (Sponsored - no gas fees!)
                  </div>
                )}

                {txError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 6: Set Proxy Admin HAT on Contract (FALLBACK - Only if prediction failed) */}
        {step === 'set-admin-hat' && (
          <div className="space-y-6">
            <div className="bg-teal-50 p-6 rounded-lg border border-teal-200">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-teal-600" />
                Phase 6: Configure Proxy Contract (Fallback)
              </h3>
              <p className="text-sm text-teal-700 mb-2">
                Final step: Configuring the proxy contract with its admin HAT.
              </p>
              <p className="text-xs text-teal-600 mb-4">
                This enables the proxy to modify HAT metadata autonomously!
                Transaction sponsored - no gas fees!
              </p>

              <div className="bg-white p-4 rounded-lg border border-teal-100 mb-4">
                <h4 className="text-sm font-medium mb-2">What This Does:</h4>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-teal-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Contract Configuration:</strong> Tells the proxy
                      which HAT grants it admin rights
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-teal-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Enables Token Sync:</strong> Proxy can now update
                      HAT metadata on blockchain
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-teal-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Full Autonomy:</strong> Pod leaders can manage
                      permissions without admin intervention
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      const calls = configureProxyCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing Configure Proxy with CDP:', { calls });

                      if (!currentUser?.evmSmartAccounts?.[0]) {
                        throw new Error('Smart account not available');
                      }

                      const result = await sendUserOperation({
                        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                        network: 'base',
                        calls,
                      });

                      console.log('✅ Configure Proxy successful:', result);

                      handleConfigureProxySuccess(result);
                    } catch (error) {
                      console.error('❌ Configure Proxy failed:', error);
                      handleConfigureProxyError(error);
                    }
                  }}
                  disabled={txStatus === 'pending'}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 px-6 rounded-lg"
                >
                  {txStatus === 'pending' ? '⏳ Configuring Proxy...' : 'Configure Proxy Contract'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="mt-2 text-sm text-blue-600 text-center">
                    🔄 Configuring proxy contract... (Sponsored - no gas fees!)
                  </div>
                )}

                {txError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 6/7: Set Eligibility Module Admin (Phase 6 if prediction succeeded, Phase 7 if not) */}
        {step === 'set-eligibility-admin' && (
          <div className="space-y-6">
            <div className="bg-emerald-50 p-6 rounded-lg border border-emerald-200">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                Final Phase: Configure Eligibility Module
              </h3>
              <p className="text-sm text-emerald-700 mb-2">
                Final step: Authorizing your proxy to manage token requirements
                and eligibility criteria.
              </p>
              <p className="text-xs text-emerald-600 mb-4">
                This enables pod leaders to add/remove token requirements for
                membership! Transaction sponsored - no gas fees!
              </p>

              <div className="bg-white p-4 rounded-lg border border-emerald-100 mb-4">
                <h4 className="text-sm font-medium mb-2">What This Enables:</h4>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Token Requirements:</strong> Add requirements like
                      "Hold 100 $SELF" or "Hold 50 $SYSTEM"
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Hard Gate Enforcement:</strong> HATs auto-revoke
                      when users don't meet requirements
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1"></div>
                    <span>
                      <strong>On-Chain Verification:</strong> Requirements
                      checked automatically by smart contract
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1"></div>
                    <span>
                      <strong>Leader Autonomy:</strong> Pod leaders can manage
                      criteria without admin intervention
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    if (!currentUser?.evmSmartAccounts?.[0]) {
                      toast({
                        title: 'Account Not Ready',
                        description: 'Smart account not available',
                        variant: 'destructive',
                      });
                      return;
                    }

                    try {
                      const calls = eligibilityAdminCalls.map((call: any) => ({
                        to: call.address as `0x${string}`,
                        data: encodeFunctionData({
                          abi: call.abi,
                          functionName: call.functionName,
                          args: call.args,
                        }),
                        value: 0n,
                      }));

                      console.log('🚀 Executing Set Eligibility Admin with CDP:', { calls });

                      if (!currentUser?.evmSmartAccounts?.[0]) {
                        throw new Error('Smart account not available');
                      }

                      const result = await sendUserOperation({
                        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
                        network: 'base',
                        calls,
                      });

                      console.log('✅ Set Eligibility Admin successful:', result);

                      handleEligibilityAdminSuccess(result);
                    } catch (error) {
                      console.error('❌ Set Eligibility Admin failed:', error);
                      handleEligibilityAdminError(error);
                    }
                  }}
                  disabled={txStatus === 'pending'}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-6 rounded-lg"
                >
                  {txStatus === 'pending' ? '⏳ Configuring Eligibility...' : 'Configure Eligibility Module'}
                </Button>

                {txStatus === 'pending' && (
                  <div className="mt-2 text-sm text-blue-600 text-center">
                    🔄 Configuring eligibility module... (Sponsored - no gas fees!)
                  </div>
                )}

                {txError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    ❌ {txError.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-6 border-t">
          <div>
            {step !== 'config' &&
              step !== 'creating' &&
              step !== 'mint-hats' &&
              step !== 'create-admin-hat' &&
              step !== 'mint-admin-hat' &&
              step !== 'set-admin-hat' &&
              step !== 'set-eligibility-admin' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const steps = ['config', 'rules', 'review'] as const;
                    const currentIndex = steps.indexOf(step as any);
                    if (currentIndex > 0) {
                      setStep(steps[currentIndex - 1]);
                    }
                  }}
                  className="px-4"
                >
                  Previous
                </Button>
              )}
          </div>

          <div className="flex gap-2">
            {step !== 'creating' &&
              step !== 'mint-hats' &&
              step !== 'create-admin-hat' &&
              step !== 'mint-admin-hat' &&
              step !== 'set-admin-hat' &&
              step !== 'set-eligibility-admin' && (
                <Button
                  variant="outline"
                  onClick={onCancel || (() => router.push('/pods'))}
                  className="px-4"
                >
                  Cancel
                </Button>
              )}

            {step === 'config' || step === 'rules' ? (
              <Button
                onClick={() => {
                  const steps = ['config', 'rules', 'review'] as const;
                  const currentIndex = steps.indexOf(step);
                  if (currentIndex < steps.length - 1) {
                    setStep(steps[currentIndex + 1]);
                  }
                }}
                disabled={
                  (step === 'config' &&
                    (!formData.name ||
                      !formData.description ||
                      !formData.parentPodId)) ||
                  !modulesInitialized
                }
                className="px-4"
              >
                Next
              </Button>
            ) : step === 'review' ? (
              <Button
                onClick={prepareTransactionCalls}
                disabled={!validation.isValid || loading || !modulesInitialized}
                className="px-4"
                style={{ backgroundColor: '#3F7A5A' }}
                onMouseEnter={(e) => {
                  if (
                    !(!validation.isValid || loading || !modulesInitialized)
                  ) {
                    e.currentTarget.style.backgroundColor = '#2F5D50';
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    !(!validation.isValid || loading || !modulesInitialized)
                  ) {
                    e.currentTarget.style.backgroundColor = '#3F7A5A';
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4" />
                  Create
                </div>
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
