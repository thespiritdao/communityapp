import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const text = {
<<<<<<< HEAD
  body: 'ock-font-family font-normal text-base',
  caption: 'ock-font-family font-semibold text-xs',
  headline: 'ock-font-family font-semibold',
  label1: 'ock-font-family font-semibold text-sm',
  label2: 'ock-font-family text-sm',
  legal: 'ock-font-family text-xs',
  title1: 'ock-font-family font-semibold text-2xl',
  title3: 'ock-font-family font-semibold text-xl',
=======
  body: 'ock-font-family font-normal leading-normal',
  caption: 'ock-font-family font-semibold text-xs leading-4',
  headline: 'ock-font-family font-semibold leading-normal',
  label1: 'ock-font-family font-semibold text-sm leading-5',
  label2: 'ock-font-family text-sm leading-5',
  legal: 'ock-font-family text-xs leading-4',
  title1: 'ock-font-family font-semibold text-2xl leading-9',
  title3: 'ock-font-family font-semibold text-xl leading-7',
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
} as const;

export const pressable = {
  default:
    'cursor-pointer ock-bg-default active:bg-[var(--ock-bg-default-active)] hover:bg-[var(--ock-bg-default-hover)]',
  alternate:
<<<<<<< HEAD
    'cursor-pointer ock-bg-alternate active:bg-[var(--ock-bg-alternate-active)] hover:bg-[var(--ock-bg-alternate-hover)]',
=======
    'cursor-pointer ock-bg-alternate active:bg-[var(--ock-bg-alternate-active)] hover:[var(--ock-bg-alternate-hover)]',
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
  inverse:
    'cursor-pointer ock-bg-inverse active:bg-[var(--ock-bg-inverse-active)] hover:bg-[var(--ock-bg-inverse-hover)]',
  primary:
    'cursor-pointer ock-bg-primary active:bg-[var(--ock-bg-primary-active)] hover:bg-[var(--ock-bg-primary-hover)]',
  secondary:
    'cursor-pointer ock-bg-secondary active:bg-[var(--ock-bg-secondary-active)] hover:bg-[var(--ock-bg-secondary-hover)]',
  coinbaseBranding: 'cursor-pointer bg-[#0052FF] hover:bg-[#0045D8]',
  shadow: 'ock-shadow-default',
  disabled: 'opacity-[0.38] pointer-events-none',
} as const;

export const background = {
  default: 'ock-bg-default',
  alternate: 'ock-bg-alternate',
  inverse: 'ock-bg-inverse',
  primary: 'ock-bg-primary',
  secondary: 'ock-bg-secondary',
  error: 'ock-bg-error',
  warning: 'ock-bg-warning',
  success: 'ock-bg-success',
  washed: 'ock-bg-primary-washed',
  disabled: 'ock-bg-primary-disabled',
  reverse: 'ock-bg-default-reverse',
} as const;

export const color = {
  inverse: 'ock-text-inverse',
  foreground: 'ock-text-foreground',
  foregroundMuted: 'ock-text-foreground-muted',
  error: 'ock-text-error',
  primary: 'ock-text-primary',
  success: 'ock-text-success',
  warning: 'ock-text-warning',
  disabled: 'ock-text-disabled',
} as const;

export const fill = {
  default: 'ock-fill-default',
  defaultReverse: 'ock-fill-default-reverse',
  inverse: 'ock-fill-inverse',
  alternate: 'ock-fill-alternate',
} as const;

export const border = {
  default: 'ock-border-default',
  defaultActive: 'ock-border-default-active',
<<<<<<< HEAD
  linePrimary: 'ock-border-line-primary border',
  lineDefault: 'ock-border-line-default border',
  lineHeavy: 'ock-border-line-heavy border',
  lineInverse: 'ock-border-line-inverse border',
=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
  radius: 'ock-border-radius',
  radiusInner: 'ock-border-radius-inner',
} as const;

export const placeholder = {
  default: 'ock-placeholder-default',
} as const;

export const icon = {
  primary: 'ock-icon-color-primary',
  foreground: 'ock-icon-color-foreground',
  foregroundMuted: 'ock-icon-color-foreground-muted',
  inverse: 'ock-icon-color-inverse',
  error: 'ock-icon-color-error',
  success: 'ock-icon-color-success',
  warning: 'ock-icon-color-warning',
} as const;

export const line = {
<<<<<<< HEAD
  default: 'ock-border-line-default border',
  primary: 'ock-border-line-primary border',
  heavy: 'ock-border-line-heavy border',
  inverse: 'ock-border-line-inverse border',
};
=======
  primary: 'ock-line-primary border',
  default: 'ock-line-default border',
  heavy: 'ock-line-heavy border',
  inverse: 'ock-line-inverse border',
} as const;
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
