import { badgeSvg } from 'src/internal/svg/badgeSvg';
import { background, cn } from 'src/styles/theme';
import type { BadgeReact } from '../types';

/**
 * Badge component.
 */
export function Badge({ className }: BadgeReact) {
  const badgeSize = '12px';
  return (
    <span
      className={cn(
        background.primary,
        'rounded-full border border-transparent',
        className,
      )}
      data-testid="ockBadge"
      style={{
        height: badgeSize,
        width: badgeSize,
        maxHeight: badgeSize,
        maxWidth: badgeSize,
      }}
    >
      {badgeSvg}
    </span>
  );
}
