"use client";

import { memo, useCallback } from "react";
import styled from "styled-components";

const SizeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 0.5rem;
`;

const SizeOption = styled.button<{ isSelected: boolean }>`
  padding: 0.5rem;
  border: 2px solid ${props => props.isSelected ? '#007bff' : '#e0e0e0'};
  background: ${props => props.isSelected ? '#007bff' : 'white'};
  color: ${props => props.isSelected ? 'white' : '#333'};
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #007bff;
    ${props => !props.isSelected && 'background: #f0f8ff;'}
  }
`;

const availableSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OS'];

interface SizeFilterProps {
  selectedSizes: string[];
  onSizeChange: (sizes: string[]) => void;
}

/**
 * SizeFilter - Optimized size selection
 * - Grid layout for easy selection
 * - Multi-select capability
 * - Memoized to prevent re-renders
 */
const SizeFilter = memo(({ selectedSizes, onSizeChange }: SizeFilterProps) => {
  const handleSizeToggle = useCallback((size: string) => {
    const newSizes = selectedSizes.includes(size)
      ? selectedSizes.filter(s => s !== size)
      : [...selectedSizes, size];
    
    onSizeChange(newSizes);
  }, [selectedSizes, onSizeChange]);

  return (
    <SizeGrid>
      {availableSizes.map(size => (
        <SizeOption
          key={size}
          isSelected={selectedSizes.includes(size)}
          onClick={() => handleSizeToggle(size)}
        >
          {size}
        </SizeOption>
      ))}
    </SizeGrid>
  );
});

SizeFilter.displayName = 'SizeFilter';

export default SizeFilter;