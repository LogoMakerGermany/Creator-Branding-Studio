import { Link } from 'react-router-dom';
import { BRANDING_MODULES, AI_CREATOR_MODULES } from '@/v2/config/navigation';
import { GlassCard } from '@/v2/components/GlassCard';

export function TemplatesPage() {
  const items = [...BRANDING_MODULES, ...AI_CREATOR_MODULES];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Vorlagen</h1>
        <p className="mt-2 text-zinc-400">
          Startpunkte für echte Generatoren — jede Karte öffnet ein funktionierendes Studio.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => (
          <Link key={m.id} to={m.path}>
            <GlassCard accent={m.accent}>
              <h2 className="font-semibold text-white">{m.title}</h2>
              <p className="mt-1 text-sm text-zinc-400">{m.description}</p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
