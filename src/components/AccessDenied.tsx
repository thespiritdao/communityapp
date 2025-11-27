/**
 * Access Denied Component - Reusable UI for feature access restrictions
 *
 * Shows when users don't have permission to access a pod feature.
 * Provides clear explanation and actionable next steps.
 */

import React from 'react';
import { Shield, Lock, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FeatureAccessResult } from '@/utils/podFeatureAccess';

interface AccessDeniedProps {
  feature: string;
  reason: string;
  details?: FeatureAccessResult['details'];
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ feature, reason, details }) => {
  return (
    <Card className="max-w-2xl mx-auto mt-8">
      <CardContent className="p-8">
        <div className="text-center">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-gray-100 rounded-full">
              <Shield className="h-12 w-12 text-gray-400" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold mb-2">Access Restricted</h3>

          {/* Reason */}
          <p className="text-gray-600 mb-6">{reason}</p>

          {/* Access Check Details */}
          {details && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-sm text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Feature enabled for pod:</span>
                  <Badge variant={details.moduleEnabled ? 'default' : 'secondary'}>
                    {details.moduleEnabled ? '✅ Yes' : '❌ No'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Pod membership (Hat):</span>
                  <Badge variant={details.hasHat ? 'default' : 'secondary'}>
                    {details.hasHat ? '✅ Yes' : '❌ No'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Role permission:</span>
                  <Badge variant={details.hasPermission ? 'default' : 'secondary'}>
                    {details.hasPermission ? '✅ Yes' : '❌ No'}
                  </Badge>
                </div>
                {details.userRole && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Your role:</span>
                    <Badge variant="outline" className="capitalize">
                      {details.userRole}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Guidance */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <Settings className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 text-left">
                <p className="font-semibold mb-1">Need Access?</p>
                {!details?.moduleEnabled && (
                  <p>Ask pod leaders to enable {feature} in the <strong>Modules</strong> tab.</p>
                )}
                {!details?.hasHat && (
                  <p>You need to be a member of this pod. Contact pod leaders to receive a membership Hat.</p>
                )}
                {details?.hasHat && !details?.hasPermission && (
                  <p>Your role doesn't have permission for this action. Ask pod leaders to update role permissions in <strong>Manager Controls → Membership & Verification → Access</strong>.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Compact version for inline use
 */
export const AccessDeniedInline: React.FC<AccessDeniedProps> = ({ feature, reason }) => {
  return (
    <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <Lock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
      <div className="text-sm">
        <p className="font-semibold text-yellow-900">Access Restricted</p>
        <p className="text-yellow-700">{reason}</p>
      </div>
    </div>
  );
};
