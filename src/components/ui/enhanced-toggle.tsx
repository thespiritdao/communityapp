// Enhanced Toggle Component - Better visual design with button-style toggle
'use client';
import { Check, X } from 'lucide-react';

interface EnhancedToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  variant?: 'switch' | 'button' | 'pill';
}

export function EnhancedToggle({
  checked,
  onCheckedChange,
  disabled = false,
  size = 'md',
  id,
  variant = 'button',
}: EnhancedToggleProps) {
  if (variant === 'button') {
    const sizeClasses = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base',
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={`
          ${sizeClasses[size]}
          inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-200
          ${
            checked
              ? 'bg-[#E8F1EE] text-[#1F453A] border-2 border-[#B8D9CA] hover:bg-[#D1E6DC]'
              : 'bg-[#F5E6E6] text-[#8B3A3A] border-2 border-[#D9B3B3] hover:bg-[#F5E6E6]'
          }
          ${
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:scale-105 active:scale-95'
          }
          focus:outline-none focus:ring-2 focus:ring-[#2F5D50] focus:ring-offset-2
        `}
      >
        {checked ? (
          <>
            <Check className="h-4 w-4" />
            On
          </>
        ) : (
          <>
            <X className="h-4 w-4" />
            Off
          </>
        )}
      </button>
    );
  }

  if (variant === 'pill') {
    const sizeClasses = {
      sm: 'w-12 h-6',
      md: 'w-16 h-8',
      lg: 'w-20 h-10',
    };

    const circleClasses = {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
    };

    const translateClasses = {
      sm: 'translate-x-6',
      md: 'translate-x-8',
      lg: 'translate-x-10',
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={`
          ${sizeClasses[size]}
          relative inline-flex items-center rounded-full transition-all duration-300 ease-in-out
          ${
            checked
              ? 'bg-gradient-to-r from-[#3F7A5A] to-[#2F5D50] shadow-lg'
              : 'bg-gradient-to-r from-[#E8E4DC] to-[#D1C4A9]'
          }
          ${
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:shadow-xl'
          }
          focus:outline-none focus:ring-2 focus:ring-[#2F5D50] focus:ring-offset-2
          border-2 border-white
        `}
      >
        <span
          className={`
            ${circleClasses[size]}
            absolute left-1 inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 ease-in-out
            ${checked ? translateClasses[size] : 'translate-x-0'}
            flex items-center justify-center
          `}
        >
          {checked ? (
            <Check className="h-3 w-3 text-[#3F7A5A]" />
          ) : (
            <X className="h-3 w-3 text-[#8FAAA1]" />
          )}
        </span>
      </button>
    );
  }

  // Default switch variant (improved version)
  const sizeClasses = {
    sm: {
      container: 'w-10 h-5',
      circle: 'w-4 h-4',
      translate: 'translate-x-5',
    },
    md: {
      container: 'w-12 h-6',
      circle: 'w-5 h-5',
      translate: 'translate-x-6',
    },
    lg: {
      container: 'w-16 h-8',
      circle: 'w-7 h-7',
      translate: 'translate-x-8',
    },
  };

  const currentSize = sizeClasses[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={`
        ${currentSize.container}
        relative inline-flex items-center rounded-full transition-all duration-300 ease-in-out
        ${
          checked
            ? 'bg-gradient-to-r from-[#2F5D50] to-[#1F453A] shadow-lg'
            : 'bg-gradient-to-r from-[#E8E4DC] to-[#D1C4A9]'
        }
        ${
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer hover:shadow-xl'
        }
        focus:outline-none focus:ring-2 focus:ring-[#2F5D50] focus:ring-offset-2
        border-2 border-white
      `}
    >
      <span
        className={`
          ${currentSize.circle}
          absolute left-0.5 inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 ease-in-out
          ${checked ? currentSize.translate : 'translate-x-0'}
        `}
      />
    </button>
  );
}
