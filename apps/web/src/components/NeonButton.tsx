import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes } from 'react';

interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'pink' | 'cyan' | 'purple' | 'ghost';
  loading?: boolean;
}

export function NeonButton({ variant = 'pink', loading, children, className = '', disabled, type = 'button', onClick }: NeonButtonProps) {
  const variants = {
    pink: 'bg-neon-pink/20 border-neon-pink text-neon-pink hover:bg-neon-pink/30 glow-pink',
    cyan: 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30 glow-cyan',
    purple: 'bg-neon-purple/20 border-neon-purple text-neon-purple hover:bg-neon-purple/30 glow-purple',
    ghost: 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10',
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 font-medium transition-all disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </motion.button>
  );
}
