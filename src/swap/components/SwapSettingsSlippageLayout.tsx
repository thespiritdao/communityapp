import { Children, useMemo } from 'react';
import { findComponent } from '../../internal/utils/findComponent';
<<<<<<< HEAD
import { background, border, cn } from '../../styles/theme';
=======
import { background, border, cn, line } from '../../styles/theme';
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
import type { SwapSettingsSlippageLayoutReact } from '../types';
import { SwapSettingsSlippageDescription } from './SwapSettingsSlippageDescription';
import { SwapSettingsSlippageInput } from './SwapSettingsSlippageInput';
import { SwapSettingsSlippageTitle } from './SwapSettingsSlippageTitle';

export function SwapSettingsSlippageLayout({
  children,
  className,
}: SwapSettingsSlippageLayoutReact) {
  const { title, description, input } = useMemo(() => {
    const childrenArray = Children.toArray(children);
    return {
      title: childrenArray.find(findComponent(SwapSettingsSlippageTitle)),
      description: childrenArray.find(
        findComponent(SwapSettingsSlippageDescription),
      ),
      input: childrenArray.find(findComponent(SwapSettingsSlippageInput)),
    };
  }, [children]);

  return (
    <div
      className={cn(
        background.default,
        border.radius,
<<<<<<< HEAD
        border.lineDefault,
=======
        line.default,
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
        'right-0 z-10 w-[21.75rem] px-3 py-3',
        className,
      )}
      data-testid="ockSwapSettingsLayout_container"
    >
      {title}
      {description}
      <div className="flex items-center justify-between gap-2">
        {input && <div className="flex-grow">{input}</div>}
      </div>
    </div>
  );
}
