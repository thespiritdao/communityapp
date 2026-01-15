import { supabase } from '@/utils/supabaseClient';

export interface PodToken {
  id: string;
  name: string;
  displayName: string;
  symbol?: string;
  address?: string;
  contract_address?: string; // Match marketplace format
  decimals?: number;
  description?: string;
  gatingType: 'token' | 'pod_role' | 'system'; // Match marketplace format
  podId?: string;
  podName?: string;
  roleName?: string;
  hatId?: string;
  isExecutive?: boolean;
  requiredBalance?: string;
}

/**
 * Enhanced token service for pod creation that includes:
 * - System tokens (SYSTEM, SELF)
 * - Membership tokens (Advocate, PoC)
 * - Pod membership tokens (from existing pods)
 */
export class PodTokenService {
  /**
   * Get all available tokens for pod gating including pod memberships
   */
  static async getAllTokensForGating(
    userAddress?: string,
  ): Promise<PodToken[]> {
    try {
      console.log('🪙 Loading comprehensive token list for pod gating...');

      const allTokens: PodToken[] = [];

      // 1. System tokens (SYSTEM, SELF)
      const systemTokens: PodToken[] = [
        {
          id: 'system-token',
          name: 'SYSTEM Token',
          displayName: 'SYSTEM Token',
          symbol: 'SYSTEM',
          address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '',
          decimals: 18,
          gatingType: 'system' as const,
          description: 'SpiritDAO system currency for governance and rewards',
          requiredBalance: '1',
        },
        {
          id: 'self-token',
          name: 'SELF Token',
          displayName: 'SELF Token',
          symbol: 'SELF',
          address: process.env.NEXT_PUBLIC_SELF_TOKEN || '',
          decimals: 18,
          gatingType: 'system' as const,
          description: 'SpiritDAO community currency for member interactions',
          requiredBalance: '1',
        },
      ].filter((token) => token.address);

      allTokens.push(...systemTokens);
      console.log('🏛️ System tokens added:', systemTokens.length);

      // 2. Get membership tokens from database (Advocate, PoC, etc.)
      try {
        const { data: dbTokens } = await supabase
          .from('tokens')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (dbTokens && dbTokens.length > 0) {
          // Filter out SELF and SYSTEM tokens (already added as system tokens)
          const filteredTokens = dbTokens.filter(
            (token) => token.symbol !== 'SELF' && token.symbol !== 'SYSTEM'
          );

          const membershipTokens: PodToken[] = filteredTokens.map((token) => ({
            id: token.id,
            name: token.name,
            displayName: token.name,
            symbol: token.symbol || undefined,
            address: token.contract_address || token.address,
            decimals: token.decimals || 18,
            gatingType: 'token' as const,
            description: token.description || `Membership token: ${token.name}`,
            requiredBalance: token.minimum_balance || '1',
          }));

          allTokens.push(...membershipTokens);
          console.log('🎫 Membership tokens added:', membershipTokens.length);
        }
      } catch (error) {
        console.error('Failed to load membership tokens:', error);
      }

      // 3. Get pod membership tokens (existing pods that can be used for gating)
      try {
        // Get all active pods with their membership hat IDs
        const { data: pods } = await supabase
          .from('pods')
          .select('id, name, membership_hat_id, management_hat_id')
          .eq('status', 'active')
          .not('membership_hat_id', 'is', null);

        if (pods && pods.length > 0) {
          const podTokens: PodToken[] = [];
          const addedHatIds = new Set<string>(); // Track to avoid duplicates

          for (const pod of pods) {
            // Add membership token option
            if (
              pod.membership_hat_id &&
              pod.membership_hat_id !== 'placeholder' &&
              !addedHatIds.has(pod.membership_hat_id)
            ) {
              podTokens.push({
                id: `pod_member_${pod.id}`,
                name: `${pod.name} Member`,
                displayName: `${pod.name} - Member Access`,
                gatingType: 'pod_role' as const,
                description: `Requires membership in ${pod.name} pod`,
                podId: pod.id,
                podName: pod.name,
                roleName: 'Member',
                hatId: pod.membership_hat_id,
                requiredBalance: '1',
              });
              addedHatIds.add(pod.membership_hat_id);
            }

            // Add management/leader token option
            if (
              pod.management_hat_id &&
              pod.management_hat_id !== 'placeholder' &&
              !addedHatIds.has(pod.management_hat_id)
            ) {
              podTokens.push({
                id: `pod_leader_${pod.id}`,
                name: `${pod.name} Leader`,
                displayName: `${pod.name} - Leader Access`,
                gatingType: 'pod_role' as const,
                description: `Requires leadership role in ${pod.name} pod`,
                podId: pod.id,
                podName: pod.name,
                roleName: 'Leader',
                hatId: pod.management_hat_id,
                requiredBalance: '1',
              });
              addedHatIds.add(pod.management_hat_id);
            }
          }

          allTokens.push(...podTokens);
          console.log('🎩 Pod membership tokens added:', podTokens.length);
        }
      } catch (error) {
        console.error('Failed to load pod membership tokens:', error);
      }

      // Skip pod_permission_lookup to avoid duplicates - we already have the main pod roles above

      console.log(
        '✅ Total tokens available for pod gating:',
        allTokens.length,
      );

      // Sort tokens by type and name
      return allTokens.sort((a, b) => {
        // System tokens first
        if (a.gatingType === 'system' && b.gatingType !== 'system') return -1;
        if (a.gatingType !== 'system' && b.gatingType === 'system') return 1;

        // Then regular tokens
        if (a.gatingType === 'token' && b.gatingType === 'pod_role') return -1;
        if (a.gatingType === 'pod_role' && b.gatingType === 'token') return 1;

        // Finally alphabetical by display name
        return a.displayName.localeCompare(b.displayName);
      });
    } catch (error) {
      console.error('❌ Failed to load tokens for gating:', error);

      // Fallback to just system tokens
      const fallbackTokens: PodToken[] = [
        {
          id: 'system-token',
          name: 'SYSTEM Token',
          displayName: 'SYSTEM Token',
          symbol: 'SYSTEM',
          address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '',
          decimals: 18,
          gatingType: 'system' as const,
          description: 'SpiritDAO system currency',
          requiredBalance: '1',
        },
      ].filter((token) => token.address);

      return fallbackTokens;
    }
  }

