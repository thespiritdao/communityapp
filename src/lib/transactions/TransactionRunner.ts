/**
 * Transaction Runner - User-friendly blockchain transaction execution
 *
 * Provides a clean interface for executing blockchain transactions with
 * user feedback, progress tracking, and error handling.
 */

import * as React from 'react';
import { globalRpcQueue } from '../rpc/RpcQueue';

export interface TransactionStep {
  id: string;
  name: string;
  description: string;
  estimatedMs?: number;
}

export interface TransactionConfig {
  title: string;
  description: string;
  steps: TransactionStep[];
  allowCancel?: boolean;
  requireConfirmation?: boolean;
}

export interface TransactionProgress {
  currentStep: number;
  totalSteps: number;
  stepId: string;
  stepName: string;
  stepDescription: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: Error;
  txHash?: string;
  estimatedTimeRemaining?: number;
}

export type TransactionUpdateCallback = (progress: TransactionProgress) => void;

export interface TransactionResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  txHash?: string;
  gasUsed?: string;
  blockNumber?: number;
}

/**
 * Individual transaction step executor
 */
export type TransactionStepExecutor<T = any> = (
  onProgress?: (progress: Partial<TransactionProgress>) => void,
) => Promise<T>;

export class TransactionRunner {
  private isCancelled = false;
  private onUpdate?: TransactionUpdateCallback;

  constructor(
    private config: TransactionConfig,
    onUpdate?: TransactionUpdateCallback,
  ) {
    this.onUpdate = onUpdate;
  }

  /**
   * Execute a multi-step transaction with user feedback
   */
  async execute<T>(
    stepExecutors: TransactionStepExecutor<any>[],
  ): Promise<TransactionResult<T>> {
    if (stepExecutors.length !== this.config.steps.length) {
      throw new Error(
        `Step executor count (${stepExecutors.length}) doesn't match config steps (${this.config.steps.length})`,
      );
    }

    this.isCancelled = false;
    const results: any[] = [];
    let txHash: string | undefined;
    let gasUsed: string | undefined;
    let blockNumber: number | undefined;

    try {
      for (let i = 0; i < this.config.steps.length; i++) {
        if (this.isCancelled) {
          this.updateProgress(i, 'cancelled');
          return {
            success: false,
            error: new Error('Transaction cancelled by user'),
          };
        }

        const step = this.config.steps[i];
        const executor = stepExecutors[i];

        // Update progress to running
        this.updateProgress(i, 'running');

        try {
          // Execute step with RPC queue for rate limiting
          const stepResult = await globalRpcQueue.enqueueHighPriority(
            async () => {
              return executor((stepProgress) => {
                this.updateProgress(i, 'running', stepProgress);
              });
            },
          );

          // Extract transaction details if available
          if (stepResult?.hash) {
            txHash = stepResult.hash;
          }
          if (stepResult?.gasUsed) {
            gasUsed = stepResult.gasUsed.toString();
          }
          if (stepResult?.blockNumber) {
            blockNumber = stepResult.blockNumber;
          }

          results.push(stepResult);
          this.updateProgress(i, 'completed', { txHash });
        } catch (error) {
          console.error(`Transaction step ${step.id} failed:`, error);
          this.updateProgress(i, 'failed', {
            error: error instanceof Error ? error : new Error(String(error)),
          });

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            txHash,
          };
        }
      }

      return {
        success: true,
        data: results.length === 1 ? results[0] : results,
        txHash,
        gasUsed,
        blockNumber,
      };
    } catch (error) {
      console.error('Transaction execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        txHash,
      };
    }
  }

  /**
   * Cancel the running transaction
   */
  cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Check if transaction is cancelled
   */
  get cancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * Update progress and notify callback
   */
  private updateProgress(
    stepIndex: number,
    status: TransactionProgress['status'],
    extra: Partial<TransactionProgress> = {},
  ): void {
    const step = this.config.steps[stepIndex];
    const progress: TransactionProgress = {
      currentStep: stepIndex + 1,
      totalSteps: this.config.steps.length,
      stepId: step.id,
      stepName: step.name,
      stepDescription: step.description,
      status,
      estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(
        stepIndex,
        status,
      ),
      ...extra,
    };

    this.onUpdate?.(progress);
  }

  /**
   * Calculate estimated time remaining based on step progress
   */
  private calculateEstimatedTimeRemaining(
    currentStepIndex: number,
    status: TransactionProgress['status'],
  ): number | undefined {
    if (
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled'
    ) {
      return 0;
    }

    let remainingMs = 0;

    // Add estimated time for remaining steps
    for (let i = currentStepIndex + 1; i < this.config.steps.length; i++) {
      remainingMs += this.config.steps[i].estimatedMs || 3000; // Default 3 seconds per step
    }

    // Add half the current step's estimated time if running
    if (status === 'running') {
      const currentStep = this.config.steps[currentStepIndex];
      remainingMs += (currentStep.estimatedMs || 3000) / 2;
    }

    return remainingMs;
  }
}

