import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Dna, Image, Film, Bot, Cloud, FolderKanban, Sparkles,
  Camera, LayoutTemplate, Share2, Sticker, Layers,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type DashboardSummary } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { GlassCard } from '@/v2/components/GlassCard';
import { Skeleton } from '@/v2/components/Skeleton';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';

export const DASHBOARD_QUICK_ACTIONS = [
  { label: 'Logo erstellen', path: '/logo-studio', icon: Sparkles, accent: 'cyan' as const },
  { label: 'Streamset erstellen', path: '/streamset-studio', icon: Layers, accent: 'purple' as const },
  { label: 'Facecam erstellen', path: '/facecam-studio', icon: Camera, accent: 'green' as const },
  { label: 'Banner erstellen', path: '/banner-studio', icon: Image, accent: 'purple' as const },
  { label: 'Sticker erstellen', path: '/sticker-studio', icon: Sticker, accent: 'cyan' as const },
  { label: 'Video / Short', path: '/video-studio', icon: Film, accent: 'cyan' as const },
  { label: 'Layout erstellen', path: '/layout-studio', icon: LayoutTemplate, accent: 'purple' as const },
  { label: 'Social Content planen', path: '/social-studio', icon: Share2, accent: 'green' as const },
] as const;

export const DASHBOARD_NEXTER_PROMPTS = [
  { label: 'Was möchtest du heute erstellen?', prompt: 'Was möchtest du heute erstellen?' },
  { label: 'Weiter am letzten Projekt', prompt: 'Weiter an meinem letzten Projekt' },
  { label: 'Letzte Dateien', prompt: 'Zeig mir meine letzten Dateien' },
  { label: 'Was steht heute im Kalender?', prompt: 'Was steht heute im Kalender?' },
  { label: 'Neues Logo', prompt: 'Erstelle ein neues Logo' },
  { label: 'Content planen', prompt: 'Plane meinen Content' },
] as const;

function greetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 18) return 'Guten Abend';
  if (hour < 12) return 'Guten Morgen';
  return 'Guten Tag';
}

function jobStatusLabel(status: string): string {
  switch (status) {
    case 'queued':
    case 'pending':
      return 'Wartet';
    case 'processing':
    case 'running':
      return 'Wird erstellt …';
    case 'completed':
      return 'Fertig';
    case 'failed':
      return 'Fehlgeschlagen';
    case 'partial':
      return 'Teilweise fertig';
    default:
      return status;
  }
}

function SectionError({ message }: { message: string }) {
  return (
    <p className="text-sm text-amber-200" role="alert">
      {message}
    </p>
  );
}

