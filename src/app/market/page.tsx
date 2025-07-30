// src/app/cart/page.tsx

"use client";

import { ThemeProvider } from "src/features/shopping-cart/commons/style/styled-components";
import { theme } from "src/features/shopping-cart/commons/style/theme";
import GlobalStyle from "src/features/shopping-cart/commons/style/global-style";
import { ProductsProvider } from "src/features/shopping-cart/contexts/products-context";
import { CartProvider } from "src/features/shopping-cart/contexts/cart-context";
import { CartErrorBoundary } from "src/components/ErrorBoundary/CartErrorBoundary";
import Marketplace from "src/features/shopping-cart/components/Marketplace/Marketplace";

export default function CartPage() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <CartErrorBoundary>
        <ProductsProvider>
          <CartProvider>
            <Marketplace />
          </CartProvider>
        </ProductsProvider>
      </CartErrorBoundary>
    </ThemeProvider>
  );
}
