'use client';

import type React from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTimeBoundMembership } from '../hooks/useTimeBoundMembership';

interface TimeBoundMembershipStatusProps {
  podId?: string;
  hatId?: bigint;
  roleType: 'leader' | 'member';
  showActions?: boolean;
  onUpdateTimeBounds?: (validFrom: Date | null, validUntil: Date | null) => void;
}

/**
 * Component that displays time-bound membership status and expiration warnings
 */
export const TimeBoundMembershipStatus: React.FC<TimeBoundMembershipStatusProps> = ({
  podId,
  hatId,
  roleType,
  showActions = false,
  onUpdateTimeBounds
}) => {
  const {
    membership,
    loading,
    error,
    lastChecked,
    refresh,
    isExpiringSoon,
    formattedTimeRemaining,
    statusInfo
  } = useTimeBoundMembership({
    podId,
    hatId,
    autoRefresh: true,
    refreshInterval: 60000 // Check every minute
  });

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="h-4 w-4 animate-spin" />;

    switch (statusInfo.color) {
      case 'green':
        return <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />;
      case 'yellow':
        return <AlertTriangle className="h-4 w-4" style={{ color: '#C6933F' }} />;
      case 'red':
        return <XCircle className="h-4 w-4" style={{ color: '#8B3A3A' }} />;
      case 'blue':
        return <Clock className="h-4 w-4" style={{ color: '#2F5D50' }} />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadgeVariant = () => {
    switch (statusInfo.color) {
      case 'green':
        return 'default' as const;
      case 'yellow':
        return 'secondary' as const;
      case 'red':
        return 'destructive' as const;
      case 'blue':
        return 'outline' as const;
      default:
        return 'outline' as const;
    }
  };

  if (error) {
    return (
      <Card className="border" style={{ borderColor: '#D9B3B3' }}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2" style={{ color: '#8B3A3A' }}>
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Error checking membership: {error}</span>
            <Button size="sm" variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!membership && !loading) {
    return (
      <Card className="border-gray-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-gray-500">
            <Clock className="h-4 w-4" />
            <span className="text-sm">No time-bound restrictions</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getBorderColor = () => {
    if (statusInfo.color === 'red') return '#D9B3B3';
    if (statusInfo.color === 'yellow') return '#E8D7B8';
    return '#e5e7eb';
  };

  return (
    <Card className="border" style={{ borderColor: getBorderColor() }}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" />
          Time-Bound {roleType === 'leader' ? 'Leadership' : 'Membership'}
          {membership && (
            <Badge variant={getStatusBadgeVariant()}>
              {membership.status}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Checking membership status...</span>
          </div>
        )}

        {membership && (
          <>
            {/* Status Information */}
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">{statusInfo.message}</span>
            </div>

            {/* Time Information */}
            {membership.validFrom && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Valid From:</span>{' '}
                {membership.validFrom.toLocaleDateString()} at{' '}
                {membership.validFrom.toLocaleTimeString()}
              </div>
            )}

            {membership.validUntil && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Valid Until:</span>{' '}
                {membership.validUntil.toLocaleDateString()} at{' '}
                {membership.validUntil.toLocaleTimeString()}
              </div>
            )}

            {formattedTimeRemaining && membership.status === 'active' && (
              <div className="text-sm" style={{ color: isExpiringSoon ? '#C6933F' : '#6b7280', fontWeight: isExpiringSoon ? 500 : 400 }}>
                <span className="font-medium">Time Remaining:</span> {formattedTimeRemaining}
              </div>
            )}

            {/* Expiration Warning */}
            {isExpiringSoon && membership.status === 'active' && (
              <div className="border rounded-lg p-3" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
                <div className="flex items-center gap-2" style={{ color: '#8F6B2F' }}>
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Your {roleType} membership expires in {formattedTimeRemaining}!
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#A67E35' }}>
                  Contact pod administrators to extend your membership if needed.
                </p>
              </div>
            )}

            {/* Expired Notice */}
            {membership.status === 'expired' && (
              <div className="border rounded-lg p-3" style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}>
                <div className="flex items-center gap-2" style={{ color: '#5C1F1F' }}>
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Your {roleType} membership has expired
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                  You no longer have access to {roleType} privileges in this pod.
                </p>
              </div>
            )}

            {/* Pending Activation */}
            {membership.status === 'pending' && (
              <div className="border rounded-lg p-3" style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}>
                <div className="flex items-center gap-2" style={{ color: '#1F453A' }}>
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Your {roleType} membership is pending activation
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#2F5D50' }}>
                  Membership will activate on{' '}
                  {membership.validFrom?.toLocaleDateString()}.
                </p>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Clock className="h-3 w-3 mr-1" />
            )}
            Refresh
          </Button>

          {showActions && onUpdateTimeBounds && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                // This would open a modal to update time bounds
                // For now, just call the callback with current values
                onUpdateTimeBounds(
                  membership?.validFrom || null,
                  membership?.validUntil || null
                );
              }}
            >
              Update Time Bounds
            </Button>
          )}

          {lastChecked && (
            <span className="text-xs text-gray-500 ml-auto">
              Last checked: {lastChecked.toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Simplified status indicator for use in lists or compact displays
 */
export const TimeBoundStatusIndicator: React.FC<{
  hatId: bigint;
  roleType: 'leader' | 'member';
  compact?: boolean;
}> = ({ hatId, roleType, compact = false }) => {
  const { membership, loading, isExpiringSoon, statusInfo } = useTimeBoundMembership({
    hatId,
    autoRefresh: true
  });

  if (loading) {
    return (
      <div className="flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
        {!compact && <span className="text-xs text-gray-500">Checking...</span>}
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="flex items-center gap-1">
        <Clock className="h-3 w-3 text-gray-400" />
        {!compact && <span className="text-xs text-gray-500">No restrictions</span>}
      </div>
    );
  }

  const getIconColor = () => {
    switch (statusInfo.color) {
      case 'green': return isExpiringSoon ? '#C6933F' : '#3F7A5A';
      case 'yellow': return '#C6933F';
      case 'red': return '#8B3A3A';
      case 'blue': return '#2F5D50';
      default: return '#6b7280';
    }
  };

  return (
    <div className="flex items-center gap-1">
      {membership.status === 'active' ? (
        <CheckCircle className="h-3 w-3" style={{ color: getIconColor() }} />
      ) : membership.status === 'expired' ? (
        <XCircle className="h-3 w-3" style={{ color: '#8B3A3A' }} />
      ) : membership.status === 'pending' ? (
        <Clock className="h-3 w-3" style={{ color: '#2F5D50' }} />
      ) : (
        <AlertTriangle className="h-3 w-3" style={{ color: '#8B3A3A' }} />
      )}

      {!compact && (
        <span className="text-xs" style={{ color: getIconColor() }}>
          {isExpiringSoon ? 'Expiring Soon' : statusInfo.message}
        </span>
      )}
    </div>
  );
};

export default TimeBoundMembershipStatus;