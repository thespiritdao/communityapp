// src/features/marketplace/components/ManageProductsButton/ManageProductsButton.style.ts
import styled from 'styled-components';

export const ManageProductsButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background-color: #8FAAA1;
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

  &:hover {
    background-color: #6F8F86;
  }

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

export const ButtonText = styled.span`
  font-weight: 500;
  @media (max-width: 480px) {
    display: none;
  }
`;
