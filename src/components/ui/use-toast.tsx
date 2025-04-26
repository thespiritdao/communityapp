//src/components/ui/use-toast.tsx

import { toast as hotToast, ToastOptions as HotToastOptions } from 'react-hot-toast';
import React from 'react';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface ToastParams {
  title: string;
  description?: string;
  variant?: ToastVariant;
  options?: HotToastOptions;
}

export function useToast() {
  const toast = (params: ToastParams) => {
    const { title, description, variant = 'default', options } = params;

    const content = (
      <div style={{ padding: '0.5rem 1rem' }}>
        <div style={{ fontWeight: 'bold' }}>{title}</div>
        {description && <div>{description}</div>}
      </div>
    );

    switch (variant) {
      case 'destructive':
        hotToast.error(content, options);
        break;
      case 'success':
        hotToast.success(content, options);
        break;
      default:
        hotToast(content, options);
        break;
    }
  };

  return { toast };
}
