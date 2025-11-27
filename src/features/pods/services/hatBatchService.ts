/**
 * Batch processing service for HAT operations
 * Supports both real-time individual operations (testing) and batch processing (production)
 * Includes governance approval workflow integration
 */

import { logHatTransaction, logHatError } from './hatErrorService';

export interface BatchOperation {
  id: string;
  type: 'mint_management' | 'mint_membership' | 'create_hat' | 'deactivate_hat';
  podId: string;
  targetAddress?: string;
  targetAddresses?: string[];
  hatId?: string;
  metadata?: any;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected';
  createdAt: string;
  executedAt?: string;
  createdBy: string;
  approvedBy?: string;
  transactionHash?: string;
  error?: string;
}

export interface BatchExecutionResult {
  batchId: string;
  totalOperations: number;
  successful: number;
  failed: number;
  duration: number;
  operations: {
    operationId: string;
    success: boolean;
    transactionHash?: string;
    error?: string;
  }[];
}

export interface GovernanceApprovalRequest {
  batchId: string;
  title: string;
  description: string;
  operations: BatchOperation[];
  requestedBy: string;
  executiveReviewRequired: boolean;
  estimatedGasCost?: string;
}

class HatBatchService {
  private pendingBatches: Map<string, BatchOperation[]> = new Map();
  private executionQueue: BatchOperation[] = [];
  private isProcessing = false;

