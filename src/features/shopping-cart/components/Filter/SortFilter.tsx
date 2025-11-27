'use client';

import { memo, useCallback } from 'react';
import styled from 'styled-components';

const SortSelect = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
  font-size: 0.9rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }
`;

const sortOptions = [
  { value: '', label: 'Default' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name: A to Z' },
  { value: 'name_desc', label: 'Name: Z to A' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

interface SortFilterProps {
  selectedSort: string;
  onSortChange: (sort: string) => void;
}

/**
 * SortFilter - Product sorting options
 * - Comprehensive sort options
 * - Accessible select component
 * - Memoized for performance
 */
const SortFilter = memo(({ selectedSort, onSortChange }: SortFilterProps) => {
  const handleSortChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onSortChange(event.target.value);
    },
    [onSortChange],
  );

  return (
    <SortSelect value={selectedSort} onChange={handleSortChange}>
      {sortOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SortSelect>
  );
});

SortFilter.displayName = 'SortFilter';

export default SortFilter;
