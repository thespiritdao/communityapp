//src/components/ui/button.tsx


import React, { ButtonHTMLAttributes } from 'react';
import classNames from 'classnames';
import styles from './button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  className,
  ...props
}) => {
  const buttonClass = classNames(
    styles.button,
    styles[variant],
    styles[size],
    className
  );

  return <button className={buttonClass} {...props} />;
};

export default Button;
