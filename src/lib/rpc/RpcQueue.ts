/**
 * RPC Queue - Rate-limited blockchain RPC request management
 *
 * Provides intelligent queuing and retry logic for blockchain operations
 * with exponential backoff and jitter to handle rate limits gracefully.
 */

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retryCount: number;
  priority: number;
}

export interface RpcQueueOptions {
  maxConcurrent?: number;
  baseDelayMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  jitterMs?: number;
}

export class RpcQueue {
  private queue: QueueItem<any>[] = [];
  private running: Set<Promise<any>> = new Set();
  private readonly maxConcurrent: number;
  private readonly baseDelayMs: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly jitterMs: number;

  constructor(options: RpcQueueOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBackoffMs = options.retryBackoffMs ?? 1000;
    this.jitterMs = options.jitterMs ?? 100;
  }

  /**
   * Enqueue an RPC operation with automatic retry and rate limiting
   */
  async enqueue<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: QueueItem<T> = {
        fn,
        resolve,
        reject,
        retryCount: 0,
        priority,
      };

      // Insert with priority (higher numbers = higher priority)
      const insertIndex = this.queue.findIndex((q) => q.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }

      this.processQueue();
    });
  }

  /**
   * Enqueue high-priority operation (for user-initiated transactions)
   */
  async enqueueHighPriority<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(fn, 10);
  }

  /**
   * Enqueue low-priority operation (for background data fetching)
   */
  async enqueueLowPriority<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(fn, -10);
  }

  /**
   * Process the queue with concurrency and rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.running.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    const operation = this.executeWithRetry(item);
    this.running.add(operation);

    operation.finally(() => {
      this.running.delete(operation);
      this.processQueue(); // Process next item
    });
  }

  /**
   * Execute operation with retry logic and rate limit handling
   */
  private async executeWithRetry<T>(item: QueueItem<T>): Promise<void> {
    try {
      // Add base delay with jitter
      const delay = this.baseDelayMs + Math.random() * this.jitterMs;
      await this.sleep(delay);

      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      await this.handleError(item, error);
    }
  }

  /**
   * Handle errors with intelligent retry logic
   */
  private async handleError<T>(item: QueueItem<T>, error: any): Promise<void> {
    const isRateLimit = this.isRateLimitError(error);
    const isRetryable = this.isRetryableError(error);

    if (item.retryCount >= this.maxRetries) {
      item.reject(
        new Error(
          `RPC operation failed after ${this.maxRetries} retries: ${error?.message || 'Unknown error'}`,
        ),
      );
      return;
    }

    if (!isRetryable && !isRateLimit) {
      item.reject(error);
      return;
    }

    // Calculate retry delay with exponential backoff
    let retryDelay = this.retryBackoffMs * Math.pow(2, item.retryCount);

    // Add extra delay for rate limits
    if (isRateLimit) {
      retryDelay *= 2;
      console.warn(
        `🚦 Rate limit detected, retrying in ${retryDelay}ms (attempt ${item.retryCount + 1}/${this.maxRetries})`,
      );
    }

    // Add jitter to prevent thundering herd
    retryDelay += Math.random() * this.jitterMs;

    await this.sleep(retryDelay);

    // Increment retry count and re-queue with same priority
    item.retryCount++;
    const insertIndex = this.queue.findIndex((q) => q.priority < item.priority);
    if (insertIndex === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(insertIndex, 0, item);
    }
  }

  /**
   * Check if error is due to rate limiting
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code;

    return (
      errorCode === 429 ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('throttled')
    );
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code;

    // Network and temporary errors that should be retried
    return (
      errorCode === 'NETWORK_ERROR' ||
      errorCode === 'TIMEOUT' ||
      errorCode === 'SERVER_ERROR' ||
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('server error') ||
      errorMessage.includes('internal error') ||
      errorMessage.includes('bad gateway') ||
      errorMessage.includes('service unavailable')
    );
  }

  /**
   * Sleep utility with Promise
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get queue status for monitoring
   */
  getStatus(): {
    queueLength: number;
    runningCount: number;
    maxConcurrent: number;
  } {
    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Clear the queue (for cleanup)
   */
  clear(): void {
    this.queue.forEach((item) => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue.length = 0;
  }
}

// Global RPC queue instance
export const globalRpcQueue = new RpcQueue({
  maxConcurrent: 2,
  baseDelayMs: 250,
  maxRetries: 3,
  retryBackoffMs: 1000,
  jitterMs: 100,
});
