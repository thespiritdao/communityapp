import { supabase } from '@/utils/supabaseClient';

export interface AccountabilitySignature {
  id: string;
  pod_id: string;
  signer_address: string;
  signature_data: string;
  signed_at: string;
  accountability_statement: string;
  is_valid: boolean;
}

export interface CreateSignatureData {
  pod_id: string;
  signer_address: string;
  signature_data: string;
  accountability_statement: string;
}

/**
 * Service for managing Pod Accountability Agreement signatures
 */
export class AccountabilitySignatureService {
  /**
   * Create a new accountability signature record
   */
  static async createSignature(data: CreateSignatureData): Promise<{
    success: boolean;
    signature?: AccountabilitySignature;
    error?: string;
  }> {
    try {
      console.log('📝 Creating accountability signature:', {
        pod_id: data.pod_id,
        signer_address: data.signer_address,
        signature_length: data.signature_data?.length || 0,
        statement_length: data.accountability_statement?.length || 0,
      });

      const { data: signature, error } = await supabase
        .from('pod_accountability_signatures')
        .insert({
          pod_id: data.pod_id,
          signer_address: data.signer_address.toLowerCase(),
          signature_data: data.signature_data,
          accountability_statement: data.accountability_statement,
          is_valid: true,
          signed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Failed to create signature:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Signature created successfully:', signature.id);
      return { success: true, signature };
    } catch (error) {
      console.error('❌ Error creating signature:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to create signature',
      };
    }
  }

  /**
   * Get all signatures for a specific pod
   */
  static async getPodSignatures(podId: string): Promise<{
    success: boolean;
    signatures?: AccountabilitySignature[];
    error?: string;
  }> {
    try {
      console.log('🔍 Getting signatures for pod:', podId);

      const { data: signatures, error } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .eq('is_valid', true)
        .order('signed_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to get signatures:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Retrieved', signatures?.length || 0, 'signatures');
      return { success: true, signatures: signatures || [] };
    } catch (error) {
      console.error('❌ Error getting signatures:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get signatures',
      };
    }
  }

  /**
   * Check if a user has signed the accountability agreement for a pod
   */
  static async hasUserSigned(
    podId: string,
    userAddress: string,
  ): Promise<{
    success: boolean;
    hasSigned?: boolean;
    signature?: AccountabilitySignature;
    error?: string;
  }> {
    try {
      console.log('🔍 Checking if user has signed:', {
        pod_id: podId,
        user_address: userAddress,
      });

      const { data: signature, error } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .eq('signer_address', userAddress.toLowerCase())
        .eq('is_valid', true)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('❌ Failed to check signature:', error);
        return { success: false, error: error.message };
      }

      const hasSigned = !!signature;
      console.log('✅ Signature check result:', hasSigned);

      return {
        success: true,
        hasSigned,
        signature: signature || undefined,
      };
    } catch (error) {
      console.error('❌ Error checking signature:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to check signature',
      };
    }
  }

  /**
   * Invalidate a signature (soft delete)
   */
  static async invalidateSignature(signatureId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('❌ Invalidating signature:', signatureId);

      const { error } = await supabase
        .from('pod_accountability_signatures')
        .update({ is_valid: false })
        .eq('id', signatureId);

      if (error) {
        console.error('❌ Failed to invalidate signature:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Signature invalidated successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error invalidating signature:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to invalidate signature',
      };
    }
  }

  /**
   * Get signature statistics for a pod
   */
  static async getPodSignatureStats(podId: string): Promise<{
    success: boolean;
    stats?: {
      total_signatures: number;
      valid_signatures: number;
      latest_signature: string | null;
    };
    error?: string;
  }> {
    try {
      console.log('📊 Getting signature stats for pod:', podId);

      const { data: signatures, error } = await supabase
        .from('pod_accountability_signatures')
        .select('id, signed_at, is_valid')
        .eq('pod_id', podId);

      if (error) {
        console.error('❌ Failed to get signature stats:', error);
        return { success: false, error: error.message };
      }

      const total_signatures = signatures?.length || 0;
      const valid_signatures =
        signatures?.filter((s) => s.is_valid).length || 0;
      const latest_signature =
        signatures?.length > 0
          ? signatures.sort(
              (a, b) =>
                new Date(b.signed_at).getTime() -
                new Date(a.signed_at).getTime(),
            )[0].signed_at
          : null;

      const stats = {
        total_signatures,
        valid_signatures,
        latest_signature,
      };

      console.log('✅ Signature stats:', stats);
      return { success: true, stats };
    } catch (error) {
      console.error('❌ Error getting signature stats:', error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get signature stats',
      };
    }
  }
}
