'use client';

import type React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, } from '@/components/ui/card';
import { X, Scroll } from 'lucide-react';

interface AccountabilityAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToSign?: () => void;
  podName?: string;
}

const ACCOUNTABILITY_AGREEMENT_TEXT = `SpiritDAO Accountability Agreement

This Accountability Agreement ("Agreement") is entered into by and between the undersigned participant ("Member") and the respective Pod of SpiritDAO LLC. (the "Pod"), collectively referred to as the "Parties."

1. Responsibilities and Conduct

The Member acknowledges and agrees to be personally responsible and accountable for their actions, decisions, and participation within the Pod. The Member shall exercise good faith, honesty, and integrity in all Pod-related activities.

2. Misrepresentation

The Member shall not mislead, misrepresent, or otherwise falsify their identity, qualifications, contributions, or efforts in connection with their role or responsibilities in the Pod.

3. Use of Resources

The Member shall not intentionally mismanage, misuse, divert, or otherwise abuse Pod funds, assets, or resources. All use of Pod resources shall be for the sole benefit of the Pod and in alignment with its mission and governance.

4. Liability for Malicious Acts

The Member acknowledges and agrees that any intentional misconduct, fraud, or malicious action resulting in harm to the Pod, the DAO, or its Members may subject the Member to personal liability, including but not limited to restitution, legal claims, and removal from the Pod.

5. Acknowledgment

By participating in the Pod, the Member affirms that they have read, understood, and agreed to be bound by the terms of this Agreement.`;

export const AccountabilityAgreementModal: React.FC<AccountabilityAgreementModalProps> = ({
  isOpen,
  onClose,
  onProceedToSign,
  podName
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <Scroll className="h-6 w-6" style={{ color: '#2F5D50' }} />
            <div>
              <h2 className="text-xl font-semibold">Accountability Agreement</h2>
              {podName && (
                <p className="text-sm text-gray-600">For {podName}</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-2"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-800">
                Agreement Terms
              </h2>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <div className="whitespace-pre-line text-sm leading-relaxed">
                  {ACCOUNTABILITY_AGREEMENT_TEXT}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            Please read the agreement carefully before proceeding to sign.
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {onProceedToSign && (
              <Button
                onClick={onProceedToSign}
                className="text-white"
                style={{ backgroundColor: '#2F5D50' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6F8F86'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2F5D50'}
              >
                Proceed to Sign
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountabilityAgreementModal;