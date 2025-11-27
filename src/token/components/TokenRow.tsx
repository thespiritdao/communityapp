import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { TokenRowReact } from '../types';
import { formatAmount } from '../utils/formatAmount';
import { TokenImage } from './TokenImage';

export const TokenRow = memo(function TokenRow({
  className,
  token,
  amount,
  onClick,
  hideImage,
  hideSymbol,
}: TokenRowReact) {

  return (
    <button
      data-testid="ockTokenRow_Container"
      type="button"
      className={cn(
        'flex w-full items-center justify-between px-2 py-1',
        'hover:bg-gray-50 active:bg-gray-100 rounded transition-colors',
        className,
      )}
      onClick={() => onClick?.(token)}
    >
      <span className="flex items-center gap-3">
        {!hideImage && <TokenImage token={token} size={28} />}
        <span className="flex flex-col items-start">
          <span className="text-sm font-medium text-gray-900">{token.name}</span>
          {!hideSymbol && (
            <span className="text-sm text-gray-500">
              {token.symbol}
            </span>
          )}
        </span>
      </span>
      <span
        data-testid="ockTokenRow_Amount"
        className="text-sm text-gray-500"
      >
        {formatAmount(amount, {
          minimumFractionDigits: 2,
          maximumFractionDigits: Number(amount) < 1 ? 5 : 2,
        })}
      </span>
    </button>
  );
});
