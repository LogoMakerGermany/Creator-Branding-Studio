import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { Link } from 'react-router-dom';

export function TestModePage() {
  const { id } = useParams<{ id: string }>();

  const { data: status } = useQuery({
    queryKey: ['test-mode'],
    queryFn: async () => (await api.get('/test/status')).data,
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Plattform-Testmodus</h1>
      <p className="mt-2 text-white/50">Für TikTok- und Twitch-Tester – Mock-Assets ohne API-Kosten.</p>

      <GlassCard className="mt-8" glow={status?.active ? 'cyan' : 'none'}>
        <p className={`text-lg font-semibold ${status?.active ? 'text-neon-cyan' : 'text-white/50'}`}>
          {status?.active ? '✓ Testmodus aktiv' : '✗ Testmodus inaktiv'}
        </p>
        <p className="mt-2 text-sm text-white/50">{status?.message}</p>
        <p className="mt-4 text-xs text-white/40">Login: tester@cbs.local · Rolle: Tester · 200 Coins</p>
      </GlassCard>

      {status?.active && id && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <GlassCard glow="pink">
            <h3 className="font-semibold">Twitch Mockup</h3>
            <p className="mt-2 text-sm text-white/50">Vorschau ohne Live-Generierung</p>
            <Link to={`/projects/${id}/preview`}><NeonButton className="mt-4">Twitch Vorschau</NeonButton></Link>
          </GlassCard>
          <GlassCard glow="cyan">
            <h3 className="font-semibold">TikTok Mockup</h3>
            <p className="mt-2 text-sm text-white/50">Profil- & Banner-Test</p>
            <Link to={`/projects/${id}/preview`}><NeonButton variant="cyan" className="mt-4">TikTok Vorschau</NeonButton></Link>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
