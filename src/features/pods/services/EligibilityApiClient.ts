import type {
  EligibilityCriteria,
  EligibilityEvaluation,
} from './EligibilityService';
import { getAuthHeaders } from '@/lib/authHeaders';

export interface EligibilityCheckResponse {
  podId: string;
  userAddress: string;
  roleId?: string;
  eligible: boolean;
  evaluation: EligibilityEvaluation;
}

export interface EligibleRolesResponse {
  podId: string;
  userAddress: string;
  eligibleRoles: {
    roleId: string;
    roleName: string;
    hatId: string;
    eligible: boolean;
    evaluation: EligibilityEvaluation;
  }[];
}

export interface RoleEligibilityResponse {
  roleId: string;
  roleName: string;
  eligibilityCriteria: EligibilityCriteria[];
  maxHolders: number;
  currentHolders: number;
  userEligibility?: {
    userAddress: string;
    eligible: boolean;
    evaluation: EligibilityEvaluation;
  };
}

export interface BatchVerificationResponse {
  podId: string | null;
  roleId: string | null;
  totalRequested: number;
  successful: number;
  failed: number;
  results: {
    userAddress: string;
    evaluation: EligibilityEvaluation;
  }[];
  errors: {
    userAddress: string;
    error: string;
  }[];
  timestamp: string;
}

export class EligibilityApiClient {
  /**
   * Check if a user is eligible for a specific role in a pod
   */
  static async checkUserEligibility(
    podId: string,
    userAddress: string,
    roleId: string,
  ): Promise<EligibilityCheckResponse> {
    const params = new URLSearchParams({
      userAddress,
      roleId,
    });

    const response = await fetch(`/api/pods/${podId}/eligibility?${params}`);

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get all eligible roles for a user in a pod
   */
  static async getEligibleRoles(
    podId: string,
    userAddress: string,
  ): Promise<EligibleRolesResponse> {
    const params = new URLSearchParams({ userAddress });

    const response = await fetch(`/api/pods/${podId}/eligibility?${params}`);

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Evaluate custom criteria against a user (without requiring existing role)
   */
  static async evaluateCriteria(
    userAddress: string,
    criteria: EligibilityCriteria[],
    podId?: string,
    roleId?: string,
  ): Promise<{ evaluation: EligibilityEvaluation }> {
    const response = await fetch('/api/eligibility/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userAddress,
        criteria,
        podId: podId || null,
        roleId: roleId || null,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get role eligibility information including criteria
   */
  static async getRoleEligibility(
    roleId: string,
    userAddress?: string,
  ): Promise<RoleEligibilityResponse> {
    const params = userAddress ? new URLSearchParams({ userAddress }) : '';

    const response = await fetch(
      `/api/pods/roles/${roleId}/eligibility?${params}`,
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Update eligibility criteria for a role
   */
  static async updateRoleEligibility(
    roleId: string,
    eligibilityCriteria: EligibilityCriteria[],
    updatedBy: string,
  ): Promise<{
    roleId: string;
    roleName: string;
    eligibilityCriteria: EligibilityCriteria[];
    updatedAt: string;
  }> {
    const response = await fetch(`/api/pods/roles/${roleId}/eligibility`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      },
      body: JSON.stringify({
        eligibilityCriteria,
        updatedBy,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Batch check multiple users against the same criteria
   */
  static async batchVerifyEligibility(
    userAddresses: string[],
    criteria: EligibilityCriteria[],
    podId?: string,
    roleId?: string,
  ): Promise<BatchVerificationResponse> {
    if (userAddresses.length > 50) {
      throw new Error('Maximum 50 user addresses allowed per batch');
    }

    const response = await fetch('/api/eligibility/verify', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userAddresses,
        criteria,
        podId: podId || null,
        roleId: roleId || null,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Auto-assign eligible roles to a user
   */
  static async autoAssignEligibleRoles(
    podId: string,
    userAddress: string,
  ): Promise<string[]> {
    try {
      const eligibleRoles = await this.getEligibleRoles(podId, userAddress);

      // Filter for roles where the user is eligible
      const rolesToAssign = eligibleRoles.eligibleRoles
        .filter((role) => role.eligible)
        .map((role) => role.roleId);

      // Here you would integrate with the actual HAT assignment system
      // For now, we just return the eligible role IDs
      console.log(
        `✅ User ${userAddress} is eligible for ${rolesToAssign.length} roles in pod ${podId}`,
      );

      return rolesToAssign;
    } catch (error) {
      console.error('Failed to auto-assign eligible roles:', error);
      throw error;
    }
  }

  /**
   * Preview eligibility for a user before saving criteria
   */
  static async previewEligibility(
    userAddress: string,
    criteria: EligibilityCriteria[],
  ): Promise<EligibilityEvaluation> {
    const result = await this.evaluateCriteria(userAddress, criteria);
    return result.evaluation;
  }

  /**
   * Check if eligibility criteria are valid (can be evaluated)
   */
  static validateCriteria(criteria: EligibilityCriteria[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const [index, criterion] of criteria.entries()) {
      if (!criterion.type) {
        errors.push(`Criterion ${index + 1}: Type is required`);
      }

      if (!criterion.name?.trim()) {
        errors.push(`Criterion ${index + 1}: Name is required`);
      }

      switch (criterion.type) {
        case 'token_balance':
          if (!criterion.contract_address) {
            errors.push(
              `Criterion ${index + 1}: Contract address is required for token balance`,
            );
          }
          if (!criterion.minimum_amount) {
            errors.push(
              `Criterion ${index + 1}: Minimum amount is required for token balance`,
            );
          }
          break;

        case 'nft_ownership':
          if (!criterion.contract_address) {
            errors.push(
              `Criterion ${index + 1}: Contract address is required for NFT ownership`,
            );
          }
          break;

        case 'agreement_signed':
          if (!criterion.agreement_hash) {
            errors.push(
              `Criterion ${index + 1}: Agreement hash is required for agreement signing`,
            );
          }
          break;

        // TODO: Re-enable when 'reputation_score' is added to EligibilityCriteria type
        // case 'reputation_score':
        //   if (
        //     criterion.minimum_score === undefined ||
        //     criterion.minimum_score < 0
        //   ) {
        //     errors.push(
        //       `Criterion ${index + 1}: Valid minimum score is required for reputation`,
        //     );
        //   }
        //   break;

        case 'staking':
          if (!criterion.staking_pool) {
            errors.push(
              `Criterion ${index + 1}: Staking pool address is required`,
            );
          }
          if (!criterion.minimum_staked) {
            errors.push(
              `Criterion ${index + 1}: Minimum staked amount is required`,
            );
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
