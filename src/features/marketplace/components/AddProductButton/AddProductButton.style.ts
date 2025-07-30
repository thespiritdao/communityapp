// src/features/marketplace/components/AddProductButton/AddProductButton.style.ts
import styled from "styled-components";

export const AddProductButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #d7f8fd;
  color: #000;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-right: 1rem;
  
  &:hover {
    background-color: #aceef8;
  }
  
  @media (max-width: 768px) {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }
`;

export const PlusIcon = styled.span`
  font-size: 1.2rem;
  font-weight: bold;
  line-height: 1;
`;

export const ButtonText = styled.span`
  font-weight: 500;
  
  @media (max-width: 480px) {
    display: none;
  }
`;