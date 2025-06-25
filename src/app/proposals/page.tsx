'use client';
import React, { useCallback } from 'react';
import { useAccount } from 'wagmi';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownBasename,
  WalletDropdownFundLink,
  WalletDropdownLink,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import { encodeFunctionData, Address } from 'viem';
import { base } from 'wagmi/chains';
import { useProposal, ProposalProvider } from 'src/context/ProposalContext';

// Governor contract ABI
const GOVERNOR_ABI = [
  {
    name: 'proposeWithMetadata',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'targets', type: 'address[]' },
      { name: 'values', type: 'uint256[]' },
      { name: 'calldatas', type: 'bytes[]' },
      { name: 'description', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'forumThreadId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Outer component wraps with ProposalProvider
export default function ProposalSubmissionPage() {
  return (
    <ProposalProvider>
      <InnerProposalSubmissionPage />
    </ProposalProvider>
  );
}

// Inner page uses the context
function InnerProposalSubmissionPage() {
  const { address, isConnected } = useAccount();
  const {
    formData,
    updateFormField,
    resetForm,
    canPropose,
    validationMessage,
    advocateBalance,
    isSubmitting,
    setIsSubmitting,
    isFormValid,
    formErrors,
  } = useProposal();

  // Prepare transaction data
  const prepareTransaction = useCallback(() => {
    if (!isFormValid || !canPropose) return null;

    try {
      // For simple governance proposals, use empty execution arrays
      const targets: Address[] = [];
      const values: bigint[] = [];
      const calldatas: `0x${string}`[] = [];
      
      // Format description with markdown
      const description = `# ${formData.title}\n\n${formData.body}`;
      
      const calldata = encodeFunctionData({
        abi: GOVERNOR_ABI,
        functionName: 'proposeWithMetadata',
        args: [
          targets,
          values,
          calldatas,
          description,
          formData.title,
          formData.forumThreadId || '',
        ],
      });

      return {
        to: process.env.NEXT_PUBLIC_DAO_GOVERNOR as Address,
        data: calldata,
        value: BigInt(0),
      };
    } catch (error) {
      console.error('Error preparing transaction:', error);
      return null;
    }
  }, [formData, isFormValid, canPropose]);

  const handleSuccess = useCallback(() => {
    setIsSubmitting(false);
    resetForm();
    console.log('Proposal submitted successfully!');
    // You can add a toast notification here or redirect
  }, [resetForm, setIsSubmitting]);

  const handleError = useCallback((error: Error) => {
    setIsSubmitting(false);
    console.error('Transaction failed:', error);
    // You can add error notification here
  }, [setIsSubmitting]);

  const transactionData = prepareTransaction();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Submit DAO Proposal
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Create a new proposal for the SpiritDAO community to vote on. 
            Your proposal will be recorded on-chain and open for voting.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Status Bar */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-sm font-medium">
                    {isConnected ? 'Wallet Connected' : 'Wallet Disconnected'}
                  </span>
                </div>
                {isConnected && (
                  <div className="text-sm">
                    <span className="opacity-75">Advocate NFTs: </span>
                    <span className="font-semibold">{advocateBalance.toString()}</span>
                  </div>
                )}
              </div>
              
              <Wallet>
                <ConnectWallet>
                  <WalletDropdown>
                    <WalletDropdownBasename />
                    <WalletDropdownLink
                      icon="wallet"
                      href="https://keys.coinbase.com"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Wallet
                    </WalletDropdownLink>
                    <WalletDropdownFundLink />
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </ConnectWallet>
              </Wallet>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8">
            {/* Validation Message */}
            {!canPropose && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-5 h-5 text-yellow-600 mr-3">⚠️</div>
                  <p className="text-yellow-800 font-medium">{validationMessage}</p>
                </div>
              </div>
            )}

            {/* Form Errors */}
            {formErrors.length > 0 && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-red-800 font-medium mb-2">Please fix the following errors:</h4>
                <ul className="text-red-700 text-sm space-y-1">
                  {formErrors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Proposal Form */}
            <div className="space-y-6">
              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                  Proposal Title *
                </label>
                <input
                  id="title"
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  value={formData.title}
                  onChange={e => updateFormField('title', e.target.value)}
                  placeholder="Enter a clear, descriptive title for your proposal"
                  disabled={isSubmitting}
                  maxLength={200}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Make it clear and specific - this will be the main identifier for your proposal
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.title.length}/200
                  </span>
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="body" className="block text-sm font-semibold text-gray-700 mb-2">
                  Proposal Description *
                </label>
                <textarea
                  id="body"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                  value={formData.body}
                  onChange={e => updateFormField('body', e.target.value)}
                  placeholder="Provide a detailed description of your proposal...&#10;&#10;Include:&#10;• Background and motivation&#10;• Specific actions or changes requested&#10;• Expected outcomes and benefits&#10;• Implementation timeline&#10;• Any relevant links or references"
                  disabled={isSubmitting}
                  rows={12}
                  maxLength={10000}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Supports Markdown formatting. Be thorough - voters need enough detail to make informed decisions.
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.body.length}/10,000
                  </span>
                </div>
              </div>

              {/* Forum Thread ID */}
              <div>
                <label htmlFor="forumThreadId" className="block text-sm font-semibold text-gray-700 mb-2">
                  Forum Thread ID (Optional)
                </label>
                <input
                  id="forumThreadId"
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  value={formData.forumThreadId}
                  onChange={e => updateFormField('forumThreadId', e.target.value)}
                  placeholder="e.g., forum-thread-123, discussion-456"
                  disabled={isSubmitting}
                  maxLength={100}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Link to an existing forum discussion for additional context and community feedback
                </p>
              </div>
            </div>

            {/* Submit Section */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              {isConnected && canPropose ? (
                <Transaction
                  chainId={base.id}

				  calls={transactionData ? [transactionData] : []}
                  onSuccess={handleSuccess}
                  onError={handleError}
                >
                  <TransactionButton
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                    disabled={!isFormValid || isSubmitting}
                    text={isSubmitting ? "Submitting Proposal..." : "Submit Proposal to DAO"}
                  />
                  <TransactionSponsor />
                  <div className="mt-4">
                    <TransactionStatus>
                      <TransactionStatusLabel />
                      <TransactionStatusAction />
                    </TransactionStatus>
                  </div>
                </Transaction>
              ) : (
                <div className="text-center">
                  <button
                    disabled
                    className="w-full bg-gray-300 text-gray-500 font-semibold py-4 px-8 rounded-lg cursor-not-allowed"
                  >
                    {!isConnected ? 'Connect Wallet to Submit' : 'Requirements Not Met'}
                  </button>
                </div>
              )}

            </div>

            {/* Requirements */}
            <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-blue-900 font-semibold mb-3">📋 Proposal Requirements</h4>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-800">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    Wallet connected
                  </div>
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${advocateBalance > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                    Hold at least 1 Advocate NFT
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${formData.title.length >= 10 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    Clear, descriptive title
                  </div>
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${formData.body.length >= 50 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    Detailed description (50+ chars)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
