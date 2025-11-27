// src/config/appSettings.ts

/**
 * Application-wide settings for wallet connection and error handling
 */
export const APP_SETTINGS = {
  // Wallet Connection Settings
  wallet: {
    // Enable persistent wallet connection across page reloads
    enablePersistence: true,

    // Session timeout in milliseconds (24 hours)
    sessionTimeout: 24 * 60 * 60 * 1000,

    // Maximum connection retry attempts
    maxRetryAttempts: 3,

    // Retry backoff settings
    retryBackoff: {
      initial: 1000, // 1 second
      multiplier: 2, // Double each time
      maximum: 30000, // Max 30 seconds
    },

    // Cache duration for wallet verification results
    verificationCacheDuration: 5 * 60 * 1000, // 5 minutes

    // Enable debug logging for wallet operations
    debugMode: process.env.NODE_ENV === 'development',
  },

  // Module Error Handling Settings
  errorHandling: {
    // Enable auto-refresh on module loading errors
    enableAutoRefresh: true,

    // Maximum auto-refresh attempts within a time window
    maxRefreshAttempts: 3,

    // Time window for counting refresh attempts (milliseconds)
    refreshTimeWindow: 60000, // 1 minute

    // Minimum time between auto-refreshes (milliseconds)
    minRefreshInterval: 10000, // 10 seconds

    // Delay before auto-refresh triggers (milliseconds)
    autoRefreshDelay: 3000, // 3 seconds

    // Enable detailed error logging
    verboseLogging: process.env.NODE_ENV === 'development',
  },

  // API Request Settings
  api: {
    // Enable request deduplication
    enableDeduplication: true,

    // Deduplication cache timeout (milliseconds)
    dedupeTimeout: 1000,

    // Request timeout settings
    timeout: {
      default: 30000, // 30 seconds
      wallet: 10000, // 10 seconds for wallet operations
      data: 60000, // 60 seconds for data fetching
    },
  },

  // Performance Optimization Settings
  performance: {
    // Enable lazy loading for heavy components
    enableLazyLoading: true,

    // Debounce delay for search/filter operations (milliseconds)
    debounceDelay: 300,

    // Throttle delay for scroll events (milliseconds)
    throttleDelay: 100,

    // Enable performance monitoring
    enableMonitoring: process.env.NODE_ENV === 'development',
  },
};

/**
 * Helper function to get a setting value with fallback
 */
export function getSetting<T>(path: string, fallback: T): T {
  try {
    const keys = path.split('.');
    let value: any = APP_SETTINGS;

    for (const key of keys) {
      value = value[key];
      if (value === undefined) {
        return fallback;
      }
    }

    return value as T;
  } catch {
    return fallback;
  }
}

/**
 * Helper function to update settings at runtime (for debugging)
 */
export function updateSetting(path: string, value: any): void {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('Settings can only be updated in development mode');
    return;
  }

  try {
    const keys = path.split('.');
    let target: any = APP_SETTINGS;

    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
      if (!target) {
        console.error(`Invalid setting path: ${path}`);
        return;
      }
    }

    const lastKey = keys[keys.length - 1];
    target[lastKey] = value;

    console.log(`✅ Setting updated: ${path} = ${value}`);

    // Persist to localStorage for development
    localStorage.setItem(
      'spiritdao_dev_settings',
      JSON.stringify(APP_SETTINGS),
    );
  } catch (error) {
    console.error('Failed to update setting:', error);
  }
}

/**
 * Load development settings from localStorage
 */
export function loadDevSettings(): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  try {
    const stored = localStorage.getItem('spiritdao_dev_settings');
    if (stored) {
      const settings = JSON.parse(stored);
      Object.assign(APP_SETTINGS, settings);
      console.log('📋 Development settings loaded from localStorage');
    }
  } catch (error) {
    console.error('Failed to load development settings:', error);
  }
}

// Auto-load development settings on module import
if (typeof window !== 'undefined') {
  loadDevSettings();
}
