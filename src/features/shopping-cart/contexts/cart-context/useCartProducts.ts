//src/features/shopping-cart/contexts/cart-context/useCartProducts.ts

import { useCartContext } from './CartContextProvider';
import useCartTotal from './useCartTotal';
import { ICartProduct } from 'models';

const useCartProducts = () => {
  const { products, setProducts } = useCartContext();
  const { updateCartTotal } = useCartTotal();

  // Ensure that quantities are handled as numbers.
  const updateQuantitySafely = (
    currentProduct: ICartProduct,
    targetProduct: ICartProduct,
    quantityChange: number
  ): ICartProduct => {
    if (currentProduct.id === targetProduct.id) {
      // Convert current quantity to a number in case it is a string.
      const currentQty =
        typeof currentProduct.quantity === "number"
          ? currentProduct.quantity
          : parseInt(currentProduct.quantity, 10) || 0;
      return {
        ...currentProduct,
        quantity: currentQty + quantityChange,
      };
    } else {
      return currentProduct;
    }
  };

	const addProduct = (newProduct: ICartProduct) => {
	  let updatedProducts;
	  const isProductAlreadyInCart = products.some(
		(product: ICartProduct) => newProduct.id === product.id
	  );

	  if (isProductAlreadyInCart) {
		updatedProducts = products.map((product: ICartProduct) => {
		  return updateQuantitySafely(product, newProduct, Number(newProduct.quantity) || 1);
		});
	  } else {
		// If quantity is missing, default to 1
		const productWithQuantity = { ...newProduct, quantity: newProduct.quantity || 1 };
		updatedProducts = [...products, productWithQuantity];
	  }

	  setProducts(updatedProducts);
	  updateCartTotal(updatedProducts);
	};


  const removeProduct = (productToRemove: ICartProduct) => {
    const updatedProducts = products.filter(
      (product: ICartProduct) => product.id !== productToRemove.id
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
