// src/features/shopping-cart/commons/style/styled-components.ts

import styled, {
  css,
  createGlobalStyle,
  keyframes,
  ThemeProvider as StyledThemeProvider,
} from 'styled-components';

import type { StyleClosetTheme } from './theme';

// Re-export with proper typing
export { css, createGlobalStyle, keyframes };
export const ThemeProvider = StyledThemeProvider;
export default styled;
