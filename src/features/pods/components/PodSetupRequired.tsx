'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { EligibilityCriteria } from '../services/EligibilityService';
import { useToast } from '@/components/ui/use-toast';

interface CriteriaStatus {
  type: string;
  met: boolean;
  details: string;
  criterion: EligibilityCriteria;
}

interface PodSetupRequiredProps {
  leaderAddress: string;
  criteriaStatus: CriteriaStatus[];
  onCheckAndMint: () => Promise<void>;
  onSignAgreement?: (agreementId: string) => Promise<void>;
  podName: string;
}

export default function PodSetupRequired({
  leaderAddress,
  criteriaStatus,
  onCheckAndMint,
  onSignAgreement,
  podName,
}: PodSetupRequiredProps) {
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckAndMint = async () => {
    setIsChecking(true);
    try {
      await onCheckAndMint();
    } catch (error) {
      console.error('Error during check and mint:', error);
      toast({
        title: 'Check Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to verify eligibility',
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const allMet = criteriaStatus.every((c) => c.met);

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {allMet ? (
              <CheckCircle2 className="h-8 w-8" style={{ color: '#3F7A5A' }} />
            ) : (
              <AlertCircle className="h-8 w-8" style={{ color: '#C6933F' }} />
            )}
            <div>
              <CardTitle>
                {allMet ? 'Ready to Mint HAT!' : 'Complete Your Setup'}
              </CardTitle>
              <CardDescription>
                {allMet
                  ? 'All requirements met. You can now receive your management HAT.'
                  : `Before you can manage ${podName}, you need to meet the following requirements:`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Criteria List */}
          <div className="space-y-4">
            {criteriaStatus.map((status, index) => (
              <CriterionCard
                key={index}
                status={status}
                onSignAgreement={onSignAgreement}
              />
            ))}
          </div>

          {/* Check & Mint Button */}
          <div className="pt-4 border-t">
            <Button
              onClick={handleCheckAndMint}
              disabled={isChecking}
              className="w-full"
              size="lg"
            >
              {isChecking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking Eligibility...
                </>
              ) : allMet ? (
                'Mint HAT & Complete Setup'
              ) : (
                'Re-check Eligibility'
              )}
            </Button>

            {!allMet && (
              <p className="text-sm text-gray-500 text-center mt-2">
                Complete all requirements above, then click to verify and mint
                your HAT
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Individual Criterion Card
function CriterionCard({
  status,
  onSignAgreement,
}: {
  status: CriteriaStatus;
  onSignAgreement?: (agreementId: string) => Promise<void>;
}) {
  const [isSigning, setIsSigning] = useState(false);
  const { toast } = useToast();

  const handleSignAgreement = async () => {
    if (!onSignAgreement || !status.criterion.agreement_hash) return;

    setIsSigning(true);
    try {
      await onSignAgreement(status.criterion.agreement_hash);
      toast({
        title: 'Agreement Signed',
        description: 'Your signature has been recorded',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error signing agreement:', error);
      toast({
        title: 'Signing Failed',
        description:
          error instanceof Error ? error.message : 'Failed to sign agreement',
        variant: 'destructive',
      });
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: status.met ? '#D1E6DC' : '#FAF4EC',
        borderColor: status.met ? '#B8D9CA' : '#E8D7B8',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {status.met ? (
            <CheckCircle2 className="h-5 w-5" style={{ color: '#3F7A5A' }} />
          ) : (
            <AlertCircle className="h-5 w-5" style={{ color: '#C6933F' }} />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">
              {getCriterionTitle(status.criterion)}
            </h4>
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: status.met ? '#D1E6DC' : '#FAF4EC',
                color: status.met ? '#3F7A5A' : '#C6933F',
              }}
            >
              {status.met ? 'Met' : 'Required'}
            </span>
          </div>

          <p className="text-sm text-gray-600 mt-1">{status.details}</p>

          {/* Agreement Signing Button */}
          {status.type === 'agreement_signed' &&
            !status.met &&
            onSignAgreement && (
              <Button
                onClick={handleSignAgreement}
                disabled={isSigning}
                size="sm"
                className="mt-3"
              >
                {isSigning ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Signing...
                  </>
                ) : (
                  'Sign Agreement'
                )}
              </Button>
            )}

          {/* Token Balance Info */}
          {status.type === 'token_balance' && !status.met && (
            <div className="mt-2 text-xs text-gray-500">
              You need to acquire {status.criterion.minimum_amount || '1'}{' '}
              {status.criterion.token_symbol || 'tokens'} to meet this
              requirement.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to get user-friendly criterion title
function getCriterionTitle(criterion: EligibilityCriteria): string {
  switch (criterion.type) {
    case 'agreement_signed':
      return criterion.name || 'Accountability Agreement';
    case 'token_balance':
      return `Hold ${criterion.minimum_amount || '1'} ${criterion.token_symbol || criterion.token_name || 'Tokens'}`;
    case 'nft_ownership':
    case 'credential_ownership':
      return `Own ${criterion.token_name || criterion.name || 'Required NFT'}`;
    case 'time_based':
      return 'Time Requirement';
    case 'staking':
      return 'Staking Requirement';
    default:
      return criterion.name || criterion.type;
  }
}
