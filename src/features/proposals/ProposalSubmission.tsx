// src/features/proposals/ProposalSubmission.tsx

import type React from 'react';
import { useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import type { Address } from 'viem';
import { encodeFunctionData } from 'viem';
import { useProposal } from '@/context/ProposalContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import UserTagging from '@/components/UserTagging';
import DAOGovernorABI from '@/abis/DAO_GovernorABI.json';

interface ProposalSubmissionProps {
  className?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  variant?: 'full' | 'compact' | 'minimal';
}

export const ProposalSubmission: React.FC<ProposalSubmissionProps> = ({
  className = '',
  onSuccess,
  onError,
  variant = 'full',
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { toast } = useToast();
  const isConnected = !!address;
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

  // CDP-based proposal submission handler
  const handleCdpSubmission = useCallback(async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      toast({
        title: 'Error',
        description: 'Smart Account not found. Please connect your wallet.',
        variant: 'destructive',
      });
      return;
    }

    if (!isFormValid || !canPropose) {
      toast({
        title: 'Cannot Submit',
        description: validationMessage || 'Please complete all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];
      const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as Address;

      // Prepare proposal parameters
      const targets: Address[] = [];
      const values: bigint[] = [];
      const calldatas: `0x${string}`[] = [];
      const description = `# ${formData.title}\n\n${formData.body}`;

      console.log('🚀 Submitting proposal via CDP:', {
        governor: GOVERNOR_ADDRESS,
        title: formData.title,
        smartAccount,
      });

      // Encode the proposeWithMetadata call
      const callData = encodeFunctionData({
        abi: DAOGovernorABI,
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

      // Send user operation with CDP paymaster (gasless)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: GOVERNOR_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Proposal submitted successfully:', result);

      setIsSubmitting(false);
      resetForm();

      toast({
        title: 'Proposal Submitted!',
        description: 'Your proposal has been submitted to the DAO for voting.',
        variant: 'success',
      });

      onSuccess?.();
    } catch (error: any) {
      console.error('❌ Proposal submission failed:', error);

      setIsSubmitting(false);

      let errorMessage = 'Proposal submission failed';
      if (error.shortMessage) errorMessage = error.shortMessage;
      else if (error.message) errorMessage = error.message;

      toast({
        title: 'Submission Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      onError?.(error);
    }
  }, [
    currentUser,
    sendUserOperation,
    isFormValid,
    canPropose,
    formData,
    validationMessage,
    setIsSubmitting,
    resetForm,
    toast,
    onSuccess,
    onError,
  ]);

  // Render different variants
  if (variant === 'minimal') {
    return (
      <div className={`w-full max-w-md mx-auto ${className}`}>
        <div className="space-y-4">
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.title}
            onChange={(e) => updateFormField('title', e.target.value)}
            placeholder="Proposal title"
            disabled={isSubmitting}
          />
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.body}
            onChange={(e) => updateFormField('body', e.target.value)}
            placeholder="Proposal description"
            rows={4}
            disabled={isSubmitting}
          />
          {isConnected && canPropose ? (
            <Button
              onClick={handleCdpSubmission}
              disabled={!isFormValid || isSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {isSubmitting ? 'Submitting Proposal...' : 'Submit Proposal to DAO'}
            </Button>
          ) : (
            <button
              disabled={true}
              className="w-full bg-gray-300 text-gray-500 py-2 px-4 rounded-md cursor-not-allowed"
            >
              {isConnected ? 'Requirements Not Met' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`w-full max-w-lg mx-auto p-4 bg-white rounded-lg shadow ${className}`}
      >
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
            onChange={(e) => updateFormField('title', e.target.value)}
            placeholder="Proposal title"
            disabled={isSubmitting}
            maxLength={200}
          />
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.body}
            onChange={(e) => updateFormField('body', e.target.value)}
            placeholder="Proposal description"
            rows={6}
            disabled={isSubmitting}
            maxLength={10000}
          />
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.forumThreadId}
            onChange={(e) => updateFormField('forumThreadId', e.target.value)}
            placeholder="Forum thread ID (optional)"
            disabled={isSubmitting}
            maxLength={100}
          />

          {isConnected ? (
            <Button
              onClick={handleCdpSubmission}
              disabled={!isFormValid || isSubmitting || !canPropose}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Proposal'}
            </Button>
          ) : (
            <div className="w-full text-center p-4 bg-gray-100 rounded-lg">
              <p className="text-gray-600">
                Please connect your wallet to submit a proposal
              </p>
              <p className="text-sm text-gray-500 mt-2">
                You must be logged in with an embedded wallet
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full variant (default)
  return (
    <div
      className={`w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg ${className}`}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Submit DAO Proposal
        </h2>
        <p className="text-gray-600">
          Create a new proposal for the DAO to vote on. All proposals are
          recorded on-chain.
        </p>
      </div>

      {/* Wallet Connection Status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
              />
              <span className="text-sm font-medium">
                {isConnected ? 'Wallet Connected' : 'Wallet Disconnected'}
              </span>
            </div>
            {isConnected && (
              <div className="text-sm text-gray-600">
                <span>Advocate NFTs: </span>
                <span className="font-semibold">
                  {advocateBalance.toString()}
                </span>
              </div>
            )}
          </div>

          {/* Wallet Address Display */}
          {isConnected && address && (
            <div className="text-sm bg-gray-100 px-3 py-2 rounded-lg">
              <span className="text-gray-600 mr-2">Wallet:</span>
              <span className="font-mono font-semibold text-gray-900">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
          )}
        </div>
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
          <h4 className="text-red-800 font-medium mb-2">
            Please fix the following errors:
          </h4>
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
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Proposal Title *
          </label>
          <input
            id="title"
            type="text"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={formData.title}
            onChange={(e) => updateFormField('title', e.target.value)}
            required={true}
            placeholder="Enter a clear, descriptive title"
            disabled={isSubmitting}
            maxLength={200}
          />
          <div className="flex justify-between mt-1">
            <p className="text-xs text-gray-500">
              Make it clear and specific - this will be the main identifier for
              your proposal
            </p>
            <span className="text-xs text-gray-400">
              {formData.title.length}/200
            </span>
          </div>
        </div>

        {/* Proposal Description */}
        <div>
          <label
            htmlFor="body"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Proposal Description *
          </label>
          <UserTagging
            value={formData.body}
            onChange={(value) => updateFormField('body', value)}
            placeholder="Provide a detailed description of your proposal... Use @ to mention someone&#10;&#10;Include:&#10;• Background and motivation&#10;• Specific actions or changes requested&#10;• Expected outcomes and benefits&#10;• Implementation timeline&#10;• Any relevant links or references"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            multiLine={true}
            contextType="proposal"
            contextId="new-proposal"
            contextUrl="/proposals"
            onMentionsChange={(mentions) => {
              console.log('Mentions in proposal:', mentions);
            }}
          />
          <div className="flex justify-between mt-1">
            <p className="text-xs text-gray-500">
              Supports Markdown formatting and @mentions. Be thorough - voters
              need enough detail to make informed decisions.
            </p>
            <span className="text-xs text-gray-400">
              {formData.body.length}/10,000
            </span>
          </div>
        </div>

        {/* Forum Thread ID */}
        <div>
          <label
            htmlFor="forumThreadId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Forum Thread ID (Optional)
          </label>
          <input
            id="forumThreadId"
            type="text"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={formData.forumThreadId}
            onChange={(e) => updateFormField('forumThreadId', e.target.value)}
            placeholder="e.g., forum-thread-123, discussion-456"
            disabled={isSubmitting}
            maxLength={100}
          />
          <p className="text-xs text-gray-500 mt-1">
            Link to an existing forum discussion for additional context and
            community feedback
          </p>
        </div>

        {/* Submit Transaction */}
        <div className="pt-4">
          {isConnected && canPropose ? (
            <Button
              onClick={handleCdpSubmission}
              disabled={!isFormValid || isSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              {isSubmitting ? 'Submitting Proposal...' : 'Submit Proposal to DAO'}
            </Button>
          ) : (
            <div className="text-center">
              <button
                disabled={true}
                className="w-full bg-gray-300 text-gray-500 font-semibold py-4 px-8 rounded-lg cursor-not-allowed"
              >
                {isConnected
                  ? 'Requirements Not Met'
                  : 'Connect Wallet to Submit'}
              </button>
            </div>
          )}

          {/* Transaction sponsored notice */}
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              🎉 Gas fees sponsored by Coinbase • Transaction secured by Base
              network
            </p>
          </div>
        </div>

        {/* Requirements */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-blue-900 font-semibold mb-3">
            📋 Proposal Requirements
          </h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-800">
            <div className="space-y-2">
              <div className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                />
                Wallet connected
              </div>
              <div className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${advocateBalance > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                />
                Hold at least 1 Advocate NFT
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${formData.title.length >= 10 ? 'bg-green-500' : 'bg-yellow-500'}`}
                />
                Clear, descriptive title
              </div>
              <div className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${formData.body.length >= 50 ? 'bg-green-500' : 'bg-yellow-500'}`}
                />
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
          onChange={(e) => updateFormField('title', e.target.value)}
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
        <UserTagging
          value={formData.body}
          onChange={(value) => updateFormField('body', value)}
          placeholder="Provide a detailed description of your proposal... Use @ to mention someone"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          multiLine={true}
          contextType="proposal"
          contextId="new-proposal"
          contextUrl="/proposals"
          onMentionsChange={(mentions) => {
            console.log('Mentions in proposal:', mentions);
          }}
        />
        <div className="text-xs text-gray-400 mt-1">
          {formData.body.length}/10,000
        </div>
      </div>

      <div>
        <label
          htmlFor="forumThreadId"
          className="block text-sm font-medium mb-1"
        >
          Forum Thread ID (Optional)
        </label>
        <input
          id="forumThreadId"
          type="text"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={formData.forumThreadId}
          onChange={(e) => updateFormField('forumThreadId', e.target.value)}
          placeholder="Enter a forum thread ID"
          disabled={isSubmitting}
          maxLength={100}
        />
      </div>
    </div>
  );
};

export default ProposalSubmission;
