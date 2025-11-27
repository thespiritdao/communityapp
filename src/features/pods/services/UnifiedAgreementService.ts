
import { AccountabilitySignatureService } from './AccountabilitySignatureService';
import type { EligibilityCriteria } from './EligibilityService';

export interface PodAgreement {
  id: string;
  pod_id: string;
  agreement_type: 'leadership_accountability' | 'membership_requirement' | 'role_specific';
  role_name?: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Service to bridge existing accountability agreements with eligibility criteria
 * Provides unified interface until full migration is complete
 */
export class UnifiedAgreementService {
  
  /**
   * Get existing accountability agreement for a pod
   * This looks at existing signed agreements to extract the agreement text
   */
  static async getPodAccountabilityAgreement(podId: string): Promise<{
    exists: boolean;
    title?: string;
    content?: string;
    signatureCount?: number;
  }> {
    try {
      console.log('🔍 Looking for existing accountability agreement for pod:', podId);
      
      // Get existing signatures to see what agreement text was used
      const result = await AccountabilitySignatureService.getPodSignatures(podId);
      
      if (!result.success || !result.signatures?.length) {
        console.log('📭 No existing accountability signatures found');
        return { exists: false };
      }
      
      // Look for the most common accountability statement pattern
      const statements = result.signatures.map(sig => sig.accountability_statement).filter(Boolean);
      
      if (statements.length === 0) {
        return { exists: false };
      }
      
      // Find the longest/most detailed statement (likely the real agreement)
      const detailedStatement = statements.reduce((longest, current) => 
        current.length > longest.length ? current : longest, ''
      );
      
      // If it's just the default text, create a proper agreement
      const isDefaultText = detailedStatement === 'I acknowledge and agree to the SpiritDAO Accountability Agreement.';
      
      const agreementContent = isDefaultText 
        ? this.getDefaultAccountabilityAgreement(podId)
        : detailedStatement;
      
      console.log('✅ Found existing accountability agreement');
      return {
        exists: true,
        title: 'Pod Leadership Accountability Agreement',
        content: agreementContent,
        signatureCount: result.signatures.length
      };
      
    } catch (error) {
      console.error('❌ Error getting pod accountability agreement:', error);
      return { exists: false };
    }
  }
  
  /**
   * Create default accountability agreement for pods
   */
  static getDefaultAccountabilityAgreement(podId: string): string {
    return `Pod Leadership Accountability Agreement

By signing this agreement, I acknowledge that as a leader of this pod:

1. **Integrity**: I will act with honesty and transparency in all pod activities and decisions.

2. **Responsibility**: I understand my role and responsibilities as a pod leader and commit to fulfilling them diligently.

3. **Stewardship**: I will responsibly manage pod resources, including treasury funds, member applications, and governance decisions.

4. **Collaboration**: I will work constructively with other pod leaders and members to achieve our shared objectives.

5. **Accountability**: I accept accountability for my actions and decisions as they affect the pod and its members.

6. **Community Standards**: I will uphold SpiritDAO community guidelines and ensure the pod operates in accordance with our shared values.

7. **Member Support**: I commit to supporting pod members, facilitating their contributions, and maintaining an inclusive environment.

8. **Transparency**: I will communicate openly about pod activities, decisions, and challenges with appropriate stakeholders.

By signing this agreement, I formally accept the responsibilities of pod leadership and commit to upholding these principles throughout my tenure.`;
  }
  
  /**
   * Get agreement text for eligibility criteria
   * This bridges the gap between accountability agreements and eligibility system
   */
  static async getAgreementTextForCriteria(
    podId: string, 
    criteriaType: 'leadership' | 'membership' | 'role_specific' = 'membership'
  ): Promise<string> {
    try {
      // For leadership criteria, use accountability agreement
      if (criteriaType === 'leadership') {
        const agreement = await this.getPodAccountabilityAgreement(podId);
        if (agreement.exists && agreement.content) {
          return agreement.content;
        }
        return this.getDefaultAccountabilityAgreement(podId);
      }
      
      // For membership criteria, use membership agreement
      return this.getDefaultMembershipAgreement();
      
    } catch (error) {
      console.error('❌ Error getting agreement text for criteria:', error);
      return this.getDefaultMembershipAgreement();
    }
  }
  
  /**
   * Default membership agreement
   */
  static getDefaultMembershipAgreement(): string {
    return `Pod Membership Agreement

By signing this agreement, I acknowledge that:

1. I am applying to become a member of this pod and accept the responsibilities that come with membership.

2. I understand that membership is granted through a hat token that represents my role and privileges within the pod.

3. I agree to participate constructively in pod activities and governance decisions.

4. I understand that membership can be revoked by pod leadership if I fail to meet my responsibilities or violate community guidelines.

5. I will respect other members and contribute positively to the pod's mission and objectives.

6. I acknowledge that all pod activities are recorded on-chain and that my membership status is publicly verifiable.

By signing this agreement, I formally request membership in this pod and agree to abide by these terms.`;
  }
  
  /**
   * Check if user has signed the accountability agreement
   * Bridges to existing signature checking
   */
  static async hasUserSignedAccountabilityAgreement(
    podId: string, 
    userAddress: string
  ): Promise<boolean> {
    try {
      const result = await AccountabilitySignatureService.hasUserSigned(podId, userAddress);
      return result.success && result.hasSigned === true;
    } catch (error) {
      console.error('❌ Error checking accountability signature:', error);
      return false;
    }
  }
  
  /**
   * Auto-populate eligibility criteria with existing pod agreement
   */
  static async populateEligibilityCriteriaWithExistingAgreement(
    podId: string,
    criteriaType: 'leadership' | 'membership' = 'membership'
  ): Promise<Partial<EligibilityCriteria>> {
    try {
      const agreementText = await this.getAgreementTextForCriteria(podId, criteriaType);
      
      return {
        type: 'agreement_signed',
        name: criteriaType === 'leadership' 
          ? 'Leadership Accountability Agreement' 
          : 'Pod Membership Agreement',
        description: `Required agreement for ${criteriaType} in this pod`,
        agreement_text: agreementText,
        agreement_hash: `${podId}_${criteriaType}_agreement`,
        signature_required: true,
        required: true
      };
    } catch (error) {
      console.error('❌ Error populating eligibility criteria:', error);
      return {
        type: 'agreement_signed',
        name: 'Agreement Required',
        agreement_text: this.getDefaultMembershipAgreement()
      };
    }
  }
}