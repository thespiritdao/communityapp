import type React from 'react';
import { useState, useEffect } from 'react';
import { useForumCategories } from '@/features/governance/hooks/useForumCategories';
import { useForumThreadsByCategory } from '@/features/governance/hooks/useForumThreadsByCategory';
import { useEvmAddress } from '@coinbase/cdp-hooks';

interface ProposalThreadSelectorProps {
  onThreadSelect: (threadId: string) => void;
  restrictToUser?: boolean;
}

export const ProposalThreadSelector: React.FC<ProposalThreadSelectorProps> = ({
  onThreadSelect,
  restrictToUser = false,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const {
    data: categories,
    isLoading: loadingCategories,
    error: categoryError,
  } = useForumCategories();
  const [selectedCategory, setSelectedCategory] = useState('');
  const {
    data: threads,
    isLoading: loadingThreads,
    error: threadsError,
  } = useForumThreadsByCategory(
    selectedCategory,
    restrictToUser ? address || undefined : undefined,
  );

  // Log state changes for debugging
  useEffect(() => {
    console.log('📊 ProposalThreadSelector state:', {
      selectedCategory,
      categoriesCount: categories?.length || 0,
      threadsCount: threads?.length || 0,
      loadingCategories,
      loadingThreads,
      categoryError: categoryError?.message,
      threadsError: threadsError?.message,
    });
  }, [
    selectedCategory,
    categories,
    threads,
    loadingCategories,
    loadingThreads,
    categoryError,
    threadsError,
  ]);

  return (
    <div className="space-y-4">
      {/* Category Selection */}
      <div className="form-group">
        <label htmlFor="category" className="block text-sm font-medium mb-1">
          Proposal Category {loadingCategories && '(Loading...)'}
        </label>
        <select
          id="category"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          value={selectedCategory}
          onChange={(e) => {
            console.log('📝 Category selected:', e.target.value);
            setSelectedCategory(e.target.value);
            // Reset the selected thread when category changes
            onThreadSelect('');
          }}
          required={true}
          disabled={loadingCategories}
        >
          <option value="">Select Category</option>
          {categories?.map((cat: any) => (
            <option key={cat.id} value={cat.id}>
              {cat.name} ({cat.thread_count || 0} threads)
            </option>
          ))}
        </select>
        {categoryError && (
          <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
            Error loading categories: {categoryError.message}
          </p>
        )}
        {!loadingCategories && (!categories || categories.length === 0) && (
          <p className="text-xs mt-1" style={{ color: '#C6933F' }}>
            No forum categories with threads available
          </p>
        )}
      </div>

      {/* Thread Selection */}
      {selectedCategory && (
        <div className="form-group">
          <label htmlFor="thread" className="block text-sm font-medium mb-1">
            Forum Thread {loadingThreads && '(Loading...)'}
          </label>
          <select
            id="thread"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            onChange={(e) => {
              console.log('📝 Thread selected:', e.target.value);
              onThreadSelect(e.target.value);
            }}
            required={true}
            disabled={loadingThreads}
          >
            <option value="">
              {loadingThreads ? 'Loading threads...' : 'Select Thread'}
            </option>
            {threads?.map((thread: any) => {
              const date = thread.created_at
                ? new Date(thread.created_at).toLocaleDateString()
                : '';
              return (
                <option key={thread.id} value={thread.id}>
                  {thread.title} {date && `(${date})`}
                </option>
              );
            })}
          </select>
          {threadsError && (
            <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
              Error loading threads: {threadsError.message}
            </p>
          )}
          {!loadingThreads && (!threads || threads.length === 0) && (
            <p className="text-xs mt-1" style={{ color: '#C6933F' }}>
              No threads found in this category
              {restrictToUser && ' created by you'}
            </p>
          )}
          {!loadingThreads && threads && threads.length > 0 && (
            <p className="text-gray-500 text-xs mt-1">
              Found {threads.length} thread{threads.length !== 1 ? 's' : ''} in
              this category
            </p>
          )}
        </div>
      )}
    </div>
  );
};
