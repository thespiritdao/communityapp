//src/features/shopping-cart/contexts/cart-context/useCartProducts.ts

import { useCartContext } from './CartContextProvider';
import useCartTotal from './useCartTotal';
import type { ICartProduct } from '../../models';
import { canUserAccessProductAsync } from '../../services/accessControl';
import { getUserIdentity } from '@/utils/accessControlUtils';
import { useEvmAddress } from '@coinbase/cdp-hooks';

const useCartProducts = () => {
  const { products, setProducts } = useCartContext();
  const { updateCartTotal } = useCartTotal();
  const { evmAddress: address } = useEvmAddress();

  // Ensure that quantities are handled as numbers.
  const updateQuantitySafely = (
    currentProduct: ICartProduct,
    targetProduct: ICartProduct,
    quantityChange: number,
  ): ICartProduct => {
    if (currentProduct.id === targetProduct.id) {
      // Convert current quantity to a number in case it is a string.
      const currentQty =
        typeof currentProduct.quantity === 'number'
          ? currentProduct.quantity
          : Number.parseInt(currentProduct.quantity, 10) || 0;
      return {
        ...currentProduct,
        quantity: currentQty + quantityChange,
      };
    } else {
      return currentProduct;
    }
  };

  const addProduct = async (newProduct: ICartProduct) => {
    // ✅ SECURITY FIX: Validate token-gating before adding to cart
    // This prevents bypassing client-side UI restrictions via console/state manipulation
    if (newProduct.required_token || newProduct.requiredToken) {
      if (!address) {
        console.warn('🛒 Cannot add token-gated product: User not connected');
        return; // Silent fail - user needs to connect wallet
      }

      try {
        // Get user identity and check product access
        const userIdentity = await getUserIdentity(address);
        const hasAccess = await canUserAccessProductAsync(newProduct, userIdentity);

        if (!hasAccess) {
          console.error('🛒 SECURITY: Blocked unauthorized cart addition', {
            productId: newProduct.id,
            productName: newProduct.name,
            requiredToken: newProduct.required_token || newProduct.requiredToken,
            userAddress: address,
          });
          // TODO: Show toast notification to user
          alert('You do not have the required token to add this product to your cart.');
          return;
        }

        console.log('✅ Token-gating validated for cart addition:', newProduct.name);
      } catch (error) {
        console.error('🛒 Error validating product access:', error);
        alert('Error validating product access. Please try again.');
        return;
      }
    }

    // Original cart logic - access validated
    let updatedProducts;
    const isProductAlreadyInCart = products.some(
      (product: ICartProduct) => newProduct.id === product.id,
    );

    if (isProductAlreadyInCart) {
      updatedProducts = products.map((product: ICartProduct) => {
        return updateQuantitySafely(
          product,
          newProduct,
          Number(newProduct.quantity) || 1,
        );
      });
    } else {
      // If quantity is missing, default to 1
      const productWithQuantity = {
        ...newProduct,
        quantity: newProduct.quantity || 1,
      };
      updatedProducts = [...products, productWithQuantity];
    }

    setProducts(updatedProducts);
    updateCartTotal(updatedProducts);
  };

  const removeProduct = (productToRemove: ICartProduct) => {
    const updatedProducts = products.filter(
      (product: ICartProduct) => product.id !== productToRemove.id,
    );
    setProducts(updatedProducts);
    updateCartTotal(updatedProducts);
  };

  const increaseProductQuantity = (productToIncrease: ICartProduct) => {
    const updatedProducts = products.map((product: ICartProduct) => {
      return updateQuantitySafely(product, productToIncrease, 1);
    });
    setProducts(updatedProducts);
    updateCartTotal(updatedProducts);
  };

  const decreaseProductQuantity = (productToDecrease: ICartProduct) => {
    const updatedProducts = products.map((product: ICartProduct) => {
      return updateQuantitySafely(product, productToDecrease, -1);
    });
    setProducts(updatedProducts);
    updateCartTotal(updatedProducts);
  };

  const clearCart = () => {
    setProducts([]);
    updateCartTotal([]);
  };

  return {
    products,
    addProduct,
    removeProduct,
    increaseProductQuantity,
    decreaseProductQuantity,
    clearCart,
  };
};

export default useCartProducts;
