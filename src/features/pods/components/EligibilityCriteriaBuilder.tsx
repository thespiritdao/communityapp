'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import Img from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getClientHatId } from '@/lib/hatRegistryClient';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import {
  Plus,
  Trash2,
  Coins,
  Image,
  FileText,
  Clock,
  Star,
  Lock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import type { EligibilityCriteria } from '../services/EligibilityService';
import { UnifiedAgreementService } from '../services/UnifiedAgreementService';
import { AgreementIPFSService } from '../services/AgreementIPFSService';

// Token constants from environment variables
const SYSTEM_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
  '0x1317Ae277266D38C4E492558f8693F14143a6A65';
const SELF_TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_SELF_TOKEN ||
  '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21';

interface AvailableToken {
  name: string;
  address: string;
  source: 'pods' | 'tokens';
  userBalance?: string; // Add user balance tracking
}

interface EligibilityCriteriaBuilderProps {
  initialCriteria?: EligibilityCriteria[];
  onCriteriaChange: (criteria: EligibilityCriteria[]) => void;
  roleType?: 'leader' | 'member';
  readonly?: boolean;
  podId?: string; // Add pod ID for agreement lookup
}

const CRITERION_TYPES = [
  {
    type: 'token_balance' as const,
    label: 'Currency',
    icon: Coins,
    description: 'Require minimum $SELF / $SYSTEM holdings',
    color: 'bg-[#E8F1EE] text-[#1F453A]',
  },
  {
    type: 'credential_ownership' as const,
    label: 'Credentials',
    icon: Image,
    description: 'Require specific credentials',
    color: 'bg-[#EDEAF0] text-[#3A2F47]',
  },
  {
    type: 'agreement_signed' as const,
    label: 'Agreement',
    icon: FileText,
    description: 'Require signed agreement or statement',
    color: 'bg-[#E8F1EE] text-[#1F453A]',
  },
  {
    type: 'time_based' as const,
    label: 'Time Restrictions',
    icon: Clock,
    description: 'Time-based Access',
    color: 'bg-[#FAF4EC] text-[#7A5F3F]',
  },
  // COMING SOON: Staking Requirements
  // {
  //   type: 'staking' as const,
  //   label: 'Staking Requirements (Coming Soon)',
  //   icon: Lock,
  //   description: 'Require staked tokens in specific pools',
  //   color: 'bg-red-100 text-red-700',
  //   disabled: true
  // }
];

export const EligibilityCriteriaBuilder: React.FC<
  EligibilityCriteriaBuilderProps
