'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { FileText, PenTool, X, Shield, AlertCircle } from 'lucide-react';
import { useAccount, useSignMessage } from 'wagmi';
import { usePublicClient, useWalletClient } from 'wagmi';
import { PodMembershipApplicationService } from '../services/PodMembershipApplicationService';
import { useProfiles } from '@/features/identity/hooks/useProfiles';

interface MembershipAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  podId: string;
  podName: string;
  podDescription?: string;
  podLeaders: string[];
  onSuccess?: () => void;
}

const DEFAULT_AGREEMENT = `Pod Membership Agreement

By signing this agreement, I acknowledge that:

1. I am applying to become a member of this pod and accept the responsibilities that come with membership.

2. I understand that membership is granted through a hat token that represents my role and privileges within the pod.

3. I agree to participate constructively in pod activities and governance decisions.

4. I understand that membership can be revoked by pod leadership if I fail to meet my responsibilities or violate community guidelines.

5. I will respect other members and contribute positively to the pod's mission and objectives.

6. I acknowledge that all pod activities are recorded on-chain and that my membership status is publicly verifiable.

By signing this agreement, I formally request membership in this pod and agree to abide by these terms.`;

export const MembershipAgreementModal: React.FC<MembershipAgreementModalProps> = ({
  isOpen,
  onClose,
  podId,
  podName,
  podDescription,
  podLeaders,
  onSuccess
}) => {
  const [agreementText, setAgreementText] = useState('');
  const [accountabilityStatement, setAccountabilityStatement] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'agreement' | 'accountability' | 'signing'>('agreement');
  const { toast } = useToast();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  // Get user profile for display
  const { getProfile } = useProfiles([address || '']);
  const userProfile = address ? getProfile(address) : null;
  
  // Get user display name
  const getUserDisplayName = () => {
    if (userProfile?.first_name || userProfile?.last_name) {
      return `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim();
    }
    return address ? `${address.slice(0, 8)}...${address.slice(-6)}` : 'Unknown User';
  };

  // Reset modal state when opened
  React.useEffect(() => {
    if (isOpen) {
      setAgreementText(DEFAULT_AGREEMENT);
      setAccountabilityStatement('');
      setStep('agreement');
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleNextStep = () => {
    if (step === 'agreement') {
      if (!agreementText.trim()) {
        toast({
          title: "Agreement Required",
          description: "Please review and accept the membership agreement.",
          variant: "destructive"
        });
        return;
      }
      setStep('accountability');
    } else if (step === 'accountability') {
      if (!accountabilityStatement.trim()) {
        toast({
          title: "Accountability Statement Required",
          description: "Please provide your personal accountability statement.",
          variant: "destructive"
        });
        return;
      }
      setStep('signing');
    }
  };

  const handleSignAgreement = async () => {
    if (!address || !publicClient || !walletClient) {
      toast({
        title: "Wallet Connection Required",
        description: "Please connect your wallet to proceed.",
        variant: "destructive"
      });
      return;
    }

    if (!agreementText.trim() || !accountabilityStatement.trim()) {
      toast({
        title: "Missing Information",
        description: "Please complete all required fields.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsProcessing(true);

      // Create the signature payload
      const signaturePayload = {
        podId,
        podName,
        agreement: agreementText,
        accountabilityStatement,
        applicantAddress: address,
        timestamp: new Date().toISOString()
      };

      const messageToSign = JSON.stringify(signaturePayload, null, 2);

      toast({
        title: "Please Sign",
        description: "Please sign the membership agreement in your wallet.",
        duration: 3000
      });

      // Sign the agreement
      const signature = await signMessageAsync({
        message: messageToSign
      });

      console.log('✍️ Agreement signed:', signature);

      // Submit the membership application for approval
      const applicationData = {
        podId,
        applicantAddress: address,
        agreementSignature: signature,
        accountabilityStatement
      };

      console.log('📝 Submitting membership application for approval...');
      
      const result = await PodMembershipApplicationService.submitApplication(applicationData);

      if (result.success) {
        // ✅ ISSUE #6 FIX: Get dynamic threshold based on actual leader count
        const requiredVotes = await PodMembershipApplicationService.getRequiredVotes(podId);
        toast({
          title: "Application Submitted! 📮",
          description: `Your application to join ${podName} has been submitted. It requires ${requiredVotes} leader approval${requiredVotes > 1 ? 's' : ''}.`,
          duration: 8000
        });

        onSuccess?.();
        onClose();
      } else {
        throw new Error(result.error || result.message);
      }

    } catch (error: any) {
      console.error('❌ Failed to process membership application:', error);
      
      let errorMessage = "Failed to process membership application.";
      
      if (error.message?.includes('User rejected')) {
        errorMessage = "Signature was cancelled. Please try again.";
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = "Insufficient funds for transaction fees.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Application Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 8000
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    if (step === 'accountability') {
      setStep('agreement');
    } else if (step === 'signing') {
      setStep('accountability');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ 
      paddingBottom: 'var(--bottom-nav-height, 80px)',
      paddingTop: '16px',
      paddingLeft: '16px', 
      paddingRight: '16px'
    }}>
      <div className="bg-white rounded-lg w-full max-w-2xl overflow-hidden flex flex-col" style={{ 
        maxHeight: '100%',
        minHeight: '400px'
      }}>
        {/* Header */}
        <div className="p-4 sm:p-6 border-b bg-gradient-to-r" style={{ backgroundImage: 'linear-gradient(to right, #E8F1EE, #EDEAF0)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-full" style={{ backgroundColor: '#D1E6DC' }}>
                <FileText className="w-6 h-6" style={{ color: '#2F5D50' }} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Join Pod: {podName}</h3>
                <p className="text-sm text-gray-600">Complete your membership application</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2" style={{ color: step === 'agreement' ? '#2F5D50' : (step === 'accountability' || step === 'signing') ? '#3F7A5A' : '#9ca3af' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{
                backgroundColor: step === 'agreement' ? '#D1E6DC' : (step === 'accountability' || step === 'signing') ? '#D1E6DC' : '#f3f4f6',
                color: step === 'agreement' ? '#2F5D50' : (step === 'accountability' || step === 'signing') ? '#3F7A5A' : '#9ca3af'
              }}>
                1
              </div>
              <span className="text-sm font-medium">Agreement</span>
            </div>
            <div className="h-px flex-1" style={{ backgroundColor: (step === 'accountability' || step === 'signing') ? '#B8D9CA' : '#e5e7eb' }}></div>
            <div className="flex items-center space-x-2" style={{ color: step === 'accountability' ? '#2F5D50' : step === 'signing' ? '#3F7A5A' : '#9ca3af' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{
                backgroundColor: step === 'accountability' ? '#D1E6DC' : step === 'signing' ? '#D1E6DC' : '#f3f4f6',
                color: step === 'accountability' ? '#2F5D50' : step === 'signing' ? '#3F7A5A' : '#9ca3af'
              }}>
                2
              </div>
              <span className="text-sm font-medium">Statement</span>
            </div>
            <div className="h-px flex-1" style={{ backgroundColor: step === 'signing' ? '#B8D9CA' : '#e5e7eb' }}></div>
            <div className="flex items-center space-x-2" style={{ color: step === 'signing' ? '#2F5D50' : '#9ca3af' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium" style={{
                backgroundColor: step === 'signing' ? '#D1E6DC' : '#f3f4f6',
                color: step === 'signing' ? '#2F5D50' : '#9ca3af'
              }}>
                <PenTool className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Sign</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ minHeight: 0 }}>
          {step === 'agreement' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Membership Agreement</h4>
                <p className="text-sm text-gray-600">
                  Please review the membership agreement for <strong>{podName}</strong>.
                </p>
              </div>

              {podDescription && (
                <Card style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium" style={{ color: '#1F453A' }}>About This Pod</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm" style={{ color: '#2F5D50' }}>{podDescription}</p>
                  </CardContent>
                </Card>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Agreement Terms
                </label>
                <Textarea
                  value={agreementText}
                  readOnly={true}
                  className="min-h-[300px] text-sm bg-gray-50 cursor-default"
                  placeholder="Loading agreement terms..."
                />
              </div>
            </div>
          )}

          {step === 'accountability' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Personal Accountability Statement</h4>
                <p className="text-sm text-gray-600">
                  Please provide a personal statement about your commitment to this pod and how you plan to contribute.
                </p>
              </div>

              <Card style={{ backgroundColor: '#FAF4EC', border: '1px solid #E8D7B8' }}>
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: '#C6933F' }} />
                    <div>
                      <h5 className="font-medium" style={{ color: '#7A5F3F' }}>Why This Matters</h5>
                      <p className="text-sm" style={{ color: '#9B7F5F' }}>
                        Your accountability statement helps pod leaders understand your intentions and commitment level.
                        It will be stored with your membership record.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Accountability Statement *
                </label>
                <Textarea
                  value={accountabilityStatement}
                  onChange={(e) => setAccountabilityStatement(e.target.value)}
                  className="min-h-[200px]"
                  placeholder="Describe your commitment to this pod, your relevant skills/experience, and how you plan to contribute to the community..."
                />
              </div>
            </div>
          )}

          {step === 'signing' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Ready to Sign</h4>
                <p className="text-sm text-gray-600">
                  Review your application details below, then sign to submit your membership request.
                </p>
              </div>

              <Card style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center space-x-2" style={{ color: '#1F453A' }}>
                    <Shield className="w-4 h-4" />
                    <span>Blockchain Security</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm" style={{ color: '#2F5D50' }}>
                    Your signature will be cryptographically verified and stored on-chain.
                    Upon approval, you'll receive a membership hat token that grants you access to pod resources.
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Pod Details</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div>
                      <span className="text-xs text-gray-500">Pod Name:</span>
                      <p className="text-sm font-medium">{podName}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Leaders:</span>
                      <p className="text-sm">{podLeaders.length} pod leader(s)</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{getUserDisplayName()}'s Application</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div>
                      <span className="text-xs text-gray-500">Applicant:</span>
                      <p className="text-sm">{getUserDisplayName()}</p>
                      {userProfile?.first_name && (
                        <p className="text-xs text-gray-400 font-mono">{address?.slice(0, 8)}...{address?.slice(-6)}</p>
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Statement Length:</span>
                      <p className="text-sm">{accountabilityStatement.length} characters</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            {step !== 'agreement' && (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isProcessing}
              >
                Back
              </Button>
            )}
            
            {step === 'agreement' && (
              <div></div>
            )}

            <div className="flex items-center space-x-3">
              {step !== 'signing' ? (
                <Button
                  onClick={handleNextStep}
                  className="px-6"
                  disabled={isProcessing}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={handleSignAgreement}
                  disabled={isProcessing}
                  className="px-6 text-white"
                  style={{ backgroundColor: '#3F7A5A' }}
                  onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#2F5D50')}
                  onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#3F7A5A')}
                >
                  {isProcessing ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <PenTool className="w-4 h-4" />
                      <span>Sign & Submit</span>
                    </div>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};