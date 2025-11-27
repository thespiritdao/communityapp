/**
 * Contract Read Retry Utility
 *
 * Provides retry logic with exponential backoff for contract reads.
 * Common use case: Reading proposal state from blockchain can fail due to:
 * - Network congestion
 * - RPC provider rate limiting
 * - Temporary node issues
 *
 * Usage:
 * ```typescript
 * const state = await retryContractRead(
 *   () => publicClient.readContract({ ... }),
 *   { retries: 3, initialDelay: 500 }
 * );
 * ```
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  retries?: number;
  /** Initial delay in milliseconds (default: 500ms) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 5000ms) */
  maxDelay?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Custom error handler called on each retry */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a contract read operation with exponential backoff
 *
 * @param operation - Async function that performs the contract read
 * @param options - Retry configuration options
 * @returns The result of the contract read
 * @throws The last error if all retries fail
 */
export async function retryContractRead<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    initialDelay = 500,
    maxDelay = 5000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Attempt the operation
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // If this is the last attempt, throw the error
      if (attempt === retries) {
        throw lastError;
      }

      // Call custom error handler if provided
      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next attempt (capped at maxDelay)
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Check if an error is a retryable network/RPC error
 */
export function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    /network/i,
    /timeout/i,
    /rate limit/i,
    /too many requests/i,
    /503/,
    /502/,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /fetch failed/i,
  ];

  const errorMessage = error.message || error.toString();
  return retryablePatterns.some((pattern) => pattern.test(errorMessage));
}