  /**
   * Get recommended tokens for pod requirements (prioritizes common choices)
   */
  static async getRecommendedTokensForGating(): Promise<PodToken[]> {
    const allTokens = await this.getAllTokensForGating();

    // Prioritize commonly used tokens
    const priorityOrder = ['SYSTEM', 'Advocate', 'Executive Pod', 'Dev Pod'];

    return allTokens.sort((a, b) => {
      const aPriority = priorityOrder.findIndex(
        (p) => a.displayName.includes(p) || a.symbol === p,
      );
      const bPriority = priorityOrder.findIndex(
        (p) => b.displayName.includes(p) || b.symbol === p,
      );

      if (aPriority !== -1 && bPriority === -1) return -1;
      if (aPriority === -1 && bPriority !== -1) return 1;
      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }

      return 0; // Keep original order if no priority
    });
  }

  /**
   * Get user's held tokens for displaying what they can use
   * Returns a simple list of token IDs the user holds for UI marking
   */
  static async getUserHeldTokensForGating(
    userAddress: string,
    publicClient: any,
  ): Promise<PodToken[]> {
    if (!userAddress || !publicClient) return [];

    const allTokens = await this.getAllTokensForGating();
    const heldTokens: PodToken[] = [];

    const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

    // Check which tokens the user actually holds
    for (const token of allTokens) {
      try {
        let hasToken = false;

        if (token.gatingType === 'pod_role' && token.hatId && hatsContract) {
          // Skip pending/placeholder HAT IDs that haven't been created yet
          if (
            token.hatId === 'pending_creation' ||
            token.hatId === 'extracted_from_tx' ||
            token.hatId === 'pending'
          ) {
            console.log(
              `⏭️ Skipping pending HAT check: ${token.displayName} (${token.hatId})`,
            );
            continue; // Skip to next token
          }

          // Check hat balance for pod memberships
          const balance = await publicClient.readContract({
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
            args: [userAddress as `0x${string}`, token.hatId as `0x${string}`],
          });

          hasToken = Number(balance) > 0;
        } else if (token.address) {
          // Check ERC20/721 balance for regular tokens
          try {
            const balance = await publicClient.readContract({
              address: token.address as `0x${string}`,
              abi: [
                {
                  name: 'balanceOf',
                  type: 'function',
                  inputs: [{ name: 'account', type: 'address' }],
                  outputs: [{ name: '', type: 'uint256' }],
                  stateMutability: 'view',
                },
              ],
              functionName: 'balanceOf',
              args: [userAddress as `0x${string}`],
            });

            hasToken = Number(balance) > 0;
          } catch (error) {
            // Might be ERC721, try that format
            try {
              const balance = await publicClient.readContract({
                address: token.address as `0x${string}`,
                abi: [
                  {
                    name: 'balanceOf',
                    type: 'function',
                    inputs: [{ name: 'owner', type: 'address' }],
                    outputs: [{ name: '', type: 'uint256' }],
                    stateMutability: 'view',
                  },
                ],
                functionName: 'balanceOf',
                args: [userAddress as `0x${string}`],
              });

              hasToken = Number(balance) > 0;
            } catch {
              // Token check failed, skip
            }
          }
        }

        if (hasToken) {
          heldTokens.push(token);
        }
      } catch (error) {
        // Token check failed, skip this token
        console.warn(`Failed to check token ${token.displayName}:`, error);
      }
    }

    console.log(`User holds ${heldTokens.length} tokens for potential gating`);
    return heldTokens;
  }
}

export default PodTokenService;
