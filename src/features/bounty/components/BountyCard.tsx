import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Shield, Globe } from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { checkPodFeatureAccess } from '@/utils/podFeatureAccess';
import { useTokenBalances } from '@/context/TokenBalancesContext';
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
  pod_id?: string; // Pod this bounty belongs to (sponsor)
  required_pod_id?: string | null; // null = DAO-wide open to all PoC holders
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
  pod_id,
  required_pod_id,
  onBid,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { balances: tokenBalances } = useTokenBalances();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);

  const isDAOWide = required_pod_id === null || required_pod_id === undefined;

  useEffect(() => {
    const checkAccess = async () => {
      // DAO-wide bounty: accessible to anyone holding a PoC token
      if (isDAOWide) {
        if (!address) { setHasAccess(false); return; }
        const hasPoC = tokenBalances?.hasPoC || tokenBalances?.hasAdvocate || false;
        setHasAccess(hasPoC);
        return;
      }

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

      // If no pod_id, fall back to public access
      if (!pod_id) {
        setHasAccess(true);
        return;
      }

      setIsCheckingAccess(true);
      try {
        const accessResult = await checkPodFeatureAccess('bounties', address, pod_id);
        setHasAccess(accessResult.allowed);
      } catch (error) {
        console.error('Error checking bounty access:', error);
        setHasAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkAccess();
  }, [address, token_gating, pod_id, isDAOWide, tokenBalances]);

  // Show access denied state
  if (hasAccess === false) {
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
              style={{ backgroundColor: '#FAF4EC', borderWidth: '1px', borderStyle: 'solid', borderColor: '#E8D7B8' }}
            >
              <Shield className="h-4 w-4" style={{ color: '#C6933F' }} />
              <AlertDescription style={{ color: '#8F6B2F' }}>
                <div className="font-medium mb-1">Access Restricted</div>
                <div className="text-sm">
                  {isDAOWide
                    ? 'This bounty requires a Proof of Curiosity token.'
                    : `This bounty requires one of the following roles: ${token_gating?.required_tokens?.map((t) => t.token_name).join(', ')}`}
                </div>
              </AlertDescription>
            </Alert>
            <div className="flex justify-between items-center bounty-meta">
              <Badge variant="secondary" className="bounty-category text-gray-500">{category}</Badge>
              <p className="font-semibold bounty-value text-gray-500">
                <Lock className="h-4 w-4 inline mr-1" />Hidden
              </p>
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
          {isDAOWide && (
            <Badge
              variant="outline"
              style={{
                backgroundColor: '#E8F1EE',
                color: '#2F5D50',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#B8D9CA',
              }}
            >
              <Globe className="h-3 w-3 mr-1" />
              DAO-Wide
            </Badge>
          )}
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
          {!isDAOWide && token_gating &&
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
