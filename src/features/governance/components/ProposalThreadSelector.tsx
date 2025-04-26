import React, { useState } from 'react';
import { useForumCategories } from 'src/features/governance/hooks/useForumCategories';
import { useForumThreadsByCategory } from 'src/features/governance/hooks/useForumThreadsByCategory';
import { useAccount } from 'wagmi';

interface ProposalThreadSelectorProps {
  onThreadSelect: (threadId: string) => void;
  restrictToUser?: boolean;
}

export const ProposalThreadSelector: React.FC<ProposalThreadSelectorProps> = ({
  onThreadSelect,
  restrictToUser = false,
}) => {
  const { address } = useAccount();
  const { data: categories } = useForumCategories();
  const [selectedCategory, setSelectedCategory] = useState('');
  const { data: threads } = useForumThreadsByCategory(
    selectedCategory,
    restrictToUser ? address || undefined : undefined
  );

  return (
    <div>
      <div className="form-group">
        <label htmlFor="category">Proposal Category</label>
        <select
          id="category"
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            // Reset the selected thread when category changes
            onThreadSelect('');
          }}
          required
        >
          <option value="">Select Category</option>
          {categories?.map((cat: any) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
      {selectedCategory && (
        <div className="form-group">
          <label htmlFor="thread">Forum Thread</label>
          <select
            id="thread"
            onChange={(e) => onThreadSelect(e.target.value)}
            required
          >
            <option value="">Select Thread</option>
            {threads?.map((thread: any) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
