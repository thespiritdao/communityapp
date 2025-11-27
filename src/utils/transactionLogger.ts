/**
 * Persistent Transaction Logger
 * Stores transaction details in localStorage for debugging purposes
 */

export interface TransactionLogEntry {
  id: string;
  timestamp: string;
  type: 'demo' | 'real';
  phase: 'preparation' | 'execution' | 'success' | 'error';
  transactionHash?: string;
  baseScanUrl?: string;
  roleDetails?: {
    roleId: string;
    roleName: string;
    hatId: string;
    podId?: string;
  };
  moduleDetails?: {
    moduleAddress: string;
    moduleType: string;
  };
  calls?: Array<{
    callIndex: number;
    contractAddress: string;
    functionName: string;
    args: any[];
  }>;
  criteria?: Array<{
    type: string;
    contractAddress: string;
    minimumAmount?: string;
  }>;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: any;
}

class TransactionLogger {
  private static readonly STORAGE_KEY = 'spiritdao_transaction_logs';
  private static readonly MAX_LOGS = 50; // Keep last 50 transactions

  /**
   * Add a new transaction log entry
   */
  static log(entry: Omit<TransactionLogEntry, 'id' | 'timestamp'>): string {
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    
    const fullEntry: TransactionLogEntry = {
      id,
      timestamp,
      ...entry
    };

    // Get existing logs
    const logs = this.getLogs();
    
    // Add new entry at the beginning
    logs.unshift(fullEntry);
    
    // Keep only the most recent entries
    const trimmedLogs = logs.slice(0, this.MAX_LOGS);
    
    // Save back to localStorage
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmedLogs));
    } catch (error) {
      console.warn('Failed to save transaction log to localStorage:', error);
    }

    // Also log to console with enhanced formatting
    this.logToConsole(fullEntry);
    
    return id;
  }

  /**
   * Get all transaction logs
   */
  static getLogs(): TransactionLogEntry[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to retrieve transaction logs from localStorage:', error);
      return [];
    }
  }

  /**
   * Get logs by type
   */
  static getLogsByType(type: 'demo' | 'real'): TransactionLogEntry[] {
    return this.getLogs().filter(log => log.type === type);
  }

  /**
   * Get recent logs (last N entries)
   */
  static getRecentLogs(count = 10): TransactionLogEntry[] {
    return this.getLogs().slice(0, count);
  }

  /**
   * Find logs by transaction hash
   */
  static findByHash(hash: string): TransactionLogEntry[] {
    return this.getLogs().filter(log => log.transactionHash === hash);
  }

  /**
   * Clear all logs
   */
  static clearLogs(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('🧹 Transaction logs cleared');
    } catch (error) {
      console.warn('Failed to clear transaction logs:', error);
    }
  }

  /**
   * Export logs as JSON for debugging
   */
  static exportLogs(): string {
    return JSON.stringify(this.getLogs(), null, 2);
  }

  /**
   * Print recent transaction summary to console
   */
  static printSummary(count = 5): void {
    const logs = this.getRecentLogs(count);
    
    console.group(`📊 RECENT TRANSACTION SUMMARY (Last ${count})`);
    logs.forEach((log, index) => {
      const timeAgo = this.getTimeAgo(log.timestamp);
      const status = log.phase === 'success' ? '✅' : log.phase === 'error' ? '❌' : '🔄';
      
      console.log(`${status} ${index + 1}. ${log.type.toUpperCase()} - ${log.roleDetails?.roleName || 'Unknown Role'} (${timeAgo})`);
      if (log.transactionHash) {
        console.log(`   🔗 Hash: ${log.transactionHash}`);
        console.log(`   🌐 BaseScan: ${log.baseScanUrl}`);
      }
      if (log.error) {
        console.log(`   ❌ Error: ${log.error.message}`);
      }
    });
    console.groupEnd();
  }

  /**
   * Enhanced console logging with persistent reference
   */
  private static logToConsole(entry: TransactionLogEntry): void {
    const emoji = entry.type === 'demo' ? '🎯' : '🔥';
    const phaseEmoji = {
      preparation: '📋',
      execution: '⚡',
      success: '✅',
      error: '❌'
    }[entry.phase];

    console.group(`${emoji} TRANSACTION LOG [${entry.id}] ${phaseEmoji} ${entry.phase.toUpperCase()}`);
    console.log('⏰ Timestamp:', entry.timestamp);
    console.log('🎭 Type:', entry.type);
    
    if (entry.roleDetails) {
      console.log('👤 Role:', entry.roleDetails);
    }
    
    if (entry.moduleDetails) {
      console.log('🏭 Module:', entry.moduleDetails);
    }
    
    if (entry.calls && entry.calls.length > 0) {
      console.log('📞 Calls:', entry.calls);
    }
    
    if (entry.criteria && entry.criteria.length > 0) {
      console.log('📝 Criteria:', entry.criteria);
    }
    
    if (entry.transactionHash) {
      console.log('🔗 Transaction Hash:', entry.transactionHash);
      console.log('🌐 BaseScan URL:', entry.baseScanUrl);
    }
    
    if (entry.error) {
      console.error('❌ Error Details:', entry.error);
    }
    
    console.log('💾 Stored in localStorage under key:', this.STORAGE_KEY);
    console.log('🔍 Retrieve with: TransactionLogger.getLogs()');
    
    console.groupEnd();
  }

  /**
   * Generate unique ID for log entries
   */
  private static generateId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get human-readable time ago string
   */
  private static getTimeAgo(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}

// Make it globally available for debugging
if (typeof window !== 'undefined') {
  (window as any).TransactionLogger = TransactionLogger;
}

export default TransactionLogger;