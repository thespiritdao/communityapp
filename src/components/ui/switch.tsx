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
};

export function Switch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className = '',
  id,
  name,
}: SwitchProps) {
  const [internal, setInternal] = React.useState<boolean>(!!defaultChecked);
  const isControlled = typeof checked === 'boolean';
  const value = isControlled ? !!checked : internal;

  const toggle = () => {
    if (disabled) return;
    const next = !value;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      id={id}
      name={name}
      aria-checked={value}
      role="switch"
      onClick={toggle}
      disabled={disabled}
      className={[
        'inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
        value ? 'bg-blue-600' : 'bg-gray-300',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
          value ? 'translate-x-5' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}
