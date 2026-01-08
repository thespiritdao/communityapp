// src/features/marketplace/components/ProductManagement/ProductManagement.tsx
'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import {
  getUserManagedProducts,
  updateProduct,
  deleteProduct,
  canUserManageProduct,
} from '../../services/productService';
import ImageUpload from '../ImageUpload/ImageUpload';
import type { IProduct } from '@/features/shopping-cart/models';
import type { ProductFormData } from '../../services/productService';
import { useUserAuthorizedTokens } from '@/hooks/useUserAuthorizedTokens';
import { createProduct } from '../../services/productService';
import { useProducts } from '@/features/shopping-cart/contexts/products-context';
import {
  resolveTokenDisplayName,
  type TokenDisplayInfo,
} from '@/utils/tokenDisplayUtils';
import {
  PodTreasurySelector,
  type FundDestination,
} from '../PodTreasurySelector';
import * as S from './ProductManagement.style';

interface ProductManagementProps {
  onClose: () => void;
  productId?: string; // If provided, edit specific product
}

export const ProductManagement: React.FC<ProductManagementProps> = ({
  onClose,
  productId,
}) => {
  const { currentUser } = useCurrentUser();
  const { fetchProducts } = useProducts();

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;
  const [managedProducts, setManagedProducts] = useState<IProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<IProduct | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [fundDestination, setFundDestination] = useState<FundDestination>();

  const {
    tokens: authorizedTokens,
    isLoading: tokensLoading,
    error: tokensError,
  } = useUserAuthorizedTokens();

  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    price_self: 1,
    price_system: 1.0,
    quantity: 1,
    units_available: 1,
    image_url: '',
    is_free_shipping: false,
    required_token: '',
    availableSizes: ['One Size'],
    style: 'default',
  });

  // Load managed products on mount
  useEffect(() => {
    const loadManagedProducts = async () => {
      if (!address) return;

      try {
        setIsLoading(true);
        const products = await getUserManagedProducts(address);
        setManagedProducts(products);

        // If productId provided, select that product for editing
        if (productId) {
          const product = products.find((p) => p.id.toString() === productId);
          if (product) {
            setSelectedProduct(product);
            populateFormWithProduct(product);
            setIsEditing(true);
          }
        }
      } catch (error) {
        console.error('Error loading managed products:', error);
        setError('Failed to load your products');
      } finally {
        setIsLoading(false);
      }
    };

    loadManagedProducts();
  }, [address, productId]);

  const populateFormWithProduct = (product: IProduct) => {
    setFormData({
      title: product.title || product.name || '',
      description: product.description || '',
      price_self: product.price_self ?? 1, // Use nullish coalescing to preserve 0 values
      price_system: product.price_system ?? 1, // Use nullish coalescing to preserve 0 values
      quantity: product.quantity || 1,
      units_available: product.units_available || 1,
      image_url: product.image_url || '',
      is_free_shipping: product.isFreeShipping || false,
      required_token: product.required_token || '',
      availableSizes: product.availableSizes || ['One Size'],
      style: product.style || 'default',
      sku: product.sku,
    });

    // Set fund destination from product data
    if (product.fund_destination_type) {
      // Migration: Convert legacy 'burn' to 'wallet'
      const migratedType =
        product.fund_destination_type === 'burn'
          ? 'wallet'
          : product.fund_destination_type;

      setFundDestination({
        type: migratedType as 'wallet' | 'pod_treasury',
        label: getFundDestinationLabel(
          migratedType,
          product.destination_address || undefined,
          product.pod_id || undefined,
        ),
        value: getFundDestinationValue(migratedType, product.pod_id || undefined),
        podId: product.pod_id || undefined,
        treasuryAddress: product.destination_address || undefined,
        description: getFundDestinationDescription(migratedType),
      });
    } else {
      // Default to wallet for existing products without fund destination
      setFundDestination({
        type: 'wallet',
        label: 'My Wallet',
        value: 'my_wallet',
        description: 'Route funds directly to your personal wallet',
      });
    }
  };

  // Helper functions for fund destination mapping
  const getFundDestinationLabel = (
    type: string,
    address?: string,
    podId?: string,
  ) => {
    switch (type) {
      case 'wallet':
        return 'My Wallet';
      case 'pod_treasury':
        return podId ? `Pod Treasury (${podId})` : 'Pod Treasury';
      default:
        return 'My Wallet'; // Fallback to wallet
    }
  };

  const getFundDestinationValue = (type: string, podId?: string) => {
    switch (type) {
      case 'wallet':
        return 'my_wallet';
      case 'pod_treasury':
        return podId ? `pod_${podId}` : 'pod_treasury';
      default:
        return 'my_wallet'; // Fallback to wallet
    }
  };

  const getFundDestinationDescription = (type: string) => {
    switch (type) {
      case 'wallet':
        return 'Route funds directly to your personal wallet';
      case 'pod_treasury':
        return 'Route funds to pod treasury for pod operations';
      default:
        return 'Route funds directly to your personal wallet'; // Fallback to wallet
    }
  };

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
      // Allow empty string for better UX, only convert to number when not empty
      const numValue = value === '' ? '' : Number.parseFloat(value);
      // Only set to 0 if the parsed value is actually 0, not if it's NaN from empty string
      const finalValue =
        value === '' ? '' : isNaN(numValue as number) ? 0 : numValue;
      setFormData((prev) => ({ ...prev, [name]: finalValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSizeChange = (size: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      availableSizes: checked
        ? [...prev.availableSizes, size]
        : prev.availableSizes.filter((s) => s !== size),
    }));
  };

  const handleImageUploadComplete = (imageUrl: string) => {
    setFormData((prev) => ({ ...prev, image_url: imageUrl }));
  };

  const handleImageUploadError = (error: string) => {
    setError(`Image upload failed: ${error}`);
  };

  const handleEditProduct = (product: IProduct) => {
    setSelectedProduct(product);
    populateFormWithProduct(product);
    setIsEditing(true);
    setIsAdding(false);
    setError('');
    setSuccessMessage('');
  };

  const handleAddProduct = () => {
    setSelectedProduct(null);
    setFormData({
      title: '',
      description: '',
      price_self: 1,
      price_system: 1.0,
      quantity: 1,
      units_available: 1,
      image_url: '',
      is_free_shipping: false,
      required_token: '',
      availableSizes: ['One Size'],
      style: 'default',
    });
    setFundDestination(undefined); // Clear fund destination for new products
    setIsEditing(false);
    setIsAdding(true);
    setError('');
    setSuccessMessage('');
  };

  const handleSaveProduct = async () => {
    if (!address) return;

    try {
      setIsSubmitting(true);
      setError('');

      // Validate required fields
      if (!formData.title.trim()) {
        setError('Product title is required');
        return;
      }

      if (!fundDestination) {
        setError('Please select a fund destination');
        return;
      }

      // Sanitize numeric fields - handle empty strings and invalid values
      const sanitizeNumber = (value: any, fallback = 0): number => {
        if (value === '' || value === null || value === undefined)
          return fallback;
        const num = Number(value);
        return isNaN(num) ? fallback : num;
      };

      const sanitizedFormData = {
        ...formData,
        price_self: sanitizeNumber(formData.price_self, 0),
        price_system: sanitizeNumber(formData.price_system, 0),
        quantity: sanitizeNumber(formData.quantity, 1),
        units_available: sanitizeNumber(formData.units_available, 1),
      };

      console.log('🔍 Form sanitization debug:', {
        original: {
          price_self: formData.price_self,
          price_system: formData.price_system,
          types: {
            price_self: typeof formData.price_self,
            price_system: typeof formData.price_system,
          },
        },
        sanitized: {
          price_self: sanitizedFormData.price_self,
          price_system: sanitizedFormData.price_system,
        },
      });

      if (isAdding) {
        // Creating new product
        await createProduct(sanitizedFormData, address, fundDestination);
        setSuccessMessage('Product created successfully!');
        setIsAdding(false);

        // Refresh products context and local list
        await fetchProducts();
        const updatedProducts = await getUserManagedProducts(address);
        setManagedProducts(updatedProducts);
      } else if (selectedProduct) {
        // Updating existing product
        // Check permission to manage this product
        const canManage = await canUserManageProduct(
          selectedProduct.id.toString(),
          address,
        );
        if (!canManage) {
          setError('You do not have permission to edit this product');
          return;
        }

        await updateProduct(
          selectedProduct.id.toString(),
          sanitizedFormData,
          address || '',
          fundDestination,
        );
        setSuccessMessage('Product updated successfully!');
        setIsEditing(false);

        // Refresh the products list
        const updatedProducts = await getUserManagedProducts(address);
        setManagedProducts(updatedProducts);

        // Update selected product
        const updatedProduct = updatedProducts.find(
          (p) => p.id === selectedProduct.id,
        );
        if (updatedProduct) {
          setSelectedProduct(updatedProduct);
        }
      }
    } catch (error) {
      console.error('Error saving product:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to save product',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product: IProduct) => {
    if (!address) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${product.title || product.name}"? This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      setIsSubmitting(true);
      setError('');

      // Check permission to manage this product
      const canManage = await canUserManageProduct(
        product.id.toString(),
        address,
      );
      if (!canManage) {
        setError('You do not have permission to delete this product');
        return;
      }

      await deleteProduct(product.id.toString());

      setSuccessMessage('Product deleted successfully!');

      // Refresh the products list
      const updatedProducts = await getUserManagedProducts(address);
      setManagedProducts(updatedProducts);

      // Clear selected product if it was deleted
      if (selectedProduct?.id === product.id) {
        setSelectedProduct(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to delete product',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const sizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

  // Component to display token name properly in management interface
  const TokenDisplayBadge: React.FC<{ tokenId?: string }> = ({ tokenId }) => {
    const [displayInfo, setDisplayInfo] = useState<TokenDisplayInfo | null>(
      null,
    );
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const resolveToken = async () => {
        if (!tokenId || tokenId === '') {
          setDisplayInfo({
            id: '',
            displayName: 'Open to Everyone',
            type: 'system',
          });
          setLoading(false);
          return;
        }

        try {
          const info = await resolveTokenDisplayName(tokenId);
          setDisplayInfo(info);
        } catch (error) {
          console.error('Error resolving token display name:', error);
          setDisplayInfo({
            id: tokenId,
            displayName: `${tokenId} (Unknown)`,
            type: 'token',
          });
        } finally {
          setLoading(false);
        }
      };

      resolveToken();
    }, [tokenId]);

    if (loading) {
      return <S.TokenBadge>🔄 Loading...</S.TokenBadge>;
    }

    if (!displayInfo) {
      return null;
    }

    const isOpen = displayInfo.type === 'system' && displayInfo.id === '';
    return (
      <S.TokenBadge
        style={{
          color: isOpen ? '#28a745' : '#6c757d',
          fontWeight: isOpen ? 'bold' : 'normal',
        }}
      >
        {isOpen ? '🌐' : '🔒'} {displayInfo.displayName}
      </S.TokenBadge>
    );
  };

  if (isLoading) {
    return (
      <S.Container>
        <S.ModalContent>
          <S.Header>
            <S.Title>Manage Products</S.Title>
            <S.CloseButton onClick={onClose}>×</S.CloseButton>
          </S.Header>
          <S.LoadingMessage>Loading your products...</S.LoadingMessage>
        </S.ModalContent>
      </S.Container>
    );
  }

  return (
    <S.Container>
      <S.ModalContent>
        <S.Header>
          <S.Title>Manage Products</S.Title>
          <S.CloseButton onClick={onClose}>×</S.CloseButton>
        </S.Header>

        {error && <S.ErrorMessage>{error}</S.ErrorMessage>}
        {successMessage && (
          <S.SuccessMessage>{successMessage}</S.SuccessMessage>
        )}

        <S.Content>
          {/* Product List - Always Visible */}
          <S.ProductsList>
            <S.SectionTitle>
              Your Products ({managedProducts.length})
            </S.SectionTitle>

            <S.AddProductButton onClick={handleAddProduct}>
              + Add New Product
            </S.AddProductButton>

            {managedProducts.length === 0 ? (
              <S.EmptyState>
                You haven't created any products yet. Use the + button to create
                your first product.
              </S.EmptyState>
            ) : (
              managedProducts.map((product) => (
                <S.ProductItem
                  key={product.id}
                  $isSelected={selectedProduct?.id === product.id}
                >
                  <S.ProductImage
                    src={product.image_url || '/placeholder-product.png'}
                    alt={product.title || product.name}
                  />
                  <S.ProductDetails>
                    <S.ProductName>
                      {product.title || product.name}
                    </S.ProductName>
                    <S.ProductMeta>
                      ${product.price_system} • {product.units_available}{' '}
                      available
                      <TokenDisplayBadge tokenId={product.required_token || undefined} />
                    </S.ProductMeta>
                  </S.ProductDetails>
                  <S.ProductActions>
                    <S.ActionButton
                      onClick={() => handleEditProduct(product)}
                      disabled={isSubmitting}
                    >
                      Edit
                    </S.ActionButton>
                    <S.DeleteButton
                      onClick={() => handleDeleteProduct(product)}
                      disabled={isSubmitting}
                    >
                      Delete
                    </S.DeleteButton>
                  </S.ProductActions>
                </S.ProductItem>
              ))
            )}
          </S.ProductsList>
        </S.Content>

        {/* Product Form Modal - Overlay */}
        {(isEditing || isAdding) && (
          <S.FormModalOverlay
            onClick={() => {
              setIsEditing(false);
              setIsAdding(false);
              setSelectedProduct(null);
            }}
          >
            <S.FormModal onClick={(e) => e.stopPropagation()}>
              <S.FormHeader>
                <S.FormTitle>
                  {isAdding ? 'Add New Product' : 'Edit Product'}
                </S.FormTitle>
                <S.FormCloseButton
                  onClick={() => {
                    setIsEditing(false);
                    setIsAdding(false);
                    setSelectedProduct(null);
                  }}
                >
                  ×
                </S.FormCloseButton>
              </S.FormHeader>

              <S.FormContent>
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
                    />
                  </S.FormGroup>
                </S.FormGrid>

                <S.FormGroup>
                  <S.Label htmlFor="required_token">
                    Token Gating (Optional)
                  </S.Label>
                  <S.Select
                    id="required_token"
                    name="required_token"
                    value={formData.required_token}
                    onChange={handleInputChange}
                    disabled={tokensLoading}
                  >
                    <option value="">
                      No token required (open to everyone)
                    </option>
                    {tokensLoading ? (
                      <option disabled={true}>
                        Loading available tokens...
                      </option>
                    ) : tokensError ? (
                      <option disabled={true}>Error loading tokens</option>
                    ) : authorizedTokens.length === 0 ? (
                      <option disabled={true}>No tokens available</option>
                    ) : (
                      authorizedTokens.map((token) => (
                        <option key={token.id} value={token.id}>
                          {token.name}{' '}
                          {token.symbol ? `(${token.symbol})` : ''}
                        </option>
                      ))
                    )}
                  </S.Select>
                </S.FormGroup>

                <S.FormGroup>
                  <S.Label>Available Sizes</S.Label>
                  <S.SizeGrid>
                    {sizeOptions.map((size) => (
                      <S.SizeOption key={size}>
                        <S.SizeCheckbox
                          type="checkbox"
                          id={`size-${size}`}
                          checked={formData.availableSizes.includes(size)}
                          onChange={(e) =>
                            handleSizeChange(size, e.target.checked)
                          }
                        />
                        <S.SizeLabel htmlFor={`size-${size}`}>
                          {size}
                        </S.SizeLabel>
                      </S.SizeOption>
                    ))}
                  </S.SizeGrid>
                </S.FormGroup>

                <S.FormGroup>
                  <S.CheckboxGroup>
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
                  </S.CheckboxGroup>
                </S.FormGroup>

                {/* Fund Destination Selector */}
                <S.FormGroup>
                  <PodTreasurySelector
                    value={fundDestination?.value}
                    onValueChange={setFundDestination}
                  />
                </S.FormGroup>

                <S.FormActions>
                  <S.CancelButton
                    onClick={() => {
                      setIsEditing(false);
                      setIsAdding(false);
                      setSelectedProduct(null);
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </S.CancelButton>
                  <S.SaveButton
                    onClick={handleSaveProduct}
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? isAdding
                        ? 'Creating...'
                        : 'Saving...'
                      : isAdding
                        ? 'Create Product'
                        : 'Save Changes'}
                  </S.SaveButton>
                </S.FormActions>
              </S.FormContent>
            </S.FormModal>
          </S.FormModalOverlay>
        )}
      </S.ModalContent>
    </S.Container>
  );
};
