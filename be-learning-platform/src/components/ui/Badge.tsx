import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'green' | 'orange' | 'blue' | 'default';
}

const variantClasses = {
  green: 'text-gh-accent-green bg-gh-accent-green/15',
  orange: 'text-gh-accent-orange bg-gh-accent-orange/15',
  blue: 'text-gh-accent-blue bg-gh-accent-blue/15',
  default: 'text-gh-text-secondary bg-gh-bg-secondary',
} as const;

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-tight ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
