import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardTitle } from './Card';

type NeonAccent = 'purple' | 'cyan' | 'magenta';

interface NeonCardProps {
  children: ReactNode;
  className?: string;
  accent?: NeonAccent;
  title?: ReactNode;
}

const accentClass: Record<NeonAccent, string> = {
  purple: '',
  cyan: 'ucbs-neon-card-cyan',
  magenta: 'ucbs-neon-card-magenta',
};

export function NeonCard({ children, className, accent = 'purple', title }: NeonCardProps) {
  return (
    <div className={cn('ucbs-neon-card p-6', accentClass[accent], className)}>
      {title && <CardTitle className="mb-4">{title}</CardTitle>}
      {children}
    </div>
  );
}
