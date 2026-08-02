import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Dna, Image, Film, Bot, Cloud, FolderKanban, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { GlassCard } from '@/v2/components/GlassCard';
import { Skeleton } from '@/v2/components/Skeleton';

const QUICK_ACTIONS = [
  { label: 'Ultimate Creator', path: '/ultimate-creator', icon: Sparkles, accent: 'purple' as const },
  { label: 'Logo erstellen', path: '/logo-studio', icon: Sparkles, accent: 'cyan' as const },
  { label: 'Banner erstellen', path: '/banner-studio', icon: Image, accent: 'purple' as const },
  { label: 'Overlay erstellen', path: '/overlay-studio', icon: Image, accent: 'green' as const },
  { label: 'Video Studio', path: '/video-studio', icon: Film, accent: 'cyan' as const },
  { label: 'AI Creator', path: '/ai-creator', icon: Bot, accent: 'purple' as const },
];

export function DashboardV2Page() {
  const { user, activeDna } = useAuth();

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.auth.stats(),
  });

  const filesQuery = useQuery({
    queryKey: ['dashboard-files'],
    queryFn: async () => (await api.files.list()).files.slice(0, 4),
  });

  const projectsQuery = useQuery({
    queryKey: ['dashboard-projects'],
    queryFn: async () => (await api.projects.list()).projects.slice(0, 3),
  });

  const dnaProgress = activeDna
    ? Math.min(100, 50 + (activeDna.primaryColors?.length ?? 0) * 8 + (activeDna.styleDirection ? 20 : 0))
    : 15;

  return (
    <div className="space-y-8">
      <GlassCard accent="cyan" className="!p-0 overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-[var(--ucbs-accent-cyan)]">Willkommen zurück</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
              {user?.displayName ?? 'Creator'}
            </h1>
            <p className="mt-2 max-w-xl text-zinc-400">
              Hier entsteht deine komplette Creator-Marke — DNA, Branding, Video und Social in einem Betriebssystem.
            </p>
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs text-zinc-500">
                <span>Creator DNA Fortschritt</span>
                <span>{dnaProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--ucbs-hover)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--ucbs-accent-cyan)] to-[var(--ucbs-accent-purple)] transition-all duration-700"
                  style={{ width: `${dnaProgress}%` }}
                />
              </div>
            </div>
            <Link
              to={activeDna ? '/ultimate-creator' : '/creator-dna'}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--ucbs-accent-purple)]/40 bg-[var(--ucbs-accent-purple)]/10 px-4 py-2 text-sm font-semibold text-[var(--ucbs-accent-purple)] hover:bg-[var(--ucbs-accent-purple)]/20"
            >
              <Sparkles className="h-4 w-4" />
              Ultimate Creator — 60 Sekunden
            </Link>
            <Link
              to={activeDna ? '/creator-dna' : '/creator-dna'}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline"
            >
              <Dna className="h-4 w-4" />
              {activeDna ? `DNA: ${activeDna.name}` : 'Creator DNA einrichten'}
            </Link>
          </div>
          <div className="flex flex-wrap gap-3 lg:flex-col">
            <GlassCard accent="purple" hover={false} className="min-w-[140px] px-5 py-4">
              <p className="text-xs text-zinc-500">Coins</p>
              <p className="font-display text-2xl font-bold text-white">{formatCoins(user?.coinBalance ?? 0)}</p>
            </GlassCard>
            <GlassCard accent="green" hover={false} className="min-w-[140px] px-5 py-4">
              <p className="text-xs text-zinc-500">Projekte</p>
              <p className="font-display text-2xl font-bold text-white">
                {statsQuery.isLoading ? '…' : statsQuery.data?.projects ?? 0}
              </p>
            </GlassCard>
          </div>
        </div>
      </GlassCard>

      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">Schnellaktionen</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.path} to={action.path}>
                <GlassCard accent={action.accent} className="flex items-center gap-3 !p-4">
                  <Icon className="h-5 w-5 text-[var(--ucbs-accent-cyan)]" />
                  <span className="text-sm font-medium text-zinc-200">{action.label}</span>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">Letzte Exporte</h2>
            <Link to="/file-cloud" className="text-sm text-[var(--ucbs-accent-cyan)] hover:underline">Alle anzeigen</Link>
          </div>
          {filesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : filesQuery.data?.length ? (
            <div className="space-y-2">
              {filesQuery.data.map((f) => (
                <GlassCard key={f.id} accent="none" hover={false} className="!p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{f.name}</p>
                      <p className="text-xs text-zinc-500">{f.category} · {f.source === 'generation' ? 'KI' : 'Upload'}</p>
                    </div>
                    <Cloud className="h-4 w-4 shrink-0 text-zinc-500" />
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <GlassCard accent="none" hover={false}>
              <p className="text-sm text-zinc-500">Noch keine Dateien — starte im Branding Studio.</p>
            </GlassCard>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">Meine Projekte</h2>
            <Link to="/projects" className="text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
              Alle anzeigen
            </Link>
          </div>
          {projectsQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : projectsQuery.data?.length ? (
            <div className="space-y-2">
              {projectsQuery.data.map((project) => (
                <Link key={project.id} to="/projects">
                  <GlassCard accent="purple" className="!p-4">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{project.name}</p>
                        <p className="text-xs text-zinc-500">{project.type} · {project.status}</p>
                      </div>
                      <FolderKanban className="h-4 w-4 text-zinc-500" />
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          ) : (
            <GlassCard accent="none" hover={false}>
              <p className="text-sm text-zinc-500">Noch keine Projekte — starte im Branding Studio.</p>
            </GlassCard>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">Cloud Status</h2>
        <GlassCard accent="green" hover={false}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">Generierungen</p>
              <p className="font-display text-xl font-bold text-white">
                {statsQuery.isLoading ? '…' : statsQuery.data?.generations ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Dateien</p>
              <p className="font-display text-xl font-bold text-white">
                {statsQuery.isLoading ? '…' : statsQuery.data?.files ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Projekte</p>
              <p className="font-display text-xl font-bold text-white">
                {statsQuery.isLoading ? '…' : statsQuery.data?.projects ?? 0}
              </p>
            </div>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
