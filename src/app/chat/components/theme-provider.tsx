//src/app/chat/components/theme-provider.tsx

"use client";

import React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({
  children,
  defaultTheme = "system",
  attribute = "class",
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      defaultTheme={defaultTheme}
      attribute={attribute}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
