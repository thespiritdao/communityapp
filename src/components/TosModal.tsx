'use client';

import { useState } from 'react';
import { useSignEvmMessage, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { Button } from '@/components/ui/button';
import { supabase } from '@/utils/supabaseClient';

interface TosModalProps {
  walletAddress: string;
  onAccepted: () => void;
}

const TOS_VERSION = 'v1.0';
const TOS_MESSAGE = `SpiritDAO Platform Terms of Service ${TOS_VERSION}

By signing this message I confirm that I have read, understand, and agree to the SpiritDAO Terms of Service. I acknowledge that: (1) I will not use this platform for illegal activity, pornography, harassment, or hate speech; (2) SpiritDAO provides infrastructure only — our communities are sovereign and SpiritDAO is not responsible for the independent actions of pods or members; (3) I am responsible for my own on-chain transactions and their consequences; (4) Pod governance and treasury operations are managed by pod leaders through role tokens distributed within the platform.`;

export function TosModal({ walletAddress, onAccepted }: TosModalProps) {
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signEvmMessage } = useSignEvmMessage();
  const { currentUser } = useCurrentUser();

  const handleSign = async () => {
    setSigning(true);
    setError(null);
    try {
      const evmAccount = currentUser?.evmAccounts?.[0];
      if (!evmAccount) throw new Error('Wallet account not ready. Please wait a moment and try again.');

      const result = await signEvmMessage({
        evmAccount: evmAccount as `0x${string}`,
        message: TOS_MESSAGE,
      });

      const { error: dbError } = await supabase
        .from('user_profiles')
        .update({
          tos_signed_at: new Date().toISOString(),
          tos_version: TOS_VERSION,
          tos_signature: result.signature,
        })
        .eq('wallet_address', walletAddress.toLowerCase());

      if (dbError) throw dbError;
      onAccepted();
    } catch (err: any) {
      setError(err?.message || 'Failed to sign. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">
            Terms of Service
          </h2>
          <p className="text-sm text-gray-500 mt-1">{TOS_VERSION}</p>
        </div>

        {/* TLDR */}
        <div className="mx-6 mt-4 rounded-xl p-4" style={{ backgroundColor: '#E8F1EE' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: '#1F453A' }}>
            TLDR — The short version
          </p>
          <ul className="text-sm space-y-1.5" style={{ color: '#2F5D50' }}>
            <li>• Don't use this platform for illegal activity, pornography, or harassment.</li>
            <li>• SpiritDAO provides infrastructure, but our communities are sovereign. We are not responsible for pod actions.</li>
            <li>• You are responsible for transactions you authorize from your account.</li>
            <li>• Pod funds and governance are managed by pod leaders, not SpiritDAO.</li>
          </ul>
        </div>

        {/* Full terms scrollable */}
        <div className="mx-6 mt-4 flex-1 overflow-y-auto border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-4 leading-relaxed min-h-0">
          <section>
            <h3 className="font-semibold text-gray-900 mb-1">1. Acceptance</h3>
            <p>
              By accessing or using the SpiritDAO community platform, you agree to be bound by these Terms of Service. If you do not agree, do not use this platform. These terms apply to all users, pod leaders, and members.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">2. Prohibited Conduct</h3>
            <p>You agree not to use this platform to:</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Post, share, or distribute pornographic or sexually explicit content</li>
              <li>Engage in or facilitate any illegal activity</li>
              <li>Harass, threaten, or harm other users</li>
              <li>Spread hate speech or discriminatory content</li>
              <li>Impersonate other individuals or organizations</li>
              <li>Engage in market manipulation or financial fraud</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">3. Infrastructure Provider</h3>
            <p>
              SpiritDAO Church of Temporal Naturalism is a 501(c)(3) nonprofit organization that provides platform infrastructure for decentralized community coordination. SpiritDAO does not control, endorse, or take responsibility for the independent governance decisions, treasury allocations, content, or actions of individual pods or their members. Each pod operates with its own leadership and governance structure.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">4. On-Chain Transactions</h3>
            <p>
              All blockchain transactions — including token minting, treasury interactions, and on-chain governance actions — are irreversible. You are solely responsible for reviewing and authorizing any transaction before signing. SpiritDAO cannot reverse, recover, or compensate for any on-chain action taken through your wallet.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">5. Pod Governance & Treasury</h3>
            <p>
              Pod treasuries are managed by pod leaders as designated through role tokens distributed within the platform. Participation in pod governance and financial decisions is at your own discretion and risk.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">6. Privacy</h3>
            <p>
              Wallet addresses and on-chain activity are public by nature of blockchain technology. Profile information you voluntarily provide may be visible to other platform members. SpiritDAO does not sell personal data to third parties.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">7. Modifications</h3>
            <p>
              SpiritDAO reserves the right to update these terms. Material changes will require a new signature. Continued use of the platform after notice of changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">8. Limitation of Liability</h3>
            <p>
              To the fullest extent permitted by law, SpiritDAO, its officers, and volunteers are not liable for any indirect, incidental, or consequential damages arising from your use of this platform or participation in any pod.
            </p>
          </section>
        </div>

        {/* Footer / Sign action */}
        <div className="px-6 py-4 border-t border-gray-100">
          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}
          <p className="text-xs text-gray-500 mb-3">
            Clicking "I Agree" will prompt your wallet to sign a message confirming your acceptance. No gas required.
          </p>
          <Button
            onClick={handleSign}
            disabled={signing}
            className="w-full"
            style={{ backgroundColor: '#2F5D50', color: '#fff' }}
          >
            {signing ? 'Waiting for signature…' : 'I Agree'}
          </Button>
        </div>
      </div>
    </div>
  );
}
