'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useSignMessage } from 'wagmi';
import { supabase } from '@/utils/supabaseClient';
import { useToast } from '@/components/ui/use-toast';

interface AgreementSigningModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  agreementText: string;
  podId: string;
  roleId: string;
  onSigningComplete?: () => void;
}

export default function AgreementSigningModal({
  isOpen,
  onClose,
  agreementId,
  agreementText,
  podId,
  roleId,
  onSigningComplete,
}: AgreementSigningModalProps) {
  const { evmAddress: address } = useEvmAddress();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [isSigning, setIsSigning] = useState(false);

  const handleSign = async () => {
    if (!address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to sign the agreement',
        variant: 'destructive',
      });
      return;
    }

    setIsSigning(true);
    try {
      // Create message to sign
      const message = `I agree to the following terms:\n\n${agreementText}\n\nSigned by: ${address}\nTimestamp: ${new Date().toISOString()}`;

      // Get wallet signature
      const signature = await signMessageAsync({ message });

      // Store signature in pod_accountability_signatures table
      const { error: signatureError } = await supabase
        .from('pod_accountability_signatures')
        .insert({
          pod_id: podId,
          signer_address: address.toLowerCase(),
          signature_data: signature,
          accountability_statement: agreementText,
          signed_at: new Date().toISOString(),
          is_valid: true,
        });

      if (signatureError) {
        throw signatureError;
      }

      // Also store in user_eligibility_status table
      const { error: eligibilityError } = await supabase
        .from('user_eligibility_status')
        .upsert(
          {
            user_wallet: address.toLowerCase(),
            pod_id: podId,
            role_id: roleId,
            criteria_type: 'agreement',
            criteria_id: agreementId,
            status: 'met',
            proof: signature,
            verified_at: new Date().toISOString(),
            last_checked: new Date().toISOString(),
          },
          {
            onConflict: 'user_wallet,pod_id,role_id,criteria_type,criteria_id',
          },
        );

      if (eligibilityError) {
        console.warn(
          'Warning: Failed to update eligibility status:',
          eligibilityError,
        );
        // Don't throw - signature was stored successfully
      }

      toast({
        title: 'Agreement Signed!',
        description: 'Your signature has been recorded on-chain',
        variant: 'default',
      });

      // Call completion callback
      if (onSigningComplete) {
        onSigningComplete();
      }

      // Close modal
      onClose();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sign Accountability Agreement</DialogTitle>
          <DialogDescription>
            Please review and sign the agreement below to proceed
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Agreement Text */}
          <div className="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {agreementText}
            </pre>
          </div>

          {/* Signature Info */}
          <div
            className="text-sm text-gray-600 p-4 rounded-lg"
            style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}
          >
            <p className="font-medium mb-2" style={{ color: '#1F453A' }}>
              What happens when you sign:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>You'll be prompted to sign with your wallet</li>
              <li>Your signature will be cryptographically verified</li>
              <li>The signature will be stored securely in the database</li>
              <li>
                You'll gain access to the pod once all requirements are met
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isSigning}>
              Cancel
            </Button>
            <Button onClick={handleSign} disabled={isSigning}>
              {isSigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                'Sign'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
