// Custom Toggle Component - Better styled toggle switch
'use client';

interface CustomToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

export function CustomToggle({ 
  checked, 
  onCheckedChange, 
  disabled = false, 
  size = 'md',
  id 
}: CustomToggleProps) {
  const sizeClasses = {
    sm: {
      container: 'w-8 h-4',
      circle: 'w-3 h-3',
      translate: 'translate-x-4'
    },
    md: {
      container: 'w-11 h-6',
      circle: 'w-5 h-5',
      translate: 'translate-x-5'
    },
    lg: {
      container: 'w-14 h-7',
      circle: 'w-6 h-6',
      translate: 'translate-x-7'
    }
  };

  const currentSize = sizeClasses[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      value={checked ? "on" : "off"}
      className={`
        ${currentSize.container}
        relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out
        ${checked 
          ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' 
          : 'bg-gray-200 hover:bg-gray-300 focus:ring-gray-400'
        }
        ${disabled 
          ? 'cursor-not-allowed opacity-50' 
          : 'cursor-pointer'
        }
        focus:outline-none focus:ring-2 focus:ring-offset-2
      `}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={`
          ${currentSize.circle}
          pointer-events-none inline-block rounded-full bg-white shadow-lg transform ring-0 transition-transform duration-200 ease-in-out
          ${checked ? currentSize.translate : 'translate-x-0'}
        `}
      />
    </button>
  );
}