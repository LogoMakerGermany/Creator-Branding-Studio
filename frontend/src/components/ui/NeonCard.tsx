import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardTitle } from './Card';
import { GlassCard } from '@/v2/components/GlassCard';

type NeonAccent = 'purple' | 'cyan' | 'magenta' | 'green';

interface NeonCardProps {
  children: ReactNode;
  className?: string;
  accent?: NeonAccent;
  title?: ReactNode;
}

const accentMap: Record<NeonAccent, 'cyan' | 'purple' | 'green' | 'none'> = {
  purple: 'purple',
  cyan: 'cyan',
  magenta: 'purple',
  green: 'green',
};

export function NeonCard({ children, className, accent = 'purple', title }: NeonCardProps) {
  return (
    <GlassCard accent={accentMap[accent]} className={cn('!p-6', className)} hover={false}>
      {title && <CardTitle className="mb-4 text-white">{title}</CardTitle>}
      {children}
    </GlassCard>
  );
}
