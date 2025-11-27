import { useState, useEffect, useCallback } from 'react';
import { PodValidationService } from '../services/PodValidationService';

export interface ValidatedPod {
  databaseId: string;
  contractId: string;
  isValid: boolean;
  error?: string;
}

export function usePodValidation() {
  const [validatedPods, setValidatedPods] = useState<
    Record<string, ValidatedPod>
  >({});
  const [isValidating, setIsValidating] = useState(false);

  /**
   * Validate a single pod ID and cache the result
   */
  const validatePodId = useCallback(
    async (databasePodId: string | null | undefined): Promise<ValidatedPod> => {
      const safePodId = databasePodId || '';

      // Check if we already have this validation cached
      if (validatedPods[safePodId]) {
        return validatedPods[safePodId];
      }

      console.log('🔍 Validating pod ID:', safePodId);

      try {
        const contractPodId =
          await PodValidationService.convertDatabasePodToContractId(safePodId);
        const validation =
          await PodValidationService.validatePodId(contractPodId);

        const result: ValidatedPod = {
          databaseId: safePodId,
          contractId: contractPodId,
          isValid: validation.isValid,
          error: validation.error,
        };

        // Cache the result
        setValidatedPods((prev) => ({
          ...prev,
          [safePodId]: result,
        }));

        console.log('✅ Pod validation complete:', result);
        return result;
      } catch (error) {
        const result: ValidatedPod = {
          databaseId: safePodId,
          contractId: '',
          isValid: false,
          error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };

        setValidatedPods((prev) => ({
          ...prev,
          [safePodId]: result,
        }));

        console.error('❌ Pod validation failed:', result);
        return result;
      }
    },
    [validatedPods],
  );

  /**
   * Validate multiple pod IDs in batch
   */
  const validateMultiplePods = useCallback(
    async (podIds: (string | null | undefined)[]): Promise<void> => {
      setIsValidating(true);

      try {
        const uniquePodIds = [...new Set(podIds.map((id) => id || ''))];

        console.log('🔄 Batch validating pod IDs:', uniquePodIds);

        await Promise.all(uniquePodIds.map((podId) => validatePodId(podId)));

        console.log('✅ Batch validation complete');
      } catch (error) {
        console.error('❌ Batch validation failed:', error);
      } finally {
        setIsValidating(false);
      }
    },
    [validatePodId],
  );

  /**
   * Get the validated contract pod ID for a database pod ID
   */
  const getValidatedPodId = useCallback(
    (databasePodId: string | null | undefined): string => {
      const safePodId = databasePodId || '';
      const validation = validatedPods[safePodId];

      if (!validation) {
        // If not validated yet, trigger validation and return empty string for safety
        console.warn(
          '⚠️ Pod ID not yet validated, triggering validation:',
          safePodId,
        );
        // Trigger async validation (fire and forget)
        validatePodId(safePodId).catch(console.error);
        return '';
      }

      if (!validation.isValid) {
        console.warn(
          '⚠️ Invalid pod ID, using fallback contract ID:',
          validation,
        );
        // Return the contract ID even if invalid - our service should have found a fallback
        return validation.contractId;
      }

      return validation.contractId;
    },
    [validatedPods, validatePodId],
  );

  /**
   * Check if a pod ID is currently being validated or needs validation
   */
  const isPodValidated = useCallback(
    (databasePodId: string | null | undefined): boolean => {
      const safePodId = databasePodId || '';
      return !!validatedPods[safePodId];
    },
    [validatedPods],
  );

  /**
   * Get validation status for a pod ID
   */
  const getPodValidationStatus = useCallback(
    (databasePodId: string | null | undefined) => {
      const safePodId = databasePodId || '';
      const validation = validatedPods[safePodId];

      return {
        isValidated: !!validation,
        isValid: validation?.isValid ?? false,
        contractId: validation?.contractId ?? '',
        error: validation?.error,
      };
    },
    [validatedPods],
  );

  /**
   * Clear validation cache (useful for testing or refresh)
   */
  const clearValidationCache = useCallback(() => {
    setValidatedPods({});
  }, []);

  return {
    validatePodId,
    validateMultiplePods,
    getValidatedPodId,
    isPodValidated,
    getPodValidationStatus,
    clearValidationCache,
    isValidating,
    validatedPods,
  };
}
