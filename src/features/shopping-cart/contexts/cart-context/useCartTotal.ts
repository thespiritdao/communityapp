// src/features/shopping-cart/contexts/cart-context/useCartTotal.ts
import { useCartContext } from './CartContextProvider';
import { ICartProduct } from 'models';

const useCartTotal = () => {
  const { total, setTotal } = useCartContext();

  const updateCartTotal = (products: ICartProduct[]) => {
    // Calculate total quantity
    const productQuantity = products.reduce((sum: number, product: ICartProduct) => {
      return sum + Number(product.quantity || 0);
    }, 0);

    // Calculate total for $SYSTEM using product.price_system
	const totalSystemPrice = products.reduce((sum, product) => {
	  const price = Number(product.price_system || 0);
	  const quantity = Number(product.quantity || 0);
	  return sum + price * quantity;
	}, 0);


    // Calculate total for $SELF using product.price_self
    const totalSelfPrice = products.reduce((sum: number, product: ICartProduct) => {
      const price = Number(product.price_self || 0);
      const quantity = Number(product.quantity || 0);
      return sum + price * quantity;
    }, 0);

    const installments = products.reduce((greater: number, product: ICartProduct) => {
      return product.installments > greater ? product.installments : greater;
    }, 0);

    const newTotal = {
      productQuantity,
      installments,
      totalSystemPrice,
      totalSelfPrice,
      currencyId: 'USD',
      currencyFormat: '$',
    };

    console.log("updateCartTotal:", newTotal);
    setTotal(newTotal);
  };

  return {
    total,
    updateCartTotal,
  };
};

export default useCartTotal;
