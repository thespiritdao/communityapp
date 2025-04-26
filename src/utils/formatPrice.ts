const formatPrice = (price: number, currency: string) => {
  switch (currency) {
    case '$SYSTEM':
      return `${price.toFixed(2)} $SYSTEM`;
    case '$SELF':
      return `${price.toFixed(2)} $SELF`;
    default:
      return `${price.toFixed(2)} USD`;
  }
};

export default formatPrice;
