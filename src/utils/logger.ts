/**
 * Enhanced Logging Utility
 *
 * Provides environment-aware logging with:
 * - Log levels (debug, info, warn, error)
 * - Automatic debouncing of repeated messages
 * - Production-safe logging
 * - Sensitive data redaction
 * - Emoji prefixes for easy visual scanning
 * - Grouped related logs
 * - Feature-specific loggers
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enableDebounce: boolean;
  debounceMs: number;
  redactSensitiveData: boolean;
}

/**
 * Sensitive data patterns to redact
 */
const SENSITIVE_KEYS = [
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'password',
  'pwd',
  'apiKey',
  'api_key',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'mnemonic',
  'seed',
  'signature',
  'auth',
  'authorization',
  'cookie',
  'session',
  'jwt',
  'bearer',
];

const SENSITIVE_PATTERNS = [
  /private[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /mnemonic/i,
  /seed/i,
  /signature/i,
  /auth/i,
];

// Environment-based configuration
const getDefaultConfig = (): LoggerConfig => {
  const isDev = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';

  return {
    level: isTest ? 'error' : isDev ? 'debug' : 'info',
    enableDebounce: !isDev, // Debounce in production/staging
    debounceMs: 5000,
    redactSensitiveData: true, // Always redact sensitive data
  };
};

class Logger {
  private config: LoggerConfig;
  private seenMessages: Map<string, number> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  /**
   * Log levels hierarchy
   * debug < info < warn < error
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }

  /**
   * Generate a key for debouncing
   */
  private getLogKey(level: LogLevel, message: string): string {
    return `${level}:${message}`;
  }

  /**
   * Check if message should be debounced
   */
  private shouldDebounce(key: string): boolean {
    if (!this.config.enableDebounce) return false;

    const lastSeen = this.seenMessages.get(key);
    if (!lastSeen) return false;

    const timeSinceLastLog = Date.now() - lastSeen;
    return timeSinceLastLog < this.config.debounceMs;
  }

  /**
   * Record that we've seen this message
   */
  private recordMessage(key: string): void {
    this.seenMessages.set(key, Date.now());

    // Clear old entries after debounce period
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.seenMessages.delete(key);
      this.debounceTimers.delete(key);
    }, this.config.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Redact sensitive data from logs
   * Recursively processes objects and arrays to protect sensitive information
   */
  private redactSensitiveData(data: any): any {
    if (!this.config.redactSensitiveData) return data;
    if (data === null || data === undefined) return data;

    // Handle primitive types
    if (typeof data !== 'object') return data;

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.redactSensitiveData(item));
    }

    // Handle objects
    const redacted: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Check if key matches sensitive patterns
      const isSensitive =
        SENSITIVE_KEYS.includes(key.toLowerCase()) ||
        SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

      if (isSensitive && typeof value === 'string' && value.length > 0) {
        // Redact but show partial value for debugging
        const visibleChars = Math.min(4, Math.floor(value.length / 4));
        const start = value.substring(0, visibleChars);
        const end = value.substring(value.length - visibleChars);
        redacted[key] = `[REDACTED:${start}...${end}]`;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact nested objects
        redacted[key] = this.redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    emoji: string,
    message: string,
    data?: any
  ): void {
    if (!this.shouldLog(level)) return;

    const key = this.getLogKey(level, message);
    if (this.shouldDebounce(key)) {
      // Message recently logged, skip
      return;
    }

    this.recordMessage(key);

    const formattedMessage = `${emoji} ${message}`;
    const safeData = data !== undefined ? this.redactSensitiveData(data) : '';

    switch (level) {
      case 'debug':
        console.log(formattedMessage, safeData);
        break;
      case 'info':
        console.log(formattedMessage, safeData);
        break;
      case 'warn':
        console.warn(formattedMessage, safeData);
        break;
      case 'error':
        console.error(formattedMessage, safeData);
        break;
    }
  }

  /**
   * DEBUG: Verbose development-only logs
   * Only shown in development mode
   */
  debug(message: string, data?: any): void {
    this.log('debug', '🔍', message, data);
  }

  /**
   * INFO: Important milestones and state changes
   * Shown in dev and production (filtered in prod)
   */
  info(message: string, data?: any): void {
    this.log('info', '✅', message, data);
  }

  /**
   * WARN: Non-critical issues or deprecation notices
   * Always shown
   */
  warn(message: string, data?: any): void {
    this.log('warn', '⚠️', message, data);
  }

  /**
   * ERROR: Critical failures requiring attention
   * Always shown
   */
  error(message: string, data?: any): void {
    this.log('error', '❌', message, data);
  }

  /**
   * SUCCESS: Positive outcomes (uses info level)
   */
  success(message: string, data?: any): void {
    if (!this.shouldLog('info')) return;

    const key = this.getLogKey('info', message);
    if (!this.shouldDebounce(key)) {
      this.recordMessage(key);
      const safeData = data !== undefined ? this.redactSensitiveData(data) : '';
      console.log(`🎉 ${message}`, safeData);
    }
  }

  /**
   * GROUP: Start a collapsible log group
   * Useful for related operations
   */
  group(title: string): void {
    if (this.shouldLog('debug')) {
      console.group(`📦 ${title}`);
    }
  }

  /**
   * GROUP END: Close the current log group
   */
  groupEnd(): void {
    if (this.shouldLog('debug')) {
      console.groupEnd();
    }
  }

  /**
   * ONCE: Log a message only once per session
   * Useful for deprecation warnings or one-time notices
   */
  once(level: LogLevel, message: string, data?: any): void {
    const key = `once:${this.getLogKey(level, message)}`;

    if (this.seenMessages.has(key)) return;

    this.seenMessages.set(key, Date.now());

    const emoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    }[level];

    this.log(level, emoji, message, data);
  }

  /**
   * TABLE: Display data as a table (dev only)
   */
  table(data: any): void {
    if (this.shouldLog('debug')) {
      console.table(data);
    }
  }

  /**
   * PERFORMANCE: Measure and log execution time
   */
  time(label: string): void {
    if (this.shouldLog('debug')) {
      console.time(`⏱️ ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.shouldLog('debug')) {
      console.timeEnd(`⏱️ ${label}`);
    }
  }

  /**
   * Clear all debounce state (useful for testing)
   */
  clearDebounce(): void {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.seenMessages.clear();
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for custom instances
export { Logger };

// Convenience exports for common operations
export const logDebug = (message: string, data?: any) => logger.debug(message, data);
export const logInfo = (message: string, data?: any) => logger.info(message, data);
export const logWarn = (message: string, data?: any) => logger.warn(message, data);
export const logError = (message: string, data?: any) => logger.error(message, data);
export const logSuccess = (message: string, data?: any) => logger.success(message, data);
export const logGroup = (title: string) => logger.group(title);
export const logGroupEnd = () => logger.groupEnd();
export const logOnce = (level: LogLevel, message: string, data?: any) => logger.once(level, message, data);
