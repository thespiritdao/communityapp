// src/features/marketplace/components/ProductManagement/ProductManagement.style.ts
import styled from 'styled-components';

export const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
  box-sizing: border-box;
`;

export const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  
  @media (max-width: 768px) {
    max-height: 95vh;
  }
`;

export const Content = styled.div`
  flex: 1;
  overflow: hidden;
`;

export const Header = styled.div`
  position: sticky;
  top: 0;
  background: white;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
`;

export const Title = styled.h2`
  margin: 0;
  color: #333;
  font-size: 24px;
  font-weight: 600;
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  
  &:hover {
    background: #f5f5f5;
    color: #333;
  }
`;

export const ProductsList = styled.div`
  padding: 24px;
  overflow-y: auto;
  max-height: calc(90vh - 100px);
`;


export const SectionTitle = styled.h3`
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
`;

export const EmptyState = styled.div`
  text-align: center;
  color: #666;
  padding: 40px 20px;
  font-size: 16px;
  line-height: 1.5;
`;

export const ProductItem = styled.div<{ $isSelected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px solid ${props => props.$isSelected ? '#007bff' : '#e0e0e0'};
  border-radius: 8px;
  margin-bottom: 12px;
  background: ${props => props.$isSelected ? '#f8f9ff' : 'white'};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #007bff;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
  }
`;

export const ProductImage = styled.img`
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  margin-right: 12px;
  border: 1px solid #e0e0e0;
`;

export const ProductDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ProductName = styled.div`
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const ProductMeta = styled.div`
  font-size: 14px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

export const TokenBadge = styled.span`
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
`;

export const ProductActions = styled.div`
  display: flex;
  gap: 8px;
  margin-left: 12px;
`;

export const ActionButton = styled.button`
  background: #007bff;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:hover:not(:disabled) {
    background: #0056b3;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

export const DeleteButton = styled.button`
  background: #dc3545;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:hover:not(:disabled) {
    background: #c82333;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

export const FormGroup = styled.div`
  margin-bottom: 16px;
`;

export const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  color: #333;
  font-weight: 500;
  font-size: 14px;
`;

export const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
  }
  
  &:disabled {
    background: #f5f5f5;
    color: #666;
  }
`;

export const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
  }
`;

export const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
  }
  
  &:disabled {
    background: #f5f5f5;
    color: #666;
  }
`;

export const SizeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  margin-top: 8px;
`;

export const SizeOption = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const SizeCheckbox = styled.input`
  margin: 0;
`;

export const SizeLabel = styled.label`
  margin: 0;
  font-size: 14px;
  color: #333;
  cursor: pointer;
`;

export const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const Checkbox = styled.input`
  margin: 0;
`;

export const CheckboxLabel = styled.label`
  margin: 0;
  color: #333;
  font-size: 14px;
  cursor: pointer;
`;

export const FormActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
`;

export const CancelButton = styled.button`
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:hover:not(:disabled) {
    background: #545b62;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

export const SaveButton = styled.button`
  background: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  
  &:hover:not(:disabled) {
    background: #218838;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

export const LoadingMessage = styled.div`
  text-align: center;
  color: #666;
  padding: 40px;
  font-size: 16px;
`;

export const ErrorMessage = styled.div`
  background: #f8d7da;
  color: #721c24;
  padding: 12px 16px;
  border-radius: 4px;
  margin: 16px 24px;
  border: 1px solid #f5c6cb;
`;

export const SuccessMessage = styled.div`
  background: #d4edda;
  color: #155724;
  padding: 12px 16px;
  border-radius: 4px;
  margin: 16px 24px;
  border: 1px solid #c3e6cb;
`;

export const AddProductButton = styled.button`
  background: #28a745;
  color: white;
  border: none;
  padding: 12px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-bottom: 16px;
  width: 100%;
  
  &:hover:not(:disabled) {
    background: #218838;
  }
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
`;

// Modal Components
export const FormModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1001;
  padding: 20px;
  box-sizing: border-box;
`;

export const FormModal = styled.div`
  background: white;
  border-radius: 8px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
`;

export const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
`;

export const FormTitle = styled.h3`
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
`;

export const FormCloseButton = styled.button`
  background: none;
  border: none;
  font-size: 24px;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  
  &:hover {
    background: #f5f5f5;
    color: #333;
  }
`;

export const FormContent = styled.div`
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  
  @media (max-width: 768px) {
    padding: 16px;
  }
`;