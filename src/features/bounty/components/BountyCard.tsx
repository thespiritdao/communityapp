import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Shield } from 'lucide-react';
import { useAccount } from 'wagmi';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import type { BountyTokenGating } from '../types/bounty';

interface BountyCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  status: 'open' | 'in-progress' | 'completed';
  createdAt: Date;
  funding_source?: 'wallet' | 'pod_treasury';
  token_gating?: BountyTokenGating;
  onBid?: () => void;
}

export const BountyCard: React.FC<BountyCardProps> = ({
  id,
  title,
  description,
  category,
  value,
  status,
  funding_source,
  token_gating,
  onBid,
}) => {
  const { address } = useAccount();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);

  // Map token symbols to balance properties
  const TOKEN_SYMBOL_MAP = {
    EXEC: 'hasExecutivePod',
    DEV: 'hasDevPod',
    MARKET: 'hasMarketManagement',
    BOUNTY: 'hasBountyHat',
    EVENT: 'hasEventManagement',
  } as const;

  useEffect(() => {
    const checkAccess = async () => {
      // If no token gating or restriction level is public, allow access
      if (
        !token_gating ||
        token_gating.restriction_level === 'public' ||
        !token_gating.required_tokens?.length
      ) {
        setHasAccess(true);
        return;
      }

      // If user is not connected, deny access for token-gated bounties
      if (!address) {
        setHasAccess(false);
        return;
      }

      setIsCheckingAccess(true);
      try {
        const balances = await fetchTokenBalances(address);

        // Check if user has any of the required tokens
        const hasRequiredTokens = token_gating.required_tokens.some(
          (requiredToken) => {
            const balanceKey =
              TOKEN_SYMBOL_MAP[
                requiredToken.token_id as keyof typeof TOKEN_SYMBOL_MAP
              ];
            if (balanceKey && balances[balanceKey]) {
              // For now, we just check if they have the token (balance > 0)
              // In the future, we could implement minimum balance checking
              return true;
            }
            return false;
          },
        );

        setHasAccess(hasRequiredTokens);
      } catch (error) {
        console.error('Error checking token access:', error);
        setHasAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkAccess();
  }, [address, token_gating]);

  // Show access denied state for token-gated bounties
  if (
    hasAccess === false &&
    token_gating &&
    token_gating.restriction_level !== 'public'
  ) {
    return (
      <Card className="w-full max-w-md mx-auto bounty-card border-gray-300 opacity-75">
        <CardHeader className="relative bounty-header">
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className="bg-gray-100 text-gray-600">
              <Lock className="h-3 w-3 mr-1" />
              Restricted
            </Badge>
          </div>
          <CardTitle className="text-xl font-bold bounty-title text-gray-600">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="bounty-content">
          <div className="space-y-4">
            <Alert
              style={{
                backgroundColor: '#FAF4EC',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#E8D7B8',
              }}
            >
              <Shield className="h-4 w-4" style={{ color: '#C6933F' }} />
              <AlertDescription style={{ color: '#8F6B2F' }}>
                <div className="font-medium mb-1">Access Restricted</div>
                <div className="text-sm">
                  This bounty requires one of the following roles:{' '}
                  {token_gating.required_tokens
                    ?.map((token) => token.token_name)
                    .join(', ')}
                </div>
              </AlertDescription>
            </Alert>
            <div className="flex justify-between items-center bounty-meta">
              <Badge
                variant="secondary"
                className="bounty-category text-gray-500"
              >
                {category}
              </Badge>
              <div className="text-right">
                <p className="font-semibold bounty-value text-gray-500">
                  <Lock className="h-4 w-4 inline mr-1" />
                  Hidden
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state while checking access
  if (isCheckingAccess) {
    return (
      <Card className="w-full max-w-md mx-auto bounty-card">
        <CardHeader className="relative bounty-header">
          <CardTitle className="text-xl font-bold bounty-title">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="bounty-content">
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show full bounty card for accessible bounties
  return (
    <Card className="w-full max-w-md mx-auto bounty-card" data-status={status}>
      <CardHeader className="relative bounty-header">
        <div className="absolute top-2 right-2 flex gap-2">
          {funding_source === 'pod_treasury' && (
            <Badge
              variant="outline"
              style={{
                backgroundColor: '#EDEAF0',
                color: '#574C66',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#D1CAD9',
              }}
            >
              <Shield className="h-3 w-3 mr-1" />
              Pod Treasury
            </Badge>
          )}
          {token_gating &&
            token_gating.restriction_level !== 'public' &&
            token_gating.required_tokens?.length && (
              <Badge
                variant="outline"
                style={{
                  backgroundColor: '#E8F1EE',
                  color: '#1F453A',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: '#B8D9CA',
                }}
              >
                <Shield className="h-3 w-3 mr-1" />
                Role Gated
              </Badge>
            )}
          <Badge variant="outline" className={`bounty-status ${status}`}>
            {status}
          </Badge>
        </div>
        <CardTitle className="text-xl font-bold bounty-title">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="bounty-content">
        <div className="space-y-4">
          <p className="text-gray-600 bounty-description">{description}</p>
          <div className="flex justify-between items-center bounty-meta">
            <Badge variant="secondary" className="bounty-category">
              {category}
            </Badge>
            <div className="text-right">
              <p className="font-semibold bounty-value">
                {value.amount} {value.token}
              </p>
            </div>
          </div>
          {status === 'open' && onBid && (
            <Button onClick={onBid} className="w-full bounty-btn">
              Bid on Bounty
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
