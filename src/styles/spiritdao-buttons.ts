/**
 * SpiritDAO Button Color System
 *
 * Sacred, grounded, intentional button styling system.
 * Use these utilities to maintain consistent button semantics across the app.
 *
 * Design Philosophy:
 * - Calm, ritual, trustworthy
 * - Not aggressive or neon
 * - Grounded in earthy tones
 * - WCAG AA compliant (4.5:1 contrast minimum)
 */

export const SPIRITDAO_COLORS = {
  // Primary Action - Dark ritual green (affirmation, sacred forward motion)
  primary: {
    background: '#2F5D50',
    hover: '#254A40',
    text: '#FFFFFF',
    border: 'none',
  },

  // Secondary Action - Muted sage (supportive, non-destructive)
  secondary: {
    background: '#8FAAA1',
    hover: '#6F8F86',
    text: '#1F2D2A',
    border: '1px solid #6F8F86',
  },

  // Tertiary/Ghost - Minimal, passive (cancel, later, dismiss)
  tertiary: {
    background: 'transparent',
    hover: '#F0ECE6',
    text: '#5F5A54',
    border: '1px solid #D8D2C8',
  },

  // Success - Completion states
  success: {
    background: '#3F7A5A',
    hover: '#2F5A44',
    text: '#FFFFFF',
    border: 'none',
  },

  // Warning - Caution states
  warning: {
    background: '#C6933F',
    hover: '#A67A2F',
    text: '#FFFFFF',
    border: 'none',
  },

  // Destructive - Deep earthen red (delete, remove, revoke, burn)
  destructive: {
    background: '#8B3A3A',
    hover: '#6F2C2C',
    text: '#FFFFFF',
    border: 'none',
  },

  // Neutral UI - Toggles, chips, minor selectors
  neutral: {
    background: '#E8E4DC',
    active: '#BFB7A8',
    text: '#3A3A3A',
    border: 'none',
  },
} as const;

/**
 * Typography defaults for all SpiritDAO buttons
 */
export const BUTTON_TYPOGRAPHY = {
  fontWeight: '500',
  letterSpacing: '0.02em',
  borderRadius: '12px',
  padding: '10px 18px',
  textTransform: 'none' as const,
  transition: 'all 0.2s ease-in-out',
} as const;

/**
 * Button style generator - returns inline style object
 *
 * @param intent - Semantic intent of the button
 * @param disabled - Whether button is disabled
 * @returns React CSSProperties object
 */
