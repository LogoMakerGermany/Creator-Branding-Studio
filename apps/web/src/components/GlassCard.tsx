import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: 'pink' | 'cyan' | 'purple' | 'none';
  onClick?: () => void;
}

export function GlassCard({ children, className = '', glow = 'none', onClick }: GlassCardProps) {
  const glowClass = glow === 'pink' ? 'glow-pink' : glow === 'cyan' ? 'glow-cyan' : glow === 'purple' ? 'glow-purple' : '';
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      className={`glass rounded-2xl p-5 ${glowClass} ${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </motion.div>
  );
}
