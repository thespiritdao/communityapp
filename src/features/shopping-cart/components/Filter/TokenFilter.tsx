"use client";

import { memo, useCallback } from "react";
import styled from "styled-components";

const TokenList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const TokenOption = styled.label<{ isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid ${props => props.isSelected ? '#007bff' : '#e0e0e0'};
  background: ${props => props.isSelected ? '#f0f8ff' : 'white'};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #007bff;
    background: #f0f8ff;
  }
`;

const TokenCheckbox = styled.input`
  margin: 0;
  cursor: pointer;
`;

const TokenInfo = styled.div`
  flex: 1;
`;

const TokenName = styled.div`
  font-weight: 500;
  color: #333;
  font-size: 0.9rem;
`;

const TokenDescription = styled.div`
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.125rem;
`;

const tokenOptions = [
  {
    value: 'no_token',
    name: 'Public Access',
    description: 'No token required'
  },
  {
    value: 'exec',
    name: 'Executive Pod',
    description: 'Executive pod members only'
  },
  {
    value: 'dev',
    name: 'Developer Pod',
    description: 'Developer pod members only'
  },
  {
    value: 'bounty',
    name: 'Bounty Hunters',
    description: 'Bounty token holders'
  },
  {
    value: 'advocate',
    name: 'Advocates',
    description: 'Community advocates'
  },
  {
    value: 'poc',
    name: 'Proof of Curiosity',
    description: 'POC token holders'
  }
];

interface TokenFilterProps {
  selectedTokens: string[];
  onTokenChange: (tokens: string[]) => void;
}

/**
 * TokenFilter - Token access level filtering
 * - Clear token requirement descriptions
 * - Single-select for simplicity
 * - Memoized for performance
 */
const TokenFilter = memo(({ selectedTokens, onTokenChange }: TokenFilterProps) => {
  const handleTokenToggle = useCallback((tokenValue: string) => {
    // For token filters, typically single-select makes more sense
    const newTokens = selectedTokens.includes(tokenValue) 
      ? [] 
      : [tokenValue];
    
    onTokenChange(newTokens);
  }, [selectedTokens, onTokenChange]);

  return (
    <TokenList>
      {tokenOptions.map(token => (
        <TokenOption
          key={token.value}
          isSelected={selectedTokens.includes(token.value)}
        >
          <TokenCheckbox
            type="checkbox"
            checked={selectedTokens.includes(token.value)}
            onChange={() => handleTokenToggle(token.value)}
          />
          <TokenInfo>
            <TokenName>{token.name}</TokenName>
            <TokenDescription>{token.description}</TokenDescription>
          </TokenInfo>
        </TokenOption>
      ))}
    </TokenList>
  );
});

TokenFilter.displayName = 'TokenFilter';

export default TokenFilter;