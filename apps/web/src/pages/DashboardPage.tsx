import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api, { fetchCsrfToken } from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { useAuthStore } from '../store/authStore';

export function DashboardPage() {
  const user = useAuthStore(s => s.user);
  useEffect(() => { fetchCsrfToken().catch(() => {}); }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects')).data,
  });

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-bold text-gradient">Willkommen, {user?.name}</h1>
        <p className="mt-2 text-white/50">Deine Branding-Projekte auf einen Blick</p>
      </motion.div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <GlassCard glow="pink">
          <p className="text-sm text-white/50">Projekte</p>
          <p className="font-display text-3xl font-bold text-neon-pink">{projects.length}</p>
        </GlassCard>
        <GlassCard glow="cyan">
          <p className="text-sm text-white/50">Schnellstart</p>
          <Link to="/onboarding"><NeonButton variant="cyan" className="mt-2 w-full !py-4 !text-base">Neues Projekt</NeonButton></Link>
        </GlassCard>
        <GlassCard glow="purple">
          <p className="text-sm text-white/50">Rolle</p>
          <p className="font-display text-xl capitalize text-neon-purple">{user?.role}</p>
        </GlassCard>
      </div>

      <h2 className="mt-10 font-display text-xl font-bold">Projekte</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p: { id: string; name: string; updatedAt: string }) => (
          <Link key={p.id} to={`/projects/${p.id}/dna`}>
            <GlassCard glow="cyan" className="h-full">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-xs text-white/40">{new Date(p.updatedAt).toLocaleDateString('de-DE')}</p>
            </GlassCard>
          </Link>
        ))}
        {projects.length === 0 && (
          <GlassCard className="col-span-full text-center">
            <p className="text-white/50">Noch kein Branding? Starte in wenigen Minuten.</p>
            <Link to="/onboarding"><NeonButton className="mt-4 w-full !py-4 !text-base">Neues Projekt erstellen</NeonButton></Link>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
