/**
 * Enhanced error handling and logging service for HAT transactions
 */

export interface HatTransactionError {
  code: string;
  message: string;
  details: any;
  timestamp: string;
  userAddress: string;
  hatId?: string;
  transactionHash?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface HatTransactionLog {
  type: 'creation' | 'mint' | 'permission_check' | 'state_change';
  action: string;
  success: boolean;
  duration: number;
  hatId?: string;
  userAddress: string;
  details: any;
  timestamp: string;
  transactionHash?: string;
}

class HatErrorService {
  private logs: HatTransactionLog[] = [];
  private errors: HatTransactionError[] = [];

  /**
   * Log a HAT transaction for monitoring
   */
  logTransaction(log: Omit<HatTransactionLog, 'timestamp'>): void {
    const fullLog: HatTransactionLog = {
      ...log,
      timestamp: new Date().toISOString()
    };
    
    this.logs.push(fullLog);
    
    // Log to console with appropriate level
    if (log.success) {
      console.log(`🎩 HAT ${log.type} successful:`, {
        action: log.action,
        duration: `${log.duration}ms`,
        hatId: log.hatId,
        user: log.userAddress.slice(0, 8) + '...',
        details: log.details
      });
    } else {
      console.warn(`⚠️ HAT ${log.type} failed:`, {
        action: log.action,
        duration: `${log.duration}ms`,
        hatId: log.hatId,
        user: log.userAddress.slice(0, 8) + '...',
        details: log.details
      });
    }
    
    // Keep only last 1000 logs to prevent memory issues
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }
  }

  /**
   * Log an error with detailed context
   */
  logError(error: Omit<HatTransactionError, 'timestamp'>): void {
    const fullError: HatTransactionError = {
      ...error,
      timestamp: new Date().toISOString()
    };
    
    this.errors.push(fullError);
    
    // Log to console with appropriate level based on severity
    const logMethod = {
      low: console.info,
      medium: console.warn,
      high: console.error,
      critical: console.error
    }[error.severity];
    
    logMethod(`🚨 HAT Error [${error.severity.toUpperCase()}]:`, {
      code: error.code,
      message: error.message,
      hatId: error.hatId,
      user: error.userAddress.slice(0, 8) + '...',
      txHash: error.transactionHash,
      details: error.details
    });
    
    // Keep only last 500 errors
    if (this.errors.length > 500) {
      this.errors = this.errors.slice(-500);
    }
  }

  /**
   * Parse and categorize common HAT protocol errors
   */
  parseContractError(error: any, context: {
    userAddress: string;
    hatId?: string;
    action: string;
    transactionHash?: string;
  }): HatTransactionError {
    let code = 'UNKNOWN_ERROR';
    let message = 'Unknown error occurred';
    let severity: HatTransactionError['severity'] = 'medium';
    
    const errorStr = error?.message || error?.toString() || '';
    
    // Common HAT protocol errors
    if (errorStr.includes('Hat_NotAdmin')) {
      code = 'NOT_ADMIN';
      message = 'User is not an admin of this hat';
      severity = 'high';
    } else if (errorStr.includes('Hat_MaxSupplyReached')) {
      code = 'MAX_SUPPLY_REACHED';
      message = 'Maximum supply for this hat has been reached';
      severity = 'medium';
    } else if (errorStr.includes('Hat_NotEligible')) {
      code = 'NOT_ELIGIBLE';
      message = 'User is not eligible to wear this hat';
      severity = 'medium';
    } else if (errorStr.includes('Hat_NotActive')) {
      code = 'HAT_INACTIVE';
      message = 'Hat is not active (may be toggled off)';
      severity = 'high';
    } else if (errorStr.includes('Hat_AlreadyWearing')) {
      code = 'ALREADY_WEARING';
      message = 'User is already wearing this hat';
      severity = 'low';
    } else if (errorStr.includes('insufficient funds') || errorStr.includes('gas')) {
      code = 'INSUFFICIENT_GAS';
      message = 'Insufficient gas or funds for transaction';
      severity = 'medium';
    } else if (errorStr.includes('user rejected')) {
      code = 'USER_REJECTED';
      message = 'User rejected the transaction';
      severity = 'low';
    } else if (errorStr.includes('network')) {
      code = 'NETWORK_ERROR';
      message = 'Network connection error';
      severity = 'medium';
    }
    
    return {
      code,
      message,
      details: {
        originalError: errorStr,
        action: context.action,
        stackTrace: error?.stack
      },
      timestamp: new Date().toISOString(),
      userAddress: context.userAddress,
      hatId: context.hatId,
      transactionHash: context.transactionHash,
      severity
    };
  }

