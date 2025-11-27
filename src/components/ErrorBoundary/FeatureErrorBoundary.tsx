/**
 * FeatureErrorBoundary - Reusable error boundary for critical feature areas
 *
 * Provides isolated error handling for major features preventing one component
 * error from crashing the entire application.
 *
 * Features:
 * - Customizable error UI per feature
 * - Automatic error logging
 * - Network/RPC error detection
 * - Development vs production error details
 * - Retry functionality
 * - Consistent visual design
 */

'use client';

import React from 'react';
import { AlertCircle, RefreshCw, ExternalLink, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface FeatureErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface FeatureErrorBoundaryProps {
  children: React.ReactNode;
  featureName: string;
  fallback?: React.ComponentType<{ error: Error; retry: () => void; featureName: string }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showHomeLink?: boolean;
}

/**
 * Default error fallback UI that matches SpiritDAO design system
 */
const DefaultErrorFallback = React.memo<{
  error: Error;
  retry: () => void;
  featureName: string;
  showHomeLink?: boolean;
}>(({ error, retry, featureName, showHomeLink = true }) => {
  const isNetworkError = error.message.toLowerCase().includes('network') ||
                        error.message.toLowerCase().includes('fetch') ||
                        error.message.toLowerCase().includes('connection');

  const isRpcError = error.message.toLowerCase().includes('rpc') ||
                    error.message.toLowerCase().includes('rate limit') ||
                    error.message.toLowerCase().includes('blockchain');

  const isContractError = error.message.toLowerCase().includes('contract') ||
                          error.message.toLowerCase().includes('revert') ||
                          error.message.toLowerCase().includes('execution reverted');

  const isWalletError = error.message.toLowerCase().includes('wallet') ||
                        error.message.toLowerCase().includes('user rejected') ||
                        error.message.toLowerCase().includes('denied');

  // Use Sacred Minimalism color system
  const getErrorStyle = () => {
    if (isNetworkError || isRpcError) {
      // Info/warning style (blue-green)
      return { backgroundColor: '#E8F1EE', borderColor: '#B8D9CA', color: '#1F453A' };
    }
    if (isWalletError) {
      // Warning style (yellow)
      return { backgroundColor: '#FFF8E1', borderColor: '#FFD54F', color: '#5D4E00' };
    }
    // Error style (red-brown)
    return { backgroundColor: '#F5E6E6', borderColor: '#D9B3B3', color: '#5C1F1F' };
  };

  const getErrorTitle = () => {
    if (isNetworkError) return 'Connection Issue';
    if (isRpcError) return 'Blockchain Temporarily Unavailable';
    if (isContractError) return 'Smart Contract Error';
    if (isWalletError) return 'Wallet Action Required';
    return `${featureName} Error`;
  };

  const getErrorMessage = () => {
    if (isNetworkError) {
      return 'Unable to connect to the network. Please check your internet connection and try again.';
    }
    if (isRpcError) {
      return 'The blockchain network is experiencing high traffic. Please wait a moment and try again.';
    }
    if (isContractError) {
      return 'A smart contract operation failed. This might be due to insufficient permissions or invalid parameters.';
    }
    if (isWalletError) {
      return 'A wallet action was cancelled or denied. Please approve the transaction to continue.';
    }
    return `An unexpected error occurred in ${featureName}. The rest of the application is still working normally.`;
  };

  return (
    <Card className="w-full max-w-4xl mx-auto my-8">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2" style={{ color: '#8B3A3A' }}>
          <AlertCircle className="h-5 w-5" />
          <span>{getErrorTitle()}</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="p-4 border rounded-lg" style={getErrorStyle()}>
          <p className="mb-4 font-medium">{getErrorMessage()}</p>

          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <Button
              onClick={retry}
              className="px-4 py-2 rounded text-white"
              size="sm"
              style={{ backgroundColor: '#2F5D50' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1F453A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2F5D50';
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>

            {showHomeLink && (
              <Link href="/">
                <Button
                  variant="outline"
                  size="sm"
                  className="px-4 py-2"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Return Home
                </Button>
              </Link>
            )}

            {(isNetworkError || isRpcError) && (
              <a
                href="https://status.base.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm flex items-center hover:underline"
                style={{ color: '#2F5D50' }}
              >
                Check Network Status
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            )}
          </div>

          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Developer Details
              </summary>
              <div className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
                <div className="mb-2">
                  <strong>Error Message:</strong>
                  <pre className="mt-1">{error.message}</pre>
                </div>
                <div>
                  <strong>Stack Trace:</strong>
                  <pre className="mt-1 whitespace-pre-wrap">{error.stack}</pre>
                </div>
              </div>
            </details>
          )}

          <div className="mt-4 text-xs text-gray-600">
            <p>
              <strong>Tip:</strong> This error is isolated to the {featureName} feature.
              Other parts of the application should continue to work normally.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

DefaultErrorFallback.displayName = 'DefaultErrorFallback';

/**
 * Feature Error Boundary - Catches and handles errors in specific feature areas
 */
export class FeatureErrorBoundary extends React.Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<FeatureErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to console
    console.group(`🚨 ${this.props.featureName} Error Boundary`);
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    // In production, you might want to log to an error reporting service
    // Example: Sentry, LogRocket, etc.
    if (process.env.NODE_ENV === 'production') {
      // logErrorToService(error, errorInfo, this.props.featureName);
    }
  }

  retry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;

      return (
        <FallbackComponent
          error={this.state.error}
          retry={this.retry}
          featureName={this.props.featureName}
          showHomeLink={this.props.showHomeLink}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component for wrapping functional components with error boundary
 */
export function withFeatureErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  featureName: string,
  options?: {
    fallback?: React.ComponentType<{ error: Error; retry: () => void; featureName: string }>;
    showHomeLink?: boolean;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  }
) {
  const WrappedComponent = (props: P) => (
    <FeatureErrorBoundary
      featureName={featureName}
      fallback={options?.fallback}
      showHomeLink={options?.showHomeLink}
      onError={options?.onError}
    >
      <Component {...props} />
    </FeatureErrorBoundary>
  );

  WrappedComponent.displayName = `withFeatureErrorBoundary(${featureName})`;

  return WrappedComponent;
}

/**
 * Hook for functional components to manually trigger error boundary
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  // Throw error to be caught by error boundary
  if (error) {
    throw error;
  }

  return { handleError, clearError };
}
