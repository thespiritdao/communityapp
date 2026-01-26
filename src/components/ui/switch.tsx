'use client';

import * as React from 'react';

type SwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
};

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className = '',
  id,
  name,
  'aria-label': ariaLabel = 'Toggle',
}: SwitchProps) {
  const [internal, setInternal] = React.useState<boolean>(!!defaultChecked);
  const isControlled = typeof checked === 'boolean';
  const value = isControlled ? !!checked : internal;

  const setValue = (next: boolean) => {
    if (disabled) return;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  const toggle = () => setValue(!value);

  // Embedded colors
  const SECONDARY_BG = '#8B3A3A';
  const SECONDARY_BORDER = '#6F8F86';
  const SUCCESS_BG = '#3F7A5A';

  return (
    <button
      type="button"
      id={id}
      name={name}
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={toggle}
      className={[
        // Mobile-friendly hit target
        'relative inline-flex h-12 w-[3.25rem] select-none items-center rounded-full',
        // Key fix: align knob with flex, not translate math
        value ? 'justify-end' : 'justify-start',
        'p-1 transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
      style={{
        backgroundColor: value ? SUCCESS_BG : SECONDARY_BG,
        border: value ? '1px solid transparent' : `1px solid ${SECONDARY_BORDER}`,
      }}
    >
      {/* knob */}
      <span
        aria-hidden="true"
        className={[
          'h-10 w-10 rounded-full bg-white shadow',
          'transition-transform duration-200 will-change-transform',
          disabled ? '' : 'active:scale-[0.98]',
        ].join(' ')}
      />
    </button>
  );
}