  /**
   * Get transaction logs for debugging
   */
  getTransactionLogs(filters?: {
    type?: HatTransactionLog['type'];
    success?: boolean;
    hatId?: string;
    userAddress?: string;
    since?: string;
  }): HatTransactionLog[] {
    let filteredLogs = [...this.logs];
    
    if (filters) {
      if (filters.type) {
        filteredLogs = filteredLogs.filter(log => log.type === filters.type);
      }
      if (filters.success !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.success === filters.success);
      }
      if (filters.hatId) {
        filteredLogs = filteredLogs.filter(log => log.hatId === filters.hatId);
      }
      if (filters.userAddress) {
        filteredLogs = filteredLogs.filter(log => 
          log.userAddress.toLowerCase() === filters.userAddress?.toLowerCase()
        );
      }
      if (filters.since) {
        const sinceDate = new Date(filters.since);
        filteredLogs = filteredLogs.filter(log => 
          new Date(log.timestamp) >= sinceDate
        );
      }
    }
    
    return filteredLogs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get error logs for debugging
   */
  getErrorLogs(filters?: {
    severity?: HatTransactionError['severity'];
    code?: string;
    hatId?: string;
    userAddress?: string;
    since?: string;
  }): HatTransactionError[] {
    let filteredErrors = [...this.errors];
    
    if (filters) {
      if (filters.severity) {
        filteredErrors = filteredErrors.filter(error => error.severity === filters.severity);
      }
      if (filters.code) {
        filteredErrors = filteredErrors.filter(error => error.code === filters.code);
      }
      if (filters.hatId) {
        filteredErrors = filteredErrors.filter(error => error.hatId === filters.hatId);
      }
      if (filters.userAddress) {
        filteredErrors = filteredErrors.filter(error => 
          error.userAddress.toLowerCase() === filters.userAddress?.toLowerCase()
        );
      }
      if (filters.since) {
        const sinceDate = new Date(filters.since);
        filteredErrors = filteredErrors.filter(error => 
          new Date(error.timestamp) >= sinceDate
        );
      }
    }
    
    return filteredErrors.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get performance metrics for HAT operations
   */
  getPerformanceMetrics(): {
    avgTransactionTime: number;
    successRate: number;
    errorsByType: Record<string, number>;
    transactionsByType: Record<string, number>;
  } {
    const logs = this.getTransactionLogs();
    
    if (logs.length === 0) {
      return {
        avgTransactionTime: 0,
        successRate: 0,
        errorsByType: {},
        transactionsByType: {}
      };
    }
    
    const avgTransactionTime = logs.reduce((sum, log) => sum + log.duration, 0) / logs.length;
    const successCount = logs.filter(log => log.success).length;
    const successRate = (successCount / logs.length) * 100;
    
    const errorsByType: Record<string, number> = {};
    this.errors.forEach(error => {
      errorsByType[error.code] = (errorsByType[error.code] || 0) + 1;
    });
    
    const transactionsByType: Record<string, number> = {};
    logs.forEach(log => {
      transactionsByType[log.type] = (transactionsByType[log.type] || 0) + 1;
    });
    
    return {
      avgTransactionTime: Math.round(avgTransactionTime),
      successRate: Math.round(successRate * 100) / 100,
      errorsByType,
      transactionsByType
    };
  }

  /**
   * Clear logs and errors (for testing/debugging)
   */
  clearLogs(): void {
    this.logs = [];
    this.errors = [];
    console.log('🧹 HAT service logs cleared');
  }
}

// Export singleton instance
export const hatErrorService = new HatErrorService();

// Export wrapper functions for common operations
export const logHatTransaction = (log: Omit<HatTransactionLog, 'timestamp'>) => 
  hatErrorService.logTransaction(log);

export const logHatError = (error: any, context: {
  userAddress: string;
  hatId?: string;
  action: string;
  transactionHash?: string;
}) => {
  const parsedError = hatErrorService.parseContractError(error, context);
  hatErrorService.logError(parsedError);
  return parsedError;
};