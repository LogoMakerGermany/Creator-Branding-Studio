import { Link, useParams } from 'react-router-dom';
import { ASSET_TYPES, ASSET_LABELS } from '@cbs/shared';
import { GlassCard } from '../components/GlassCard';

export function GeneratorsPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Alle Generatoren</h1>
      <p className="mt-2 text-white/50">Wähle einen Generator – DNA und Prompts werden automatisch angewendet.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ASSET_TYPES.filter(t => !['intro', 'outro', 'stinger', 'transition', 'loading', 'social_reveal', 'product_reveal', 'clan_intro', 'team_intro'].includes(t)).map(type => (
          <Link key={type} to={`/projects/${id}/generate/${type}`}>
            <GlassCard glow="purple" className="h-full">
              <p className="font-medium">{ASSET_LABELS[type]}</p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
