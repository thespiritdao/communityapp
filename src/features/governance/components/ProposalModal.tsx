'use client';

import React from 'react';
import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { EnhancedProposal } from '../hooks/useEnhancedProposals';

interface ProposalModalProps {
  proposal: EnhancedProposal;
  isOpen: boolean;
  onClose: () => void;
}

export const ProposalModal: React.FC<ProposalModalProps> = ({
  proposal,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#D1C4A9] px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#1F453A]">{proposal.title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-sage-50 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-sage-300" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(85vh-80px)]">
          {/* Metadata */}
          <div className="mb-6 pb-4 border-b border-[#D1C4A9]">
            <div className="flex flex-wrap gap-4 text-sm text-[#5F5A54]">
              <div>
                <span className="font-medium">Created:</span>{' '}
                {new Date(proposal.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              {proposal.start && proposal.end && (
                <>
                  <div>
                    <span className="font-medium">Start Block:</span> {proposal.start}
                  </div>
                  <div>
                    <span className="font-medium">End Block:</span> {proposal.end}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Proposal Body - Rich Text */}
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              components={{
                // Style markdown elements
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold text-gray-900 mb-4 mt-6">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-2xl font-bold text-gray-800 mb-3 mt-5">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xl font-semibold text-gray-800 mb-2 mt-4">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-gray-700 mb-4 leading-relaxed">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-4 text-gray-700 space-y-2">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-4 text-gray-700 space-y-2">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="ml-4">{children}</li>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-[#2F5D50] pl-4 italic text-gray-600 my-4">
                    {children}
                  </blockquote>
                ),
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-4">
                      {children}
                    </code>
                  );
                },
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2F5D50] hover:text-[#1F453A] underline"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {proposal.body}
            </ReactMarkdown>
          </div>

          {/* Vote Counts (if available) */}
          {proposal.scores && proposal.scores.length > 0 && (
            <div className="mt-6 pt-6 border-t border-[#D1C4A9] mb-12">
              <h3 className="text-lg font-semibold text-[#1F453A] mb-4">
                Current Vote Tally
              </h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {proposal.choices.map((choice, idx) => (
                  <div
                    key={idx}
                    className="text-center p-4 bg-earth-50 rounded-lg border border-earth-300"
                  >
                    <div className="text-2xl font-bold text-sage-700">
                      {proposal.scores?.[idx] || 0}
                    </div>
                    <div className="text-sm text-earth-500 font-medium">
                      {choice}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extra bottom padding for scroll visibility */}
          <div className="h-8"></div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#F5EDD7] border-t border-[#D1C4A9] px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-[#2F5D50] hover:bg-[#1F453A] text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
