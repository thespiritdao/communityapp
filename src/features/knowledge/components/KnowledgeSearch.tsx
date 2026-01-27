// src/features/knowledge/components/KnowledgeSearch.tsx
'use client';

import { Search } from 'lucide-react';

interface KnowledgeSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const KnowledgeSearch: React.FC<KnowledgeSearchProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div
      style={{
        position: 'relative',
        maxWidth: '600px',
      }}
    >
      <Search
        size={20}
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#8F8A84',
        }}
      />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search knowledge base..."
        style={{
          width: '100%',
          padding: '12px 12px 12px 44px',
          borderRadius: '12px',
          border: '1px solid #E8E4DC',
          backgroundColor: '#FFFFFF',
          fontSize: '15px',
          color: '#2F2F2F',
          outline: 'none',
          transition: 'border-color 0.2s ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#2F5D50';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#E8E4DC';
        }}
      />
    </div>
  );
};
