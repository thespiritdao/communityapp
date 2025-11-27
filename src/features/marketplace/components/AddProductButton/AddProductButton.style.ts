// src/features/marketplace/components/AddProductButton/AddProductButton.style.ts
import styled from 'styled-components';

export const AddProductButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background-color: #2F5D50;
  color: #FFFFFF;
  border: none;
  border-radius: 3px;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
  margin-right: 0.75rem;
  min-height: 20px;
  min-width: 20px;

  &:hover { background-color: #1F453A; }

  /* lucide icon sizing */
  svg {
    width: 18px;
    height: 18px;
    stroke-width: 2.25;
  }

  @media (max-width: 768px) {
    padding: 0.3rem 0.45rem;
    font-size: 0.85rem;
    svg { width: 16px; height: 16px; }
  }
`;

export const PlusIcon = styled.span`
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
`;

export const ButtonText = styled.span`
  font-weight: 500;
  @media (max-width: 480px) {
    display: none;
  }
`;
