import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DnaRequiredBanner({ message = 'Creator DNA erforderlich' }: { message?: string }) {
  return (
    <div className="ucbs-neon-card ucbs-neon-card-magenta mb-6 flex items-center gap-3 p-4 text-fuchsia-200">
      <AlertCircle className="h-5 w-5 shrink-0 text-fuchsia-400" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function StudioErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 rounded-[18px] border border-red-500/30 bg-red-500/10 p-4 text-red-300">{message}</div>
  );
}

type Accent = 'purple' | 'cyan' | 'magenta';

interface TypeOptionProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TypeOptionButton({ active, onClick, children, className, disabled }: TypeOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border p-3 text-sm transition-all',
        active
          ? 'border-cyan-500/50 bg-cyan-500/10 text-zinc-100 shadow-[0_0_16px_-4px_rgba(34,211,238,0.4)]'
          : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200',
        className
      )}
    >
      {children}
    </button>
  );
}

export function NeonPreviewBox({
  children,
  aspect = 'video',
  className,
}: {
  children: ReactNode;
  aspect?: 'video' | 'square';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-[18px] border border-[var(--ucbs-accent-cyan)]/20 bg-[var(--ucbs-bg)]/80',
        aspect === 'video' ? 'aspect-video' : 'aspect-square max-h-[520px]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function MediaGalleryGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}

export function GalleryThumb({
  onClick,
  imageUrl,
  label,
}: {
  onClick: () => void;
  imageUrl?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ucbs-neon-card overflow-hidden p-0 text-left transition-transform hover:scale-[1.02]"
    >
      {imageUrl && (
        <img src={imageUrl} alt={label} className="aspect-video w-full object-cover" />
      )}
      <p className="p-2 text-xs text-zinc-400">{label}</p>
    </button>
  );
}

export type { Accent };