> = ({
  initialCriteria = [],
  onCriteriaChange,
  roleType,
  readonly = false,
  podId,
}) => {
  const { toast } = useToast();
  const { evmAddress: address } = useEvmAddress(); // Get user's wallet address
  const [criteria, setCriteria] =
    useState<EligibilityCriteria[]>(initialCriteria);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCriterion, setNewCriterion] = useState<
    Partial<EligibilityCriteria>
  >({
    type: 'token_balance',
    required: true, // Always true since all criteria being added are requirements
  });
  const [availableTokens, setAvailableTokens] = useState<AvailableToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [userTokenBalances, setUserTokenBalances] = useState<
    Record<string, string>
  >({});
  const [checkingBalances, setCheckingBalances] = useState(false);
  const [uploadingToIPFS, setUploadingToIPFS] = useState(false);
  const [availableHats, setAvailableHats] = useState<
    Array<{ id: string; name: string; type: 'leader' | 'member' }>
  >([]);

  // Check user's token balances in real-time
  const checkUserTokenBalances = async (tokenList: AvailableToken[]) => {
    if (!address || tokenList.length === 0) {
      setUserTokenBalances({});
      return;
    }

    setCheckingBalances(true);
    try {
      // Get all unique token addresses
      const tokenAddresses = [
        ...new Set(tokenList.map((token) => token.address)),
      ];

      const balances = await fetchTokenBalances(address);

      // Convert to record format for easy lookup
      const balanceRecord: Record<string, string> = {};

      // Map known environment contract addresses to balance values
      const envMappings = {
        [getClientHatId('EXECUTIVE_POD_LEADER')?.toLowerCase() || '']:
          balances.hasExecutivePod ? '1' : '0',
        [process.env.NEXT_PUBLIC_SYSTEM_TOKEN?.toLowerCase() || '']:
          balances.systemBalance,
        [process.env.NEXT_PUBLIC_SELF_TOKEN?.toLowerCase() || '']:
          balances.selfBalance,
        [process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY?.toLowerCase() || '']:
          balances.hasProofOfCuriosity ? '1' : '0',
        [process.env.NEXT_PUBLIC_MARKET_MANAGEMENT?.toLowerCase() || '']:
          balances.hasMarketManagement ? '1' : '0',
        [process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT?.toLowerCase() || '']:
          balances.hasBountyHat ? '1' : '0',
        [process.env.NEXT_PUBLIC_EVENT_MANAGEMENT?.toLowerCase() || '']:
          balances.hasEventManagement ? '1' : '0',
      };

      // Map token addresses to their balance values
      tokenAddresses.forEach((tokenAddress) => {
        const lowerAddress = tokenAddress.toLowerCase();
        const balance = envMappings[lowerAddress];
        if (balance !== undefined) {
          balanceRecord[lowerAddress] = balance;
        } else {
          balanceRecord[lowerAddress] = '1';
        }
      });

      setUserTokenBalances(balanceRecord);

      toast({
        title: 'Balances Updated',
        description: 'Token balances refreshed successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Failed to fetch user token balances:', error);
      toast({
        title: 'Balance Check Failed',
        description: 'Unable to check your token balances. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCheckingBalances(false);
    }
  };

  // Fetch available tokens from database
  useEffect(() => {
    const fetchAvailableTokens = async () => {
      setLoadingTokens(true);
      try {
        const tokens: AvailableToken[] = [];

        // Fetch from pods table (token_address field)
        const { data: podTokens, error: podError } = await supabase
          .from('pods')
          .select('name, token_address')
          .not('token_address', 'is', null);

        if (!podError) {
          podTokens?.forEach((pod) => {
            if (pod.token_address) {
              tokens.push({
                name: pod.name,
                address: pod.token_address,
                source: 'pods',
              });
            }
          });
        }

        // Fetch from tokens table (contract_address field)
        const { data: contractTokens, error: tokenError } = await supabase
          .from('tokens')
          .select('name, contract_address')
          .not('contract_address', 'is', null);

        if (!tokenError) {
          contractTokens?.forEach((token) => {
            if (token.contract_address) {
              tokens.push({
                name: token.name,
                address: token.contract_address,
                source: 'tokens',
              });
            }
          });
        }

        const envTokens: AvailableToken[] = [];

        // Add HAT tokens (Pod management tokens)
        if (getClientHatId('EXECUTIVE_POD_LEADER')) {
          envTokens.push({
            name: 'Executive Pod Leader',
            address: getClientHatId('EXECUTIVE_POD_LEADER'),
            source: 'pods',
          });
        }

        if (process.env.NEXT_PUBLIC_MARKET_MANAGEMENT) {
          envTokens.push({
            name: 'Market Management',
            address: process.env.NEXT_PUBLIC_MARKET_MANAGEMENT,
            source: 'pods',
          });
        }

        if (process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT) {
          envTokens.push({
            name: 'Bounty Management',
            address: process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT,
            source: 'pods',
          });
        }

        if (process.env.NEXT_PUBLIC_EVENT_MANAGEMENT) {
          envTokens.push({
            name: 'Event Management',
            address: process.env.NEXT_PUBLIC_EVENT_MANAGEMENT,
            source: 'pods',
          });
        }

        // Add NFT tokens
        if (process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY) {
          envTokens.push({
            name: 'Proof of Curiosity',
            address: process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY,
            source: 'tokens',
          });
        }

        // Filter out any undefined/empty addresses and combine with database tokens
        const validEnvTokens = envTokens.filter(
          (token) =>
            token.address &&
            token.address !== '0x0000000000000000000000000000000000000000' &&
            token.address !== '0x0000000000000000000000000000000000000001',
        );

        // Combine database tokens with environment tokens, avoiding duplicates
        const allTokens = [...tokens, ...validEnvTokens];
        const uniqueTokens = allTokens.filter(
          (token, index, arr) =>
            arr.findIndex(
              (t) => t.address.toLowerCase() === token.address.toLowerCase(),
            ) === index,
        );

        // Filter out $SELF and $SYSTEM tokens since they're covered in currency requirements
        const filteredTokens = uniqueTokens.filter(
          (token) =>
            token.address.toLowerCase() !== SELF_TOKEN_ADDRESS.toLowerCase() &&
            token.address.toLowerCase() !== SYSTEM_TOKEN_ADDRESS.toLowerCase(),
        );

        setAvailableTokens(filteredTokens);

        // Check user balances for these tokens
        if (address) {
          await checkUserTokenBalances(filteredTokens);
        }
      } catch (error) {
        toast({
          title: 'Loading Failed',
          description: 'Unable to load available credentials',
          variant: 'destructive',
        });
      } finally {
        setLoadingTokens(false);
      }
    };

    fetchAvailableTokens();
  }, [address]); // Re-run when user's address changes

  // Fetch available HATs from pods table
  useEffect(() => {
    const fetchAvailableHats = async () => {
      try {
        const { data: pods, error } = await supabase
          .from('pods')
          .select('id, name, management_hat_id, membership_hat_id')
          .not('management_hat_id', 'is', null);

        if (error) return;

        const hats: Array<{
          id: string;
          name: string;
          type: 'leader' | 'member';
        }> = [];

        pods?.forEach((pod) => {
          if (pod.management_hat_id) {
            hats.push({
              id: pod.management_hat_id,
              name: `${pod.name} - Leader`,
              type: 'leader',
            });
          }
          if (pod.membership_hat_id) {
            hats.push({
              id: pod.membership_hat_id,
              name: `${pod.name} - Member`,
              type: 'member',
            });
          }
        });

        setAvailableHats(hats);
      } catch {
        // silently ignore HAT fetch errors
      }
    };

    fetchAvailableHats();
  }, []);

  // Re-check balances when user wallet changes
  useEffect(() => {
    if (address && availableTokens.length > 0) {
      checkUserTokenBalances(availableTokens);
    }
  }, [address]);

  const updateCriteria = (updatedCriteria: EligibilityCriteria[]) => {
    setCriteria(updatedCriteria);
    onCriteriaChange(updatedCriteria);
  };

  // Auto-populate agreement text when agreement_signed is selected
  const populateAgreementText = async (
    criteriaType: 'leadership' | 'membership' = 'membership',
  ) => {
    if (!podId) return '';

    try {
      return await UnifiedAgreementService.getAgreementTextForCriteria(podId, criteriaType);
    } catch {
      return UnifiedAgreementService.getDefaultMembershipAgreement();
    }
  };

  // Upload agreement text to IPFS
  const handleUploadAgreementToIPFS = async (
    agreementText: string,
    agreementId: string,
  ) => {
    if (!agreementText || agreementText.trim().length === 0) {
      toast({
        title: 'Upload Failed',
        description: 'Agreement text cannot be empty',
        variant: 'destructive',
      });
      return null;
    }

    if (!AgreementIPFSService.isConfigured()) {
      toast({
        title: 'IPFS Not Configured',
        description:
          'Please add NEXT_PUBLIC_PINATA_JWT to your environment variables',
        variant: 'destructive',
      });
      return null;
    }

    try {
      setUploadingToIPFS(true);
      const cid = await AgreementIPFSService.uploadAgreement(
        agreementText,
        agreementId,
        podId,
        roleType,
      );

      toast({
        title: 'Agreement Uploaded',
        description: `Successfully uploaded to IPFS: ${cid.substring(0, 12)}...`,
        duration: 5000,
      });

      return cid;
    } catch (error: any) {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload agreement to IPFS',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploadingToIPFS(false);
    }
  };

  const updateExistingCriterion = (
    index: number,
    updates: Partial<EligibilityCriteria>,
  ) => {
    const updatedCriteria = [...criteria];
    updatedCriteria[index] = { ...updatedCriteria[index], ...updates };
    updateCriteria(updatedCriteria);
  };

  const addCriterion = () => {
    if (!newCriterion.type) {
      toast({
        title: 'Validation Error',
        description: 'Please select a criterion type',
        variant: 'destructive',
      });
      return;
    }

    // ✅ Check for duplicate agreement criterion
    if (newCriterion.type === 'agreement_signed') {
      const existingAgreement = criteria.find(
        (c) => c.type === 'agreement_signed',
      );
      if (existingAgreement) {
        toast({
          title: 'Agreement Already Exists',
          description:
            'This role already has an agreement requirement. Please edit or remove the existing one first.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Generate stable, meaningful ID instead of timestamp
    const generateStableId = (
      type: string,
      existingCriteria: EligibilityCriteria[],
    ): string => {
      const baseId = type.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const existing = existingCriteria.filter((c) => c.id?.startsWith(baseId));
      const counter = existing.length + 1;
      return `${baseId}_${counter}`;
    };

    // Handle token_balance type specially - create separate criteria for SELF and SYSTEM
    if (newCriterion.type === 'token_balance') {
      const criteriaToAdd: EligibilityCriteria[] = [];

      // Add SELF criterion if amount is specified
      if (
        (newCriterion as any).self_token_amount &&
        Number.parseFloat((newCriterion as any).self_token_amount) > 0
      ) {
        criteriaToAdd.push({
          ...newCriterion,
          id: generateStableId('token_balance_self', criteria),
          name: '$SELF Token Balance',
          contract_address: SELF_TOKEN_ADDRESS,
          minimum_amount: (newCriterion as any).self_token_amount,
          token_name: 'SELF',
          token_symbol: 'SELF',
        } as EligibilityCriteria);
      }

      // Add SYSTEM criterion if amount is specified
      if (
        (newCriterion as any).system_token_amount &&
        Number.parseFloat((newCriterion as any).system_token_amount) > 0
      ) {
        criteriaToAdd.push({
          ...newCriterion,
          id: generateStableId('token_balance_system', criteria),
          name: '$SYSTEM Token Balance',
          contract_address: SYSTEM_TOKEN_ADDRESS,
          minimum_amount: (newCriterion as any).system_token_amount,
          token_name: 'SYSTEM',
          token_symbol: 'SYSTEM',
        } as EligibilityCriteria);
      }

      if (criteriaToAdd.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please specify an amount for at least one token',
          variant: 'destructive',
        });
        return;
      }

      updateCriteria([...criteria, ...criteriaToAdd]);
      setNewCriterion({ type: 'token_balance', required: true });
      setShowAddForm(false);

      const tokenNames = criteriaToAdd.map((c) => c.token_name).join(' and ');
      toast({
        title: 'Criteria Added',
        description: `Added ${tokenNames} balance requirements`,
      });
      return;
    }

    // Handle other criterion types normally
    const criterion: EligibilityCriteria = {
      ...newCriterion,
      id: generateStableId(newCriterion.type, criteria),
      name:
        newCriterion.name ||
        (newCriterion.type === 'agreement_signed'
          ? 'Pod Agreement'
          : `${newCriterion.type.replace('_', ' ')} requirement`),
    } as EligibilityCriteria;

    updateCriteria([...criteria, criterion]);
    setNewCriterion({ type: 'token_balance', required: true });
    setShowAddForm(false);

    toast({
      title: 'Criterion Added',
      description: `Added ${criterion.name} to eligibility requirements`,
    });
  };

  const removeCriterion = (index: number) => {
    try {
      if (index < 0 || index >= criteria.length) {
        toast({
          title: 'Removal Failed',
          description: 'Invalid criterion index',
          variant: 'destructive',
        });
        return;
      }

      const removed = criteria[index];
      const updatedCriteria = criteria.filter((_, i) => i !== index);
      updateCriteria(updatedCriteria);

      toast({
        title: 'Criterion Removed',
        description: `Removed ${removed?.name || 'criterion'} from requirements`,
      });
    } catch (error) {
      toast({
        title: 'Removal Failed',
        description: 'Failed to remove eligibility criterion',
        variant: 'destructive',
      });
    }
  };

  const updateCriterion = (
    index: number,
    updates: Partial<EligibilityCriteria>,
  ) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], ...updates };
    updateCriteria(updated);
  };

  const getTypeConfig = (type: EligibilityCriteria['type']) => {
    return CRITERION_TYPES.find((t) => t.type === type) || CRITERION_TYPES[0];
  };

  const renderCriterionForm = (
    criterion: Partial<EligibilityCriteria>,
    isNew = false,
    index?: number,
  ) => {
    const typeConfig = getTypeConfig(criterion.type || 'token_balance');
    const Icon = typeConfig.icon;

    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${typeConfig.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">{typeConfig.label}</CardTitle>
                <p className="text-sm text-gray-600">
                  {typeConfig.description}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* No common fields - criteria are self-explanatory */}

          {criterion.description !== undefined && (
            <div>
              <Label>Description</Label>
              <Textarea
                value={criterion.description || ''}
                onChange={(e) => {
                  if (isNew) {
                    setNewCriterion((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }));
                  } else if (index !== undefined) {
                    updateExistingCriterion(index, {
                      description: e.target.value,
                    });
                  }
                }}
                placeholder="Describe this requirement"
                rows={2}
                disabled={readonly}
              />
            </div>
          )}

          {/* Type-specific fields */}
          {criterion.type === 'token_balance' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <Label className="text-lg font-medium mb-3 block">
                  Token Requirements
                </Label>
                <div className="space-y-4">
                  <div>
                    <Label className="flex items-center gap-2 mb-1">
                      <Img
                        src="/images/erc20tokens/SelfToken.png"
                        alt="SELF Token"
                        width={16}
                        height={16}
                        className="h-4 w-4"
                      />
                      $SELF
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={
                        (criterion as any).self_token_amount ||
                        (criterion.contract_address?.toLowerCase() ===
                        SELF_TOKEN_ADDRESS.toLowerCase()
                          ? criterion.minimum_amount
                          : '') ||
                        ''
                      }
                      onChange={(e) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            self_token_amount: e.target.value,
                            contract_address: SELF_TOKEN_ADDRESS,
                          }));
                        } else if (index !== undefined) {
                          updateExistingCriterion(index, {
                            minimum_amount: e.target.value,
                            contract_address: SELF_TOKEN_ADDRESS,
                            token_name: 'SELF',
                            token_symbol: 'SELF',
                          });
                        }
                      }}
                      placeholder="0 (leave blank for no requirement)"
                      disabled={readonly}
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2 mb-1">
                      <Img
                        src="/images/erc20tokens/SystemToken.png"
                        alt="System Token"
                        width={16}
                        height={16}
                        className="h-4 w-4"
                      />
                      $SYSTEM
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={
                        (criterion as any).system_token_amount ||
                        (criterion.contract_address?.toLowerCase() ===
                        SYSTEM_TOKEN_ADDRESS.toLowerCase()
                          ? criterion.minimum_amount
                          : '') ||
                        ''
                      }
                      onChange={(e) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            system_token_amount: e.target.value,
                            contract_address: SYSTEM_TOKEN_ADDRESS,
                          }));
                        } else if (index !== undefined) {
                          if (
                            criterion.contract_address?.toLowerCase() ===
                            SYSTEM_TOKEN_ADDRESS.toLowerCase()
                          ) {
                            updateExistingCriterion(index, {
                              minimum_amount: e.target.value,
                              contract_address: SYSTEM_TOKEN_ADDRESS,
                              token_name: 'SYSTEM',
                              token_symbol: 'SYSTEM',
                            });
                          } else {
                            toast({
                              title: 'Note',
                              description:
                                'Please save the current criteria and add a new one for SYSTEM token',
                              variant: 'default',
                            });
                          }
                        }
                      }}
                      placeholder="0 (leave blank for no requirement)"
                      disabled={readonly}
                    />
                  </div>
                </div>
                <div
                  className="mt-3 text-sm text-gray-600 p-3 rounded"
                  style={{ backgroundColor: '#E8F1EE' }}
                >
                  <strong>Note:</strong> Users will need to meet the
                  requirements for both tokens if amounts are specified for
                  both. Leave blank or set to 0 if that token is not required.
                </div>
              </div>
            </div>
          )}

          {criterion.type === 'credential_ownership' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label>Select Credential</Label>
                    {loadingTokens || checkingBalances ? (
                      <div className="flex items-center gap-2 p-2 text-gray-500">
                        <div
                          className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full"
                          style={{
                            borderColor: '#2F5D50',
                            borderTopColor: 'transparent',
                          }}
                        ></div>
                        {loadingTokens
                          ? 'Loading available credentials...'
                          : 'Checking your token balances...'}
                      </div>
                    ) : address ? (
                      <div className="space-y-2">
                        <select
                          value={criterion.contract_address || ''}
                          onChange={(e) => {
                            const selectedToken = availableTokens.find(
                              (token) => token.address === e.target.value,
                            );
                            if (isNew) {
                              setNewCriterion((prev) => ({
                                ...prev,
                                contract_address: e.target.value,
                                credential_name: selectedToken?.name || '',
                                minimum_amount: '1', // Default to requiring 1 credential
                              }));
                            } else if (index !== undefined) {
                              updateExistingCriterion(index, {
                                contract_address: e.target.value,
                                credential_name: selectedToken?.name || '',
                                minimum_amount: '1', // Default to requiring 1 credential
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={readonly}
                        >
                          <option value="">Select a credential...</option>
                          {/* Show only tokens that the user actually holds */}
                          {availableTokens
                            .filter((token) => {
                              const balance =
                                userTokenBalances[token.address.toLowerCase()];
                              return balance && Number.parseFloat(balance) > 0;
                            })
                            .map((token, index) => {
                              const balance =
                                userTokenBalances[token.address.toLowerCase()];
                              return (
                                <option
                                  key={`${token.address}-${index}`}
                                  value={token.address}
                                >
                                  {token.name} (Balance:{' '}
                                  {Number.parseFloat(balance || '0').toFixed(2)}
                                  )
                                </option>
                              );
                            })}
                        </select>

                        {/* Show message if user has no eligible tokens */}
                        {availableTokens.filter((token) => {
                          const balance =
                            userTokenBalances[token.address.toLowerCase()];
                          return balance && Number.parseFloat(balance) > 0;
                        }).length === 0 &&
                          availableTokens.length > 0 && (
                            <div className="flex items-center gap-2 p-3 text-amber-700 bg-amber-50 border border-amber-200 rounded">
                              <AlertCircle className="h-4 w-4" />
                              <div className="text-sm">
                                <p className="font-medium">
                                  No Eligible Credentials
                                </p>
                                <p>
                                  You don't hold any tokens that can be used as
                                  credentials. You can only create requirements
                                  for tokens you actually possess.
                                </p>
                              </div>
                            </div>
                          )}

                        {/* Refresh button for real-time checking */}
                        {availableTokens.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              checkUserTokenBalances(availableTokens)
                            }
                            disabled={checkingBalances}
                            className="text-xs"
                          >
                            {checkingBalances ? (
                              <>
                                <div className="animate-spin h-3 w-3 border border-gray-400 border-t-transparent rounded-full mr-1"></div>
                                Checking...
                              </>
                            ) : (
                              'Refresh Balances'
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 text-amber-700 bg-amber-50 border border-amber-200 rounded">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">
                          Please connect your wallet to see available
                          credentials
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Only credentials you currently hold are shown. Token
                      balances are checked in real-time.
                    </p>
                    <p
                      className="text-xs mt-2 p-2 rounded border"
                      style={{
                        color: '#2F5D50',
                        backgroundColor: '#E8F1EE',
                        borderColor: '#B8D9CA',
                      }}
                    >
                      <strong>Tip:</strong> HAT roles (pod membership tokens)
                      appear in this dropdown alongside other credentials. If
                      you want to require multiple credentials, add each as a
                      separate requirement.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {criterion.type === 'agreement_signed' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <Label className="text-lg font-medium mb-3 block">
                  Agreement Requirements
                </Label>

                <div className="space-y-4">
                  <div>
                    <Label>Agreement Name (Display Title)</Label>
                    <Input
                      value={criterion.name || ''}
                      onChange={(e) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }));
                        } else if (index !== undefined) {
                          updateExistingCriterion(index, {
                            name: e.target.value,
                          });
                        }
                      }}
                      placeholder="Pod Agreement"
                      disabled={readonly}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This name will be displayed on the agreements panel (e.g.,
                      "Leadership Accountability Agreement")
                    </p>
                  </div>

                  <div>
                    <Label>Agreement Identifier</Label>
                    <Input
                      value={criterion.agreement_hash || ''}
                      onChange={(e) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            agreement_hash: e.target.value,
                            signature_required: true, // Always require signature for agreements
                          }));
                        }
                      }}
                      placeholder="pod_leadership_agreement"
                      disabled={readonly}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Unique identifier for this agreement (e.g.,
                      "pod_leadership_agreement_v1")
                    </p>
                  </div>

                  <div>
                    <Label>Agreement Text</Label>
                    <Textarea
                      value={criterion.agreement_text || ''}
                      onChange={(e) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            agreement_text: e.target.value,
                          }));
                        } else if (index !== undefined) {
                          updateExistingCriterion(index, {
                            agreement_text: e.target.value,
                          });
                        }
                      }}
                      placeholder="Enter the full text of the agreement that users must sign..."
                      rows={6}
                      disabled={readonly}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The complete agreement text that users will see and sign
                      onchain
                    </p>
                  </div>

                  {/* IPFS Upload Section */}
                  {criterion.agreement_text &&
                    criterion.agreement_text.length > 0 && (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            const agreementId =
                              criterion.agreement_hash ||
                              `agreement_${Date.now()}`;
                            const cid = await handleUploadAgreementToIPFS(
                              criterion.agreement_text || '',
                              agreementId,
                            );

                            if (cid) {
                              if (isNew) {
                                setNewCriterion((prev) => ({
                                  ...prev,
                                  agreement_cid: cid,
                                  agreement_hash: agreementId,
                                }));
                              } else if (index !== undefined) {
                                updateExistingCriterion(index, {
                                  agreement_cid: cid,
                                  agreement_hash: agreementId,
                                });
                              }
                            }
                          }}
                          disabled={
                            readonly ||
                            uploadingToIPFS ||
                            !AgreementIPFSService.isConfigured()
                          }
                          className="w-full"
                        >
                          {uploadingToIPFS ? (
                            <>
                              <div
                                className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full mr-2"
                                style={{
                                  borderColor: '#2F5D50',
                                  borderTopColor: 'transparent',
                                }}
                              ></div>
                              Creating...
                            </>
                          ) : criterion.agreement_cid ? (
                            <>
                              <CheckCircle
                                className="h-4 w-4 mr-2"
                                style={{ color: '#3F7A5A' }}
                              />
                              Submit Changes
                            </>
                          ) : (
                            <>Create</>
                          )}
                        </Button>

                        {criterion.agreement_cid && (
                          <div
                            className="border p-3 rounded"
                            style={{
                              backgroundColor: '#D1E6DC',
                              borderColor: '#B8D9CA',
                            }}
                          >
                            <p
                              className="text-xs font-medium"
                              style={{ color: '#1F453A' }}
                            >
                              ✅ Criteria Created
                            </p>
                            <p
                              className="text-xs font-mono mt-1 break-all"
                              style={{ color: '#2F5D50' }}
                            >
                              CID: {criterion.agreement_cid}
                            </p>
                            <a
                              href={AgreementIPFSService.getGatewayUrl(
                                criterion.agreement_cid,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs hover:underline mt-1 inline-block"
                              style={{ color: '#2F5D50' }}
                            >
                              View on IPFS →
                            </a>
                          </div>
                        )}

                        {!AgreementIPFSService.isConfigured() && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded">
                            <p className="text-xs text-amber-800">
                              <strong>⚠️ IPFS not configured:</strong> Add
                              NEXT_PUBLIC_PINATA_JWT to .env to enable on-chain
                              agreement storage
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                  <div
                    className="border p-3 rounded"
                    style={{
                      backgroundColor: '#E8F1EE',
                      borderColor: '#B8D9CA',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <FileText
                        className="h-4 w-4 mt-0.5"
                        style={{ color: '#2F5D50' }}
                      />
                      <div className="text-sm">
                        <p className="font-medium" style={{ color: '#1F453A' }}>
                          Instructions
                        </p>
                        <p style={{ color: '#2F5D50' }}>
                          Create Requirement first, then 'Add' below.
                        </p>
                      </div>
                    </div>
                  </div>

                  {criterion.agreement_text && (
                    <div>
                      <Label className="mb-2 block">Agreement Preview</Label>
                      <div className="border border-gray-300 rounded-lg p-4 bg-white max-h-40 overflow-y-auto">
                        <div className="text-sm whitespace-pre-wrap">
                          {criterion.agreement_text}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {criterion.type === 'time_based' && (
            <div className="space-y-4">
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-700 mb-4">
                  Set when membership becomes active and when it expires.
                  Requires renewal after expiration.
                </p>

                <div className="space-y-4">
                  <div>
                    <Label className="flex flex-col gap-0.5 mb-2">
                      <span>Start Date</span>
                      <span className="text-xs text-gray-500">
                        Leave blank for immediate
                      </span>
                    </Label>
                    <DateTimePicker
                      value={criterion.valid_from || ''}
                      onChange={(value) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            valid_from: value,
                          }));
                        } else if (index !== undefined) {
                          updateExistingCriterion(index, { valid_from: value });
                        }
                      }}
                      disabled={readonly}
                      placeholder="Select start date (optional)"
                      className="w-full"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Members cannot join before this date
                    </p>
                  </div>

                  <div>
                    <Label className="flex flex-col gap-0.5 mb-2">
                      <span>Expiration Date</span>
                      <span className="text-xs" style={{ color: '#8B3A3A' }}>
                        *Required
                      </span>
                    </Label>
                    <DateTimePicker
                      value={criterion.valid_until || ''}
                      onChange={(value) => {
                        if (isNew) {
                          setNewCriterion((prev) => ({
                            ...prev,
                            valid_until: value,
                          }));
                        } else if (index !== undefined) {
                          updateExistingCriterion(index, {
                            valid_until: value,
                          });
                        }
                      }}
                      disabled={readonly}
                      placeholder="Select expiration date"
                      required={true}
                      className="w-full"
                    />
                  </div>

                  {/* Show duration if both dates are set */}
                  {criterion.valid_from && criterion.valid_until && (
                    <div className="bg-white p-3 rounded border border-amber-100">
                      <p className="text-sm text-gray-700">
                        <strong>Duration:</strong>{' '}
                        {Math.ceil(
                          (new Date(criterion.valid_until).getTime() -
                            new Date(criterion.valid_from).getTime()) /
                            (1000 * 60 * 60 * 24),
                        )}{' '}
                        days
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(criterion.type as any) === 'reputation_score' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Minimum Score</Label>
                <Input
                  type="number"
                  value={(criterion as any).minimum_score || ''}
                  onChange={(e) => {
                    if (isNew) {
                      setNewCriterion((prev) => ({
                        ...prev,
                        minimum_score: Number.parseInt(e.target.value),
                      }));
                    }
                  }}
                  placeholder="100"
                  disabled={readonly}
                />
              </div>
              <div>
                <Label>Scoring Contract (Optional)</Label>
                <Input
                  value={(criterion as any).scoring_contract || ''}
                  onChange={(e) => {
                    if (isNew) {
                      setNewCriterion((prev) => ({
                        ...prev,
                        scoring_contract: e.target.value,
                      }));
                    }
                  }}
                  placeholder="0x..."
                  className="font-mono text-sm"
                  disabled={readonly}
                />
              </div>
            </div>
          )}

          {criterion.type === 'staking' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Staking Pool Address</Label>
                <Input
                  value={criterion.staking_pool || ''}
                  onChange={(e) => {
                    if (isNew) {
                      setNewCriterion((prev) => ({
                        ...prev,
                        staking_pool: e.target.value,
                      }));
                    }
                  }}
                  placeholder="0x..."
                  className="font-mono text-sm"
                  disabled={readonly}
                />
              </div>
              <div>
                <Label>Minimum Staked Amount</Label>
                <Input
                  value={criterion.minimum_staked || ''}
                  onChange={(e) => {
                    if (isNew) {
                      setNewCriterion((prev) => ({
                        ...prev,
                        minimum_staked: e.target.value,
                      }));
                    }
                  }}
                  placeholder="1000000000000000000"
                  disabled={readonly}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Eligibility Criteria</h3>
        </div>
        {!readonly && (
          <Button
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add New
          </Button>
        )}
      </div>

      {/* Existing criteria */}
      {criteria.length > 0 && (
        <div className="space-y-4">
          {criteria.map((criterion, index) => (
            <div key={criterion.id || index} className="relative">
              {renderCriterionForm(criterion, false, index)}
              {!readonly && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-4 right-4"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F5E6E6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={() => removeCriterion(index)}
                >
                  <Trash2 className="h-4 w-4" style={{ color: '#8B3A3A' }} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new criterion form */}
      {showAddForm && !readonly && (
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <select
              value={newCriterion.type}
              onChange={async (e) => {
                const selectedType = e.target
                  .value as EligibilityCriteria['type'];

                if (selectedType === 'agreement_signed' && podId) {
                  const criteriaType =
                    roleType === 'leader' ? 'leadership' : 'membership';
                  const agreementText =
                    await populateAgreementText(criteriaType);

                  setNewCriterion((prev) => ({
                    ...prev,
                    type: selectedType,
                    agreement_text: agreementText,
                    name:
                      criteriaType === 'leadership'
                        ? 'Leadership Accountability Agreement'
                        : 'Pod Membership Agreement',
                    agreement_hash: `${podId}_${criteriaType}_agreement`,
                    signature_required: true,
                  }));

                  toast({
                    title: 'Agreement Auto-Populated',
                    description: `Loaded existing ${criteriaType} agreement for this pod.`,
                    duration: 3000,
                  });
                } else {
                  setNewCriterion((prev) => ({
                    ...prev,
                    type: selectedType,
                  }));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CRITERION_TYPES.map((type) => (
                <option key={type.type} value={type.type}>
                  {type.label} - {type.description}
                </option>
              ))}
            </select>
          </div>

          {renderCriterionForm(newCriterion, true)}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddForm(false);
                setNewCriterion({ type: 'token_balance', required: true });
              }}
            >
              Cancel
            </Button>
            <Button onClick={addCriterion}>Add</Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {criteria.length === 0 && !showAddForm && (
        <Card className="border-2 border-dashed border-gray-300">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              No Eligibility Criteria Defined
            </h4>
            <p className="text-gray-600 text-center mb-4">
              Without eligibility criteria, all users will have access to this
              role by default.
            </p>
            {!readonly && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Criterion
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {criteria.length > 0 && (
        <div
          className="border rounded-lg p-4"
          style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}
        >
          <div className="flex items-start gap-3">
            <CheckCircle
              className="h-5 w-5 mt-0.5"
              style={{ color: '#2F5D50' }}
            />
            <div>
              <h4 className="font-medium" style={{ color: '#1F453A' }}>
                Eligibility Summary
              </h4>
              <p className="text-sm" style={{ color: '#2F5D50' }}>
                Users must meet{' '}
                <strong>
                  all {criteria.filter((c) => c.required).length} required
                  criteria
                </strong>
                {criteria.filter((c) => !c.required).length > 0 &&
                  ` and any of ${criteria.filter((c) => !c.required).length} optional criteria`}{' '}
                to obtain this role.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
