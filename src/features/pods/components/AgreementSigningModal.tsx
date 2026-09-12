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
import { useEvmAddress, useSignEvmMessage, useCurrentUser } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import {
  buildSignAgreementCall,
  isOnChainAgreementConfigured,
} from '../services/OnChainAgreementService';

interface AgreementSigningModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  agreementText: string;
  podId: string;
  roleId: string;
  /**
   * IPFS CID of the agreement. When present, signing is a real transaction
   * against the eligibility module rather than an off-chain message, and the
   * signature is publicly verifiable. Agreements created before the text was
   * pinned have no CID and keep the message-signature path.
   */
  agreementCid?: string;
  onSigningComplete?: () => void;
}

export default function AgreementSigningModal({
  isOpen,
  onClose,
  agreementId,
  agreementText,
  podId,
  roleId,
  agreementCid,
  onSigningComplete,
}: AgreementSigningModalProps) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();
  const { sendUserOperation } = useSendUserOperation();
  const { toast } = useToast();
  const [isSigning, setIsSigning] = useState(false);

  const signsOnChain = !!agreementCid && isOnChainAgreementConfigured();

  const handleSign = async () => {
    if (!address) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to sign the agreement',
        variant: 'destructive',
      });
      return;
    }

    // Check if EVM account is available
    const evmAccount = currentUser?.evmAccounts?.[0];
    if (!evmAccount && !signsOnChain) {
      toast({
        title: 'Account Not Ready',
        description: 'Your wallet account is still initializing. Please wait a moment and try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsSigning(true);
    try {
      let signature: string;

      if (signsOnChain) {
        // A transaction, not a message. signAgreement records the signature in
        // the eligibility module, where anyone can verify it with
        // hasSignedAgreement — no trust in this app required. Gas is sponsored
        // through the smart account, as elsewhere in the platform.
        toast({
          title: 'Confirm the transaction',
          description: 'Signing publishes your agreement on Base.',
          duration: 5000,
        });

        const res: any = await sendUserOperation({
          calls: [buildSignAgreementCall(agreementCid!)],
        } as any);

        signature =
          res?.userOperationHash || res?.transactionHash || res?.hash || 'onchain';
      } else {
        // Legacy path for agreements whose text was never pinned to IPFS:
        // there is no content hash to sign against, so fall back to an
        // off-chain message signature.
        const message = `I agree to the following terms:\n\n${agreementText}\n\nSigned by: ${address}\nTimestamp: ${new Date().toISOString()}`;

        const result = await signEvmMessage({
          evmAccount: evmAccount as `0x${string}`,
          message,
        });
        signature = result.signature;
      }

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
        description: signsOnChain
          ? 'Your signature is recorded on Base and is publicly verifiable.'
          : 'Your signature has been recorded.',
        variant: 'default',
        duration: 7000,
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
