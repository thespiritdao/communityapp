// src/features/proposals/ProposalSubmission.tsx

import React, { useCallback } from 'react';
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
import { useAccount } from 'wagmi';
import { encodeFunctionData, Address } from 'viem';
import { base } from 'wagmi/chains';
import { useProposal } from 'src/context/ProposalContext';

interface ProposalSubmissionProps {
  className?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  variant?: 'full' | 'compact' | 'minimal';
}

// ABI for the proposeWithMetadata function
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

export const ProposalSubmission: React.FC<ProposalSubmissionProps> = ({ 
  className = '',
  onSuccess,
  onError,
  variant = 'full'
}) => {
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

  // Prepare transaction data using the context
  const prepareProposalTransaction = useCallback(() => {
    if (!isFormValid || !canPropose) return null;

    try {
      // For a simple proposal without specific execution, we use empty arrays
      const targets: Address[] = [];
      const values: bigint[] = [];
      const calldatas: `0x${string}`[] = [];
      
      // Create the full description with title and body
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

  const handleTransactionSuccess = useCallback(() => {
    setIsSubmitting(false);
    resetForm();
    console.log('Proposal submitted successfully!');
    onSuccess?.();
  }, [resetForm, setIsSubmitting, onSuccess]);

  const handleTransactionError = useCallback((error: Error) => {
    setIsSubmitting(false);
    console.error('Transaction failed:', error);
    onError?.(error);
  }, [setIsSubmitting, onError]);

  const transactionData = prepareProposalTransaction();

  // Render different variants
  if (variant === 'minimal') {
    return (
      <div className={`w-full max-w-md mx-auto ${className}`}>
        <div className="space-y-4">
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.title}
            onChange={e => updateFormField('title', e.target.value)}
            placeholder="Proposal title"
            disabled={isSubmitting}
          />
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.body}
            onChange={e => updateFormField('body', e.target.value)}
            placeholder="Proposal description"
            rows={4}
            disabled={isSubmitting}
          />
          {isConnected && canPropose ? (
            <Transaction
              chainId={base.id}
              calls={transactionData ? [transactionData] : []}
              onSuccess={handleTransactionSuccess}
              onError={handleTransactionError}
            >
              <TransactionButton
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50"
                disabled={!isFormValid || isSubmitting}
                text={isSubmitting ? "Submitting..." : "Submit"}
              />
            </Transaction>
          ) : (
            <button disabled className="w-full bg-gray-300 text-gray-500 py-2 px-4 rounded-md cursor-not-allowed">
              {!isConnected ? 'Connect Wallet' : 'Requirements Not Met'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`w-full max-w-lg mx-auto p-4 bg-white rounded-lg shadow ${className}`}>
        <h3 className="text-lg font-semibold mb-4">Submit Proposal</h3>
        
        {/* Validation Messages */}
        {!canPropose && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <span className="text-yellow-800">{validationMessage}</span>
          </div>
        )}

        {formErrors.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <ul className="text-red-700 space-y-1">
              {formErrors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.title}
            onChange={e => updateFormField('title', e.target.value)}
            placeholder="Proposal title"
            disabled={isSubmitting}
            maxLength={200}
          />
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.body}
            onChange={e => updateFormField('body', e.target.value)}
            placeholder="Proposal description"
            rows={6}
            disabled={isSubmitting}
            maxLength={10000}
          />
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.forumThreadId}
            onChange={e => updateFormField('forumThreadId', e.target.value)}
            placeholder="Forum thread ID (optional)"
            disabled={isSubmitting}
            maxLength={100}
          />

          {isConnected ? (
            <Transaction
              chainId={base.id}
              calls={transactionData ? [transactionData] : []}
              onSuccess={handleTransactionSuccess}
              onError={handleTransactionError}
            >
              <TransactionButton
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                disabled={!isFormValid || isSubmitting}
                text={isSubmitting ? "Submitting..." : "Submit Proposal"}
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          ) : (
            <ConnectWallet className="w-full">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg">
                Connect Wallet to Submit
              </button>
            </ConnectWallet>
          )}
        </div>
      </div>
    );
  }

  // Full variant (default)
  return (
    <div className={`w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg ${className}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Submit DAO Proposal</h2>
        <p className="text-gray-600">
          Create a new proposal for the DAO to vote on. All proposals are recorded on-chain.
        </p>
      </div>

      {/* Wallet Connection Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-sm font-medium">
                {isConnected ? 'Wallet Connected' : 'Wallet Disconnected'}
              </span>
            </div>
            {isConnected && (
              <div className="text-sm text-gray-600">
                <span>Advocate NFTs: </span>
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
        {isConnected && address && (
          <p className="text-xs text-gray-500 mt-1">
            Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </p>
        )}
      </div>

      {/* Validation Messages */}
      {!canPropose && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <div className="w-5 h-5 text-yellow-600 mr-3">⚠️</div>
            <p className="text-yellow-800 font-medium">{validationMessage}</p>
          </div>
        </div>
      )}

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
      <form className="space-y-6">
        {/* Proposal Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Proposal Title *
          </label>
          <input
            id="title"
            type="text"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={formData.title}
            onChange={e => updateFormField('title', e.target.value)}
            required
            placeholder="Enter a clear, descriptive title"
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

        {/* Proposal Description */}
        <div>
          <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-2">
            Proposal Description *
          </label>
          <textarea
            id="body"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            value={formData.body}
            onChange={e => updateFormField('body', e.target.value)}
            required
            rows={8}
            placeholder="Provide a detailed description of your proposal...&#10;&#10;Include:&#10;• Background and motivation&#10;• Specific actions or changes requested&#10;• Expected outcomes and benefits&#10;• Implementation timeline&#10;• Any relevant links or references"
            disabled={isSubmitting}
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
          <label htmlFor="forumThreadId" className="block text-sm font-medium text-gray-700 mb-2">
            Forum Thread ID (Optional)
          </label>
          <input
            id="forumThreadId"
            type="text"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

        {/* Submit Transaction */}
        <div className="pt-4">
          {isConnected && canPropose ? (
            <Transaction
              chainId={base.id}
			  isSponsored
              calls={transactionData ? [transactionData] : []}
              onSuccess={handleTransactionSuccess}
              onError={handleTransactionError}
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

          {/* Transaction sponsored notice */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              🎉 Gas fees sponsored by Coinbase • Transaction secured by Base network
            </p>
          </div>
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
      </form>
    </div>
  );
};

// Export additional utility components
export const ProposalFormInputs: React.FC = () => {
  const { formData, updateFormField, isSubmitting, formErrors } = useProposal();

  return (
    <div className="space-y-4">
      {formErrors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
          <ul className="text-red-700 space-y-1">
            {formErrors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">
          Proposal Title *
        </label>
        <input
          id="title"
          type="text"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.title}
          onChange={e => updateFormField('title', e.target.value)}
          placeholder="Enter a clear, descriptive title"
          disabled={isSubmitting}
          maxLength={200}
        />
        <div className="text-xs text-gray-400 mt-1">
          {formData.title.length}/200
        </div>
      </div>
      
      <div>
        <label htmlFor="body" className="block text-sm font-medium mb-1">
          Proposal Description *
        </label>
        <textarea
          id="body"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.body}
          onChange={e => updateFormField('body', e.target.value)}
          placeholder="Provide a detailed description of your proposal"
          rows={6}
          disabled={isSubmitting}
          maxLength={10000}
        />
        <div className="text-xs text-gray-400 mt-1">
          {formData.body.length}/10,000
        </div>
      </div>
      
      <div>
        <label htmlFor="forumThreadId" className="block text-sm font-medium mb-1">
          Forum Thread ID (Optional)
        </label>
        <input
          id="forumThreadId"
          type="text"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.forumThreadId}
          onChange={e => updateFormField('forumThreadId', e.target.value)}
          placeholder="Enter a forum thread ID"
          disabled={isSubmitting}
          maxLength={100}
        />
      </div>
    </div>
  );
};

export default ProposalSubmission;