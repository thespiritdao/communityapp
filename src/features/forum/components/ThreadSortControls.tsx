// src/features/forum/components/ThreadSortControls.tsx
'use client';

import React from 'react';

export type SortOption = 'newest' | 'active' | 'replies' | 'unanswered';

interface ThreadSortControlsProps {
  active: SortOption;
  onChange: (option: SortOption) => void;
}

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'active', label: 'Most Active' },
  { value: 'replies', label: 'Most Replies' },
  { value: 'unanswered', label: 'Unanswered' },
];

export function ThreadSortControls({ active, onChange }: ThreadSortControlsProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 16,
    }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            border: active === opt.value ? '1px solid #2F5D50' : '1px solid #D1C4A9',
            backgroundColor: active === opt.value ? '#2F5D50' : '#fff',
            color: active === opt.value ? '#fff' : '#3C3C3C',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
