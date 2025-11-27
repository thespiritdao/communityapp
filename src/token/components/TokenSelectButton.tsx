import { type ForwardedRef, forwardRef } from 'react';
import { caretDownSvg } from '@/internal/svg/caretDownSvg';
import { caretUpSvg } from '@/internal/svg/caretUpSvg';
import { cn } from '@/lib/utils';
import type { TokenSelectButtonReact } from '../types';
import { TokenImage } from './TokenImage';

export const TokenSelectButton = forwardRef(function TokenSelectButton(
  { onClick, token, isOpen, className }: TokenSelectButtonReact,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      data-testid="ockTokenSelectButton_Button"
      className={cn(
        'flex w-fit items-center gap-2 px-3 py-1',
        'rounded-lg border border-gray-200 bg-white',
        'hover:bg-gray-50 active:bg-gray-100',
        'shadow-sm transition-colors',
        className,
      )}
      onClick={onClick}
      ref={ref}
    >
      {token ? (
        <>
          <div className="w-4">
            <TokenImage token={token} size={16} />
          </div>
          <span
            className={cn('text-sm font-medium text-gray-900')}
            data-testid="ockTokenSelectButton_Symbol"
          >
            {token.symbol}
          </span>
        </>
      ) : (
        <span className="text-sm font-medium text-gray-900">Select token</span>
      )}
      <div className="relative flex items-center justify-center">
        <div className="absolute top-0 left-0 h-4 w-4" />
        {isOpen ? caretUpSvg : caretDownSvg}
      </div>
    </button>
  );
});
