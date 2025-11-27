import { supabase } from '@/utils/supabaseClient';
import type { Pod, } from '../types';
import type { PodCreationData, AccountabilitySignature } from './PodCoreService';

export interface DatabaseQueryConfig {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}

export interface DatabaseResult<T> {
  data: T | null;
  error: string | null;
  count?: number;
}

/**
 * PodDatabaseService - Centralized database operations for pods
 * 
 * Handles all Supabase interactions with optimized queries, proper error handling,
 * and authentication checks. Provides a clean abstraction layer over raw database operations.
 */
export class PodDatabaseService {

  // ==========================================
  // AUTHENTICATION & SESSION MANAGEMENT
  // ==========================================

  /**
   * Ensure user is authenticated for protected operations
   */
  private static async ensureAuthenticated(): Promise<string> {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user?.id) {
      throw new Error('Authentication required');
    }
    return session.user.id;
  }

  // ==========================================
  // POD CRUD OPERATIONS
  // ==========================================

  /**
   * Get single pod by ID
   */
  static async getPodById(podId: string): Promise<DatabaseResult<Pod>> {
    try {
      console.log('📊 PodDatabaseService: Getting pod by ID:', podId);
      
      // Check authentication for RLS
      await this.ensureAuthenticated();
      
      const { data, error } = await supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url,
          created_at,
          updated_at
        `)
        .eq('id', podId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: 'Pod not found' };
        }
        console.error('Database error getting pod:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Pod retrieved from database:', data.name);
      return { data, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.getPodById error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get multiple pods with filtering and pagination
   */
  static async getPods(config: DatabaseQueryConfig = {}): Promise<DatabaseResult<Pod[]>> {
    try {
      console.log('📊 PodDatabaseService: Getting pods with config:', config);
      
      // Check authentication
      await this.ensureAuthenticated();
      
      let query = supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url,
          created_at,
          updated_at
        `, { count: 'exact' });

      // Apply filters
      if (!config.includeInactive) {
        query = query.neq('status', 'inactive');
      }

      // Apply ordering
      if (config.orderBy) {
        query = query.order(config.orderBy, { 
          ascending: config.ascending ?? false 
        });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply pagination
      if (config.limit) {
        query = query.limit(config.limit);
      }
      if (config.offset) {
        query = query.range(config.offset, config.offset + (config.limit || 50) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Database error getting pods:', error);
        return { data: null, error: error.message, count: 0 };
      }

      console.log(`✅ Retrieved ${data?.length || 0} pods from database`);
      return { data: data || [], error: null, count: count || 0 };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.getPods error:', error);
      return { data: null, error, count: 0 };
    }
  }

  /**
   * Get pods where user has leadership access
   */
  static async getUserLeadershipPods(userAddress: string): Promise<DatabaseResult<Pod[]>> {
    try {
      console.log('📊 Getting leadership pods for:', userAddress);
      
      if (!userAddress) {
        return { data: [], error: null };
      }

      await this.ensureAuthenticated();

      const { data, error } = await supabase
        .from('pods')
        .select(`
          *,
          management_hat_id,
          membership_hat_id,
          treasury_contract_address,
          pod_image_url
        `)
        .or(`pod_leads.cs.{${userAddress.toLowerCase()}},created_by_address.eq.${userAddress.toLowerCase()}`)
        .order('created_at', { ascending: false });

      if (error) {
        return { data: null, error: error.message };
      }

      console.log(`✅ Retrieved ${data?.length || 0} leadership pods`);
      return { data: data || [], error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.getUserLeadershipPods error:', error);
      return { data: null, error };
    }
  }

  /**
   * Create a new pod
   */
  static async createPod(podData: PodCreationData): Promise<DatabaseResult<Pod>> {
    try {
      console.log('📊 Creating pod in database:', podData.name);

      // Ensure authentication
      const userId = await this.ensureAuthenticated();

      // ===================================================================
      // TIER 1 FIX: Validate HAT IDs - reject placeholders
      // ===================================================================
      const placeholderValues = [
        'extracted_from_tx',
        'pending_creation',
        'pending',
        'placeholder',
        'null',
        'undefined',
        'none'
      ];

      if (podData.management_hat_id) {
        const hatIdLower = podData.management_hat_id.toLowerCase();
        if (placeholderValues.includes(hatIdLower)) {
          console.error('❌ TIER 1 FIX: Rejecting placeholder management_hat_id:', podData.management_hat_id);
          return {
            data: null,
            error: `Invalid management HAT ID: "${podData.management_hat_id}" is a placeholder value. HAT must be verified onchain before pod creation.`
          };
        }
      }

      if (podData.membership_hat_id) {
        const hatIdLower = podData.membership_hat_id.toLowerCase();
        if (placeholderValues.includes(hatIdLower)) {
          console.warn('⚠️ TIER 1 FIX: Rejecting placeholder membership_hat_id:', podData.membership_hat_id);
          // Set to null instead of rejecting - membership HAT is optional
          podData.membership_hat_id = undefined;
        }
      }

      // Require valid management_hat_id for active pods
      if (podData.status === 'active' && !podData.management_hat_id) {
        console.error('❌ TIER 1 FIX: Cannot create active pod without management HAT ID');
        return {
          data: null,
          error: 'Cannot create active pod without a valid management HAT ID. HAT must exist onchain.'
        };
      }

      const insertData = {
        id: podData.id,
        name: podData.name,
        description: podData.description,
        parent_pod_id: podData.parent_pod_id,
        pod_leads: podData.pod_leads,
        created_by_address: podData.created_by_address,
        pod_image_url: podData.pod_image_url,
        pod_metadata: podData.pod_metadata,
        status: 'draft',
        is_active: false,
        token_type: 'HATS',
        management_hat_id: podData.management_hat_id,
        membership_hat_id: podData.membership_hat_id,
        treasury_contract_address: podData.treasury_contract_address,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('pods')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Database error creating pod:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Pod created in database:', data.id);
      return { data, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.createPod error:', error);
      return { data: null, error };
    }
  }

  /**
   * Update pod properties
   */
  static async updatePod(
    podId: string,
    updates: Partial<Pod>
  ): Promise<DatabaseResult<Pod>> {
    try {
      console.log('📊 Updating pod in database:', podId);

      await this.ensureAuthenticated();

      // ===================================================================
      // TIER 1 FIX: Validate HAT IDs in updates - reject placeholders
      // ===================================================================
      const placeholderValues = [
        'extracted_from_tx',
        'pending_creation',
        'pending',
        'placeholder',
        'null',
        'undefined',
        'none'
      ];

      if (updates.management_hat_id) {
        const hatIdLower = updates.management_hat_id.toLowerCase();
        if (placeholderValues.includes(hatIdLower)) {
          console.error('❌ TIER 1 FIX: Rejecting placeholder management_hat_id in update:', updates.management_hat_id);
          return {
            data: null,
            error: `Invalid management HAT ID: "${updates.management_hat_id}" is a placeholder value. HAT must be verified onchain before updating.`
          };
        }
      }

      if (updates.membership_hat_id) {
        const hatIdLower = updates.membership_hat_id.toLowerCase();
        if (placeholderValues.includes(hatIdLower)) {
          console.warn('⚠️ TIER 1 FIX: Removing placeholder membership_hat_id from update:', updates.membership_hat_id);
          updates.membership_hat_id = undefined; // Remove from update
        }
      }

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('pods')
        .update(updateData)
        .eq('id', podId)
        .select()
        .single();

      if (error) {
        console.error('Database error updating pod:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Pod updated in database:', podId);
      return { data, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.updatePod error:', error);
      return { data: null, error };
    }
  }

  /**
   * Create accountability signatures
   */
  static async createAccountabilitySignatures(signatures: any[]): Promise<DatabaseResult<any[]>> {
    try {
      console.log('📊 Creating accountability signatures:', signatures.length);
      
      await this.ensureAuthenticated();

      const { data, error } = await supabase
        .from('pod_accountability_signatures')
        .insert(signatures)
        .select();

      if (error) {
        console.error('Database error creating accountability signatures:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Accountability signatures created:', data?.length || 0);
      return { data: data || [], error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.createAccountabilitySignatures error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get accountability signatures for a pod
   */
  static async getAccountabilitySignatures(podId: string): Promise<DatabaseResult<any[]>> {
    try {
      console.log('📊 Getting accountability signatures for pod:', podId);
      
      await this.ensureAuthenticated();

      const { data, error } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .order('signed_at', { ascending: true });

      if (error) {
        console.error('Database error getting accountability signatures:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Retrieved accountability signatures:', data?.length || 0);
      console.log('🔍 Raw signature data:', data?.map(sig => ({
        id: sig.id,
        signer_address: sig.signer_address,
        signature_data: sig.signature_data ? 'present' : 'missing',
        signed_at: sig.signed_at,
        is_valid: sig.is_valid
      })));
      return { data: data || [], error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.getAccountabilitySignatures error:', error);
      return { data: null, error };
    }
  }

  /**
   * Add single accountability signature
   */
  static async addAccountabilitySignature(podId: string, signature: any): Promise<DatabaseResult<any>> {
    try {
      console.log('📊 Adding accountability signature for pod:', podId);
      
      await this.ensureAuthenticated();

      const { data, error } = await supabase
        .from('pod_accountability_signatures')
        .insert({
          pod_id: podId,
          signer_address: signature.address,
          signature_data: signature.signature,
          signed_at: signature.timestamp,
          accountability_statement: signature.statement,
          is_valid: signature.isValid,
        })
        .select()
        .single();

      if (error) {
        console.error('Database error adding accountability signature:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Accountability signature added');
      return { data, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.addAccountabilitySignature error:', error);
      return { data: null, error };
    }
  }

  /**
   * Delete pod (soft delete by setting status to inactive)
   */
  static async deletePod(podId: string): Promise<DatabaseResult<boolean>> {
    try {
      console.log('📊 Soft deleting pod:', podId);
      
      await this.ensureAuthenticated();

      const { error } = await supabase
        .from('pods')
        .update({ 
          status: 'inactive', 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', podId);

      if (error) {
        console.error('Database error deleting pod:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Pod soft deleted:', podId);
      return { data: true, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.deletePod error:', error);
      return { data: null, error };
    }
  }

  // ==========================================
  // ACCOUNTABILITY SIGNATURES
  // ==========================================

  /**
   * Create accountability signature
   */
  static async createAccountabilitySignature(
    podId: string,
    signature: AccountabilitySignature
  ): Promise<DatabaseResult<boolean>> {
    try {
      console.log('📊 Creating accountability signature for pod:', podId);
      
      await this.ensureAuthenticated();

      const { error } = await supabase
        .from('pod_accountability_signatures')
        .insert({
          pod_id: podId,
          signer_address: signature.address,
          signature_data: signature.signature,
          signed_at: signature.timestamp,
          accountability_statement: signature.statement,
          is_valid: signature.isValid,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Database error creating signature:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Accountability signature created');
      return { data: true, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      console.error('PodDatabaseService.createAccountabilitySignature error:', error);
      return { data: null, error };
    }
  }

  /**
   * Get accountability signatures for a pod
   */
  static async getAccountabilitySignatures(podId: string): Promise<DatabaseResult<AccountabilitySignature[]>> {
    try {
      const { data, error } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .order('signed_at', { ascending: true });

      if (error) {
        return { data: null, error: error.message };
      }

      const signatures = (data || []).map(sig => ({
        address: sig.signer_address,
        signature: sig.signature_data,
        timestamp: sig.signed_at,
        statement: sig.accountability_statement,
        isValid: sig.is_valid,
      }));

      return { data: signatures, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      return { data: null, error };
    }
  }

  // ==========================================
  // MEMBERSHIP OPERATIONS
  // ==========================================

  /**
   * Get pod membership for a user
   */
  static async checkPodMembership(
    podId: string, 
    walletAddress: string
  ): Promise<DatabaseResult<{
    is_member: boolean;
    membership_type?: 'leader' | 'member' | 'admin';
    joined_at?: string;
    hat_id?: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('membership_type, joined_at, hat_id')
        .eq('pod_id', podId)
        .eq('wallet', walletAddress.toLowerCase())
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        return { data: null, error: error.message };
      }

      if (data) {
        return {
          data: {
            is_member: true,
            membership_type: data.membership_type,
            joined_at: data.joined_at,
            hat_id: data.hat_id
          },
          error: null
        };
      }

      return {
        data: { is_member: false },
        error: null
      };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      return { data: null, error };
    }
  }

  // ==========================================
  // UTILITY OPERATIONS
  // ==========================================

  /**
   * Get database statistics
   */
  static async getStats(): Promise<DatabaseResult<{
    totalPods: number;
    activePods: number;
    draftPods: number;
    totalSignatures: number;
  }>> {
    try {
      const [podsResult, signaturesResult] = await Promise.all([
        supabase
          .from('pods')
          .select('status', { count: 'exact' }),
        supabase
          .from('pod_accountability_signatures')
          .select('*', { count: 'exact' })
      ]);

      if (podsResult.error) {
        return { data: null, error: podsResult.error.message };
      }

      const pods = podsResult.data || [];
      const stats = {
        totalPods: pods.length,
        activePods: pods.filter(p => p.status === 'active').length,
        draftPods: pods.filter(p => p.status === 'draft').length,
        totalSignatures: signaturesResult.count || 0
      };

      return { data: stats, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      return { data: null, error };
    }
  }

  /**
   * Execute raw query with proper error handling
   */
  static async executeQuery<T>(
    queryFn: () => Promise<any>
  ): Promise<DatabaseResult<T>> {
    try {
      await this.ensureAuthenticated();
      
      const result = await queryFn();
      
      if (result.error) {
        return { data: null, error: result.error.message };
      }
      
      return { data: result.data, error: null };
      
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Database operation failed';
      return { data: null, error };
    }
  }
}