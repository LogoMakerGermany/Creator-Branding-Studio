import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { WIZARD_STEP_LABELS } from './wizardConfig';

interface WizardShellProps {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  hideNext?: boolean;
  error?: string;
}

export function WizardShell({
  step,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = 'Weiter →',
  nextDisabled,
  loading,
  hideNext,
  error,
}: WizardShellProps) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-neon-cyan">
          Schritt {step + 1} von {WIZARD_STEP_LABELS.length}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          {WIZARD_STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-8 bg-neon-pink' : i < step ? 'w-2 bg-neon-cyan' : 'w-2 bg-white/15'
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-white/40">{WIZARD_STEP_LABELS[step]}</p>
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/10 bg-surface-2/90 p-6 shadow-xl sm:p-8"
      >
        <h1 className="text-center font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-center text-sm text-white/50">{subtitle}</p>
        )}

        <div className="mt-8">{children}</div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">{error}</p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="order-2 rounded-2xl border border-white/15 px-6 py-4 text-base text-white/70 sm:order-1"
            >
              ← Zurück
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {!hideNext && onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled || loading}
              className="order-1 flex-1 rounded-2xl bg-gradient-to-r from-neon-pink to-neon-purple px-6 py-4 text-lg font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-40 sm:order-2 sm:flex-none sm:min-w-[200px]"
            >
              {loading ? 'Einen Moment…' : nextLabel}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