  /**
   * Add single operation (real-time mode for testing)
   */
  async executeImmediateOperation(operation: Omit<BatchOperation, 'id' | 'status' | 'createdAt'>): Promise<{
    success: boolean;
    operationId: string;
    transactionHash?: string;
    error?: string;
  }> {
    const operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullOperation: BatchOperation = {
      ...operation,
      id: operationId,
      status: 'executing',
      createdAt: new Date().toISOString()
    };

    console.log(`🚀 Executing immediate HAT operation:`, {
      type: operation.type,
      podId: operation.podId,
      operationId
    });

    const startTime = Date.now();

    try {
      // Execute the operation based on type
      const result = await this.executeSingleOperation(fullOperation);
      const duration = Date.now() - startTime;

      // Log successful operation
      logHatTransaction({
        type: this.mapOperationToLogType(operation.type),
        action: operation.type,
        success: true,
        duration,
        hatId: operation.hatId,
        userAddress: operation.createdBy,
        details: {
          operationId,
          podId: operation.podId,
          immediate: true,
          ...operation.metadata
        }
      });

      return {
        success: true,
        operationId,
        transactionHash: result.transactionHash
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const parsedError = logHatError(error, {
        userAddress: operation.createdBy,
        hatId: operation.hatId,
        action: operation.type
      });

      logHatTransaction({
        type: this.mapOperationToLogType(operation.type),
        action: operation.type,
        success: false,
        duration,
        hatId: operation.hatId,
        userAddress: operation.createdBy,
        details: {
          operationId,
          podId: operation.podId,
          immediate: true,
          error: parsedError.message
        }
      });

      return {
        success: false,
        operationId,
        error: parsedError.message
      };
    }
  }

  /**
   * Create batch for governance approval workflow
   */
  async createGovernanceBatch(operations: Omit<BatchOperation, 'id' | 'status' | 'createdAt'>[]): Promise<GovernanceApprovalRequest> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const batchOperations: BatchOperation[] = operations.map((op, index) => ({
      ...op,
      id: `${batchId}-op-${index}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    }));

    this.pendingBatches.set(batchId, batchOperations);

    // Create governance proposal description
    const operationSummary = this.summarizeOperations(batchOperations);
    const executiveReviewRequired = this.requiresExecutiveReview(batchOperations);

    const approvalRequest: GovernanceApprovalRequest = {
      batchId,
      title: `HAT Operations Batch - ${operationSummary.title}`,
      description: this.generateBatchDescription(batchOperations, operationSummary),
      operations: batchOperations,
      requestedBy: operations[0]?.createdBy || 'unknown',
      executiveReviewRequired,
      estimatedGasCost: this.estimateGasCost(batchOperations)
    };

    console.log(`📋 Created governance batch:`, {
      batchId,
      operationsCount: batchOperations.length,
      executiveReviewRequired,
      summary: operationSummary
    });

    return approvalRequest;
  }

  /**
   * Approve batch for execution (called by governance)
   */
  async approveBatch(batchId: string, approvedBy: string): Promise<void> {
    const operations = this.pendingBatches.get(batchId);
    if (!operations) {
      throw new Error(`Batch ${batchId} not found`);
    }

    // Update operation statuses
    operations.forEach(op => {
      op.status = 'approved';
      op.approvedBy = approvedBy;
    });

    // Add to execution queue
    this.executionQueue.push(...operations);

    console.log(`✅ Batch ${batchId} approved by ${approvedBy}, added to execution queue`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processExecutionQueue().catch(console.error);
    }
  }

  /**
   * Reject batch (called by governance)
   */
  async rejectBatch(batchId: string, rejectedBy: string, reason: string): Promise<void> {
    const operations = this.pendingBatches.get(batchId);
    if (!operations) {
      throw new Error(`Batch ${batchId} not found`);
    }

    operations.forEach(op => {
      op.status = 'rejected';
      op.error = `Rejected by ${rejectedBy}: ${reason}`;
    });

    console.log(`❌ Batch ${batchId} rejected by ${rejectedBy}: ${reason}`);
  }

  /**
   * Process execution queue
   */
  private async processExecutionQueue(): Promise<void> {
    if (this.isProcessing || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`⚡ Processing ${this.executionQueue.length} queued operations...`);

    while (this.executionQueue.length > 0) {
      const operation = this.executionQueue.shift()!;
      
      try {
        operation.status = 'executing';
        const result = await this.executeSingleOperation(operation);
        
        operation.status = 'completed';
        operation.executedAt = new Date().toISOString();
        operation.transactionHash = result.transactionHash;

      } catch (error) {
        operation.status = 'failed';
        operation.error = error instanceof Error ? error.message : 'Unknown error';
        
        logHatError(error, {
          userAddress: operation.createdBy,
          hatId: operation.hatId,
          action: operation.type
        });
      }
    }

    this.isProcessing = false;
    console.log('✅ Execution queue processing completed');
  }

  /**
   * Execute single operation (implementation placeholder)
   */
  private async executeSingleOperation(operation: BatchOperation): Promise<{ transactionHash: string }> {
    // This is where actual HAT protocol calls would be made
    // For now, we'll simulate the operations
    
    console.log(`🎩 Executing ${operation.type} for pod ${operation.podId}...`);
    
    // Simulate transaction execution time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    switch (operation.type) {
      case 'create_hat':
        // Would call Hats.createHat()
        return { transactionHash: `0x${Math.random().toString(16).substr(2, 64)}` };
        
      case 'mint_management':
        // Would call Hats.mintHat() for management hat
        return { transactionHash: `0x${Math.random().toString(16).substr(2, 64)}` };
        
      case 'mint_membership':
        // Would call Hats.mintHat() or Hats.batchMintHats() for membership
        return { transactionHash: `0x${Math.random().toString(16).substr(2, 64)}` };
        
      case 'deactivate_hat':
        // Would call hat toggle/deactivation
        return { transactionHash: `0x${Math.random().toString(16).substr(2, 64)}` };
        
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Helper methods
   */
  private mapOperationToLogType(operationType: BatchOperation['type']): 'creation' | 'mint' | 'state_change' {
    switch (operationType) {
      case 'create_hat': return 'creation';
      case 'mint_management':
      case 'mint_membership': return 'mint';
      case 'deactivate_hat': return 'state_change';
      default: return 'state_change';
    }
  }

  private summarizeOperations(operations: BatchOperation[]): { title: string; counts: Record<string, number> } {
    const counts: Record<string, number> = {};
    operations.forEach(op => {
      counts[op.type] = (counts[op.type] || 0) + 1;
    });

    const totalOps = operations.length;
    const types = Object.keys(counts);
    const title = totalOps === 1 
      ? `Single ${operations[0].type.replace('_', ' ')}`
      : `${totalOps} operations (${types.join(', ')})`;

    return { title, counts };
  }

  private requiresExecutiveReview(operations: BatchOperation[]): boolean {
    // Require executive review for:
    // - More than 5 operations
    // - Any hat creation operations
    // - Operations affecting more than 10 users
    return operations.length > 5 ||
           operations.some(op => op.type === 'create_hat') ||
           operations.some(op => (op.targetAddresses?.length || 0) > 10);
  }

  private generateBatchDescription(operations: BatchOperation[], summary: any): string {
    const podIds = [...new Set(operations.map(op => op.podId))];
    const podCount = podIds.length;
    
    let description = `This batch contains ${operations.length} HAT operations across ${podCount} pod(s).\n\n`;
    description += `**Operations Summary:**\n`;
    
    Object.entries(summary.counts).forEach(([type, count]) => {
      description += `- ${count} ${type.replace('_', ' ')} operation(s)\n`;
    });
    
    description += `\n**Affected Pods:**\n`;
    podIds.forEach(podId => {
      const podOps = operations.filter(op => op.podId === podId);
      description += `- ${podId}: ${podOps.length} operations\n`;
    });

    return description;
  }

  private estimateGasCost(operations: BatchOperation[]): string {
    // Rough gas estimates (would need actual contract testing)
    const gasEstimates = {
      create_hat: 150000,
      mint_management: 80000,
      mint_membership: 80000,
      deactivate_hat: 50000
    };

    const totalGas = operations.reduce((sum, op) => {
      return sum + (gasEstimates[op.type] || 100000);
    }, 0);

    // Convert to ETH estimate (assuming 20 gwei)
    const ethCost = (totalGas * 20 * 1e-9).toFixed(4);
    return `~${ethCost} ETH (${totalGas.toLocaleString()} gas)`;
  }

  /**
   * Get pending batches for governance review
   */
  getPendingBatches(): GovernanceApprovalRequest[] {
    return Array.from(this.pendingBatches.entries()).map(([batchId, operations]) => ({
      batchId,
      title: `HAT Operations Batch - ${this.summarizeOperations(operations).title}`,
      description: this.generateBatchDescription(operations, this.summarizeOperations(operations)),
      operations,
      requestedBy: operations[0]?.createdBy || 'unknown',
      executiveReviewRequired: this.requiresExecutiveReview(operations),
      estimatedGasCost: this.estimateGasCost(operations)
    }));
  }

  /**
   * Get batch status
   */
  getBatchStatus(batchId: string): { operations: BatchOperation[]; status: string } | null {
    const operations = this.pendingBatches.get(batchId);
    if (!operations) return null;

    const statuses = operations.map(op => op.status);
    const overallStatus = statuses.every(s => s === 'completed') ? 'completed' :
                         statuses.some(s => s === 'failed') ? 'failed' :
                         statuses.some(s => s === 'executing') ? 'executing' :
                         statuses.every(s => s === 'approved') ? 'approved' :
                         statuses.every(s => s === 'rejected') ? 'rejected' :
                         'pending';

    return { operations, status: overallStatus };
  }
}

// Export singleton instance
export const hatBatchService = new HatBatchService();

// Convenience functions for your approval workflow
export const createHatBatch = (operations: Omit<BatchOperation, 'id' | 'status' | 'createdAt'>[]) =>
  hatBatchService.createGovernanceBatch(operations);

export const executeHatOperation = (operation: Omit<BatchOperation, 'id' | 'status' | 'createdAt'>) =>
  hatBatchService.executeImmediateOperation(operation);

export const approveHatBatch = (batchId: string, approvedBy: string) =>
  hatBatchService.approveBatch(batchId, approvedBy);

export const rejectHatBatch = (batchId: string, rejectedBy: string, reason: string) =>
  hatBatchService.rejectBatch(batchId, rejectedBy, reason);