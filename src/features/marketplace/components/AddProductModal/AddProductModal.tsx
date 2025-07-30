// src/features/marketplace/components/AddProductModal/AddProductModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { createProduct, fetchTokens, Token, ProductFormData } from "../../services/productService";
import { useProducts } from "src/features/shopping-cart/contexts/products-context";
import { useTokenBalances } from "src/context/TokenBalancesContext";
import ImageUpload from "../ImageUpload";
import * as S from "./AddProductModal.style";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const availableSizesOptions = ["XS", "S", "M", "L", "XL", "XXL", "One Size"];

const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose }) => {
  const { address } = useAccount();
  const { fetchProducts } = useProducts();
  const { balances } = useTokenBalances();
  
  const [formData, setFormData] = useState<ProductFormData>({
    title: "",
    description: "",
    price_self: 0,
    price_system: 0,
    quantity: 1,
    units_available: 1,
    image_url: "",
    is_free_shipping: false,
    required_token: "",
    availableSizes: [],
    style: "default",
    sku: 0,
  });
  
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");

  // Fetch available tokens on component mount
  useEffect(() => {
    const loadTokens = async () => {
      try {
        const tokenList = await fetchTokens();
        setTokens(tokenList);
      } catch (error) {
        console.error('Failed to load tokens:', error);
        setError('Failed to load token options');
      }
    };
    
    if (isOpen) {
      loadTokens();
    }
  }, [isOpen]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSizeChange = (size: string) => {
    setFormData(prev => ({
      ...prev,
      availableSizes: prev.availableSizes.includes(size)
        ? prev.availableSizes.filter(s => s !== size)
        : [...prev.availableSizes, size]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!address) {
      setError("Wallet not connected");
      return;
    }

    // Validation
    if (!formData.title || !formData.description) {
      setError("Title and description are required");
      return;
    }

    if (formData.price_self <= 0 && formData.price_system <= 0) {
      setError("At least one token price must be greater than 0");
      return;
    }

    if (formData.availableSizes.length === 0) {
      setError("Please select at least one size");
      return;
    }

    if (!formData.image_url) {
      setError("Please upload a product image");
      return;
    }

    // Check if user is trying to create a product with no token requirement without Executive Pod
    if (!formData.required_token && !balances?.hasExecutivePod) {
      setError("Only Executive Pod holders can create products with no token requirement");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");
    setUploadError("");

    try {
      await createProduct(formData, address);
      setSuccess("Product created successfully!");
      
      // Refresh the products list
      await fetchProducts();
      
      // Reset form
      setFormData({
        title: "",
        description: "",
        price_self: 0,
        price_system: 0,
        quantity: 1,
        units_available: 1,
        image_url: "",
        is_free_shipping: false,
        required_token: "",
        availableSizes: [],
        style: "default",
        sku: 0,
      });

      // Close modal after a short delay
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 2000);
      
    } catch (error) {
      console.error('Failed to create product:', error);
      setError(error instanceof Error ? error.message : 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError("");
    setSuccess("");
    setUploadError("");
    onClose();
  };

  const handleImageUploadComplete = (imageUrl: string) => {
    setFormData(prev => ({ ...prev, image_url: imageUrl }));
    setUploadError("");
  };

  const handleImageUploadError = (error: string) => {
    setUploadError(error);
  };

  if (!isOpen) return null;

  return (
    <S.ModalOverlay onClick={handleClose}>
      <S.ModalContent onClick={(e) => e.stopPropagation()}>
        <S.ModalHeader>
          <S.ModalTitle>Add New Product</S.ModalTitle>
          <S.CloseButton onClick={handleClose}>&times;</S.CloseButton>
        </S.ModalHeader>

        <S.ModalBody>
          {error && <S.ErrorMessage>{error}</S.ErrorMessage>}
          {uploadError && <S.ErrorMessage>{uploadError}</S.ErrorMessage>}
          {success && <S.SuccessMessage>{success}</S.SuccessMessage>}

          <S.Form onSubmit={handleSubmit}>
            <S.FormGrid>
              <S.FormGroup>
                <S.Label htmlFor="title">Product Title *</S.Label>
                <S.Input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter product title"
                />
              </S.FormGroup>

              <S.FormGroup>
                <ImageUpload
                  onUploadComplete={handleImageUploadComplete}
                  onUploadError={handleImageUploadError}
                  productTitle={formData.title}
                  currentImageUrl={formData.image_url}
                  disabled={isSubmitting}
                />
              </S.FormGroup>
            </S.FormGrid>

            <S.FormGroup>
              <S.Label htmlFor="description">Description *</S.Label>
              <S.TextArea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                placeholder="Enter product description"
                rows={4}
              />
            </S.FormGroup>

            <S.FormGrid>
              <S.FormGroup>
                <S.Label htmlFor="price_self">$SELF Price</S.Label>
                <S.Input
                  type="number"
                  id="price_self"
                  name="price_self"
                  value={formData.price_self}
                  onChange={handleInputChange}
                  onFocus={(e) => e.target.select()}
                  min="0"
                  step="0.1"
                  placeholder="0.0"
                />
              </S.FormGroup>

              <S.FormGroup>
                <S.Label htmlFor="price_system">$SYSTEM Price</S.Label>
                <S.Input
                  type="number"
                  id="price_system"
                  name="price_system"
                  value={formData.price_system}
                  onChange={handleInputChange}
                  onFocus={(e) => e.target.select()}
                  min="0"
                  step="0.1"
                  placeholder="0.0"
                />
              </S.FormGroup>
            </S.FormGrid>

            <S.FormGrid>
              <S.FormGroup>
                <S.Label htmlFor="quantity">Quantity</S.Label>
                <S.Input
                  type="number"
                  id="quantity"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  min="1"
                  required
                />
              </S.FormGroup>

              <S.FormGroup>
                <S.Label htmlFor="units_available">Units Available</S.Label>
                <S.Input
                  type="number"
                  id="units_available"
                  name="units_available"
                  value={formData.units_available}
                  onChange={handleInputChange}
                  min="1"
                  required
                />
              </S.FormGroup>
            </S.FormGrid>

            <S.FormGroup>
              <S.Label htmlFor="required_token">Token Gating (Optional)</S.Label>
              <S.Select
                id="required_token"
                name="required_token"
                value={formData.required_token}
                onChange={handleInputChange}
              >
                {/* Only Executive Pod holders can create products with no token requirement */}
                {balances?.hasExecutivePod ? (
                  <option value="">No token required</option>
                ) : (
                  <option value="" disabled>No token required (Executive Pod holders only)</option>
                )}
                {tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.name} ({token.symbol})
                  </option>
                ))}
              </S.Select>
            </S.FormGroup>

            <S.FormGroup>
              <S.Label>Available Sizes *</S.Label>
              <S.SizeGrid>
                {availableSizesOptions.map((size) => (
                  <S.SizeOption key={size}>
                    <S.SizeCheckbox
                      type="checkbox"
                      id={`size-${size}`}
                      checked={formData.availableSizes.includes(size)}
                      onChange={() => handleSizeChange(size)}
                    />
                    <S.SizeLabel htmlFor={`size-${size}`}>{size}</S.SizeLabel>
                  </S.SizeOption>
                ))}
              </S.SizeGrid>
            </S.FormGroup>

            <S.FormGroup>
              <S.CheckboxWrapper>
                <S.Checkbox
                  type="checkbox"
                  id="is_free_shipping"
                  name="is_free_shipping"
                  checked={formData.is_free_shipping}
                  onChange={handleInputChange}
                />
                <S.CheckboxLabel htmlFor="is_free_shipping">
                  Free Shipping
                </S.CheckboxLabel>
              </S.CheckboxWrapper>
            </S.FormGroup>

            <S.ButtonGroup>
              <S.CancelButton type="button" onClick={handleClose}>
                Cancel
              </S.CancelButton>
              <S.SubmitButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Product"}
              </S.SubmitButton>
            </S.ButtonGroup>
          </S.Form>
        </S.ModalBody>
      </S.ModalContent>
    </S.ModalOverlay>
  );
};

export default AddProductModal;