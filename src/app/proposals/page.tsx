'use client';
import React, { useCallback, useState } from 'react';
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
import UserTagging from 'src/components/UserTagging';
import { supabase } from 'src/lib/supabase';
import { ProposalThreadSelector } from 'src/features/governance/components/ProposalThreadSelector';

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

// Add validation utility (copied from Cart.tsx)
const validateTransactionData = (data: any) => {
  const validation = {
    isValid: true,
    issues: [] as string[],
    data: {} as any
  };
  try {
    validation.data = JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');
    if (Array.isArray(validation.data.calls)) {
      validation.data.calls.forEach((call: any, index: number) => {
        if (!call.address) validation.issues.push(`Call ${index}: Missing address`);
        if (!call.abi) validation.issues.push(`Call ${index}: Missing ABI`);
        if (!call.functionName) validation.issues.push(`Call ${index}: Missing functionName`);
        if (!Array.isArray(call.args)) validation.issues.push(`Call ${index}: Missing args array`);
      });
    } else {
      validation.issues.push('Calls is not an array');
    }
    validation.isValid = validation.issues.length === 0;
  } catch (e) {
    validation.isValid = false;
    validation.issues.push(`Serialization error: ${e instanceof Error ? e.message : String(e)}`);
  }
  return validation;
};

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
      
      return {
        address: process.env.NEXT_PUBLIC_DAO_GOVERNOR as Address,
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
      };
    } catch (error) {
      console.error('Error preparing transaction:', error);
      return null;
    }
  }, [formData, isFormValid, canPropose]);

  const handleSuccess = useCallback(async (txResult) => {
    console.group('✅ Proposal Transaction Success');
    console.log('📋 Transaction Response:', txResult);
    console.log('📋 Transaction Hash:', txResult?.transactionReceipts?.[0]?.transactionHash);
    console.log('📋 Block Number:', txResult?.transactionReceipts?.[0]?.blockNumber);
    console.log('📋 Status:', txResult?.transactionReceipts?.[0]?.status);
    console.log('📋 Gas Used:', txResult?.transactionReceipts?.[0]?.gasUsed);
    console.log('📋 To Address:', txResult?.transactionReceipts?.[0]?.to);
    console.log('📋 From Address:', txResult?.transactionReceipts?.[0]?.from);
    console.log('📋 Logs Count:', txResult?.transactionReceipts?.[0]?.logs?.length);
    console.groupEnd();
    
    setIsSubmitting(false);
    resetForm();
    // Extract on-chain proposal ID from txResult if available
    const proposalId = txResult?.transactionReceipts?.[0]?.logs?.find(
      (log) => log.topics && log.topics.length > 0 && log.topics[0].startsWith('0x')
    )?.topics?.[1];
    // Save metadata to Supabase
    if (proposalId) {
      await supabase.from('proposal_metadata').insert([
        {
          onchain_proposal_id: proposalId,
          title: formData.title,
          description: formData.body,
          proposer_address: address,
          forum_thread_id: formData.forumThreadId || null,
          mentions: formData.mentions || [],
        }
      ]);
    }
    console.log('Proposal submitted successfully!');
  }, [resetForm, setIsSubmitting, formData, address]);

  const handleError = useCallback((error: Error) => {
    console.group('❌ Proposal Transaction Error');
    console.error('📋 Error Details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    console.error('📋 Error Type:', typeof error);
    console.error('📋 Error Constructor:', error.constructor.name);
    console.groupEnd();
    
    setIsSubmitting(false);
    console.error('Transaction failed:', error);
    // You can add error notification here
  }, [setIsSubmitting]);

  const transactionData = prepareTransaction();
  const validation = validateTransactionData({
    address: address?.toLowerCase() as `0x${string}`,
    chainId: base.id,
    calls: transactionData ? [transactionData] : [],
    isSponsored: true
  });
  if (!validation.isValid) {
    console.error('Invalid transaction data:', validation.issues);
  } else {
    console.log('Validated transaction data:', validation.data);
  }

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
                <UserTagging
                  value={formData.body}
                  onChange={(value) => updateFormField('body', value)}
                  placeholder="Provide a detailed description of your proposal... Use @ to mention someone&#10;&#10;Include:&#10;• Background and motivation&#10;• Specific actions or changes requested&#10;• Expected outcomes and benefits&#10;• Implementation timeline&#10;• Any relevant links or references"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
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
                    Supports Markdown formatting and @mentions. Be thorough - voters need enough detail to make informed decisions.
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.body.length}/10,000
                  </span>
                </div>
              </div>

              {/* Forum Thread Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Forum Discussion (Optional)
                </label>
                <ProposalThreadSelector
                  onThreadSelect={threadId => updateFormField('forumThreadId', threadId)}
                />
                {formData.forumThreadId && (
                  <p className="mt-1 text-sm text-gray-600">
                    Selected: {formData.forumThreadId}
                  </p>
                )}
              </div>
            </div>

            {/* Submit Section */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              {isConnected && canPropose ? (
                <Transaction
                  address={address?.toLowerCase() as `0x${string}`}
                  chainId={base.id}
                  isSponsored={true}
                  calls={transactionData ? [transactionData] : []}
                  onStatus={(status) => {
                    console.log('Transaction lifecycle status:', status);
                  }}
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
