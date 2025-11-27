// src/components/TopBar.style.ts
import styled from "styled-components";

export const TopBarContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #333;
  color: #000;
  padding: 0.75rem 1.5rem 0.75rem 0.75rem;
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
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 700;
  .label { color: #e9f9ec; }                
  .value {
    background-color: #e9f9ec;
    color: #0aba42;
    padding: 2px 6px;                       /* compact pill */
    border-radius: 6px;
    white-space: nowrap;
    flex: 0 0 auto;
  }
`;

export const SelfBalances = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 700;
  .label { color: #E8F1EE; }                /* SELF info label */
  .value {
    background-color: #E8F1EE;
    color: #2F5D50;
    padding: 2px 6px;                       /* compact pill */
    border-radius: 6px;
    white-space: nowrap;
    flex: 0 0 auto;
  }
`;





export const CartToggleButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  position: relative;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* Enforce previous visual size */
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  flex: 0 0 auto;
  margin-right: 0.4rem; 

  /* Ensure the Next.js <Image>'s <img> renders at the intended size */
  img {
    width: 30px;
    height: 30px;
    display: block;
  }
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
  margin-left: 0.75rem;
`;
