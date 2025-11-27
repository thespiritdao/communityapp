'use client';

import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { APP_SETTINGS } from '@/config/appSettings';

interface ModuleErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: { componentStack: string };
}

interface ModuleErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * ModuleErrorBoundary - Catches webpack module loading errors and provides recovery
 *
 * Specifically designed to handle the "Cannot read properties of undefined (reading 'call')"
 * webpack errors that occur when modules fail to load properly.
 */
export class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    // Detect webpack module loading errors
    const isModuleLoadingError =
      error.message.includes('Cannot read properties of undefined') ||
      error.message.includes("reading 'call'") ||
      error.message.includes('Loading chunk') ||
      error.message.includes('ChunkLoadError') ||
      error.name === 'ChunkLoadError';

    if (isModuleLoadingError) {
      console.error('🚨 Module loading error detected:', error);

      // Check if auto-refresh is enabled and we haven't refreshed too many times
      const autoRefreshEnabled =
        APP_SETTINGS.errorHandling.enableAutoRefresh &&
        localStorage.getItem('autoRefreshEnabled') !== 'false';
      const refreshCount = Number.parseInt(
        localStorage.getItem('moduleErrorRefreshCount') || '0',
        10,
      );
      const lastRefreshTime = Number.parseInt(
        localStorage.getItem('lastModuleErrorRefresh') || '0',
        10,
      );
      const timeSinceLastRefresh = Date.now() - lastRefreshTime;

      // Only auto-refresh if:
      // 1. Auto-refresh is enabled
      // 2. We haven't exceeded max refresh attempts
      // 3. Minimum refresh interval has passed
      if (
        autoRefreshEnabled &&
        refreshCount < APP_SETTINGS.errorHandling.maxRefreshAttempts &&
        timeSinceLastRefresh > APP_SETTINGS.errorHandling.minRefreshInterval
      ) {
        // Update refresh tracking
        localStorage.setItem(
          'moduleErrorRefreshCount',
          String(refreshCount + 1),
        );
        localStorage.setItem('lastModuleErrorRefresh', String(Date.now()));

        // Clear refresh count after the time window
        if (refreshCount === 0) {
          setTimeout(() => {
            localStorage.setItem('moduleErrorRefreshCount', '0');
          }, APP_SETTINGS.errorHandling.refreshTimeWindow);
        }

        // Attempt to reload the page after configured delay
        setTimeout(() => {
          console.log('🔄 Auto-reloading page due to module loading error...');
          window.location.reload();
        }, APP_SETTINGS.errorHandling.autoRefreshDelay);
      } else {
        console.log(
          '⚠️ Auto-refresh disabled or limit reached. Manual refresh required.',
        );
      }
    }

    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('ModuleErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      hasError: true,
      error,
      errorInfo,
    });

    // Track module loading errors
    const isModuleLoadingError =
      error.message.includes('Cannot read properties of undefined') ||
      error.message.includes("reading 'call'") ||
      error.message.includes('Loading chunk');

    if (isModuleLoadingError) {
      console.error('📊 Module Loading Error Details:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isModuleLoadingError =
        this.state.error &&
        (this.state.error.message.includes(
          'Cannot read properties of undefined',
        ) ||
          this.state.error.message.includes("reading 'call'") ||
          this.state.error.message.includes('Loading chunk'));

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl mb-4">
                  {isModuleLoadingError ? '🔄' : '⚠️'}
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {isModuleLoadingError
                    ? 'Loading Issue Detected'
                    : 'Something went wrong'}
                </h2>

                <p className="text-gray-600 mb-6">
                  {isModuleLoadingError
                    ? 'A module failed to load properly. The page will refresh automatically in a moment, or you can refresh manually.'
                    : 'An unexpected error occurred. Please try refreshing the page.'}
                </p>

                {/* Error details for debugging */}
                {this.state.error && process.env.NODE_ENV === 'development' && (
                  <details className="text-left mb-4 p-3 bg-gray-100 rounded text-xs">
                    <summary className="cursor-pointer font-medium">
                      Error Details
                    </summary>
                    <pre className="mt-2 overflow-auto">
                      {this.state.error.message}
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}

                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={this.handleReload}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Refresh Page
                  </Button>

                  {!isModuleLoadingError && (
                    <Button onClick={this.handleRetry} variant="outline">
                      Try Again
                    </Button>
                  )}
                </div>

                {isModuleLoadingError && (
                  <p className="text-xs text-gray-500 mt-4">
                    Auto-refresh in progress...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook version for functional components
 */
export function withModuleErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
) {
  const WrappedComponent = (props: P) => (
    <ModuleErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ModuleErrorBoundary>
  );

  WrappedComponent.displayName = `withModuleErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}
