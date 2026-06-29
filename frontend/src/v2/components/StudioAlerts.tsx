import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Dna } from 'lucide-react';
import { Button } from '@/components/ui';
import { GlassCard } from './GlassCard';

export function DnaRequiredBanner({ message = 'Creator DNA erforderlich — alle Generatoren nutzen deine Markenidentität.' }: { message?: string }) {
  return (
    <GlassCard accent="purple" hover={false} className="!p-4">
      <div className="flex items-center gap-3 text-fuchsia-200">
        <AlertCircle className="h-5 w-5 shrink-0 text-[var(--ucbs-accent-purple)]" />
        <p className="flex-1 text-sm">{message}</p>
        <Link to="/creator-dna">
          <Button size="sm" variant="outline" className="gap-1">
            <Dna className="h-4 w-4" />
            DNA einrichten
          </Button>
        </Link>
      </div>
    </GlassCard>
  );
}

export function StudioSuccessBanner({ children }: { children: ReactNode }) {
  return (
    <GlassCard accent="green" hover={false} className="!p-4 text-sm text-[var(--ucbs-accent-green)]">
      {children}
    </GlassCard>
  );
}
