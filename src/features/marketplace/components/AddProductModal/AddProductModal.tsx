// src/features/marketplace/components/AddProductModal/AddProductModal.tsx
'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  createProduct,
  type ProductFormData,
} from '../../services/productService';
import { useProducts } from '@/features/shopping-cart/contexts/products-context';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useUserAuthorizedTokens } from '@/hooks/useUserAuthorizedTokens';
import { useMarketplaceManagementAccess } from '../../hooks/useMarketplaceManagementAccess';
import { Loader2, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import ImageUpload from '../ImageUpload';
import {
  PodTreasurySelector,
  type FundDestination,
} from '../PodTreasurySelector';
import * as S from './AddProductModal.style';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const availableSizesOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { address } = useAccount();
  const { fetchProducts } = useProducts();
  const { balances } = useTokenBalances();
  const {
    tokens: authorizedTokens,
    isLoading: tokensLoading,
    error: tokensError,
  } = useUserAuthorizedTokens();
  const { managedPods, isLoading: podsLoading } =
    useMarketplaceManagementAccess();

  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    price_self: 0,
    price_system: 0,
    quantity: 1,
    units_available: 1,
    image_url: '',
    is_free_shipping: false,
    required_token: '',
    availableSizes: ['One Size'], // Default to "One Size" checked
    style: 'default',
    sku: 0,
  });

  const [fundDestination, setFundDestination] = useState<FundDestination>();
  const [selectedPodId, setSelectedPodId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');

  // Auto-select first managed pod
  useEffect(() => {
    if (managedPods.length > 0 && !selectedPodId) {
      setSelectedPodId(managedPods[0].id);
    }
  }, [managedPods, selectedPodId]);

  // Set error from token loading
  useEffect(() => {
    if (tokensError) {
      setError(`Token loading error: ${tokensError}`);
    }
  }, [tokensError]);

  // Debug logging for dropdown behavior
  // useEffect(() => {
  //   console.log('🎫 AddProductModal token state:', {
  //     tokensLoading,
  //     authorizedTokens: authorizedTokens.length,
  //     tokensError,
  //     balances: !!balances,
  //     hasExecutivePod: balances?.hasExecutivePod
  //   });
  // }, [tokensLoading, authorizedTokens.length, tokensError, balances]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      const parsedValue = Number.parseFloat(value) || 0;
      console.log(`Price input debug: ${name} = "${value}" -> ${parsedValue}`);
      setFormData((prev) => ({ ...prev, [name]: parsedValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSizeChange = (size: string) => {
    setFormData((prev) => ({
      ...prev,
      availableSizes: prev.availableSizes.includes(size)
        ? prev.availableSizes.filter((s) => s !== size)
        : [...prev.availableSizes, size],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      setError('Wallet not connected');
      return;
    }

    // Validation
    if (!formData.title || !formData.description) {
      setError('Title and description are required');
      return;
    }

    if (formData.price_self <= 0 && formData.price_system <= 0) {
      setError('At least one token price must be greater than 0');
      return;
    }

    if (formData.availableSizes.length === 0) {
      setError('Please select at least one size');
      return;
    }

    if (!formData.image_url) {
      setError('Please upload a product image');
      return;
    }

    if (!fundDestination) {
      setError('Please select a fund destination');
      return;
    }

    if (!selectedPodId) {
      setError('Please select a pod');
      return;
    }

    // Check if user is trying to create a product with no token requirement without Executive Pod
    if (
      !formData.required_token &&
      !(balances && balances.hasExecutivePod === true)
    ) {
      setError(
        'Only Executive Pod holders can create products with no token requirement',
      );
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');
    setUploadError('');

    try {
      await createProduct(formData, address, fundDestination, selectedPodId);
      setSuccess('Product created successfully!');

      // Refresh the products list
      await fetchProducts();

      // Reset form
      setFormData({
        title: '',
        description: '',
        price_self: 0,
        price_system: 0,
        quantity: 1,
        units_available: 1,
        image_url: '',
        is_free_shipping: false,
        required_token: '',
        availableSizes: ['One Size'], // Default to "One Size" checked
        style: 'default',
        sku: 0,
      });
      setFundDestination(undefined);

      // Close modal after a short delay
      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 2000);
    } catch (error) {
      console.error('Failed to create product:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to create product',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setSuccess('');
    setUploadError('');
    onClose();
  };

  const handleImageUploadComplete = (imageUrl: string) => {
    setFormData((prev) => ({ ...prev, image_url: imageUrl }));
    setUploadError('');
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
          <S.Form onSubmit={handleSubmit}>
            {/* Pod Selection */}
            {podsLoading ? (
              <S.FormGroup>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: '#666',
                    padding: '0.75rem',
                    background: '#f5f5f5',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading pods and
                  verifying permissions...
                </p>
              </S.FormGroup>
            ) : managedPods.length === 0 ? (
              <S.FormGroup>
                <div
                  style={{
                    padding: '1rem',
                    background: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '0.375rem',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 0.5rem 0',
                      color: '#856404',
                      fontWeight: 600,
                    }}
                  >
                    No Pods Available for Product Creation
                  </h4>
                  <p
                    style={{
                      margin: '0 0 0.5rem 0',
                      fontSize: '0.875rem',
                      color: '#856404',
                    }}
                  >
                    To create products in a pod, you need:
                  </p>
                  <ul
                    style={{
                      margin: '0 0 0 1.5rem',
                      fontSize: '0.875rem',
                      color: '#856404',
                    }}
                  >
                    <li>
                      <strong>Marketplace Module ON</strong> (pod-wide setting)
                    </li>
                    <li>
                      <strong>Marketplace Access Permission</strong> (your role
                      in the pod)
                    </li>
                  </ul>
                  <p
                    style={{
                      margin: '0.5rem 0 0 0',
                      fontSize: '0.875rem',
                      color: '#856404',
                    }}
                  >
                    Contact your pod administrators to enable the marketplace
                    module or grant you marketplace access permissions.
                  </p>
                </div>
              </S.FormGroup>
            ) : (
              <S.FormGroup>
                <S.Label htmlFor="pod_select">Pod Context *</S.Label>
                <S.Select
                  id="pod_select"
                  value={selectedPodId}
                  onChange={(e) => setSelectedPodId(e.target.value)}
                  required={true}
                >
                  <option value="">Select a pod...</option>
                  {managedPods.map((pod) => (
                    <option key={pod.id} value={pod.id}>
                      {pod.name}
                    </option>
                  ))}
                </S.Select>
                {selectedPodId && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#3F7A5A',
                    }}
                  >
                    <p
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <CheckCircle className="w-3 h-3" /> Pod selected:{' '}
                      {managedPods.find((p) => p.id === selectedPodId)?.name}
                    </p>
                    <p
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <CheckCircle className="w-3 h-3" /> Marketplace Module: ON
                    </p>
                    <p
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <CheckCircle className="w-3 h-3" /> Marketplace Access
                      Permission: Granted
                    </p>
                  </div>
                )}
              </S.FormGroup>
            )}

            <S.FormGrid>
              <S.FormGroup>
                <S.Label htmlFor="title">Product Title *</S.Label>
                <S.Input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required={true}
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
                required={true}
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
                  step="0.0001"
                  placeholder="0.0000"
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
                  step="0.0001"
                  placeholder="0.0000"
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
                  required={true}
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
                  required={true}
                />
              </S.FormGroup>
            </S.FormGrid>

            <S.FormGroup>
              <S.Label htmlFor="required_token">
                Token Gating (Optional)
              </S.Label>

              {/* Status information */}
              {tokensLoading && (
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: '#666',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Search className="w-4 h-4" /> Checking your pod memberships
                  and available tokens...
                </p>
              )}

              {!tokensLoading && tokensError && (
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: '#d32f2f',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertTriangle className="w-4 h-4" /> Error loading tokens:{' '}
                  {tokensError}
                </p>
              )}

              {!tokensLoading &&
                !tokensError &&
                authorizedTokens.length === 0 && (
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: '#ed6c02',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertTriangle className="w-4 h-4" /> No tokens available
                    for gating. You need pod membership with marketplace access.
                  </p>
                )}

              <S.Select
                id="required_token"
                name="required_token"
                value={formData.required_token}
                onChange={handleInputChange}
                disabled={tokensLoading}
              >
                {/* Only Executive Pod holders can create products with no token requirement */}
                {balances && balances.hasExecutivePod === true ? (
                  <option value="">No token required (open to everyone)</option>
                ) : (
                  <option value="" disabled={true}>
                    No token required (Executive Pod only)
                  </option>
                )}

                {tokensLoading ? (
                  <option disabled={true}>
                    Loading your available tokens...
                  </option>
                ) : tokensError ? (
                  <option disabled={true}>
                    Error loading tokens - please refresh the page
                  </option>
                ) : authorizedTokens.length === 0 ? (
                  <option disabled={true}>
                    No tokens available - you need pod membership
                  </option>
                ) : (
                  authorizedTokens.map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.name}{' '}
                      {token.symbol ? `(${token.symbol})` : ''}
                    </option>
                  ))
                )}
              </S.Select>

              {/* Debug info for development */}
              {process.env.NODE_ENV === 'development' && !tokensLoading && (
                <details
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.75rem',
                    color: '#666',
                  }}
                >
                  <summary>Debug Info (dev only)</summary>
                  <pre style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>
                    {JSON.stringify(
                      {
                        tokensLoading,
                        tokensError,
                        authorizedTokensCount: authorizedTokens.length,
                        hasExecutivePod: balances?.hasExecutivePod,
                        baseTokens: authorizedTokens
                          .filter((t) => !t.role_name)
                          .map((t) => ({ id: t.id, name: t.name })),
                        podRoleOptions: authorizedTokens
                          .filter((t) => !!t.role_name)
                          .map((t) => ({
                            id: t.id,
                            displayName: t.name,
                          })),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
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

            <PodTreasurySelector
              value={fundDestination?.value}
              onValueChange={setFundDestination}
            />

            <S.ButtonGroup>
              <S.CancelButton type="button" onClick={handleClose}>
                Cancel
              </S.CancelButton>
              <S.SubmitButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Product'}
              </S.SubmitButton>
            </S.ButtonGroup>

            {/* Error messages below the buttons */}
            {error && <S.ErrorMessage>{error}</S.ErrorMessage>}
            {uploadError && <S.ErrorMessage>{uploadError}</S.ErrorMessage>}
            {success && <S.SuccessMessage>{success}</S.SuccessMessage>}
          </S.Form>
        </S.ModalBody>
      </S.ModalContent>
    </S.ModalOverlay>
  );
};

export default AddProductModal;
