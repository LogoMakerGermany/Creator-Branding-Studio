import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Accent = 'cyan' | 'purple' | 'green' | 'none';

const accentBorder: Record<Accent, string> = {
  cyan: 'border-[var(--ucbs-accent-cyan)]/25 hover:border-[var(--ucbs-accent-cyan)]/50 hover:shadow-[0_0_32px_-8px_rgba(34,211,238,0.35)]',
  purple: 'border-[var(--ucbs-accent-purple)]/25 hover:border-[var(--ucbs-accent-purple)]/50 hover:shadow-[0_0_32px_-8px_rgba(168,85,247,0.35)]',
  green: 'border-[var(--ucbs-accent-green)]/25 hover:border-[var(--ucbs-accent-green)]/50 hover:shadow-[0_0_32px_-8px_rgba(52,211,153,0.35)]',
  none: 'border-white/8 hover:border-white/15',
};

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  accent?: Accent;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, accent = 'none', hover = true, onClick }: GlassCardProps) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : undefined}
      className={cn(
        'relative overflow-hidden rounded-[18px] border bg-[var(--ucbs-card)]/90 p-5 backdrop-blur-xl',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        hover && 'transition-shadow duration-300',
        accentBorder[accent],
        onClick && 'w-full text-left',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />
      <div className="relative">{children}</div>
    </Comp>
  );
}
