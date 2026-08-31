import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import type { ProjectStatus } from '@ucbs/shared';
import { PageHeader, Badge, Button, NeonCard, Input } from '@/components/ui';
import { api, ApiError, type DesignVersion } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
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

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const activeProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useBrandProjectStore((s) => s.setActiveProjectId);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.projects.overview>> | null>(null);
  const [changeJobId, setChangeJobId] = useState<string | null>(null);
  const [changeText, setChangeText] = useState('');
  const [pendingQuote, setPendingQuote] = useState<{ id: string; coinCost: number; label: string } | null>(null);
  const [versions, setVersions] = useState<DesignVersion[]>([]);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.projects.overview(projectId);
      setOverview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Projekt nicht gefunden');
      setOverview(null);
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

  const project = overview?.project;
  const isNexterActive = Boolean(projectId && activeProjectId === projectId);

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
        badge={<Badge variant="brand">NEXTER</Badge>}
      />

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
      {loading && <p className="text-sm text-zinc-500">Lade Projekt…</p>}

      {project && (
        <>
          <NeonCard accent="cyan" title="Projekt">
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-header">
              <p className="text-sm text-zinc-300">
                Typ <span className="text-zinc-100">{project.type}</span>
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
              </p>
              <p className="text-xs text-zinc-500">Erstellt {project.createdAt.slice(0, 10)}</p>
              <p className="text-xs text-zinc-500">Aktualisiert {project.updatedAt.slice(0, 16).replace('T', ' ')}</p>
              <p className="text-sm text-zinc-300" data-testid="project-nexter-active">
                Nexter: {isNexterActive ? 'aktiv' : 'nicht aktiv'}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={isNexterActive ? 'secondary' : 'outline'}
                onClick={() => setActiveProjectId(project.id)}
              >
                {isNexterActive ? 'Aktiv für Nexter' : 'Für Nexter nutzen'}
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" /> Neu laden
              </Button>
            </div>
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
                <li>{overview.assets.length} Assets</li>
                <li>{overview.files.length} projektbezogene Files</li>
                <li>{overview.videos.length} Videos · {overview.shorts.length} Shorts</li>
                <li>{overview.content.length} Content-Pakete</li>
                {overview.missing[0] && <li>Streamset fehlt noch: {overview.missing.join(', ')}</li>}
              </ul>
            </NeonCard>
          )}

          {tab === 'assets' && (
            <div className="space-y-4" data-testid="project-assets">
              {[...grouped.entries()].map(([type, items]) => (
                <NeonCard key={type} accent="cyan" title={type}>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {items.map((a) => (
                      <div key={a.id} className="rounded-lg border border-white/10 p-3" data-testid={`asset-${a.type}`}>
                        {a.previewUrl && (
                          <img src={a.previewUrl} alt={a.name} className="mb-2 h-32 w-full object-contain" />
                        )}
                        <p className="font-medium text-zinc-100">{a.name}</p>
                        <p className="text-xs text-zinc-500">
                          {a.type} · {a.createdAt.slice(0, 10)}
                          {a.version > 1 ? ` · Version ${a.version}` : ''}
                          {a.jobId ? ` · Job ${a.jobId.slice(0, 8)}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {a.downloadable && a.url && (
                            <a href={a.url} download target="_blank" rel="noreferrer">
                              <Button size="sm" variant="outline" className="gap-1">
                                <Download className="h-3.5 w-3.5" /> Download
                              </Button>
                            </a>
                          )}
                          {a.changeSupported && a.jobId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setChangeJobId(a.jobId!);
                                setTab('versions');
                                void loadVersions(a.jobId!);
                              }}
                            >
                              Ändern
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </NeonCard>
              ))}
              {!overview.assets.length && <p className="text-sm text-zinc-500">Noch keine Assets in diesem Projekt.</p>}
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
                  <p className="text-sm text-zinc-500">Keine Files mit projectId. Globale Dateien bleiben in der File Cloud.</p>
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
