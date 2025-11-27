// src/app/cart/page.tsx

"use client";

import { ThemeProvider } from "@/features/shopping-cart/commons/style/styled-components";
import { theme } from "@/features/shopping-cart/commons/style/theme";
import GlobalStyle from "@/features/shopping-cart/commons/style/global-style";
import { ProductsProvider } from "@/features/shopping-cart/contexts/products-context";
import { CartProvider } from "@/features/shopping-cart/contexts/cart-context";
import { CartErrorBoundary } from "@/components/ErrorBoundary/CartErrorBoundary";
import Marketplace from "@/features/shopping-cart/components/Marketplace/Marketplace";

export default function CartPage() {
  return (
    <div className="bottom-nav-spacing">
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
    </div>
  );
}
