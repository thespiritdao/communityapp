//src/features/shopping-cart/components/Filter/style.ts

import styled from "src/features/shopping-cart/commons/style/styled-components";
import CB from "src/features/shopping-cart/commons/Checkbox/Checkbox";

export const Container = styled.div`
  display: flex;
  align-items: center;
  padding: 10px;
  background: ${({ theme }) => theme.colors.secondaryLight};
  border-radius: 5px;
  gap: 10px;
`;
export const Checkbox = styled(CB)`
  display: inline-block;
  margin-bottom: 10px;

  /* Customize the label */
  label {
    display: inline-block;
    position: relative;
    cursor: pointer;
    font-size: 22px;
    user-select: none;
    width: 35px;
    height: 35px;
    font-size: 0.8em;
    margin-bottom: 8px;
    margin-right: 8px;
    border-radius: 50%;
    line-height: 35px;
    text-align: center;

    /* On mouse-over, add a border with the primary color */
    &:hover input ~ .checkmark {
      border: 1px solid ${({ theme }) => theme.colors.primary};
    }

    input:focus-visible ~ .checkmark {
      box-sizing: border-box;
      line-height: 30px;
      border: 3px solid ${({ theme }) => theme.colors.secondary};
    }

    /* When the checkbox is checked, add the primary color to background */
    & input:checked ~ .checkmark {
      background-color: ${({ theme }) => theme.colors.primary};
      color: #ececec;
    }

    /* Show the checkmark when checked */
    & input:checked ~ .checkmark:after {
      display: block;
    }

    input {
      position: absolute;
      opacity: 0;
      cursor: pointer;
    }

    /* Create a custom checkbox */
    .checkmark {
      position: absolute;
      top: 0;
      left: 0;
      width: 35px;
      height: 35px;
      font-size: 0.8em;
      border-radius: 50%;
      box-sizing: border-box;
      line-height: 35px;
      text-align: center;
      color: ${({ theme }) => theme.colors.primary};
      background-color: #ececec;
      border: 1px solid transparent;
    }
  }
`;

//src/features/shopping-cart/components/Filter/style.ts

/* 🏷 Style for Different Filter Sections */
export const Title = styled.h4`
  margin-top: 2px;
  margin-bottom: 10px;
  color: ${({ theme }) => theme.colors.primary};
`;

/* 🛍 Style for Payment Filters */
export const PaymentFilters = styled.div`
  margin-top: 10px;
  padding: 10px;
  background: ${({ theme }) => theme.colors.secondaryLight};
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
`;

export const Label = styled.label`
  font-size: 16px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.primary};
`;

export const SortDropdown = styled.select`
  padding: 8px 12px;
  font-size: 16px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
  background: #f0f0f0; /* Light grey background */
  color: #000;       /* Black text */
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.secondary};
  }
`;
