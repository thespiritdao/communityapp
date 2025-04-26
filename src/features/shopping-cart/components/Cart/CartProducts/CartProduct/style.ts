import styled from 'src/features/shopping-cart/commons/style/styled-components';

export const Container = styled.div`
  position: relative;
  box-sizing: border-box;
  padding: 5%;
  border-radius: 8px;
  background-color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 10px;

  transition: background-color 0.2s, opacity 0.2s;

  &::before {
    content: '';
    width: 90%;
    height: 2px;
    background-color: rgba(255, 255, 255, 0.1);
    position: absolute;
    top: 0;
    left: 5%;
  }
`;


/* ✅ NEW: Price Container for $SYSTEM & $SELF */
export const PriceContainer = styled.div`
  width: 30%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: ${({ theme }) => theme.colors.secondary};
  text-align: right;
`;

/* ✅ NEW: Separate styles for both token prices */
export const PriceSystem = styled.p`
  font-size: 1.1em;
  font-weight: bold;
  color: #5fb3b3; /* Soft green for $SYSTEM */
  margin: 2px 0;
`;

export const PriceSelf = styled.p`
  font-size: 0.9em;
  color: #b2a1ff; /* Light purple for $SELF */
  margin: 2px 0;
`;

/* ✅ Improved Remove Button */
export const DeleteButton = styled.button`
  width: 20px;
  height: 20px;
  top: 12px;
  right: 5%;
  border-radius: 50%;
  position: absolute;
  background-size: contain;
  background-image: url(${require('public/images/cart/delete-icon.png')});
  background-repeat: no-repeat;
  background-color: transparent;
  border: none;
  cursor: pointer;

  &:hover {
    transform: scale(1.1);
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.secondary};
  }
`;

/* ✅ Improved Quantity Controls */
export const ChangeQuantity = styled.button`
  color: #b7b7b7;
  border: 1px solid #5b5a5e;
  background-color: rgba(255, 255, 255, 0.05);
  width: 28px;
  height: 28px;
  font-size: 1.2em;
  font-weight: bold;
  margin: 0 3px;
  border-radius: 5px;
  transition: 0.2s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }

  &:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }
`;

/* ✅ Improved Product Image */
export const Image = styled.img`
  display: inline-block;
  vertical-align: middle;
  width: 40%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.2);
  margin-right: 10px;
`;

export const ProductContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
`;


export const ProductName = styled.h3`
  font-size: 1.1rem;  /* Slightly larger than default */
  font-weight: bold;
  margin-bottom: 0.45rem; /* Slight bottom margin */
`;

export const ProductDescription = styled.div`
  flex: 2;
  font-size: .5rem;
  color: #333;
  margin-right: 1rem;
`;


export const ProductControls = styled.div`
  display: flex;
  align-items: center;

  button {
    margin: 0 4px;
    padding: 4px 8px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  span {
    margin: 0 8px;
  }
`;

export const QuantityButton = styled.button`
  border-radius: 50%;
  background-color: #transparent;
  color: #000;
  border: 2px solid #4bb6d1;
  width: 32px;
  height: 32px;
  cursor: pointer;
  margin: 0 0.25rem;
  font-size: 1.25em;
`;

export const RemoveButton = styled.button`
  border-radius: 8px;
  background-color: #d3430e;
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-weight: bold;
  margin-left: 0.5rem;

  &:hover {
    background-color: #f79e7f;
  }
`;


export const ProductImage = styled.img`
  width: 75px;
  height: 75px;
  object-fit: cover;
  margin-right: 0.5rem;
  border-radius: 4px;
`;
