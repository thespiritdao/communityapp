// src/components/TopBar.style.ts
import styled from "styled-components";

export const TopBarContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #333;
  color: #000;
  padding: 0.75rem 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

export const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const ConnectedInfo = styled.div`
  font-size: 0.9rem;
  font-weight: bold;
`;

export const SystemBalances = styled.div`
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  span {
    background-color: #e9f9ec;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }
  font-weight: bold;
`;

export const SelfBalances = styled.div`
  display: flex;
  gap: 1rem;
  font-size: 0.9rem;
  span {
    background-color: #e8fcff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }
  font-weight: bold;
`;





export const CartToggleButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

/* This badge will be positioned over the cart icon */
export const CartBadge = styled.div`
  position: absolute;
  top: -5px;
  right: -5px;
  background: red;
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;
