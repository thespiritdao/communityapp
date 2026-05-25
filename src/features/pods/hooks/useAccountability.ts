import { useState, useEffect, useCallback } from 'react';
import { useSignEvmMessage, useCurrentUser } from '@coinbase/cdp-hooks';
import { useUserWallet } from '@/hooks/useUserWallet';
import {
  PodCoreService,
  type AccountabilitySignature,
} from '../services/PodCoreService';
import { AccountabilitySignatureService } from '../services/AccountabilitySignatureService';

export interface UseAccountabilityConfig {
  podId: string;
  podName?: string;
}

export interface UseAccountabilityReturn {
  signatures: AccountabilitySignature[];
  loading: boolean;
  signing: boolean;
  agreementText: string;
  setAgreementText: (text: string) => void;
  handleSign: () => Promise<void>;
  canSign: boolean;
  hasSigned: boolean;
  error: string | null;
}

/**
 * Hook for managing accountability signatures for pods
 * Consolidates accountability logic from pod detail page
 */
export function useAccountability({
  podId,
  podName,
}: UseAccountabilityConfig): UseAccountabilityReturn {
  // Identity wallet (canonical) — who is signing of record. The actual
  // signature is produced by the device's CDP account (currentUser) below;
  // the stored signer_address must be the canonical identity so the
  // "has signed" read (usePodEligibilityAgreements / pod display) matches
  // regardless of which device the user is on.
  const address = useUserWallet();
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();

  const [signatures, setSignatures] = useState<AccountabilitySignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreementText, setAgreementText] = useState<string>(
    'I acknowledge and agree to the SpiritDAO Accountability Agreement.',
  );

  /**
   * Load accountability signatures for pod
   */
  const loadSignatures = useCallback(async () => {
    if (!podId) return;

    try {
      setLoading(true);
      setError(null);

      const sigs = await PodCoreService.getAccountabilitySignatures(podId);
      setSignatures(sigs);
    } catch (err) {
      console.error('Failed to load accountability signatures:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load signatures',
      );
    } finally {
      setLoading(false);
    }
  }, [podId]);

  /**
   * Handle signing accountability agreement
   */
  const handleSign = useCallback(async () => {
    if (!address || !podId) return;

    try {
      setSigning(true);
      setError(null);

      // Check if EVM account is available
      const evmAccount = currentUser?.evmAccounts?.[0];
      if (!evmAccount) {
        throw new Error('EVM account not available');
      }

      // Create accountability message
      const message = `SpiritDAO Pod Leadership Accountability Statement\n\nAddress: ${address}\nTimestamp: ${new Date().toISOString()}\n\n${agreementText}`;

      // Sign the message with CDP
      const signResult = await signEvmMessage({
        evmAccount: evmAccount as `0x${string}`,
        message,
      });
      const signature = signResult.signature;

      // Store signature using AccountabilitySignatureService
      const result = await AccountabilitySignatureService.createSignature({
        pod_id: podId,
        signer_address: address,
        signature_data: signature,
        accountability_statement: agreementText,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save signature');
      }

      console.log('✅ Accountability signature created successfully');

      // Refresh signatures list
      await loadSignatures();

      // Check if threshold is met and notify executives
      const currentSignatureCount = signatures.length + 1;
      if (currentSignatureCount >= 1 && podName) {
        // TODO: Re-enable when notifyExecutiveForApproval is made public
        // try {
        //   await PodCoreService.notifyExecutiveForApproval(
        //     podId,
        //     podName,
        //     address,
        //   );
        //   console.log('✅ Executive notification sent for pod approval');
        // } catch (notificationError) {
        //   console.warn('Failed to notify executives:', notificationError);
        //   // Don't fail the signing process
        // }
        console.log('⏩ Skipping executive notification (method is private)');
      }
    } catch (err) {
      console.error('❌ Signing failed:', err);
      setError(err instanceof Error ? err.message : 'Could not sign agreement');
    } finally {
      setSigning(false);
    }
  }, [
    address,
    podId,
    podName,
    agreementText,
    currentUser,
    signEvmMessage,
    signatures.length,
    loadSignatures,
  ]);

  // Computed properties
  const canSign = Boolean(address && podId);

  // Check if user has signed - use the same logic as the pod display for consistency
  const hasSigned = Boolean(
    address &&
      signatures.some(
        (s) => s.address && s.address.toLowerCase() === address.toLowerCase(),
      ),
  );

  // Load signatures on mount and when podId changes
  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  return {
    signatures,
    loading,
    signing,
    agreementText,
    setAgreementText,
    handleSign,
    canSign,
    hasSigned,
    error,
  };
}
