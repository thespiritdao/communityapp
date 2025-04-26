// src/features/shopping-cart/utils/formatPrice.ts
import { parseUnits } from "ethers";
export default function formatPrice(price: any, currency: string): string {
  let numPrice: number;
  try {
    numPrice = parseFloat(price.toString());
  } catch (e) {
    numPrice = 0;
  }
  if (isNaN(numPrice)) {
    numPrice = 0;
  }
  return numPrice.toFixed(2);
}
