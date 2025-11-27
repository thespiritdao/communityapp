'use client';

import type { ReactNode } from 'react';

interface PodPageLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: 'default' | 'wide' | 'full';
  showBackButton?: boolean;
  actions?: ReactNode;
}

export function PodPageLayout({
  title,
  description,
  children,
  maxWidth = 'default',
  showBackButton = false,
  actions,
}: PodPageLayoutProps) {
  const containerClasses = {
    default: 'container mx-auto py-8 px-4',
    wide: 'max-w-6xl mx-auto py-8 px-4',
    full: 'w-full py-8 px-4',
  };

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  return (
    <div className={containerClasses[maxWidth]}>
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            {showBackButton && (
              <button
                onClick={handleBack}
                className="mb-4 text-sm text-gray-600 hover:text-gray-800 flex items-center gap-1"
              >
                ← Back
              </button>
            )}
            <h1 className="text-3xl font-bold mb-2">{title}</h1>
            {description && <p className="text-gray-600">{description}</p>}
          </div>
          {actions && <div className="ml-4">{actions}</div>}
        </div>
      </div>

      <div className="pb-20">{children}</div>
    </div>
  );
}
