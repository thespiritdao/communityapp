/**
 * Pod Error Boundary - Preserves existing UX design language
 *
 * Provides error handling with the same visual style as existing components
 * including the blue theme for info states and consistent card layouts.
 */

'use client';

import React from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';

interface PodErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

interface PodErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
  onError?: (error: Error, errorInfo: any) => void;
}

/**
 * Custom error fallback that matches existing UX patterns
 */
const DefaultErrorFallback = React.memo<{ error: Error; retry: () => void }>(
  ({ error, retry }) => {
    const isNetworkError =
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('fetch');

    const isRpcError =
      error.message.toLowerCase().includes('rpc') ||
      error.message.toLowerCase().includes('rate limit');

    // Use Sacred Minimalism color system
    const getErrorStyle = () => {
      if (isNetworkError || isRpcError) {
        return {
          backgroundColor: '#E8F1EE',
          borderColor: '#B8D9CA',
          color: '#1F453A',
        };
      }
      return {
        backgroundColor: '#F5E6E6',
        borderColor: '#D9B3B3',
        color: '#5C1F1F',
      };
    };

    const getErrorTitle = () => {
      if (isNetworkError) return 'Connection Issue';
      if (isRpcError) return 'Blockchain Temporarily Unavailable';
      return 'Something went wrong';
    };

    const getErrorMessage = () => {
      if (isNetworkError) {
        return 'Unable to connect to the network. Please check your connection and try again.';
      }
      if (isRpcError) {
        return 'The blockchain network is busy. Please wait a moment and try again.';
      }
      return 'An unexpected error occurred. Please try refreshing the page.';
    };

    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle
            className="flex items-center space-x-2"
            style={{ color: '#8B3A3A' }}
          >
            <AlertCircle className="h-5 w-5" />
            <span>{getErrorTitle()}</span>
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="p-4 border rounded-lg" style={getErrorStyle()}>
            <p className="mb-4">{getErrorMessage()}</p>

            <div className="flex items-center space-x-3">
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

              {(isNetworkError || isRpcError) && (
                <a
                  href="https://status.base.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm flex items-center"
                  style={{ color: '#2F5D50' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#1F453A';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#2F5D50';
                  }}
                >
                  Check Network Status
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              )}
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Developer Details
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);

DefaultErrorFallback.displayName = 'DefaultErrorFallback';

/**
 * Error boundary that preserves existing UX design patterns
 */
export class PodErrorBoundary extends React.Component<
  PodErrorBoundaryProps,
  PodErrorBoundaryState
> {
  constructor(props: PodErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(
    error: Error,
  ): Partial<PodErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Pod Error Boundary caught an error:', error, errorInfo);
    }

    // In production, you might want to log to an error reporting service
    // if (process.env.NODE_ENV === 'production') {
    //   logErrorToService(error, errorInfo);
    // }
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

      return <FallbackComponent error={this.state.error} retry={this.retry} />;
    }

    return this.props.children;
  }
}

/**
 * Hook for functional components to use error boundaries
 */
export function usePodErrorHandler() {
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
