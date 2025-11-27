'use client';

import type React from 'react';
import { Button } from '@/components/ui/button';
import { DollarSign, Send } from 'lucide-react';

interface FundButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  recipientType?: 'member' | 'pod';
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Reusable Fund button component
 * Can be used anywhere in the app for consistent funding UX
 */
export default function FundButton({
  variant = 'default',
  size = 'default',
  recipientType = 'member',
  className,
  onClick,
  disabled = false,
  children,
}: FundButtonProps) {
  const getIcon = () => {
    switch (recipientType) {
      case 'pod':
        return <DollarSign className="h-4 w-4" />;
      case 'member':
        return <Send className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  const getDefaultText = () => {
    switch (recipientType) {
      case 'pod':
        return 'Donate';
      case 'member':
        return 'Send Funds';
      default:
        return 'Fund';
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 ${className}`}
    >
      {getIcon()}
      {children || getDefaultText()}
    </Button>
  );
}
