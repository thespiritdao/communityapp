// src/features/shopping-cart/commons/style/styled-components.ts

import styled, {
  css,
  createGlobalStyle,
  keyframes,
  ThemeProvider as StyledThemeProvider,
  type ThemedStyledComponentsModule,
} from 'styled-components';

import type { StyleClosetTheme } from './theme';

// Type the styled function with our theme
const typedStyled =
  styled as unknown as ThemedStyledComponentsModule<StyleClosetTheme>['default'];

// Re-export with proper typing
export { css, createGlobalStyle, keyframes };
export const ThemeProvider = StyledThemeProvider;
export default typedStyled;
