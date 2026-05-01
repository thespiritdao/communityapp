'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders markdown content with styled elements and mention support.
 *
 * Pre-processes @[Name](wallet) mention syntax into readable @Name text
 * before passing through ReactMarkdown for rendering.
 */
export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  // Pre-process mentions: @[Display Name](wallet_address) → @Display Name
  const processed = content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-[#3C3C3C] mb-3 mt-4 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-[#3C3C3C] mb-2 mt-3 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-[#3C3C3C] mb-2 mt-3 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-[#5A5A5A] mb-3 leading-relaxed last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 text-[#5A5A5A] space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 text-[#5A5A5A] space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="ml-2">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#2F5D50] pl-4 italic text-[#7C6F5B] my-3">
              {children}
            </blockquote>
          ),
          code: ({ children, className: codeClassName }) => {
            const isInline = !codeClassName;
            return isInline ? (
              <code className="bg-[#F5EDD7] text-[#8B5E3C] px-1 py-0.5 rounded text-sm font-mono">
                {children}
              </code>
            ) : (
              <code className="block bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-3">
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
          hr: () => (
            <hr className="my-4 border-[#D1C4A9]/40" />
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#3C3C3C]">{children}</strong>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border-collapse border border-[#D1C4A9]/40 text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[#D1C4A9]/40 px-3 py-2 bg-[#F5EDD7] text-left font-semibold text-[#3C3C3C]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[#D1C4A9]/40 px-3 py-2 text-[#5A5A5A]">
              {children}
            </td>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
