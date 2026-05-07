//src/features/shopping-cart/components/Filter/style.ts

import styled from '@/features/shopping-cart/commons/style/styled-components';
import CB from '@/features/shopping-cart/commons/Checkbox/Checkbox';

export const Container = styled.div`
  display: flex;
  align-items: stretch;
  padding: 12px;
  background: #f5f4ed;
  border-radius: 8px;
  border: 1px solid #D1C4A9;
`;

export const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  width: 100%;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
`;

export const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  @media (max-width: 768px) {
    gap: 0.25rem;
  }
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
      border: 1px solid ${({ theme }: any) => theme.colors.primary};
    }

    input:focus-visible ~ .checkmark {
      box-sizing: border-box;
      line-height: 30px;
      border: 3px solid ${({ theme }: any) => theme.colors.secondary};
    }

    /* When the checkbox is checked, add the primary color to background */
    & input:checked ~ .checkmark {
      background-color: ${({ theme }: any) => theme.colors.primary};
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
      color: ${({ theme }: any) => theme.colors.primary};
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
  color: ${({ theme }: any) => theme.colors.primary};
`;

/* 🛍 Style for Payment Filters */
export const PaymentFilters = styled.div`
  margin-top: 10px;
  padding: 10px;
  background: ${({ theme }: any) => theme.colors.secondaryLight};
  border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
`;

export const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #5F5A54;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

export const SortDropdown = styled.select`
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid ${({ theme }: any) => theme.colors.primary};
  border-radius: 6px;
  background: #f5f4ed;
  color: #1F453A;
  cursor: pointer;
  outline: none;
  width: 100%;

  &:focus {
    border-color: ${({ theme }: any) => theme.colors.secondary};
    box-shadow: 0 0 0 2px rgba(198, 147, 63, 0.15);
  }

  &:hover {
    background: #E8F1EE;
  }

  optgroup {
    font-weight: 600;
    color: #2F5D50;
  }

  option {
    color: #1F453A;
    padding: 4px 8px;
  }
`;

export const FilterDropdown = styled(SortDropdown)``;
