import { supabase } from '@/utils/supabaseClient';
// NOTE: userWalletsService imports the SERVICE-ROLE admin client (server-only).
// EligibilityService is imported by client components, so we must NOT statically
// import it here or the service-role key gets pulled into the client bundle
// (crashes with "Service Role Key is missing"). Load it dynamically inside the
// server-only code path instead.
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { ScalableTokenService } from '@/services/ScalableTokenService';
import { EligibilityModuleService } from '@/services/eligibilityModuleService';
import { getClientHatId } from '@/lib/hatRegistryClient';
import {
  HYDREX_STAKING_ENABLED,
  TGN_TOKEN_ADDRESS,
  fetchQualifyingStakedTgn,
} from '@/features/pods/services/hydrexStakingService';

// Enhanced eligibility criteria types
export interface EligibilityCriteria {
  type:
    | 'token_balance'
    | 'nft_ownership'
    | 'staking'
    | 'agreement_signed'
    | 'time_based'
    | 'credential_ownership';

  // Common fields
  id?: string;
  name?: string;
  description?: string;
  required?: boolean;

  // Token balance criteria
  contract_address?: string;
  minimum_amount?: string;
  token_type?: 'ERC20' | 'ERC721' | 'ERC1155';
  token_id?: string;

  // Database token fields (populated by enhanced queries)
  token_name?: string;
  token_symbol?: string;

  // Agreement criteria
  agreement_hash?: string;
  agreement_text?: string;
  agreement_cid?: string; // IPFS CID for on-chain storage
  signature_required?: boolean;

  // Credential/HAT criteria
  required_hat_ids?: string[]; // Array of HAT IDs for HAT-based credentials
  credential_name?: string; // Display name for the credential

  // Time-based criteria
  valid_from?: string;
  valid_until?: string;
  duration_days?: number;

  // Staking criteria
  staking_pool?: string;
  minimum_staked?: string;
  lock_period?: number;

  // Logic operators for compound criteria
  logic_operator?: 'AND' | 'OR';
  nested_criteria?: EligibilityCriteria[];
}

export interface EligibilityEvaluation {
  eligible: boolean;
  criteriaResults: {
    [criteriaId: string]: {
      passed: boolean;
      value?: any;
      error?: string;
      details?: string;
    };
  };
  overallResult: {
    passed: number;
    total: number;
    message: string;
  };
  evaluatedAt: string;
  userAddress: string;
  roleId: string;
}

export interface EligibilityCheck {
  userAddress: string;
  podId: string;
  roleId?: string;
  criteria: EligibilityCriteria[];
  skipCache?: boolean;
}

export class EligibilityService {
  /**
   * Validate and clean criteria before evaluation
   */
  static validateAndCleanCriteria(
    criteria: EligibilityCriteria[],
  ): EligibilityCriteria[] {
    return criteria
      .map((criterion) => {
        // Clean up token balance criteria
        if (criterion.type === 'token_balance') {
          // Set default minimum_amount if missing
          if (!criterion.minimum_amount) {
            criterion.minimum_amount = '1';
          }

          // Check for invalid contract addresses
          const invalidAddresses = [
            '0xyourmembershiptokenaddress',
            '0xYOURMEMBERSHIPTOKENADDRESS',
            'yourmembershiptokenaddress',
            'YOUR_TOKEN_ADDRESS_HERE',
            '0x0000000000000000000000000000000000000000',
          ];

          if (
            !criterion.contract_address ||
            invalidAddresses.includes(
              criterion.contract_address.toLowerCase(),
            ) ||
            criterion.contract_address.length !== 42 ||
            !criterion.contract_address.startsWith('0x')
          ) {
            // Mark as invalid but keep for user feedback
            criterion.contract_address =
              criterion.contract_address || 'INVALID_ADDRESS';
            console.warn(
              '⚠️ Invalid contract address detected in saved criteria:',
              criterion.contract_address,
            );
          }
        }

        return criterion;
      })
      .filter((criterion) => {
        // Remove completely invalid criteria
        if (criterion.type === 'token_balance') {
          return (
            criterion.contract_address &&
            criterion.contract_address !== 'INVALID_ADDRESS'
          );
        }
        return true;
      });
  }

