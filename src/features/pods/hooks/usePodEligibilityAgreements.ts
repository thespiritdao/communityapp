import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import {
  EligibilityService,
  type EligibilityCriteria,
} from '../services/EligibilityService';
import { AccountabilitySignatureService } from '../services/AccountabilitySignatureService';
import { supabase } from '@/utils/supabaseClient';

interface AgreementRequirement {
  agreementCid: string;
  hatId: bigint;
  eligibilityModuleAddress: `0x${string}`;
  roleType: 'leader' | 'member';
}

interface UsePodEligibilityAgreementsResult {
  agreements: AgreementRequirement[];
  loading: boolean;
  error: string | null;
  hasUnsignedAgreements: boolean;
  checkSignatureStatus: (
    agreementCid: string,
    hatId: bigint,
    eligibilityModuleAddress: `0x${string}`,
  ) => Promise<boolean>;
}

/**
 * Hook to fetch and manage pod eligibility agreements
 *
 * Checks both leader and member roles for agreement requirements
 * Returns unsigned agreements that need user signature
 */
export function usePodEligibilityAgreements(
  podId: string,
): UsePodEligibilityAgreementsResult {
  const [agreements, setAgreements] = useState<AgreementRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsignedAgreements, setHasUnsignedAgreements] = useState(false);

  const { address } = useAccount();
  const publicClient = usePublicClient();

  const ELIGIBILITY_MODULE_ABI = [
    {
      name: 'hasSignedAgreement',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'user', type: 'address' },
        { name: 'hatId', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] as const;

  useEffect(() => {
    if (!podId) {
      setLoading(false);
      return;
    }

    const fetchEligibilityAgreements = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 Fetching eligibility criteria for pod:', podId);

        // Fetch both leader and member eligibility criteria
        const leaderCriteria = await EligibilityService.getEligibilityCriteria(
          podId,
          'leader',
        );
        const memberCriteria = await EligibilityService.getEligibilityCriteria(
          podId,
          'member',
        );

        console.log('📋 Criteria fetch results:', {
          leaderCriteria: leaderCriteria
            ? `${leaderCriteria.criteria.length} criteria`
            : 'null',
          memberCriteria: memberCriteria
            ? `${memberCriteria.criteria.length} criteria`
            : 'null',
        });

        const allAgreements: AgreementRequirement[] = [];

        // Check leader criteria for agreements
        if (leaderCriteria) {
          const leaderAgreements = leaderCriteria.criteria.filter(
            (c: EligibilityCriteria) => c.type === 'agreement_signed',
          );

          console.log(`🔍 Leader agreements found: ${leaderAgreements.length}`);
          console.log(
            `🔍 Leader agreement details:`,
            leaderAgreements.map((a) => ({
              name: a.name,
              has_cid: !!a.agreement_cid,
              has_hash: !!a.agreement_hash,
            })),
          );

          for (const agreement of leaderAgreements) {
            // ✅ FIX: Accept EITHER agreement_cid (IPFS-based) OR agreement_hash (database-based)
            const agreementId =
              agreement.agreement_cid || agreement.agreement_hash;

            if (agreementId && leaderCriteria.hatId) {
              allAgreements.push({
                agreementCid: agreementId, // Can be CID or hash - both work
                hatId: BigInt(leaderCriteria.hatId),
                eligibilityModuleAddress:
                  leaderCriteria.eligibilityModule as `0x${string}`,
                roleType: 'leader',
              });

              console.log(
                `✅ Added leader agreement: ${agreement.name} (id: ${agreementId})`,
              );
            } else {
              console.warn(`⚠️ Leader agreement missing ID:`, agreement);
            }
          }
        }

        // Check member criteria for agreements
        if (memberCriteria) {
          const memberAgreements = memberCriteria.criteria.filter(
            (c: EligibilityCriteria) => c.type === 'agreement_signed',
          );

          console.log(`🔍 Member agreements found: ${memberAgreements.length}`);
          console.log(
            `🔍 Member agreement details:`,
            memberAgreements.map((a) => ({
              name: a.name,
              has_cid: !!a.agreement_cid,
              has_hash: !!a.agreement_hash,
            })),
          );

          for (const agreement of memberAgreements) {
            // ✅ FIX: Accept EITHER agreement_cid (IPFS-based) OR agreement_hash (database-based)
            const agreementId =
              agreement.agreement_cid || agreement.agreement_hash;

            if (agreementId && memberCriteria.hatId) {
              allAgreements.push({
                agreementCid: agreementId, // Can be CID or hash - both work
                hatId: BigInt(memberCriteria.hatId),
                eligibilityModuleAddress:
                  memberCriteria.eligibilityModule as `0x${string}`,
                roleType: 'member',
              });

              console.log(
                `✅ Added member agreement: ${agreement.name} (id: ${agreementId})`,
              );
            } else {
              console.warn(`⚠️ Member agreement missing ID:`, agreement);
            }
          }
        }

        console.log(
          '✅ Total eligibility agreements found:',
          allAgreements.length,
        );

        setAgreements(allAgreements);

        // ✅ FIX: Check signature status in BOTH on-chain AND database
        if (allAgreements.length === 0) {
          // No agreement criteria = no unsigned agreements
          console.log(
            'ℹ️ No agreement criteria defined - no signatures required',
          );
          setHasUnsignedAgreements(false);
        } else if (address && allAgreements.length > 0) {
          // First check database for accountability signatures
          const { data: dbSignatures } = await supabase
            .from('pod_accountability_signatures')
            .select('*')
            .eq('pod_id', podId)
            .eq('signer_address', address.toLowerCase())
            .eq('is_valid', true);

          const hasDBSignature = (dbSignatures?.length || 0) > 0;

          console.log('🔍 Checking signatures:', {
            podId,
            userAddress: address,
            agreementsRequiringSignature: allAgreements.length,
            hasDBSignature,
            dbSignatureCount: dbSignatures?.length || 0,
          });

          // If user has database signature (accountability agreement), they're signed ✅
          if (hasDBSignature) {
            console.log(
              '✅ User has valid accountability signature in database - access granted',
            );
            setHasUnsignedAgreements(false);
          }
          // Otherwise check on-chain eligibility module signatures
          else if (publicClient) {
            const signatureChecks = await Promise.all(
              allAgreements.map(async (agreement) => {
                try {
                  const hasSigned = await publicClient.readContract({
                    address: agreement.eligibilityModuleAddress,
                    abi: ELIGIBILITY_MODULE_ABI,
                    functionName: 'hasSignedAgreement',
                    args: [address, agreement.hatId],
                  });
                  return hasSigned as boolean;
                } catch (error) {
                  console.warn(
                    '⚠️ Error checking on-chain signature status:',
                    error,
                  );
                  return false;
                }
              }),
            );

            // If any agreement is unsigned, set flag
            const hasUnsigned = signatureChecks.some((signed) => !signed);
            setHasUnsignedAgreements(hasUnsigned);

            console.log('📝 On-chain signature status:', {
              total: allAgreements.length,
              signed: signatureChecks.filter((s) => s).length,
              unsigned: signatureChecks.filter((s) => !s).length,
              hasUnsignedAgreements: hasUnsigned,
            });
          } else {
            // No database signature and can't check on-chain - DENY ACCESS
            console.warn(
              '⚠️ Cannot verify signatures (no publicClient) - denying access',
            );
            setHasUnsignedAgreements(true);
          }
        } else if (!address && allAgreements.length > 0) {
          // No wallet connected but agreements exist - DENY ACCESS
          console.warn(
            '⚠️ Wallet not connected but agreements required - denying access',
          );
          setHasUnsignedAgreements(true);
        }
      } catch (error: any) {
        console.error('❌ Failed to fetch eligibility agreements:', error);
        setError(error.message || 'Failed to fetch agreements');
      } finally {
        setLoading(false);
      }
    };

    fetchEligibilityAgreements();
  }, [podId, address, publicClient]);

  const checkSignatureStatus = async (
    agreementCid: string,
    hatId: bigint,
    eligibilityModuleAddress: `0x${string}`,
  ): Promise<boolean> => {
    if (!address) return false;

    try {
      // ✅ FIX: First check database for accountability signatures
      const { data: dbSignatures } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .eq('signer_address', address.toLowerCase())
        .eq('is_valid', true);

      if ((dbSignatures?.length || 0) > 0) {
        console.log('✅ Found database signature for agreement');
        return true;
      }

      // Fall back to on-chain check
      if (!publicClient) return false;

      const hasSigned = await publicClient.readContract({
        address: eligibilityModuleAddress,
        abi: ELIGIBILITY_MODULE_ABI,
        functionName: 'hasSignedAgreement',
        args: [address, hatId],
      });
      return hasSigned as boolean;
    } catch (error) {
      console.error('Error checking signature status:', error);
      return false;
    }
  };

  return {
    agreements,
    loading,
    error,
    hasUnsignedAgreements,
    checkSignatureStatus,
  };
}
