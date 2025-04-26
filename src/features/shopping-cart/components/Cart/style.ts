// src/features/shopping-cart/components/Cart/style.ts
import styled from "styled-components";

// If you still need a container for a cart toggle button, keep this:
export const Container = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: #f5f4ed;
  z-index: 1000;
`;

// If you have a floating cart icon or button, keep this:
export const CartButton = styled.button`
  background-color: #4bb6d1;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  cursor: pointer;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

////////////////////////////////////////////////////////////////////////
// OVERLAY + CART CONTENT (centered modal approach)
////////////////////////////////////////////////////////////////////////

export const CartOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1100;
  display: flex;
  justify-content: center; /* Center the modal horizontally */
  align-items: center;    /* Center the modal vertically */
`;

export const CartContent = styled.div`
  max-width: 600px;
  width: 90%;
  margin: 5% auto;
  background-color: #fff;
  border-radius: 8px;
  padding: 1rem;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-height: 90vh;
  overflow-y: auto;
`;

export const CartContentHeader = styled.div`
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
`;

export const HeaderImage = styled.img`
  width: 75px;
  height: 75px;
  margin-right: 0.5rem;
  border-radius: 4px;
  object-fit: cover;
`;

export const HeaderTitle = styled.h2`
  font-size: 1.2rem;
  margin: 0;
`;

////////////////////////////////////////////////////////////////////////
// CART FOOTER & BUTTONS
////////////////////////////////////////////////////////////////////////

export const CartFooter = styled.div`
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

/* Subtotal label */
export const Sub = styled.div`
  font-size: 0.9rem;
  font-weight: bold;
`;

/* Container for the prices */
export const SubPrice = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

/* Each price value */
export const SubPriceValue = styled.span`
  font-size: 0.9rem;
`;

/* Example of a styled checkout button with your new color scheme */
export const TransactionButtonStyled = styled.button`
  background-color: #4bb6d1 !important;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  opacity: 1; /* Ensure it's not transparent */
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #005bb5;
  }
`;

////////////////////////////////////////////////////////////////////////
// TOKEN DROPDOWN & PRODUCT IMAGE
////////////////////////////////////////////////////////////////////////

export const TokenDropdownContainer = styled.div`
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  /* Remove any default border or bevel here */
`;

export const ProductContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
`;

export const ProductImage = styled.img`
  width: 75px;
  height: 75px;
  object-fit: cover;
  margin-right: 0.5rem;
  border-radius: 4px;
`;

export const TokenRadioLabel = styled.label`
  display: flex;
  align-items: center;
  margin-right: 1rem;
  cursor: pointer;

  input[type="radio"] {
    margin-right: 4px;
  }

  img {
    width: 24px;
    height: 24px;
    vertical-align: middle;
    margin-right: 4px;
    border: none;
  }
`;