/**
 * Common transaction configurations for pod operations
 */
export const PodTransactionConfigs = {
  CREATE_POD: {
    title: 'Create Pod',
    description: 'Creating a new pod with HAT integration',
    steps: [
      {
        id: 'validate',
        name: 'Validate',
        description: 'Validating pod configuration',
        estimatedMs: 1000,
      },
      {
        id: 'create-hats',
        name: 'Create HATs',
        description: 'Creating management and member HATs',
        estimatedMs: 8000,
      },
      {
        id: 'deploy-treasury',
        name: 'Deploy Treasury',
        description: 'Deploying pod treasury contract',
        estimatedMs: 10000,
      },
      {
        id: 'save-pod',
        name: 'Save Pod',
        description: 'Saving pod to database',
        estimatedMs: 2000,
      },
    ],
    requireConfirmation: true,
    allowCancel: true,
  } as TransactionConfig,

  UPDATE_MEMBERS: {
    title: 'Update Members',
    description: 'Adding or removing pod members',
    steps: [
      {
        id: 'validate',
        name: 'Validate',
        description: 'Validating member changes',
        estimatedMs: 500,
      },
      {
        id: 'update-hats',
        name: 'Update HATs',
        description: 'Updating HAT assignments',
        estimatedMs: 5000,
      },
      {
        id: 'sync-database',
        name: 'Sync Database',
        description: 'Updating member records',
        estimatedMs: 1000,
      },
    ],
    requireConfirmation: true,
    allowCancel: true,
  } as TransactionConfig,

  TREASURY_TRANSACTION: {
    title: 'Treasury Transaction',
    description: 'Executing treasury transaction',
    steps: [
      {
        id: 'prepare',
        name: 'Prepare',
        description: 'Preparing transaction data',
        estimatedMs: 1000,
      },
      {
        id: 'execute',
        name: 'Execute',
        description: 'Executing transaction',
        estimatedMs: 8000,
      },
      {
        id: 'confirm',
        name: 'Confirm',
        description: 'Waiting for confirmation',
        estimatedMs: 5000,
      },
    ],
    requireConfirmation: true,
    allowCancel: false, // Treasury transactions shouldn't be cancelled mid-flight
  } as TransactionConfig,
};

/**
 * Utility function to create a transaction runner with common setup
 */
export function createTransactionRunner(
  configKey: keyof typeof PodTransactionConfigs | TransactionConfig,
  onUpdate?: TransactionUpdateCallback,
): TransactionRunner {
  const config =
    typeof configKey === 'string'
      ? PodTransactionConfigs[configKey]
      : configKey;

  return new TransactionRunner(config, onUpdate);
}

/**
 * React hook utility for transaction state management
 */
export interface UseTransactionRunnerResult {
  progress: TransactionProgress | null;
  isRunning: boolean;
  execute: <T>(
    config: keyof typeof PodTransactionConfigs | TransactionConfig,
    executors: TransactionStepExecutor<any>[],
  ) => Promise<TransactionResult<T>>;
  cancel: () => void;
}

/**
 * Hook for managing transaction state in React components
 * (This would normally be in a separate hooks file, but including here for completeness)
 */
export function useTransactionRunner(): UseTransactionRunnerResult {
  const [progress, setProgress] = React.useState<TransactionProgress | null>(
    null,
  );
  const [currentRunner, setCurrentRunner] =
    React.useState<TransactionRunner | null>(null);

  const execute = React.useCallback(
    async <T>(
      config: keyof typeof PodTransactionConfigs | TransactionConfig,
      executors: TransactionStepExecutor<any>[],
    ): Promise<TransactionResult<T>> => {
      const runner = createTransactionRunner(config, setProgress);
      setCurrentRunner(runner);

      try {
        const result = await runner.execute<T>(executors);
        return result;
      } finally {
        setCurrentRunner(null);
        setProgress(null);
      }
    },
    [],
  );

  const cancel = React.useCallback(() => {
    currentRunner?.cancel();
  }, [currentRunner]);

  return {
    progress,
    isRunning: !!currentRunner,
    execute,
    cancel,
  };
}
