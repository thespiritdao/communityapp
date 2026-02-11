const formatPrice = (price: number, currency: string) => {
  // ✅ FIX: Handle undefined/null price values
  if (price === undefined || price === null || isNaN(price)) {
    console.warn('formatPrice received invalid price:', price, 'defaulting to 0');
    price = 0;
  }

  switch (currency) {
    case '$SYSTEM':
      return `${price.toFixed(4)} $SYSTEM`;
    case '$SELF':
      return `${price.toFixed(4)} $SELF`;
    default:
      return `${price.toFixed(2)} USD`;
  }
};

export default formatPrice;
