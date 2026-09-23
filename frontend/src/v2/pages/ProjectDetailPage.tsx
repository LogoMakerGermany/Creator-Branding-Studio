import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import type { ProjectStatus } from '@ucbs/shared';
import { NEXTER_STUDIO_PATHS } from '@ucbs/shared';
import { PageHeader, Badge, Button, NeonCard, Input } from '@/components/ui';
import { Skeleton } from '@/v2/components/Skeleton';
import { api, ApiError, type DesignVersion } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { useNexterStore } from '@/v2/store/nexter-store';
import { formatCoins } from '@/lib/utils';

const STATUSES: ProjectStatus[] = ['draft', 'in_progress', 'review', 'revision', 'completed', 'archived'];

type Tab = 'overview' | 'assets' | 'video' | 'content' | 'files' | 'versions' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'assets', label: 'Assets' },
  { id: 'video', label: 'Videos & Shorts' },
  { id: 'content', label: 'Content' },
  { id: 'files', label: 'Files' },
  { id: 'versions', label: 'Versionen' },
  { id: 'export', label: 'Export' },
];

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

function AssetPreview({
  name,
  src,
  fileId,
}: {
  name: string;
  src?: string;
  fileId?: string;
}) {
  const [url, setUrl] = useState(src || '');
  useEffect(() => {
    setUrl(src || '');
  }, [src, fileId]);

  async function renew() {
    if (!fileId) return;
    try {
      const issued = await api.files.downloadUrl(fileId);
      setUrl(issued.downloadUrl);
    } catch {
      setUrl('');
    }
  }

  if (!url) return null;
  return (
    <img
      src={url}
      alt={name}
      className="mb-2 h-32 w-full object-contain"
      onError={() => {
        void renew();
      }}
    />
  );
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const activeProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useBrandProjectStore((s) => s.setActiveProjectId);
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const setPanelOpen = useNexterStore((s) => s.setPanelOpen);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.projects.overview>> | null>(null);
  const [changeJobId, setChangeJobId] = useState<string | null>(null);
  const [changeText, setChangeText] = useState('');
  const [pendingQuote, setPendingQuote] = useState<{ id: string; coinCost: number; label: string } | null>(null);
  const [versions, setVersions] = useState<DesignVersion[]>([]);
  const [renameValue, setRenameValue] = useState('');

  async function load() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await api.projects.overview(projectId);
      setOverview(data);
      setRenameValue(data.project.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Projekt nicht gefunden');
      setOverview(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof overview extends null ? never : NonNullable<typeof overview>['assets']>();
    for (const a of overview?.assets ?? []) {
      const key = a.type || 'other';
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [overview]);

  async function saveStatus(status: ProjectStatus) {
    if (!projectId) return;
    await api.projects.update(projectId, { status });
    await load();
  }

  async function quoteChange() {
    if (!changeJobId || !changeText.trim()) return;
    setError(null);
    try {
      const res = await api.changeRequest.quote(changeJobId, changeText.trim(), projectId);
      setPendingQuote({ id: res.quote.id, coinCost: res.quote.coinCost, label: res.honestLabel });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Angebot fehlgeschlagen');
    }
  }

  async function confirmChange() {
    if (!pendingQuote) return;
    setError(null);
    try {
      await api.nexter.confirmQuote(pendingQuote.id);
      setPendingQuote(null);
      setChangeText('');
      await refreshUser();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Änderung fehlgeschlagen');
      await refreshUser();
    }
  }

  async function cancelChange() {
    if (!pendingQuote) return;
    await api.nexter.cancelQuote(pendingQuote.id);
    setPendingQuote(null);
  }

  async function loadVersions(jobId: string) {
    const res = await api.changeRequest.versions(jobId);
    setVersions(res.versions);
  }

  async function restore(versionId: string) {
    await api.changeRequest.restore(versionId);
    await load();
    if (changeJobId) await loadVersions(changeJobId);
  }

  async function exportZip() {
    if (!projectId) return;
    setError(null);
    try {
      const result = await api.projects.export(projectId);
      if (result.exportUrl) {
        const a = document.createElement('a');
        a.href = result.exportUrl;
        a.download = `${result.project.name.replace(/\s+/g, '-')}.zip`;
        a.click();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ZIP-Export fehlgeschlagen');
    }
  }

  async function exportStreamset() {
    try {
      const res = await api.streamset.exportZip(projectId);
      const a = document.createElement('a');
      a.href = res.exportUrl;
      a.download = 'streamset.zip';
      a.click();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Streamset-ZIP nicht verfügbar');
    }
  }

  async function saveName() {
    if (!projectId || !renameValue.trim()) return;
    setError(null);
    try {
      await api.projects.rename(projectId, renameValue.trim());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Umbenennen fehlgeschlagen');
    }
  }

  async function removeAsset(assetId: string) {
    if (!projectId) return;
    setError(null);
    try {
      await api.projects.detachAsset(projectId, assetId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Asset konnte nicht entfernt werden');
    }
  }

  const project = overview?.project;
  const isNexterActive = Boolean(projectId && activeProjectId === projectId);

  function openNexter(prompt?: string) {
    if (project) {
      setActiveProjectId(project.id);
      void api.nexter.setActiveProject(project.id).catch(() => undefined);
    }
    setPanelOpen(true);
    if (prompt) queueNexterPrompt(prompt);
    navigate('/nexter');
  }

  function openStudio(path: string) {
    if (project) setActiveProjectId(project.id);
    navigate(`${path}?projectId=${encodeURIComponent(project?.id || '')}`);
  }

  return (
    <div className="space-y-6" data-testid="project-detail">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-4 w-4" /> Hub
        </Button>
      </div>

      <PageHeader
        title={project?.name ?? 'Projekt'}
        description="Zentrale Projektansicht — Assets, Versionen, Export. Keine Fake-Daten."
        badge={
          <span className="flex flex-wrap gap-1">
            <Badge variant="brand">NEXTER</Badge>
            {project?.status === 'archived' ? <Badge variant="default">Archiviert</Badge> : null}
          </span>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="space-y-2" aria-busy="true">
          <p className="text-sm text-zinc-500">Lade Projekt…</p>
          <Skeleton className="h-28" />
        </div>
      )}
      {!loading && notFound && !project && (
        <p className="text-sm text-zinc-400">Projekt nicht gefunden.</p>
      )}

      {project && (
        <>
          <NeonCard accent="cyan" title="Projekt">
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-header">
              <p className="text-sm text-zinc-300">
                Typ <span className="text-zinc-100">{project.type}</span>
                {project.platform ? ` · ${project.platform}` : ''}
              </p>
              <p className="text-sm text-zinc-300">
                Status{' '}
                <select
                  data-testid="project-status"
                  className="rounded border border-zinc-700 bg-surface-900 px-2 py-1 text-zinc-100"
                  value={project.status}
                  onChange={(e) => void saveStatus(e.target.value as ProjectStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </p>
              <p className="text-sm text-zinc-300" data-testid="project-dna">
                DNA {overview.dna ? `„${overview.dna.name}“ v${overview.dna.version ?? '?'}` : 'nicht verknüpft'}
                {overview.dna?.styleDirection ? ` · ${overview.dna.styleDirection}` : ''}
              </p>
              {overview.dna?.primaryColors?.length ? (
                <p className="text-xs text-zinc-400">Farben {overview.dna.primaryColors.join(', ')}</p>
              ) : null}
              <p className="text-xs text-zinc-500">Erstellt {project.createdAt.slice(0, 10)}</p>
              <p className="text-xs text-zinc-500">Aktualisiert {project.updatedAt.slice(0, 16).replace('T', ' ')}</p>
              <p className="text-sm text-zinc-300" data-testid="project-nexter-active">
                Nexter: {isNexterActive ? 'aktiv' : 'nicht aktiv'}
                {project.status === 'archived' ? ' · archiviert (nicht still reaktiviert)' : ''}
              </p>
            </div>
            <div className="mt-4 flex max-w-md flex-col gap-2">
              <Input label="Projektname" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
              <Button size="sm" variant="outline" className="min-h-11 w-fit" onClick={() => void saveName()}>
                Umbenennen
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-11"
                variant={isNexterActive ? 'secondary' : 'outline'}
                onClick={() => openNexter('Welche Dateien gehören zu diesem Projekt?')}
              >
                {isNexterActive ? 'Nexter öffnen' : 'Für Nexter nutzen'}
              </Button>
              <Button size="sm" variant="outline" className="min-h-11 gap-1" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Neu laden
              </Button>
              {project.status !== 'archived' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  data-testid="project-archive"
                  onClick={() => {
                    if (!projectId) return;
                    void api.projects.archive(projectId).then(() => load());
                  }}
                >
                  Archivieren
                </Button>
              )}
              <Link to="/creator-dna" className="inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                DNA ansehen
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['logo', 'Logo erstellen'],
                  ['banner', 'Banner'],
                  ['facecam', 'Facecam'],
                  ['overlay', 'Overlay'],
                  ['sticker', 'Sticker'],
                  ['mockup', 'Mockup'],
                  ['video', 'Video'],
                  ['layout', 'Layout'],
                  ['music', 'Musik'],
                  ['voice', 'Voice'],
                  ['animation', 'Animation'],
                  ['streamset', 'Streamset'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => openStudio(NEXTER_STUDIO_PATHS[key])}
                >
                  {label}
                </Button>
              ))}
            </div>
          </NeonCard>

          {overview.errors?.jobs && (
            <p className="text-sm text-amber-200" role="alert">
              {overview.errors.jobs}
            </p>
          )}
          {overview.streamset && (
            <Link to={overview.streamset.href}>
              <NeonCard accent="purple" title="Streamset">
                <p className="mt-2 text-sm text-zinc-300">
                  {overview.streamset.completed} von {overview.streamset.total} Assets fertig
                  {overview.streamset.status === 'partial' ? ' · teilweise' : ` · ${jobStatusLabel(overview.streamset.status)}`}
                </p>
              </NeonCard>
            </Link>
          )}
          <NeonCard accent="cyan" title="Jobs">
            {(overview.activeJobs?.length || overview.failedJobs?.length || overview.completedJobs?.length) ? (
              <ul className="mt-3 space-y-2 text-sm">
                {(overview.activeJobs ?? []).map((job) => (
                  <li key={job.id} className="text-zinc-200">
                    {job.label} · {jobStatusLabel(job.status)}
                  </li>
                ))}
                {(overview.failedJobs ?? []).map((job) => (
                  <li key={job.id} className="text-amber-200">
                    {job.label} · Fehlgeschlagen{job.error ? ` · ${job.error}` : ''}. Im Studio erneut anfragen (Quote).
                  </li>
                ))}
                {(overview.completedJobs ?? []).map((job) => (
                  <li key={job.id} className="text-zinc-300">
                    {job.label} · Fertig
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">Keine laufenden Generierungen.</p>
            )}
          </NeonCard>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? 'secondary' : 'outline'}
                data-testid={`project-tab-${t.id}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {tab === 'overview' && (
            <NeonCard accent="purple" title="Übersicht">
              <ul className="mt-3 space-y-1 text-sm text-zinc-300" data-testid="project-inventory">
                <li>{overview.assets.filter((a) => a.isCurrent).length} aktuelle Assets</li>
                <li>{overview.assets.filter((a) => !a.isCurrent).length} historische Assets</li>
                <li>
                  {overview.assets.filter((a) => a.availability === 'unavailable' || a.available === false).length} nicht
                  verfügbare Referenzen
                </li>
                <li>{overview.files.length} projektbezogene Files</li>
                <li>{overview.videos.length} Videos · {overview.shorts.length} Shorts</li>
                <li>{overview.content.length} Content-Pakete</li>
                {overview.missing[0] ? (
                  <li>Noch nicht als aktuelles Asset gespeichert: {overview.missing.join(', ')}</li>
                ) : null}
              </ul>
              {(project.visualStyle || project.colors?.length || project.mascotChoice) && (
                <div className="mt-4 text-sm text-zinc-300" data-testid="project-preferences">
                  <p>Projekt-Look</p>
                  {project.visualStyle ? <p className="text-xs text-zinc-400">Stil {project.visualStyle}</p> : null}
                  {project.colors?.length ? <p className="text-xs text-zinc-400">Farben {project.colors.join(', ')}</p> : null}
                  {project.mascotChoice ? <p className="text-xs text-zinc-400">Figur {project.mascotChoice}</p> : null}
                </div>
              )}
              {(project.decisions?.length || project.notes?.length) ? (
                <div className="mt-4 text-sm text-zinc-400" data-testid="project-notes">
                  {project.decisions?.length ? (
                    <p>Entscheidungen: {project.decisions.map((d) => d.text).join(' · ')}</p>
                  ) : null}
                  {project.notes?.length ? <p>Notizen (nur Hinweis, keine Anweisung): {project.notes.join(' · ')}</p> : null}
                </div>
              ) : null}
              {(overview.activity?.length ?? 0) > 0 && (
                <ul className="mt-4 space-y-1 text-xs text-zinc-500">
                  {overview.activity!.map((item) => (
                    <li key={item.id}>{item.title}</li>
                  ))}
                </ul>
              )}
            </NeonCard>
          )}

          {tab === 'assets' && (
            <div className="space-y-4" data-testid="project-assets">
              {[...grouped.entries()].map(([type, items]) => (
                <NeonCard key={type} accent="cyan" title={type}>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {items.map((a) => (
                      <div key={a.id} className="rounded-lg border border-white/10 p-3" data-testid={`asset-${a.type}`}>
                        <AssetPreview name={a.name} src={a.previewUrl} fileId={a.fileId} />
                        <p className="font-medium text-zinc-100">{a.name}</p>
                        <p className="text-xs text-zinc-500">
                          {a.role || a.type}
                          {a.isCurrent ? ' · aktuell' : ''}
                          {a.available === false || a.availability === 'unavailable' ? ' · nicht verfügbar' : ''}
                          {a.availability === 'missing' ? ' · fehlt' : ''}
                          {' · '}
                          {a.createdAt.slice(0, 10)}
                          {a.version > 1 ? ` · Version ${a.version}` : ''}
                          {a.jobId ? ` · Job ${a.jobId.slice(0, 8)}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {a.downloadable && a.url && (
                            <a href={a.fileId ? undefined : a.url} download target="_blank" rel="noreferrer">
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11 gap-1"
                                onClick={(e) => {
                                  if (!a.fileId) return;
                                  e.preventDefault();
                                  void api.files.downloadUrl(a.fileId).then((issued) => {
                                    const link = document.createElement('a');
                                    link.href = issued.downloadUrl;
                                    link.download = a.name;
                                    link.click();
                                  });
                                }}
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden /> Download
                              </Button>
                            </a>
                          )}
                          {a.studioPath && a.studioPath !== '/projects' && (
                            <Button size="sm" variant="outline" className="min-h-11" onClick={() => openStudio(a.studioPath!)}>
                              Weiterarbeiten
                            </Button>
                          )}
                          {a.changeSupported && a.jobId && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                onClick={() => {
                                  setChangeJobId(a.jobId!);
                                  setTab('versions');
                                  void loadVersions(a.jobId!);
                                }}
                              >
                                Ändern
                              </Button>
                              <Link
                                to={`/change-request?jobId=${encodeURIComponent(a.jobId)}`}
                                className="inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline"
                              >
                                Änderung anfordern
                              </Link>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => void removeAsset(a.id)}
                          >
                            Aus Projekt entfernen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </NeonCard>
              ))}
              {!overview.assets.length && (
                <div>
                  <p className="text-sm text-zinc-500">Dieses Projekt hat noch keine Assets.</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button type="button" className="min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline" onClick={() => openStudio(NEXTER_STUDIO_PATHS.logo)}>
                      Logo erstellen
                    </button>
                    <Link to="/file-cloud" className="inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                      Datei hinzufügen
                    </Link>
                    <button type="button" className="min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline" onClick={() => openNexter('Was fehlt meinem Streamset noch?')}>
                      Nexter fragen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'video' && (
            <NeonCard accent="cyan" title="Videos & Shorts">
              <div className="mt-3 space-y-2 text-sm" data-testid="project-videos">
                {overview.videos.map((v) => (
                  <p key={v.id} className="text-zinc-300">
                    {v.title} {v.renderUrl ? '· MP4' : ''}
                  </p>
                ))}
                {overview.shorts.map((s) => (
                  <p key={s.id} className="text-zinc-300">
                    Short {s.id.slice(0, 8)} {s.videoUrl ? '· Download' : ''}
                  </p>
                ))}
                {!overview.videos.length && !overview.shorts.length && (
                  <p className="text-zinc-500">Keine Videos/Shorts diesem Projekt zugeordnet.</p>
                )}
              </div>
            </NeonCard>
          )}

          {tab === 'content' && (
            <NeonCard accent="purple" title="Content">
              <div className="mt-3 space-y-2" data-testid="project-content">
                {overview.content.map((c) => (
                  <Link key={c.id} to="/text-studio" className="block text-sm text-violet-300">
                    {c.title}
                  </Link>
                ))}
                {!overview.content.length && <p className="text-sm text-zinc-500">Keine Content-Pakete.</p>}
              </div>
            </NeonCard>
          )}

          {tab === 'files' && (
            <NeonCard accent="cyan" title="Files dieses Projekts">
              <div className="mt-3 space-y-2" data-testid="project-files">
                {overview.files.map((f) => (
                  <p key={f.id} className="text-sm text-zinc-300">
                    {f.name} · {f.mimeType}
                  </p>
                ))}
                {!overview.files.length && (
                  <div>
                    <p className="text-sm text-zinc-500">Keine Files mit projectId. Globale Dateien bleiben in der File Cloud.</p>
                    <Link to="/file-cloud" className="mt-2 inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                      Datei hinzufügen
                    </Link>
                  </div>
                )}
              </div>
            </NeonCard>
          )}

          {tab === 'versions' && (
            <NeonCard accent="purple" title="Versionen / Änderungen">
              <p className="mt-2 text-xs text-zinc-500">
                Bild-Änderungen sind KI-Varianten auf Basis des bestehenden Designs — keine Layer-Bearbeitung. DNA-Locks
                gelten serverseitig. Restore kostet 0 Coins.
              </p>
              <div className="mt-4 space-y-3" data-testid="project-change">
                <select
                  className="w-full rounded border border-zinc-700 bg-surface-900 px-2 py-2 text-sm"
                  value={changeJobId ?? ''}
                  onChange={(e) => {
                    setChangeJobId(e.target.value || null);
                    if (e.target.value) void loadVersions(e.target.value);
                  }}
                >
                  <option value="">Asset mit Job wählen</option>
                  {overview.assets
                    .filter((a) => a.changeSupported && a.jobId)
                    .map((a) => (
                      <option key={a.jobId} value={a.jobId}>
                        {a.name}
                      </option>
                    ))}
                </select>
                <Input
                  data-testid="change-request-text"
                  label="Änderungswunsch"
                  value={changeText}
                  onChange={(e) => setChangeText(e.target.value)}
                  placeholder="z.B. Mach den Hintergrund dunkler"
                />
                {!pendingQuote ? (
                  <Button data-testid="change-quote" size="sm" onClick={() => void quoteChange()} disabled={!changeJobId}>
                    Angebot einholen
                  </Button>
                ) : (
                  <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3" data-testid="change-quote-bar">
                    <p data-testid="change-quote-cost" className="text-sm text-violet-100">
                      {formatCoins(pendingQuote.coinCost)} Coins — {pendingQuote.label}. Startet erst nach Bestätigung.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button data-testid="change-confirm" size="sm" onClick={() => void confirmChange()}>
                        Bestätigen
                      </Button>
                      <Button data-testid="change-cancel" size="sm" variant="outline" onClick={() => void cancelChange()}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}
                {versions.length > 0 && (
                  <div className="space-y-2" data-testid="design-versions">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-zinc-300">
                          Version {v.version}
                          {v.changeRequest ? ` · ${v.changeRequest}` : ''}
                        </span>
                        <Button size="sm" variant="outline" data-testid={`restore-v${v.version}`} onClick={() => void restore(v.id)}>
                          Wiederherstellen (0 Coins)
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </NeonCard>
          )}

          {tab === 'export' && (
            <NeonCard accent="cyan" title="Projekt-Export">
              <p className="mt-2 text-sm text-zinc-400">
                Echter Brand-Projekt-ZIP mit Manifest. Ultimate Export Center ist ein Legacy-Pack-Workflow und kein
                Projekt-ZIP.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button data-testid="project-zip-export" className="gap-1" onClick={() => void exportZip()}>
                  <Download className="h-4 w-4" /> Projekt-ZIP
                </Button>
                <Button variant="outline" onClick={() => void exportStreamset()}>
                  Streamset-ZIP (nur vorhandene Dateien)
                </Button>
              </div>
            </NeonCard>
          )}
        </>
      )}
    </div>
  );
}
