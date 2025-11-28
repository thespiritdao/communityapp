//src/components/ui/use-toast.tsx

import type React from 'react';
import {
  toast as hotToast,
  type ToastOptions as HotToastOptions,
} from 'react-hot-toast';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface ToastParams {
  title: string;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
  options?: HotToastOptions;
}

export function useToast() {
  const toast = (params: ToastParams) => {
    const { title, description, variant = 'default', duration, options } =
      params;

    const content = (
      <div style={{ padding: '0.5rem 1rem' }}>
        <div style={{ fontWeight: 'bold' }}>{title}</div>
        {description && <div>{description}</div>}
      </div>
    );

    // Merge duration into options if provided
    const mergedOptions: HotToastOptions = {
      ...options,
      ...(duration !== undefined && { duration }),
    };

    switch (variant) {
      case 'destructive':
        hotToast.error(content, mergedOptions);
        break;
      case 'success':
        hotToast.success(content, mergedOptions);
        break;
      default:
        hotToast(content, mergedOptions);
        break;
    }
  };

  return { toast };
}
