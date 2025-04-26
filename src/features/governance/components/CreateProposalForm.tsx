// src/features/governance/components/CreateProposalForm.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { base } from 'viem/chains';
import { encodeFunctionData } from 'viem';
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { ProposalThreadSelector } from 'src/features/governance/components/ProposalThreadSelector';
import { useGovernanceForumThreads } from 'src/features/governance/hooks/useGovernanceForumThreads';
import 'src/features/governance/styles/proposal-form.css';

interface ProposalFormData {
  title: string;
  body: string;
  forumThreadId: string;
}

interface CreateProposalFormProps {
  onSuccess?: () => void;
}

const CreateProposalForm: React.FC<CreateProposalFormProps> = ({ onSuccess }) => {
  const { address } = useAccount();
  const [formData, setFormData] = useState<ProposalFormData>({
    title: '',
    body: '',
    forumThreadId: '',
  });
  const [submittedTxHash, setSubmittedTxHash] = useState<string | null>(null);

  const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

  // Build a dummy calldata so the proposal isn't empty:
  const dummyCalldata = useMemo(
    () =>
      encodeFunctionData({
        abi: DAOGovernorABI,
        functionName: 'votingDelay',
        args: [],
      }),
    []
  );

  const targets = [GOVERNOR_ADDRESS];
  const values = [0n];
  const calldatas = [dummyCalldata];
  const description = `# ${formData.title}\n\n${formData.body}${
    formData.forumThreadId ? `\n\nForum Discussion: ${formData.forumThreadId}` : ''
  }`;

  // Prepare the on‑chain call payload
  const proposeCall = useMemo(
    () => [
      {
        address: GOVERNOR_ADDRESS,
        abi: DAOGovernorABI,
        functionName: 'propose',
        args: [targets, values, calldatas, description] as [
          `0x${string}`[],
          bigint[],
          `0x${string}`[],
          string
        ],
      },
    ],
    [GOVERNOR_ADDRESS, targets, values, calldatas, description]
  );

  // Debug payload on every render
  useEffect(() => {
    console.log('👉 [Debug] Transaction payload:', {
      contracts: proposeCall,
      paymaster: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT,
      isSponsored: true,
    });
  }, [proposeCall]);

  const handleSuccess = (txHash: string) => {
    console.log('✅ Proposal tx hash:', txHash);
    setSubmittedTxHash(txHash);
    onSuccess?.();
    setFormData({ title: '', body: '', forumThreadId: '' });
  };

  const handleError = (error: any) => {
    console.error('❌ Proposal tx failed:', error);
    alert('Proposal failed: ' + (error?.message || error));
  };

  return (
    <form className="proposal-form" onSubmit={(e) => e.preventDefault()}>
      <h2>Create a New Proposal</h2>

      <div className="form-group">
        <label htmlFor="title">Proposal Title</label>
        <input
          id="title"
          name="title"
          value={formData.title}
          onChange={(e) =>
            setFormData((f) => ({ ...f, title: e.target.value }))
          }
          required
          placeholder="Enter proposal title"
        />
      </div>

      <div className="form-group">
        <label htmlFor="body">Proposal Description</label>
        <textarea
          id="body"
          name="body"
          value={formData.body}
          onChange={(e) =>
            setFormData((f) => ({ ...f, body: e.target.value }))
          }
          required
          rows={6}
          placeholder="Describe your proposal in detail"
        />
      </div>

      <ProposalThreadSelector
        onThreadSelect={(threadId) =>
          setFormData((f) => ({ ...f, forumThreadId: threadId }))
        }
      />
      {formData.forumThreadId && (
        <p className="mt-2 text-sm text-gray-600">
          Selected Thread ID: {formData.forumThreadId}
        </p>
      )}

      <Transaction
        isSponsored
        address={address as `0x${string}`}
        chainId={base.id}
        contracts={proposeCall}
        onSuccess={handleSuccess}
        onError={handleError}
      >
        <TransactionButton
          text="Create Proposal"
          className="newProposalButton"
        />
        <TransactionSponsor />
        <TransactionStatus>
          <TransactionStatusLabel />
          {/* wrap the “view transaction” button so we log right before it shows */}
          <div
            onClick={() =>
              console.log(
                '🔍 [Debug] ViewTx clicked:',
                submittedTxHash,
                proposeCall
              )
            }
          >
            <TransactionStatusAction />
          </div>
        </TransactionStatus>
      </Transaction>

      {submittedTxHash && (
        <a
          href={`https://basescan.org/tx/${submittedTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          View Transaction
        </a>
      )}
    </form>
  );
};

export default CreateProposalForm;