  /**
   * Main method to evaluate user eligibility against criteria
   */
  static async evaluateCriteria(
    check: EligibilityCheck,
  ): Promise<EligibilityEvaluation> {
    const { userAddress, podId, roleId } = check;

    // Validate and clean criteria before evaluation
    const cleanCriteria = this.validateAndCleanCriteria(check.criteria);

    console.log('🔍 Evaluating eligibility:', {
      userAddress,
      podId,
      roleId,
      originalCriteriaCount: check.criteria.length,
      cleanCriteriaCount: cleanCriteria.length,
    });

    const evaluation: EligibilityEvaluation = {
      eligible: false,
      criteriaResults: {},
      overallResult: {
        passed: 0,
        total: cleanCriteria.length,
        message: '',
      },
      evaluatedAt: new Date().toISOString(),
      userAddress,
      roleId: roleId || '',
    };

    try {
      // Evaluate each criterion
      for (const criterion of cleanCriteria) {
        // Generate stable ID if missing, using array index as fallback
        const generateStableId = (type: string, index: number): string => {
          const baseId = type.toLowerCase().replace(/[^a-z0-9]/g, '_');
          return `${baseId}_${index + 1}`;
        };

        const criteriaId =
          criterion.id ||
          generateStableId(criterion.type, cleanCriteria.indexOf(criterion));

        try {
          const result = await this.evaluateSingleCriterion(
            userAddress,
            podId,
            criterion,
          );
          evaluation.criteriaResults[criteriaId] = result;

          if (result.passed) {
            evaluation.overallResult.passed++;
          }
        } catch (error) {
          console.error(`❌ Error evaluating criterion ${criteriaId}:`, error);
          evaluation.criteriaResults[criteriaId] = {
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      // Determine overall eligibility
      const { passed, total } = evaluation.overallResult;

      // Default logic: ALL criteria must pass (AND logic)
      evaluation.eligible = passed === total && total > 0;
      evaluation.overallResult.message = evaluation.eligible
        ? `All ${total} eligibility criteria met`
        : `${passed}/${total} criteria met - ${total - passed} requirements missing`;

      console.log('✅ Eligibility evaluation complete:', {
        eligible: evaluation.eligible,
        passed: evaluation.overallResult.passed,
        total: evaluation.overallResult.total,
      });

      return evaluation;
    } catch (error) {
      console.error('❌ Eligibility evaluation failed:', error);
      evaluation.overallResult.message =
        'Evaluation failed: ' +
        (error instanceof Error ? error.message : 'Unknown error');
      return evaluation;
    }
  }

  /**
   * Evaluate a single eligibility criterion
   */
  private static async evaluateSingleCriterion(
    userAddress: string,
    podId: string,
    criterion: EligibilityCriteria,
  ): Promise<{
    passed: boolean;
    value?: any;
    error?: string;
    details?: string;
  }> {
    switch (criterion.type) {
      case 'token_balance':
        return await this.evaluateTokenBalance(userAddress, criterion);

      case 'nft_ownership':
        return await this.evaluateNFTOwnership(userAddress, criterion);

      case 'agreement_signed':
        return await this.evaluateAgreementSigned(
          userAddress,
          podId,
          criterion,
        );

      case 'time_based':
        return await this.evaluateTimeBased(userAddress, criterion);

      // TODO: Re-enable when 'reputation_score' is added to EligibilityCriteria type
      // case 'reputation_score':
      //   return await this.evaluateReputationScore(userAddress, criterion);

      case 'staking':
        return await this.evaluateStaking(userAddress, criterion, podId);

      case 'credential_ownership':
        return await this.evaluateCredentialOwnership(userAddress, criterion);

      default:
        throw new Error(`Unsupported criterion type: ${criterion.type}`);
    }
  }

  /**
   * Evaluate token balance requirements
   */
  private static async evaluateTokenBalance(
    userAddress: string,
    criterion: EligibilityCriteria,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    // Validate required fields and set defaults
    if (!criterion.contract_address) {
      console.warn(
        '⚠️ Token balance criterion missing contract_address:',
        criterion,
      );
      return {
        passed: false,
        details:
          'Token balance criterion is missing required contract_address field',
      };
    }

    // Set default minimum_amount if missing (backwards compatibility)
    const minimumAmount = criterion.minimum_amount || '1';
    if (!criterion.minimum_amount) {
      console.info(
        'ℹ️ Using default minimum_amount of 1 for criterion:',
        criterion.contract_address,
      );
    }

    // Check for invalid placeholder addresses
    const invalidAddresses = [
      '0xyourmembershiptokenaddress',
      '0xYOURMEMBERSHIPTOKENADDRESS',
      'yourmembershiptokenaddress',
      'YOUR_TOKEN_ADDRESS_HERE',
      '0x0000000000000000000000000000000000000000',
    ];

    if (
      invalidAddresses.includes(criterion.contract_address.toLowerCase()) ||
      criterion.contract_address.length !== 42 ||
      !criterion.contract_address.startsWith('0x')
    ) {
      console.warn(
        '⚠️ Invalid or placeholder contract address detected:',
        criterion.contract_address,
      );
      return {
        passed: false,
        details: `Invalid contract address: ${criterion.contract_address}. Please configure a valid token contract address.`,
      };
    }

    try {
      // Use existing token balance fetching service
      const balances = await fetchTokenBalances(userAddress);

      console.log('🔍 Token balance evaluation:', {
        userAddress: userAddress.slice(0, 6) + '...' + userAddress.slice(-4),
        criterion: criterion.contract_address,
        balances,
      });

      // Check specific token based on contract address
      const targetContract = criterion.contract_address.toLowerCase();
      const minimumAmountNum = Number.parseFloat(minimumAmount);

      // Map environment contract addresses to balance checks
      const execPodLeader =
        getClientHatId('EXECUTIVE_POD_LEADER')?.toLowerCase();
      const systemToken = process.env.NEXT_PUBLIC_SYSTEM_TOKEN?.toLowerCase();
      const selfToken = process.env.NEXT_PUBLIC_SELF_TOKEN?.toLowerCase();
      const proofOfCuriosity =
        process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY?.toLowerCase();

      // Check Executive Pod leader token (HAT token)
      if (targetContract === execPodLeader) {
        const passed = balances.hasExecutivePod;
        console.log('✅ Executive Pod token check:', {
          passed,
          hasExecutivePod: balances.hasExecutivePod,
        });
        return {
          passed,
          value: passed ? '1' : '0',
          details: passed
            ? 'Executive Pod HAT token ownership verified'
            : 'Executive Pod HAT token not found',
        };
      }

      // Check Proof of Curiosity NFT
      if (targetContract === proofOfCuriosity) {
        const passed = balances.hasProofOfCuriosity;
        console.log('✅ Proof of Curiosity check:', {
          passed,
          hasProofOfCuriosity: balances.hasProofOfCuriosity,
        });
        return {
          passed,
          value: passed ? '1' : '0',
          details: passed
            ? 'Proof of Curiosity NFT ownership verified'
            : 'Proof of Curiosity NFT not found',
        };
      }

      // Check SYSTEM token balance
      if (targetContract === systemToken) {
        const systemBalance = Number.parseFloat(balances.systemBalance);
        const passed = systemBalance >= minimumAmountNum;
        console.log('✅ System token check:', {
          passed,
          systemBalance,
          minimumAmount: minimumAmountNum,
        });
        return {
          passed,
          value: systemBalance.toString(),
          details: `Required: ${minimumAmountNum} SYSTEM, Available: ${systemBalance}`,
        };
      }

      // Check SELF token balance
      if (targetContract === selfToken) {
        const selfBalance = Number.parseFloat(balances.selfBalance);
        const passed = selfBalance >= minimumAmountNum;
        console.log('✅ Self token check:', {
          passed,
          selfBalance,
          minimumAmount: minimumAmountNum,
          rawMinimum: minimumAmount,
          criterion: criterion.minimum_amount,
        });
        return {
          passed,
          value: selfBalance.toString(),
          details: `Required: ${minimumAmountNum} SELF, Available: ${selfBalance}`,
        };
      }

      // Check other HAT tokens
      if (
        targetContract ===
        process.env.NEXT_PUBLIC_MARKET_MANAGEMENT?.toLowerCase()
      ) {
        const passed = balances.hasMarketManagement;
        return {
          passed,
          value: passed ? '1' : '0',
          details: passed
            ? 'Market Management HAT token ownership verified'
            : 'Market Management HAT token not found',
        };
      }

      if (
        targetContract ===
        process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT?.toLowerCase()
      ) {
        const passed = balances.hasBountyHat;
        return {
          passed,
          value: passed ? '1' : '0',
          details: passed
            ? 'Bounty Management HAT token ownership verified'
            : 'Bounty Management HAT token not found',
        };
      }

      if (
        targetContract ===
        process.env.NEXT_PUBLIC_EVENT_MANAGEMENT?.toLowerCase()
      ) {
        const passed = balances.hasEventManagement;
        return {
          passed,
          value: passed ? '1' : '0',
          details: passed
            ? 'Event Management HAT token ownership verified'
            : 'Event Management HAT token not found',
        };
      }

      // Not a hardcoded platform token. Fall back to the database-driven token
      // registry (tokens table) so any registered community ERC-20 (e.g. $TGN)
      // can gate a role on a decimal-aware balance threshold.
      if (targetContract.startsWith('0x') && targetContract.length === 42) {
        const dbResult = await this.evaluateRegisteredErc20Balance(
          userAddress,
          targetContract,
          minimumAmountNum,
        );
        if (dbResult) {
          return dbResult;
        }

        console.warn('⚠️ Unknown contract address:', targetContract);
        return {
          passed: false,
          details: `Token contract ${criterion.contract_address.slice(0, 10)}... is not configured in the system. Please contact an administrator to add support for this token.`,
        };
      } else {
        return {
          passed: false,
          details: `Invalid contract address format: ${criterion.contract_address}. Please select a valid token from the dropdown.`,
        };
      }
    } catch (error) {
      console.error('Token balance evaluation failed:', error);
      return {
        passed: false,
        details:
          error instanceof Error ? error.message : 'Token balance check failed',
      };
    }
  }

  /**
   * Evaluate a decimal-aware ERC-20 balance threshold for a token registered in
   * the `tokens` table (the database-driven registry). This is the generic path
   * that lets any community ERC-20 (e.g. $TGN) gate a pod role without being
   * hardcoded into fetchTokenBalances.
   *
   * Returns null when the contract is not a registered active ERC-20, so the
   * caller can preserve the existing "not configured" rejection.
   */
  private static async evaluateRegisteredErc20Balance(
    userAddress: string,
    contractAddress: string,
    minimumAmount: number,
  ): Promise<{ passed: boolean; value?: any; details?: string } | null> {
    try {
      const { data: token, error } = await supabase
        .from('tokens')
        .select('*')
        .ilike('contract_address', contractAddress)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !token || token.token_type !== 'erc20') {
        return null;
      }

      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');
      const publicClient = createPublicClient({ chain: base, transport: http() });

      const result = await ScalableTokenService.checkTokenBalance(
        userAddress,
        token,
        publicClient,
      );

      if (result.error) {
        return {
          passed: false,
          details: `${token.symbol || token.name} balance check failed: ${result.error}`,
        };
      }

      const decimals = typeof token.decimals === 'number' ? token.decimals : 18;
      const humanBalance = Number(result.balance) / 10 ** decimals;
      const passed = humanBalance >= minimumAmount;
      const label = token.symbol || token.name;

      console.log('✅ Registered ERC-20 check:', {
        token: label,
        humanBalance,
        minimumAmount,
        passed,
      });

      return {
        passed,
        value: humanBalance.toString(),
        details: `Required: ${minimumAmount} ${label}, Available: ${humanBalance}`,
      };
    } catch (err) {
      console.error('Registered ERC-20 balance evaluation failed:', err);
      return {
        passed: false,
        details:
          err instanceof Error ? err.message : 'Registered token check failed',
      };
    }
  }

  /**
   * Evaluate NFT ownership requirements - Legacy wrapper
   */
  private static async evaluateNFTOwnership(
    userAddress: string,
    criterion: EligibilityCriteria,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    // Redirect to the new credential ownership method for consistency
    return await this.evaluateCredentialOwnership(userAddress, criterion);
  }

  /**
   * Evaluate agreement signing requirements
   */
  private static async evaluateAgreementSigned(
    userAddress: string,
    podId: string,
    criterion: EligibilityCriteria,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    try {
      console.log('🔍 EligibilityService: Checking agreement signature for:', {
        userAddress,
        podId,
        criterion: {
          agreement_hash: criterion.agreement_hash,
          name: criterion.name,
          type: criterion.type,
        },
      });

      // Check if user has signed the required agreement in pod_accountability_signatures table
      // 🔐 CRITICAL: Must filter by pod_id to ensure signature is for THIS pod
      const { data: signatures, error } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .eq('signer_address', userAddress.toLowerCase())
        .eq('is_valid', true);

      if (error) {
        console.error(
          '❌ EligibilityService: Database error checking signatures:',
          error,
        );
        throw error;
      }

      console.log(
        '🔍 EligibilityService: Found signatures for THIS pod:',
        signatures?.length || 0,
      );

      // Signatures are already filtered by pod_id, so any signature found is valid for this pod
      const relevantSignatures = signatures || [];

      // Future enhancement: could also filter by agreement_hash if criterion specifies it
      // This would allow checking for specific agreement versions

      const hasSigned = relevantSignatures.length > 0;

      const result = {
        passed: hasSigned,
        value: hasSigned ? relevantSignatures[0].signature_data : null,
        details: hasSigned
          ? `Agreement signed on ${new Date(relevantSignatures[0].signed_at).toLocaleDateString()}`
          : 'Agreement signature required',
      };

      console.log(
        '✅ EligibilityService: Agreement evaluation result:',
        result,
      );
      return result;
    } catch (error) {
      console.error('Agreement evaluation failed:', error);
      return {
        passed: false,
        details:
          error instanceof Error ? error.message : 'Agreement check failed',
      };
    }
  }

  /**
   * Evaluate time-based requirements
   */
  private static async evaluateTimeBased(
    userAddress: string,
    criterion: EligibilityCriteria,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    const now = new Date();

    try {
      // Check valid_from and valid_until dates
      let withinTimeframe = true;
      let details = 'Time-based criterion met';

      if (criterion.valid_from) {
        const validFrom = new Date(criterion.valid_from);
        if (now < validFrom) {
          withinTimeframe = false;
          details = `Not valid until ${validFrom.toLocaleDateString()}`;
        }
      }

      if (criterion.valid_until && withinTimeframe) {
        const validUntil = new Date(criterion.valid_until);
        if (now > validUntil) {
          withinTimeframe = false;
          details = `Expired on ${validUntil.toLocaleDateString()}`;
        }
      }

      return {
        passed: withinTimeframe,
        value: now.toISOString(),
        details,
      };
    } catch (error) {
      console.error('Time-based evaluation failed:', error);
      return {
        passed: false,
        details:
          error instanceof Error ? error.message : 'Time-based check failed',
      };
    }
  }

  /**
   * Evaluate reputation score requirements
   */
  private static async evaluateReputationScore(
    userAddress: string,
    criterion: EligibilityCriteria,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    // Placeholder for reputation system integration
    // This would integrate with your reputation scoring system

    return {
      passed: false,
      details: 'Reputation scoring system not yet implemented',
    };
  }

  /**
   * Evaluate staking requirements
   */
  private static async evaluateStaking(
    userAddress: string,
    criterion: EligibilityCriteria,
    podId?: string,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    // Staking source seam. Only consulted when the criterion explicitly opts in
    // via `staking_pool` AND the source is enabled. Otherwise preserve the
    // original "not yet implemented" behaviour (returns passed: false) so no
    // role is accidentally gated on an unconfirmed/disabled source.
    if (criterion.staking_pool === 'hydrex' && HYDREX_STAKING_ENABLED) {
      const minimum = Number.parseFloat(criterion.minimum_staked || '0');

      // If this pod counts verified linked wallets, sum held + staked across
      // the member's SpiritDAO wallet + linked external wallets. Otherwise just
      // the given wallet (safe default).
      let addresses = [userAddress.toLowerCase()];
      if (await this.podCountsLinkedWallets(podId)) {
        const { walletsForBalanceCheck } = await import(
          '@/services/userWalletsService'
        );
        addresses = await walletsForBalanceCheck(userAddress);
      }

      let held = 0;
      let staked = 0;
      for (const addr of addresses) {
        const stake = await fetchQualifyingStakedTgn(addr);
        if (!stake.resolved) {
          return { passed: false, details: stake.details };
        }
        staked += stake.qualifyingTgn;
        // Held wallet balance SUMS with Hydrex-staked toward the threshold
        // (TreeGens rule: "2K $TGN held or staked"). Mirrors the snapshot
        // layer's held+staked sum.
        const heldResult = await this.evaluateRegisteredErc20Balance(
          addr,
          TGN_TOKEN_ADDRESS,
          0,
        );
        held += heldResult ? Number(heldResult.value) || 0 : 0;
      }

      const total = held + staked;
      const passed = total >= minimum;
      return {
        passed,
        value: total.toString(),
        details: `Required: ${minimum} $TGN (held + staked), Available: ${held.toFixed(2)} held + ${staked.toFixed(2)} staked = ${total.toFixed(2)}`,
      };
    }

    return {
      passed: false,
      details: 'Staking verification system not yet implemented',
    };
  }

  /** Whether a pod counts a member's verified linked-wallet balances. Cached
   *  briefly per pod. Off (single-wallet) unless the pod's module flag is on. */
  private static linkedWalletFlagCache = new Map<
    string,
    { value: boolean; at: number }
  >();
  private static async podCountsLinkedWallets(
    podId?: string,
  ): Promise<boolean> {
    if (!podId) return false;
    const cached = this.linkedWalletFlagCache.get(podId);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;
    try {
      const { data } = await supabase
        .from('pod_modules')
        .select('external_wallet_linking_enabled')
        .eq('pod_id', podId)
        .maybeSingle();
      const value = data?.external_wallet_linking_enabled === true;
      this.linkedWalletFlagCache.set(podId, { value, at: Date.now() });
      return value;
    } catch {
      return false;
    }
  }

  /**
   * Evaluate credential ownership requirements using ScalableTokenService
   */
  private static async evaluateCredentialOwnership(
    userAddress: string,
    criterion: EligibilityCriteria,
  ): Promise<{ passed: boolean; value?: any; details?: string }> {
    console.log(
      '🎫 ScalableTokenService: Evaluating credential ownership for:',
      {
        user: userAddress,
        criterion: {
          name: criterion.name,
          token_name: criterion.token_name,
          contract_address: criterion.contract_address,
          type: criterion.type,
        },
      },
    );

    try {
      // Create a public client compatible object
      // Note: This should ideally use usePublicClient() from wagmi, but since this is a static method,
      // we'll need to pass the client from the calling component
      const { createPublicClient, http } = await import('viem');
      const { base } = await import('viem/chains');

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Method 1: If we have token_name from enhanced query, use it to find the token
      if (criterion.token_name) {
        console.log(`🎯 Using database token name: ${criterion.token_name}`);

        const tokenInfo = await ScalableTokenService.getToken(
          criterion.token_name,
        );
        if (tokenInfo) {
          console.log(`✅ Found token in database:`, tokenInfo);

          const balance = await ScalableTokenService.checkTokenBalance(
            userAddress,
            tokenInfo,
            publicClient,
          );

          return {
            passed: balance.hasToken,
            value: balance.balance.toString(),
            details: balance.hasToken
              ? `${tokenInfo.name} ownership verified (balance: ${balance.balance})`
              : `${tokenInfo.name} not found in wallet${balance.error ? ` (${balance.error})` : ''}`,
          };
        } else {
          console.warn(
            `⚠️ Token not found in database: ${criterion.token_name}`,
          );
        }
      }

      // Method 2: If we have contract_address, look up by contract address
      if (criterion.contract_address) {
        console.log(
          `🔍 Looking up token by contract address: ${criterion.contract_address}`,
        );

        const { data: tokenData, error } = await supabase
          .from('tokens')
          .select('*')
          .eq('contract_address', criterion.contract_address)
          .eq('is_active', true)
          .single();

        if (tokenData && !error) {
          console.log(`✅ Found token by contract address:`, tokenData);

          const balance = await ScalableTokenService.checkTokenBalance(
            userAddress,
            tokenData,
            publicClient,
          );

          return {
            passed: balance.hasToken,
            value: balance.balance.toString(),
            details: balance.hasToken
              ? `${tokenData.name} ownership verified (balance: ${balance.balance})`
              : `${tokenData.name} not found in wallet${balance.error ? ` (${balance.error})` : ''}`,
          };
        } else {
          console.log(
            `⚠️ No token found for contract address: ${criterion.contract_address}`,
          );
        }
      }

      // Method 3: Fallback - search by criterion name
      if (
        criterion.name &&
        criterion.name !== 'credential ownership requirement'
      ) {
        console.log(`🔍 Searching tokens by name pattern: ${criterion.name}`);

        const searchResults = await ScalableTokenService.searchTokens(
          criterion.name,
          5,
        );
        if (searchResults.length > 0) {
          console.log(
            `🎯 Found ${searchResults.length} tokens matching name pattern`,
          );

          // Check the first matching token
          const tokenInfo = searchResults[0];
          const balance = await ScalableTokenService.checkTokenBalance(
            userAddress,
            tokenInfo,
            publicClient,
          );

          return {
            passed: balance.hasToken,
            value: balance.balance.toString(),
            details: balance.hasToken
              ? `${tokenInfo.name} ownership verified (balance: ${balance.balance})`
              : `${tokenInfo.name} not found in wallet${balance.error ? ` (${balance.error})` : ''}`,
          };
        }
      }

      // Method 4: Fallback to legacy fetchTokenBalances for known patterns
      console.log('🔄 Falling back to legacy token checking...');
      const balances = await fetchTokenBalances(userAddress);

      const credentialName = criterion.name?.toLowerCase() || '';
      const tokenName = criterion.token_name?.toLowerCase() || '';

      // Check for known credential patterns
      if (
        credentialName.includes('advocate') ||
        tokenName.includes('advocate')
      ) {
        return {
          passed: balances.hasExecutivePod,
          value: balances.hasExecutivePod ? '1' : '0',
          details: balances.hasExecutivePod
            ? 'Advocate credential verified (Executive Pod)'
            : 'Advocate credential not found in wallet',
        };
      }

      if (
        credentialName.includes('proof') ||
        credentialName.includes('curiosity') ||
        tokenName.includes('proof') ||
        tokenName.includes('curiosity')
      ) {
        return {
          passed: balances.hasProofOfCuriosity,
          value: balances.hasProofOfCuriosity ? '1' : '0',
          details: balances.hasProofOfCuriosity
            ? 'Proof of Curiosity verified'
            : 'Proof of Curiosity not found in wallet',
        };
      }

      // Final fallback - credential not found or recognized
      console.warn('❌ Credential could not be verified:', criterion);
      return {
        passed: false,
        details: `Credential "${criterion.name || criterion.token_name || 'Unknown'}" could not be verified. Please ensure token is registered in database.`,
      };
    } catch (error) {
      console.error('❌ Credential ownership evaluation failed:', error);
      return {
        passed: false,
        details:
          error instanceof Error
            ? error.message
            : 'Credential ownership check failed',
      };
    }
  }

  /**
   * 🆕 WALLED GARDEN SOLUTION: Check ALL criteria for a user before minting HAT
   *
   * This is the PRE-MINT CHECK that prevents HATs from being minted to ineligible users.
   * Returns detailed status for each criterion so UI can show what's missing.
   *
   * Use this BEFORE minting HATs in pod creation flow.
   */
  static async checkAllCriteriaForUser(
    userAddress: string,
    criteria: EligibilityCriteria[],
    podId: string = '',
  ): Promise<{
    eligible: boolean;
    criteriaStatus: Array<{
      type: string;
      met: boolean;
      details: string;
      criterion: EligibilityCriteria;
    }>;
  }> {
    console.log('🔍 Pre-mint eligibility check for:', userAddress);
    console.log(`📋 Checking ${criteria.length} criteria`);

    if (criteria.length === 0) {
      return {
        eligible: true,
        criteriaStatus: [],
      };
    }

    const criteriaStatus: Array<{
      type: string;
      met: boolean;
      details: string;
      criterion: EligibilityCriteria;
    }> = [];

    // Check each criterion
    for (const criterion of criteria) {
      try {
        const result = await this.evaluateSingleCriterion(
          userAddress,
          podId,
          criterion,
        );

        criteriaStatus.push({
          type: criterion.type,
          met: result.passed,
          details: result.details || (result.passed ? 'Met' : 'Not met'),
          criterion,
        });

        console.log(
          `${result.passed ? '✅' : '❌'} ${criterion.type}: ${result.details || (result.passed ? 'Met' : 'Not met')}`,
        );
      } catch (error) {
        console.error(`❌ Error checking ${criterion.type}:`, error);
        criteriaStatus.push({
          type: criterion.type,
          met: false,
          details: error instanceof Error ? error.message : 'Check failed',
          criterion,
        });
      }
    }

    const allMet = criteriaStatus.every((c) => c.met);

    console.log(
      `${allMet ? '✅' : '❌'} Overall eligibility: ${allMet ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`,
    );
    console.log(
      `📊 ${criteriaStatus.filter((c) => c.met).length}/${criteriaStatus.length} criteria met`,
    );

    return {
      eligible: allMet,
      criteriaStatus,
    };
  }

  /**
   * Get eligibility criteria for a pod role
   *
   * @param podId Pod identifier
   * @param roleType 'leader' or 'member' - role type to fetch criteria for
   * @returns Object with criteria, hatId, and eligibility module info
   */
  static async getEligibilityCriteria(
    podId: string,
    roleType: 'leader' | 'member',
  ): Promise<{
    criteria: EligibilityCriteria[];
    hatId: string | null;
    eligibilityModule: string | null;
    roleId: string | null;
  } | null> {
    try {
      console.log(
        `🔍 Fetching ${roleType} eligibility criteria for pod:`,
        podId,
      );

      // CRITICAL FIX: Get pod's HAT IDs first, then query by token_address
      // Cannot query by role_name - must use token_address (HAT ID)
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('management_hat_id, membership_hat_id')
        .eq('id', podId)
        .single();

      if (podError || !pod) {
        console.warn(`⚠️ Pod ${podId} not found:`, podError);
        return null;
      }

      // Determine which HAT ID to use based on roleType
      const hatId = roleType === 'leader'
        ? pod.management_hat_id
        : pod.membership_hat_id;

      if (!hatId) {
        console.warn(`⚠️ No ${roleType} HAT ID found for pod ${podId}`);
        return null;
      }

      // Fetch role data from pod_role_permissions using token_address
      const { data: role, error } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('pod_id', podId)
        .eq('token_address', hatId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.warn(`⚠️ No ${roleType} role found for pod ${podId}:`, error);
        return null;
      }

      if (!role) {
        console.warn(`⚠️ No active ${roleType} role found for pod ${podId}`);
        return null;
      }

      // Extract criteria from role
      const criteria = Array.isArray(role.eligibility_criteria)
        ? role.eligibility_criteria
        : [];

      console.log(
        `✅ Found ${criteria.length} ${roleType} criteria for pod ${podId}`,
      );

      return {
        criteria,
        hatId: role.token_address || null,
        eligibilityModule: null, // TODO: Add eligibility module address if needed
        roleId: role.id,
      };
    } catch (error) {
      console.error(
        `❌ Failed to fetch ${roleType} eligibility criteria:`,
        error,
      );
      return null;
    }
  }

  /**
   * Check if user meets eligibility for a specific pod role
   */
  static async checkUserEligibility(
    userAddress: string,
    podId: string,
    roleId?: string,
  ): Promise<EligibilityEvaluation> {
    try {
      // Get eligibility criteria for the role or all pod roles
      let criteria: EligibilityCriteria[] = [];

      if (roleId) {
        // Check specific role
        const { data: role, error } = await supabase
          .from('pod_role_permissions')
          .select('eligibility_criteria')
          .eq('id', roleId)
          .single();

        if (error || !role) {
          throw new Error('Role not found');
        }

        criteria = Array.isArray(role.eligibility_criteria)
          ? role.eligibility_criteria
          : [];
      } else {
        // Check all roles in the pod
        const { data: roles, error } = await supabase
          .from('pod_role_permissions')
          .select('eligibility_criteria')
          .eq('pod_id', podId)
          .eq('is_active', true);

        if (error) {
          throw error;
        }

        // Combine all criteria from all roles
        criteria = roles.flatMap((role) =>
          Array.isArray(role.eligibility_criteria)
            ? role.eligibility_criteria
            : [],
        );
      }

      // If no criteria defined, user is eligible by default
      if (criteria.length === 0) {
        return {
          eligible: true,
          criteriaResults: {},
          overallResult: {
            passed: 0,
            total: 0,
            message: 'No eligibility criteria defined - access granted',
          },
          evaluatedAt: new Date().toISOString(),
          userAddress,
          roleId: roleId || '',
        };
      }

      // Evaluate the criteria
      return await this.evaluateCriteria({
        userAddress,
        podId,
        roleId,
        criteria,
      });
    } catch (error) {
      console.error('User eligibility check failed:', error);
      throw error;
    }
  }

  /**
   * Get default eligibility templates
   */
  static getDefaultEligibilityTemplates(): {
    [roleName: string]: EligibilityCriteria[];
  } {
    return {
      pod_leader: [
        {
          type: 'agreement_signed',
          name: 'Leadership Agreement',
          description: 'Must sign pod leadership accountability agreement',
          agreement_hash: 'pod_leadership_agreement',
          required: true,
        },
        {
          type: 'token_balance',
          name: 'Minimum Token Balance',
          description: 'Must hold minimum governance tokens',
          contract_address: getClientHatId('EXECUTIVE_POD_LEADER'),
          minimum_amount: '1',
          token_type: 'ERC20',
          required: true,
        },
      ],
      pod_member: [
        {
          type: 'token_balance',
          name: 'Member Token Requirement',
          description: 'Must hold member access token',
          contract_address: getClientHatId('EXECUTIVE_POD_LEADER'),
          minimum_amount: '1',
          token_type: 'ERC20',
          required: true,
        },
      ],
    };
  }

  /**
   * 🚀 NEW: Build sync calls for OnchainKit Transaction component
   * This is the PROPER way to sync with Coinbase Smart Wallets
   *
   * Returns transaction call objects that can be passed to OnchainKit <Transaction>
   * for proper account abstraction and sponsored transaction handling
   *
   * @param roleId Role ID to build sync calls for
   * @param clearExisting Whether to clear existing criteria first (default: true)
   * @returns Object with call objects, metadata, and role info
   */
  static async buildSyncCallsForRole(
    roleId: string,
    clearExisting = true,
  ): Promise<{
    success: boolean;
    calls: any[];
    criteriaCount: number;
    errors: string[];
    roleId: string;
    hatId?: string;
    podId?: string;
  }> {
    console.log('🎩 Building sync calls for role:', roleId);

    try {
      // Import the eligibility module service
      const { EligibilityModuleService } = await import(
        '@/services/eligibilityModuleService'
      );

      // Step 1: Get role data from database
      const { data: role, error: roleError } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('id', roleId)
        .single();

      if (roleError || !role) {
        throw new Error(`Role not found: ${roleId}`);
      }

      // Step 2: Validate we have a HAT ID
      if (!role.token_address) {
        return {
          success: false,
          calls: [],
          criteriaCount: 0,
          errors: ['Role does not have an associated HAT ID'],
          roleId,
          hatId: undefined,
          podId: undefined,
        };
      }

      // Step 3: Get eligibility criteria
      const criteria = Array.isArray(role.eligibility_criteria)
        ? role.eligibility_criteria
        : [];

      if (criteria.length === 0) {
        console.log('ℹ️ No criteria to sync for role:', roleId);
        return {
          success: true,
          calls: [],
          criteriaCount: 0,
          errors: [],
          roleId,
          hatId: role.token_address,
          podId: undefined,
        };
      }

      // Step 4: Check if Phase 7 (setHatAdmin) needs to be executed
      // This is required when users add eligibility criteria after pod creation
      console.log('🔍 Checking if Phase 7 (setHatAdmin) was executed...');

      let phase7Call: any = null;

      try {
        // Get proxy address using the eligibility module service helper
        const managementHatId = BigInt(role.token_address);
        const proxyData =
          await EligibilityModuleService.getProxyAddressForHat(managementHatId);

        if (!proxyData.proxyAddress) {
          console.warn(
            '⚠️ Could not verify Phase 7 status - proxy address not available',
            {
              error: proxyData.error,
              hatId: managementHatId.toString(),
            },
          );
        } else {
          console.log('🔍 Phase 7 check parameters:', {
            podId: proxyData.podId,
            proxyAddress: proxyData.proxyAddress,
            managementHatId: managementHatId.toString(),
          });

          // Check if proxy is already set as admin
          const adminCheck = await EligibilityModuleService.checkIfProxyIsAdmin(
            managementHatId,
            proxyData.proxyAddress,
          );

          if (!adminCheck.isAdmin) {
            console.log(
              '⚠️ Phase 7 was never executed - adding setHatAdmin call',
            );
            console.log(
              '📋 Current admin:',
              adminCheck.currentAdmin || 'none (0x0)',
            );

            // Build Phase 7 call and prepend to transaction
            phase7Call = EligibilityModuleService.buildPhase7SetAdminCall(
              managementHatId,
              proxyData.proxyAddress,
            );

            console.log('✅ Phase 7 call built and will be executed first');
          } else {
            console.log('✅ Phase 7 already completed - proxy is authorized');
          }
        }
      } catch (phase7Error) {
        console.error('❌ Error checking Phase 7 status:', phase7Error);
        console.log(
          '⚠️ Continuing without Phase 7 check - may fail if admin not set',
        );
      }

      // Step 5: Build transaction calls for criteria sync
      console.log(
        `🔨 Building sync calls for ${criteria.length} criteria on HAT ${role.token_address}...`,
      );

      const result = await EligibilityModuleService.buildSyncCriteriaCalls(
        role.token_address,
        criteria,
        clearExisting,
      );

      // Step 6: Prepend Phase 7 call if needed
      if (phase7Call) {
        console.log('🔧 Prepending Phase 7 setHatAdmin call to transaction');
        result.calls.unshift(phase7Call);
        console.log(
          `📋 Total calls: ${result.calls.length} (1 Phase 7 + ${result.calls.length - 1} criteria)`,
        );
      }

      console.log('🔍 TRACE: buildSyncCallsForRole received result:', {
        success: result.success,
        podId: result.podId,
        callsLength: result.calls.length,
        criteriaCount: result.criteriaCount,
        errorsLength: result.errors.length,
      });

      if (result.calls.length > 0) {
        console.log('🔍 TRACE: First call details:', {
          address: result.calls[0].address,
          functionName: result.calls[0].functionName,
          args: result.calls[0].args,
          arg0_podId: result.calls[0].args?.[0],
        });
      }

      // Step 7: 🚀 V3 FIX: Inject user's wallet address from wagmi/OnchainKit
      // This will be passed from the Transaction component which has access to `address`
      // For now, mark calls as needing address injection
      console.log(
        '⚠️ Calls prepared with __USER_ADDRESS__ placeholder - will be replaced by Transaction component',
      );

      console.log('✅ Sync calls built:', {
        roleId,
        hatId: role.token_address,
        totalCalls: result.calls.length,
        criteriaCount: result.criteriaCount,
        errors: result.errors.length,
      });

      return {
        success: result.success,
        calls: result.calls, // Contains __USER_ADDRESS__ placeholder
        criteriaCount: result.criteriaCount,
        errors: result.errors,
        roleId,
        hatId: role.token_address,
        podId: result.podId,
      };
    } catch (error) {
      console.error('❌ Failed to build sync calls:', error);
      return {
        success: false,
        calls: [],
        criteriaCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        roleId,
        hatId: undefined,
        podId: undefined,
      };
    }
  }

  /**
   * Update database sync status after successful transaction
   * Call this from the Transaction onSuccess handler
   */
  static async updateSyncStatus(
    roleId: string,
    status: 'synced' | 'partial' | 'failed',
  ): Promise<void> {
    try {
      await supabase
        .from('pod_role_permissions')
        .update({
          last_synced_at: new Date().toISOString(),
          sync_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', roleId);

      console.log('✅ Updated sync status:', { roleId, status });
    } catch (error) {
      console.error('❌ Failed to update sync status:', error);
    }
  }

  /**
   * @deprecated Use buildSyncCallsForRole() instead for Coinbase Smart Wallet compatibility
   *
   * Sync eligibility criteria with HATS modules - LEGACY IMPLEMENTATION
   *
   * WARNING: This function uses raw wagmi walletClient.writeContract() which does NOT work
   * correctly with Coinbase Smart Wallets due to account abstraction (ERC-4337).
   *
   * During gas estimation with smart wallets, msg.sender becomes the bundler address
   * instead of the user's wallet, causing "Not authorized to manage pod" errors.
   *
   * Use buildSyncCallsForRole() + OnchainKit Transaction component instead.
   */
  static async syncWithHatsModules(
    roleId: string,
    walletClient: any,
    clearExisting = true,
  ): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
    txHashes: string[];
  }> {
    console.log(
      '⚠️ WARNING: Using deprecated syncWithHatsModules - may fail with Smart Wallets',
    );
    console.log('🎩 Starting HATS module sync for role:', roleId);

    try {
      // Import the eligibility module service
      const { EligibilityModuleService } = await import(
        '@/services/eligibilityModuleService'
      );

      // Step 1: Get role data from database
      const { data: role, error: roleError } = await supabase
        .from('pod_role_permissions')
        .select('*')
        .eq('id', roleId)
        .single();

      if (roleError || !role) {
        throw new Error(`Role not found: ${roleId}`);
      }

      // Step 2: Validate we have a HAT ID
      if (!role.token_address) {
        return {
          success: false,
          syncedCount: 0,
          errors: ['Role does not have an associated HAT ID'],
          txHashes: [],
        };
      }

      // Step 3: Get eligibility criteria
      const criteria = Array.isArray(role.eligibility_criteria)
        ? role.eligibility_criteria
        : [];

      if (criteria.length === 0) {
        console.log('ℹ️ No criteria to sync for role:', roleId);
        return {
          success: true,
          syncedCount: 0,
          errors: [],
          txHashes: [],
        };
      }

      // Step 4: Sync to on-chain module
      console.log(
        `🔄 Syncing ${criteria.length} criteria to HAT ${role.token_address}...`,
      );

      const result = await EligibilityModuleService.syncAllCriteriaToModule(
        role.token_address,
        criteria,
        walletClient,
        clearExisting,
      );

      // Step 5: Update database with sync status
      if (result.success) {
        await supabase
          .from('pod_role_permissions')
          .update({
            last_synced_at: new Date().toISOString(),
            sync_status: result.errors.length === 0 ? 'synced' : 'partial',
            updated_at: new Date().toISOString(),
          })
          .eq('id', roleId);
      }

      console.log('✅ HATs module sync complete:', {
        roleId,
        hatId: role.token_address,
        syncedCount: result.syncedCount,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      console.error('❌ HATs module sync failed:', error);
      return {
        success: false,
        syncedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        txHashes: [],
      };
    }
  }

  /**
   * Hybrid eligibility check - combines database and on-chain verification
   * Use database for UI/preview, on-chain for critical operations
   */
  static async checkEligibilityHybrid(
    userAddress: string,
    podId: string,
    roleId: string,
    mode: 'database' | 'onchain' | 'both' = 'both',
  ): Promise<{
    eligible: boolean;
    source: 'database' | 'onchain' | 'hybrid';
    databaseResult?: EligibilityEvaluation;
    onchainResult?: { eligible: boolean; standing: boolean };
    recommendation: string;
  }> {
    console.log('🔍 Hybrid eligibility check:', {
      userAddress,
      podId,
      roleId,
      mode,
    });

    const result: any = {
      eligible: false,
      source: mode,
      recommendation: '',
    };

    try {
      // Database check (always fast and free)
      if (mode === 'database' || mode === 'both') {
        const dbEval = await this.checkUserEligibility(
          userAddress,
          podId,
          roleId,
        );
        result.databaseResult = dbEval;

        if (mode === 'database') {
          result.eligible = dbEval.eligible;
          result.recommendation = 'Database check only - use for UI preview';
          return result;
        }
      }

      // On-chain check (secure but costs gas to write, free to read)
      if (mode === 'onchain' || mode === 'both') {
        const { EligibilityModuleService } = await import(
          '@/services/eligibilityModuleService'
        );

        // Get HAT ID for the role
        const { data: role } = await supabase
          .from('pod_role_permissions')
          .select('token_address')
          .eq('id', roleId)
          .single();

        if (role?.token_address) {
          const hatIdBigInt =
            typeof role.token_address === 'string'
              ? BigInt(role.token_address)
              : BigInt(role.token_address);

          const onchainEval = await EligibilityModuleService.checkEligibility(
            userAddress as `0x${string}`,
            hatIdBigInt,
          );

          result.onchainResult = onchainEval;

          if (mode === 'onchain') {
            result.eligible = onchainEval.eligible;
            result.recommendation =
              'On-chain check - cryptographically verified';
            return result;
          }
        } else {
          console.warn('⚠️ Role has no HAT ID - falling back to database only');
          result.eligible = result.databaseResult?.eligible || false;
          result.source = 'database';
          result.recommendation = 'No HAT ID - database check only';
          return result;
        }
      }

      // Both mode - compare results
      if (mode === 'both' && result.databaseResult && result.onchainResult) {
        const dbEligible = result.databaseResult.eligible;
        const chainEligible = result.onchainResult.eligible;

        if (dbEligible === chainEligible) {
          result.eligible = dbEligible;
          result.source = 'hybrid';
          result.recommendation =
            'Database and on-chain agree - fully verified';
        } else {
          // Discrepancy - trust on-chain as source of truth
          result.eligible = chainEligible;
          result.source = 'hybrid';
          result.recommendation = chainEligible
            ? 'On-chain eligible but database says no - criteria may have updated, resync needed'
            : 'Database says eligible but on-chain says no - USER CANNOT ACCESS (on-chain is authoritative)';

          console.warn('⚠️ Eligibility mismatch detected:', {
            userAddress,
            roleId,
            database: dbEligible,
            onchain: chainEligible,
            usingOnchain: true,
          });
        }
      }

      return result;
    } catch (error) {
      console.error('❌ Hybrid eligibility check failed:', error);
      // Fallback to database-only on error
      if (result.databaseResult) {
        result.eligible = result.databaseResult.eligible;
        result.source = 'database';
        result.recommendation =
          'On-chain check failed - using database fallback';
      }
      return result;
    }
  }

  /**
   * Check if user can perform critical operation (always uses on-chain verification)
   */
  static async canPerformCriticalOperation(
    userAddress: string,
    podId: string,
    roleId: string,
    operation: 'treasury' | 'voting' | 'bounty_approval' | 'role_assignment',
  ): Promise<boolean> {
    console.log(`🔒 Critical operation check: ${operation}`, {
      userAddress,
      roleId,
    });

    try {
      const result = await this.checkEligibilityHybrid(
        userAddress,
        podId,
        roleId,
        'onchain', // Always use on-chain for critical ops
      );

      if (!result.eligible) {
        console.warn(
          `❌ User ${userAddress} denied ${operation} - not eligible on-chain`,
        );
      }

      return result.eligible;
    } catch (error) {
      console.error(
        `❌ Critical operation check failed for ${operation}:`,
        error,
      );
      // Fail closed - deny access if check fails
      return false;
    }
  }
}

export default EligibilityService;
