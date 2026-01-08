'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  Image,
  FileText,
  Clock,
  Star,
  Lock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useToast } from '@/components/ui/use-toast';
import {
  EligibilityService,
  type EligibilityCriteria,
  type EligibilityEvaluation,
} from '../services/EligibilityService';

interface EligibilityCriteriaDisplayProps {
  criteria: EligibilityCriteria[];
  podId: string;
  roleId?: string;
  showUserStatus?: boolean;
  compact?: boolean;
}

const CRITERION_ICONS = {
  token_balance: Coins,
  nft_ownership: Image,
  agreement_signed: FileText,
  time_based: Clock,
  reputation_score: Star,
  staking: Lock,
};

export const EligibilityCriteriaDisplay: React.FC<
  EligibilityCriteriaDisplayProps
> = ({ criteria, podId, roleId, showUserStatus = false, compact = false }) => {
  const { evmAddress: address } = useEvmAddress();
  const { toast } = useToast();

  const [evaluation, setEvaluation] = useState<EligibilityEvaluation | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const checkEligibility = async () => {
    if (!showUserStatus || !address) return;

    setLoading(true);
    try {
      const result = await EligibilityService.evaluateCriteria({
        userAddress: address,
        podId,
        roleId,
        criteria,
      });

      setEvaluation(result);

      console.log('✅ Eligibility check completed:', result);
    } catch (error) {
      console.error('❌ Eligibility check failed:', error);
      toast({
        title: 'Eligibility Check Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to check eligibility',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-check on mount if user status is enabled
  useEffect(() => {
    if (showUserStatus && address && criteria.length > 0) {
      checkEligibility();
    }
  }, [showUserStatus, address, criteria.length]);

  const getCriterionIcon = (type: EligibilityCriteria['type']) => {
    return CRITERION_ICONS[type as keyof typeof CRITERION_ICONS] || AlertCircle;
  };

  const getCredentialDisplayName = (criterion: EligibilityCriteria) => {
    console.log('🏷️ Getting display name for criterion:', {
      type: criterion.type,
      name: criterion.name,
      token_name: criterion.token_name,
      contract_address: criterion.contract_address,
      fullCriterion: criterion,
    });

    // For token_balance type, handle $SELF and $SYSTEM specially
    if (criterion.type === 'token_balance') {
      // Check for $SELF or $SYSTEM tokens by contract address
      const SELF_ADDRESS =
        process.env.NEXT_PUBLIC_SELF_TOKEN?.toLowerCase() ||
        '0xe9b4ab2eb9397fa41ac3223e96f9d988beff5d21'.toLowerCase();
      const SYSTEM_ADDRESS =
        process.env.NEXT_PUBLIC_SYSTEM_TOKEN?.toLowerCase() ||
        '0x1317ae277266d38c4e492558f8693f14143a6a65'.toLowerCase();

      const contractLower = criterion.contract_address?.toLowerCase();

      if (contractLower === SELF_ADDRESS) {
        // Check for the correct amount field - could be minimum_amount or self_token_amount
        const rawAmount =
          criterion.minimum_amount || (criterion as any).self_token_amount || '1';
        const amount = Number.parseFloat(rawAmount).toFixed(3);
        console.log('💰 SELF amount display:', {
          rawAmount,
          amount,
          criterion,
        });
        return `$SELF (${amount})`;
      }

      if (contractLower === SYSTEM_ADDRESS) {
        // Check for the correct amount field - could be minimum_amount or system_token_amount
        const rawAmount =
          criterion.minimum_amount || (criterion as any).system_token_amount || '1';
        const amount = Number.parseFloat(rawAmount).toFixed(3);
        console.log('💰 SYSTEM amount display:', {
          rawAmount,
          amount,
          criterion,
        });
        return `$SYSTEM (${amount})`;
      }

      // For other token_balance criteria, try to get the name
      if (criterion.token_name) {
        const amount = criterion.minimum_amount
          ? Number.parseFloat(criterion.minimum_amount).toFixed(3)
          : '1.000';
        return `${criterion.token_name} (${amount})`;
      }

      if (criterion.name && criterion.name !== 'token balance requirement') {
        const amount = criterion.minimum_amount
          ? Number.parseFloat(criterion.minimum_amount).toFixed(3)
          : '1.000';
        return `${criterion.name} (${amount})`;
      }

      // Fallback for token_balance
      return 'Token Balance Requirement';
    }

    // For credential_ownership and nft_ownership types
    // Priority 1: Check token_name from database join (this should be populated by the query)
    if (criterion.token_name) {
      console.log('✅ Using token_name from database:', criterion.token_name);
      return criterion.token_name;
    }

    // Priority 2: Check if name is NOT a generic placeholder
    const isGenericName =
      criterion.name === 'credential ownership requirement' ||
      criterion.name === 'nft ownership requirement' ||
      !criterion.name;

    if (criterion.name && !isGenericName) {
      console.log('✅ Using criterion.name:', criterion.name);
      return criterion.name;
    }

    // Priority 3: Try to determine name based on known contract addresses
    if (criterion.contract_address) {
      const contractLower = criterion.contract_address.toLowerCase();

      // Known contract addresses mapping
      if (contractLower === '0x592e560171d2a882474cdfc3bbeedb21ceb4015d') {
        console.log('✅ Recognized Advocate contract address');
        return 'Advocate';
      }

      // Add more known contracts here as needed
      console.log(
        '⚠️ Unknown contract address - needs to be added to tokens table:',
        criterion.contract_address,
      );
      return 'Token Requirement';
    }

    // Final fallback
    console.log(
      '❌ No token information available - database query may not be joining tokens table',
    );
    return 'Token Requirement';
  };

  const formatCriterionValue = (criterion: EligibilityCriteria) => {
    switch (criterion.type as any) {
      case 'token_balance':
        // Amount is already shown in the title for token_balance
        return 'Token holding requirement';
      case 'nft_ownership':
      case 'credential_ownership':
        return 'Ownership required';
      case 'agreement_signed':
        return 'Signature required';
      case 'time_based':
        return criterion.valid_until
          ? `Until ${new Date(criterion.valid_until).toLocaleDateString()}`
          : 'Time restricted';
      case 'reputation_score':
        return `Score ≥ ${(criterion as any).minimum_score}`;
      case 'staking':
        return `${(criterion as any).minimum_staked} staked`;
      default:
        return 'Custom requirement';
    }
  };

  const renderCriterionStatus = (criterion: EligibilityCriteria) => {
    if (!evaluation || !criterion.id) return null;

    const result = evaluation.criteriaResults[criterion.id];
    if (!result) return null;

    if (result.passed) {
      return (
        <div
          className="flex items-center justify-center"
          style={{ color: '#3F7A5A' }}
        >
          <CheckCircle className="h-5 w-5" />
        </div>
      );
    } else {
      return (
        <div
          className="flex items-center justify-center"
          style={{ color: '#8B3A3A' }}
        >
          <XCircle className="h-5 w-5" />
        </div>
      );
    }
  };

  if (criteria.length === 0) {
    return (
      <Card className="border-dashed border-gray-300">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
          <p className="text-gray-600 text-sm text-center">
            No eligibility criteria defined for this role
          </p>
          <p className="text-xs text-gray-500 mt-1">
            All users have access by default
          </p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="space-y-1">
          {criteria.map((criterion, index) => {
            const Icon = getCriterionIcon(criterion.type);
            return (
              <div
                key={criterion.id || index}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span>{getCredentialDisplayName(criterion)}</span>
                </div>
                {showUserStatus && renderCriterionStatus(criterion)}
              </div>
            );
          })}
        </div>

        {evaluation && (
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Overall Status:</span>
              <Badge variant={evaluation.eligible ? 'default' : 'destructive'}>
                {evaluation.eligible ? 'Eligible' : 'Not Eligible'}
              </Badge>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Eligibility Requirements</h3>
          <p className="text-sm text-gray-600">
            Requirements to obtain this role
          </p>
        </div>
      </div>

      {/* Overall status card */}
      {evaluation && showUserStatus && (
        <Card
          className="border-2"
          style={{
            borderColor: evaluation.eligible ? '#B8D9CA' : '#D9B3B3',
            backgroundColor: evaluation.eligible ? '#D1E6DC' : '#F5E6E6',
          }}
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {evaluation.eligible ? (
                  <CheckCircle
                    className="h-6 w-6"
                    style={{ color: '#3F7A5A' }}
                  />
                ) : (
                  <XCircle className="h-6 w-6" style={{ color: '#8B3A3A' }} />
                )}
                <div>
                  <h4
                    className="font-semibold"
                    style={{
                      color: evaluation.eligible ? '#1F453A' : '#5C1F1F',
                    }}
                  >
                    {evaluation.eligible ? 'You are eligible!' : 'Not eligible'}
                  </h4>
                  <p
                    className="text-sm"
                    style={{
                      color: evaluation.eligible ? '#2F5D50' : '#8B3A3A',
                    }}
                  >
                    {evaluation.overallResult.message}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div
                  className="text-2xl font-bold"
                  style={{
                    color: evaluation.eligible ? '#3F7A5A' : '#8B3A3A',
                  }}
                >
                  {evaluation.overallResult.passed}/
                  {evaluation.overallResult.total}
                </div>
                <p className="text-xs text-gray-600">criteria met</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual criteria */}
      <div className="grid gap-4">
        {criteria.map((criterion, index) => {
          const Icon = getCriterionIcon(criterion.type);

          return (
            <Card
              key={criterion.id || index}
              className="border-l-4"
              style={{ borderLeftColor: '#3F7A5A' }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {getCredentialDisplayName(criterion)}
                      </CardTitle>
                      {criterion.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {criterion.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {showUserStatus && renderCriterionStatus(criterion)}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-2">
                  {criterion.type === 'time_based' && (
                    <div className="space-y-1 text-sm">
                      {criterion.valid_from && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Valid from:</span>
                          <span>
                            {new Date(criterion.valid_from).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {criterion.valid_until && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Valid until:</span>
                          <span>
                            {new Date(criterion.valid_until).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