function FileThumb({
  file,
}: {
  file: DashboardSummary['files'][number];
}) {
  const [src, setSrc] = useState(file.available === false ? '' : file.downloadUrl || '');
  const [failed, setFailed] = useState(file.available === false);

  useEffect(() => {
    setSrc(file.available === false ? '' : file.downloadUrl || '');
    setFailed(file.available === false);
  }, [file.id, file.downloadUrl, file.available]);

  async function renew() {
    try {
      const issued = await api.files.downloadUrl(file.id);
      setSrc(issued.downloadUrl);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  if (!file.mimeType.startsWith('image/') || failed || !src) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/40 text-[10px] uppercase text-zinc-400">
        {file.category.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={file.name}
      className="h-12 w-12 shrink-0 rounded-lg object-cover"
      onError={() => {
        void renew();
      }}
    />
  );
}

export function DashboardV2Page() {
  const { user, activeDna } = useAuth();
  const navigate = useNavigate();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const setPanelOpen = useNexterStore((s) => s.setPanelOpen);
  const setActiveProjectId = useBrandProjectStore((s) => s.setActiveProjectId);
  const [tabHidden, setTabHidden] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );

  useEffect(() => {
    function onVis() {
      setTabHidden(document.visibilityState === 'hidden');
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => (await api.dashboard.summary()).dashboard,
    refetchInterval: (query) => {
      if (tabHidden) return false;
      const count = query.state.data?.activeJobCount ?? 0;
      return count > 0 ? 10_000 : false;
    },
  });

  const calendarQuery = useQuery({
    queryKey: ['dashboard-upcoming-planning', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const res = await api.calendar.list();
      return {
        today: res.today ?? [],
        upcomingItems: res.upcomingItems?.slice(0, 5) ?? [],
      };
    },
  });

  const data = summaryQuery.data;
  const greetingName = data?.greetingName || user?.displayName?.trim() || 'Creator';
  const coinBalanceKnown = data != null || user != null;
  const coinBalance = data?.errors.coins
    ? user?.coinBalance
    : (data?.coinBalance ?? user?.coinBalance);
  const dna = data?.dna ?? (activeDna
    ? { id: activeDna.id, name: activeDna.name, styleDirection: activeDna.styleDirection, primaryColors: activeDna.primaryColors ?? [] }
    : null);

  function openNexter(prompt?: string) {
    setPanelOpen(true);
    if (prompt) queueNexterPrompt(prompt);
    navigate('/nexter');
  }

  return (
    <div className="space-y-8" aria-busy={summaryQuery.isLoading || calendarQuery.isLoading}>
      <GlassCard accent="cyan" className="!p-0 overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-[var(--ucbs-accent-cyan)]">
              {greetingPrefix()}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
              {greetingPrefix()}, {greetingName}.
            </h1>
            <p className="mt-2 max-w-xl text-zinc-400">
              Deine eigenen Projekte, Dateien und geplante Inhalte — ohne Demo-Daten.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--ucbs-accent-purple)] px-4 py-2 text-sm font-semibold text-white"
                onClick={() => openNexter('Was möchtest du heute erstellen?')}
              >
                <Bot className="h-4 w-4" aria-hidden />
                Nexter öffnen
              </button>
              {DASHBOARD_NEXTER_PROMPTS.slice(1, 4).map((item) => (
                <button
                  key={item.prompt}
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                  onClick={() => openNexter(item.prompt)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 lg:flex-col">
            <GlassCard accent="purple" hover={false} className="min-w-[140px] px-5 py-4">
              <p className="text-xs text-zinc-500">Coins</p>
              <p className="font-display text-2xl font-bold text-white" aria-busy={!coinBalanceKnown}>
                {coinBalanceKnown && coinBalance != null ? `${formatCoins(coinBalance)} Coins` : '…'}
              </p>
              {data?.errors.coins && <SectionError message={data.errors.coins} />}
              <Link
                to="/coins"
                className="mt-2 inline-flex min-h-11 items-center text-xs text-[var(--ucbs-accent-cyan)] hover:underline"
              >
                Coins-Übersicht
              </Link>
            </GlassCard>
            <GlassCard accent="green" hover={false} className="min-w-[140px] px-5 py-4">
              <p className="text-xs text-zinc-500">Projekte</p>
              <p className="font-display text-2xl font-bold text-white">
                {summaryQuery.isLoading ? '…' : data?.projectCount ?? 0}
              </p>
            </GlassCard>
            <GlassCard accent="cyan" hover={false} className="min-w-[140px] px-5 py-4">
              <p className="text-xs text-zinc-500">Laufende Jobs</p>
              <p className="font-display text-2xl font-bold text-white">
                {summaryQuery.isLoading ? '…' : data?.activeJobCount ?? 0}
              </p>
            </GlassCard>
          </div>
        </div>
      </GlassCard>

      <section aria-labelledby="dash-actions">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="dash-actions" className="font-display text-lg font-semibold text-white">Schnellaktionen</h2>
          <Link to="/logo-studio" className="text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
            Alle Studios
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DASHBOARD_QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.path} to={action.path} className="min-h-11">
                <GlassCard accent={action.accent} className="flex items-center gap-3 !p-4">
                  <Icon className="h-5 w-5 shrink-0 text-[var(--ucbs-accent-cyan)]" aria-hidden />
                  <span className="text-sm font-medium text-zinc-200">{action.label}</span>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="dash-jobs">
        <h2 id="dash-jobs" className="mb-4 font-display text-lg font-semibold text-white">Aktuelle Arbeit</h2>
        {summaryQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : data?.errors.jobs ? (
          <GlassCard accent="none" hover={false}><SectionError message={data.errors.jobs} /></GlassCard>
        ) : (
          <div className="space-y-2">
            {data?.streamset && (
              <Link to={data.streamset.href}>
                <GlassCard accent="purple" className="!p-4">
                  <p className="text-sm font-medium text-white">Streamset</p>
                  <p className="text-xs text-zinc-400">
                    {data.streamset.completed} von {data.streamset.total} Assets fertig
                    {data.streamset.status === 'partial' ? ' · teilweise' : ` · ${jobStatusLabel(data.streamset.status)}`}
                  </p>
                </GlassCard>
              </Link>
            )}
            {(data?.activeJobs.length ?? 0) === 0 && (data?.failedJobs.length ?? 0) === 0 && !data?.streamset ? (
              <GlassCard accent="none" hover={false}>
                <p className="text-sm text-zinc-500">Aktuell keine laufenden Generierungen.</p>
              </GlassCard>
            ) : null}
            {data?.activeJobs.map((job) => (
              <Link key={job.id} to={job.href}>
                <GlassCard accent="cyan" className="!p-4">
                  <p className="text-sm font-medium text-white">{job.label}</p>
                  <p className="text-xs text-zinc-400">{jobStatusLabel(job.status)}</p>
                </GlassCard>
              </Link>
            ))}
            {data?.failedJobs.map((job) => (
              <Link key={job.id} to={job.href}>
                <GlassCard accent="none" className="!p-4">
                  <p className="text-sm font-medium text-white">{job.label}</p>
                  <p className="text-xs text-amber-200">
                    Fehlgeschlagen{job.error ? ` · ${job.error}` : ''}. Im Studio erneut anfragen (Quote).
                  </p>
                </GlassCard>
              </Link>
            ))}
            {data?.recentCompletedJobs.slice(0, 2).map((job) => (
              <Link key={job.id} to={job.fileId ? '/file-cloud' : job.href}>
                <GlassCard accent="green" className="!p-4">
                  <p className="text-sm font-medium text-white">{job.label}</p>
                  <p className="text-xs text-zinc-400">Fertig · öffnen</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="dash-projects">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="dash-projects" className="font-display text-lg font-semibold text-white">Letzte Projekte</h2>
            <Link to="/projects" className="text-sm text-[var(--ucbs-accent-cyan)] hover:underline">Alle Projekte</Link>
          </div>
          {summaryQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : data?.errors.projects ? (
            <GlassCard accent="none" hover={false}><SectionError message={data.errors.projects} /></GlassCard>
          ) : data?.projects.length ? (
            <div className="space-y-2">
              {data.projects.map((project) => (
                <Link
                  key={project.id}
                  to={project.continuePath}
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <GlassCard accent="purple" className="!p-4">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{project.name}</p>
                        <p className="text-xs text-zinc-500">
                          {project.type} · {project.status} · {new Date(project.updatedAt).toLocaleString('de-DE')}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-[var(--ucbs-accent-cyan)]">Weiterarbeiten</span>
                      <FolderKanban className="h-4 w-4 text-zinc-500" aria-hidden />
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          ) : (
            <GlassCard accent="none" hover={false}>
              <p className="text-sm text-zinc-500">Noch keine Projekte.</p>
              <Link to="/projects" className="mt-2 inline-block min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                Erstes Projekt erstellen
              </Link>
            </GlassCard>
          )}
        </section>

        <section aria-labelledby="dash-files">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="dash-files" className="font-display text-lg font-semibold text-white">Letzte Dateien</h2>
            <Link to="/file-cloud" className="text-sm text-[var(--ucbs-accent-cyan)] hover:underline">Alle Dateien</Link>
          </div>
          {summaryQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : data?.errors.files ? (
            <GlassCard accent="none" hover={false}><SectionError message={data.errors.files} /></GlassCard>
          ) : data?.files.length ? (
            <div className="space-y-2">
              {data.files.map((file) => (
                <Link key={file.id} to="/file-cloud">
                  <GlassCard accent="none" hover={false} className="!p-4">
                    <div className="flex items-center gap-3">
                      <FileThumb file={file} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{file.name}</p>
                        <p className="text-xs text-zinc-500">{file.category}</p>
                      </div>
                      <Cloud className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          ) : (
            <GlassCard accent="none" hover={false}>
              <p className="text-sm text-zinc-500">Noch keine Dateien.</p>
              <Link to="/logo-studio" className="mt-2 inline-block min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                Erstes Asset erstellen
              </Link>
            </GlassCard>
          )}
        </section>
      </div>

      <section aria-labelledby="dash-cal">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="dash-cal" className="font-display text-lg font-semibold text-white">Heute & als Nächstes</h2>
          <Link to="/content-calendar" className="text-sm text-[var(--ucbs-accent-cyan)] hover:underline">Kalender öffnen</Link>
        </div>
        {calendarQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : calendarQuery.isError || data?.errors.calendar ? (
          <GlassCard accent="none" hover={false}>
            <SectionError message="Kalender konnte nicht geladen werden." />
          </GlassCard>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <GlassCard accent="cyan" hover={false} className="!p-4">
              <h3 className="text-sm font-semibold text-white">Heute</h3>
              {(calendarQuery.data?.today.length ?? data?.today.length ?? 0) === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">Heute ist nichts geplant.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {(calendarQuery.data?.today ?? data?.today ?? []).map((item) => (
                    <li key={item.id} className="text-sm text-zinc-200">
                      <span className="font-medium">{item.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {item.scheduledAt ? new Date(item.scheduledAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}
                        {item.platform ? ` · ${item.platform}` : ''} · {item.plannerLabel || ('status' in item ? item.status : '')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
            <GlassCard accent="purple" hover={false} className="!p-4">
              <h3 className="text-sm font-semibold text-white">Als Nächstes</h3>
              {(calendarQuery.data?.upcomingItems.length ?? data?.upcoming.length ?? 0) === 0 ? (
                <>
                  <p className="mt-2 text-sm text-zinc-500">Noch nichts geplant.</p>
                  <Link to="/social-studio" className="mt-2 inline-block text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                    Post planen
                  </Link>
                </>
              ) : (
                <ul className="mt-2 space-y-2">
                  {(calendarQuery.data?.upcomingItems ?? data?.upcoming ?? []).map((item) => (
                    <li key={item.id} className="text-sm text-zinc-200">
                      <span className="font-medium">{item.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                        {item.platform ? ` · ${item.platform}` : ''} · {item.plannerLabel || ('status' in item ? item.status : '')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="dash-dna">
          <h2 id="dash-dna" className="mb-4 font-display text-lg font-semibold text-white">Creator DNA</h2>
          <GlassCard accent="green" hover={false}>
            {data?.errors.dna ? (
              <SectionError message={data.errors.dna} />
            ) : dna ? (
              <>
                <p className="text-sm font-medium text-white">{dna.name}</p>
                <p className="mt-1 text-xs text-zinc-400">Stil: {dna.styleDirection || '—'}</p>
                {dna.primaryColors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="Markenfarben">
                    {dna.primaryColors.map((color) => (
                      <span key={color} className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span
                          className="h-8 w-8 rounded-lg border border-white/20"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span>{color}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link to="/creator-dna" className="min-h-11 text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline">
                    DNA ansehen
                  </Link>
                  <Link to="/creator-dna" className="min-h-11 text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline">
                    DNA bearbeiten
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-400">Noch keine Creator DNA eingerichtet.</p>
                <Link to="/creator-dna" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline">
                  <Dna className="h-4 w-4" aria-hidden />
                  Creator DNA einrichten
                </Link>
              </>
            )}
          </GlassCard>
        </section>

        <section aria-labelledby="dash-setup">
          <h2 id="dash-setup" className="mb-4 font-display text-lg font-semibold text-white">Setup</h2>
          <GlassCard accent="none" hover={false}>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>{data?.setup.hasDna ? 'Creator DNA eingerichtet' : 'Creator DNA fehlt'}</li>
              <li>{data?.setup.hasNexterPersonalization ? 'Nexter personalisiert' : 'Nexter noch nicht personalisiert'}</li>
              <li>{data?.setup.hasProject ? 'Erstes Projekt vorhanden' : 'Noch kein Projekt'}</li>
              <li>{data?.setup.hasFile ? 'Erstes Asset vorhanden' : 'Noch kein Asset'}</li>
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              {data?.fileCount ?? 0} Dateien · {data?.projectCount ?? 0} Projekte · {data?.plannedCount ?? 0} geplante Inhalte
            </p>
            {data && data.coinHistory.length > 0 && (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Letzte Coin-Bewegungen</h3>
                <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                  {data.coinHistory.map((tx) => (
                    <li key={tx.id}>
                      {tx.type} · {tx.amount > 0 ? 'Gutschrift +' : 'Abbuchung −'}{Math.abs(tx.amount)} Coins · {tx.description}
                    </li>
                  ))}
                </ul>
                <Link to="/coins" className="mt-2 inline-flex min-h-11 items-center text-xs text-[var(--ucbs-accent-cyan)] hover:underline">
                  Vollständigen Verlauf
                </Link>
              </>
            )}
            <Link to="/settings" className="mt-3 inline-block min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
              Einstellungen
            </Link>
            <Link to="/support" className="ml-4 mt-3 inline-block min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
              Hilfe
            </Link>
          </GlassCard>
        </section>
      </div>

      {data && data.activity.length > 0 && (
        <section aria-labelledby="dash-activity">
          <h2 id="dash-activity" className="mb-4 font-display text-lg font-semibold text-white">Letzte Aktivität</h2>
          <div className="space-y-2">
            {data.activity.map((item) => (
              <Link key={item.id} to={item.href}>
                <GlassCard accent="none" hover={false} className="!p-3">
                  <p className="text-sm text-zinc-200">{item.title}</p>
                  <p className="text-xs text-zinc-500">{item.at ? new Date(item.at).toLocaleString('de-DE') : ''}</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