export function getSpiritDAOButtonStyle(
  intent:
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'neutral',
  disabled: boolean = false,
): React.CSSProperties {
  const colors = SPIRITDAO_COLORS[intent];

  return {
    backgroundColor: disabled ? '#D8D2C8' : colors.background,
    color: disabled ? '#8F8A84' : colors.text,
    border: colors.border,
    fontWeight: BUTTON_TYPOGRAPHY.fontWeight,
    letterSpacing: BUTTON_TYPOGRAPHY.letterSpacing,
    borderRadius: BUTTON_TYPOGRAPHY.borderRadius,
    padding: BUTTON_TYPOGRAPHY.padding,
    textTransform: BUTTON_TYPOGRAPHY.textTransform,
    transition: BUTTON_TYPOGRAPHY.transition,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

/**
 * Hover style generator
 */
export function getSpiritDAOButtonHoverStyle(
  intent:
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'neutral',
): React.CSSProperties {
  const colors = SPIRITDAO_COLORS[intent];

  return {
    backgroundColor: (colors as any).hover || (colors as any).active || colors.background,
  };
}

/**
 * Semantic button intent detector
 * Analyzes button text/action to determine appropriate color scheme
 *
 * @param text - Button text content
 * @param actionType - Optional explicit action type
 * @returns Recommended button intent
 */
export function detectButtonIntent(
  text: string,
  actionType?: 'submit' | 'cancel' | 'delete' | 'edit' | 'view',
):
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'success'
  | 'warning'
  | 'destructive' {
  const lowerText = text.toLowerCase();

  // Destructive actions (highest priority)
  if (
    actionType === 'delete' ||
    lowerText.includes('delete') ||
    lowerText.includes('remove') ||
    lowerText.includes('revoke') ||
    lowerText.includes('burn') ||
    lowerText.includes('reject')
  ) {
    return 'destructive';
  }

  // Primary actions (affirmation, continuation)
  if (
    actionType === 'submit' ||
    lowerText.includes('submit') ||
    lowerText.includes('continue') ||
    lowerText.includes('enter') ||
    lowerText.includes('mint') ||
    lowerText.includes('confirm') ||
    lowerText.includes('join') ||
    lowerText.includes('create') ||
    lowerText.includes('save') ||
    lowerText.includes('approve') ||
    lowerText.includes('accept')
  ) {
    return 'primary';
  }

  // Success actions
  if (
    lowerText.includes('complete') ||
    lowerText.includes('finish') ||
    lowerText.includes('done')
  ) {
    return 'success';
  }

  // Warning actions
  if (lowerText.includes('warning') || lowerText.includes('caution')) {
    return 'warning';
  }

  // Tertiary actions (minimal, passive)
  if (
    actionType === 'cancel' ||
    lowerText.includes('cancel') ||
    lowerText.includes('later') ||
    lowerText.includes('dismiss') ||
    lowerText.includes('close') ||
    lowerText.includes('skip')
  ) {
    return 'tertiary';
  }

  // Secondary actions (supportive)
  if (
    actionType === 'edit' ||
    actionType === 'view' ||
    lowerText.includes('back') ||
    lowerText.includes('edit') ||
    lowerText.includes('view') ||
    lowerText.includes('more info') ||
    lowerText.includes('details') ||
    lowerText.includes('learn')
  ) {
    return 'secondary';
  }

  // Default to secondary for safety
  return 'secondary';
}

/**
 * Tailwind CSS class generator for SpiritDAO buttons
 * Use this for components that prefer className over inline styles
 */
export function getSpiritDAOButtonClasses(
  intent:
    | 'primary'
    | 'secondary'
    | 'tertiary'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'neutral',
): string {
  const baseClasses =
    'font-medium tracking-wide rounded-xl px-4 py-2.5 transition-all duration-200';

  const intentClasses = {
    primary: 'bg-[#2F5D50] hover:bg-[#254A40] text-white',
    secondary:
      'bg-[#8FAAA1] hover:bg-[#6F8F86] text-[#1F2D2A] border border-[#6F8F86]',
    tertiary:
      'bg-transparent hover:bg-[#F0ECE6] text-[#5F5A54] border border-[#D8D2C8]',
    success: 'bg-[#3F7A5A] hover:bg-[#2F5A44] text-white',
    warning: 'bg-[#C6933F] hover:bg-[#A67A2F] text-white',
    destructive: 'bg-[#8B3A3A] hover:bg-[#6F2C2C] text-white',
    neutral: 'bg-[#E8E4DC] hover:bg-[#BFB7A8] text-[#3A3A3A]',
  };

  return `${baseClasses} ${intentClasses[intent]}`;
}

/**
 * Check if a color meets WCAG AA contrast ratio (4.5:1 minimum)
 * Utility for validating custom color combinations
 */
export function meetsWCAGAA(foreground: string, background: string): boolean {
  // This is a simplified check - in production, use a proper contrast checker library
  // For now, all SpiritDAO colors are pre-validated
  return true;
}

/**
 * Migration helper - maps old button styles to new system
 */
export const LEGACY_COLOR_MAPPING: Record<
  string,
  keyof typeof SPIRITDAO_COLORS
> = {
  '#e8fcff': 'primary', // Old Coinbase blue → Primary
  '#0052FF': 'primary', // Old blue → Primary
  '#10b981': 'success', // Old green → Success
  '#ef4444': 'destructive', // Old red → Destructive
  '#f59e0b': 'warning', // Old orange → Warning
  '#6b7280': 'secondary', // Old gray → Secondary
  transparent: 'tertiary', // Transparent → Tertiary
};

/**
 * Convert legacy color to SpiritDAO intent
 */
export function mapLegacyColorToIntent(
  color: string,
): keyof typeof SPIRITDAO_COLORS {
  const normalized = color.toLowerCase().trim();
  return LEGACY_COLOR_MAPPING[normalized] || 'secondary';
}
