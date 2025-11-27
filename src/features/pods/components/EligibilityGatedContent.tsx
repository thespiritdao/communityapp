'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Lock, 
  Shield, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useEligibility } from '../hooks/useEligibility';
import { EligibilityCriteriaDisplay } from './EligibilityCriteriaDisplay';
import type { EligibilityCriteria } from '../services/EligibilityService';

interface EligibilityGatedContentProps {
  children: React.ReactNode;
  eligibilityCriteria: EligibilityCriteria[];
  podId?: string;
  roleId?: string;
  fallbackComponent?: React.ReactNode;
  showCriteriaDetails?: boolean;
  contentType?: 'chat' | 'forum' | 'feature' | 'content';
  onEligibilityChange?: (eligible: boolean) => void;
}

export const EligibilityGatedContent: React.FC<EligibilityGatedContentProps> = ({
  children,
  eligibilityCriteria,
  podId,
  roleId,
  fallbackComponent,
  showCriteriaDetails = true,
  contentType = 'content',
  onEligibilityChange
}) => {
  const { address } = useAccount();
  const [eligibilityResult, setEligibilityResult] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const {
    evaluateCriteria,
    checkUserEligibility,
    loading,
    error
  } = useEligibility();

  const checkEligibility = async () => {
    if (!address || eligibilityCriteria.length === 0) {
      setHasAccess(eligibilityCriteria.length === 0); // Open access if no criteria
      return;
    }

    setIsChecking(true);
    try {
      let result;
      
      if (roleId && podId) {
        // Use role-based eligibility check
        result = await checkUserEligibility(podId, roleId);
      } else {
        // Use custom criteria evaluation
        result = await evaluateCriteria(eligibilityCriteria, podId, roleId);
      }

      setEligibilityResult(result);
      const eligible = result?.eligible || false;
      setHasAccess(eligible);
      
      onEligibilityChange?.(eligible);

    } catch (err) {
      console.error('Eligibility check failed:', err);
      setHasAccess(false);
      onEligibilityChange?.(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkEligibility();
  }, [address, eligibilityCriteria, podId, roleId]);

  // No criteria means open access
  if (eligibilityCriteria.length === 0) {
    return <>{children}</>;
  }

  // Loading state
  if (loading || isChecking) {
    return (
      <Card className="border-2 border-dashed" style={{ borderColor: '#8FAAA1' }}>
        <CardContent className="py-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-t-transparent rounded-full mx-auto mb-3" style={{ borderColor: '#2F5D50', borderTopColor: 'transparent' }}></div>
          <p className="text-sm text-gray-600">Checking access requirements...</p>
        </CardContent>
      </Card>
    );
  }

  // Access granted
  if (hasAccess && eligibilityResult?.eligible) {
    return (
      <div className="relative">
        {/* Success indicator */}
        <div className="mb-4 p-3 border rounded-lg" style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
            <span className="text-sm font-medium" style={{ color: '#1F453A' }}>
              Access granted - you meet all requirements
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={checkEligibility}
              disabled={isChecking}
              className="ml-auto"
            >
              <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        {/* Render protected content */}
        {children}
      </div>
    );
  }

  // Access denied - show fallback or default denial UI
  if (fallbackComponent) {
    return <>{fallbackComponent}</>;
  }

  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'chat': return 'Chat';
      case 'forum': return 'Forum';
      case 'feature': return 'Feature';
      default: return 'Content';
    }
  };

  return (
    <Card className="border-2" style={{ borderColor: '#D9B3B3', backgroundColor: '#F5E6E6' }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" style={{ color: '#5C1F1F' }}>
          <Lock className="h-5 w-5" />
          {getContentTypeLabel()} Access Restricted
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2" style={{ color: '#8B3A3A' }}>
          <XCircle className="h-4 w-4" />
          <span className="text-sm">
            You don't meet the requirements to access this {contentType.toLowerCase()}
          </span>
        </div>

        {/* Show eligibility results if available */}
        {eligibilityResult && (
          <div className="bg-white border rounded-lg p-4" style={{ borderColor: '#D9B3B3' }}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium" style={{ color: '#5C1F1F' }}>Requirements Status</h4>
              <Button
                size="sm"
                variant="outline"
                onClick={checkEligibility}
                disabled={isChecking}
                style={{ color: '#8B3A3A', borderColor: '#D9B3B3' }}
                onMouseEnter={(e) => {
                  if (!isChecking) {
                    e.currentTarget.style.backgroundColor = '#F5E6E6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isChecking) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
                Recheck
              </Button>
            </div>

            {eligibilityResult.evaluation?.overallResult && (
              <div className="text-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Progress:</span>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded font-medium" style={{ backgroundColor: '#F5E6E6', color: '#5C1F1F' }}>
                      {eligibilityResult.evaluation.overallResult.passed}/
                      {eligibilityResult.evaluation.overallResult.total} passed
                    </div>
                  </div>
                </div>

                <p className="text-xs" style={{ color: '#8B3A3A' }}>
                  {eligibilityResult.evaluation.overallResult.message}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Show detailed criteria if requested */}
        {showCriteriaDetails && (
          <div className="border-t pt-4">
            <EligibilityCriteriaDisplay
              criteria={eligibilityCriteria}
              podId={podId || ''}
              roleId={roleId}
              showUserStatus={!!address}
              compact={true}
            />
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="border p-3 rounded-lg" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
            <div className="flex items-center gap-2" style={{ color: '#8F6B2F' }}>
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Error checking requirements:</span>
            </div>
            <p className="text-sm mt-1" style={{ color: '#A67E35' }}>{error}</p>
          </div>
        )}

        {/* Help text */}
        <div className="border p-3 rounded-lg" style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: '#1F453A' }}>
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">How to get access:</span>
          </div>
          <ul className="text-sm space-y-1" style={{ color: '#2F5D50' }}>
            <li>• Meet the eligibility requirements shown above</li>
            <li>• Requirements are checked automatically when you connect your wallet</li>
            <li>• Contact pod administrators if you believe you should have access</li>
            {roleId && (
              <li>• You may need to request assignment to the required role</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Higher-order component version for easier wrapping
 */
export function withEligibilityGating<T extends {}>(
  Component: React.ComponentType<T>,
  eligibilityConfig: {
    criteria: EligibilityCriteria[];
    podId?: string;
    roleId?: string;
    contentType?: 'chat' | 'forum' | 'feature' | 'content';
    showCriteriaDetails?: boolean;
  }
) {
  return function EligibilityGatedComponent(props: T) {
    return (
      <EligibilityGatedContent
        eligibilityCriteria={eligibilityConfig.criteria}
        podId={eligibilityConfig.podId}
        roleId={eligibilityConfig.roleId}
        contentType={eligibilityConfig.contentType}
        showCriteriaDetails={eligibilityConfig.showCriteriaDetails}
      >
        <Component {...props} />
      </EligibilityGatedContent>
    );
  };
}