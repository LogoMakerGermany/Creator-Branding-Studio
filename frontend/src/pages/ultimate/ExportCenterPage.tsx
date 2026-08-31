import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import type { UltimateCreatorProject, UltimatePackAsset } from '@ucbs/shared';
import { api, ApiError } from '@/services/api';
import { useProjectStore } from '@/v2/store/project-store';
import { LivePreviewStage } from '@/components/ultimate';
import { Button } from '@/components/ui';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

function assetStatusLabel(status: UltimatePackAsset['status']) {
  switch (status) {
    case 'completed':
      return 'Fertig';
    case 'pending':
      return 'Generiert…';
    case 'failed':
      return 'Fehler';
    default:
      return status;
  }
}

export function ExportCenterPage() {
  const [searchParams] = useSearchParams();
  const projectIdParam = searchParams.get('project');
  const { projects, activeProjectId, setProjects, setActiveProjectId, upsertProject } = useProjectStore();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<UltimateCreatorProject | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const list = await api.ultimateCreator.listProjects();
      setProjects(list);
    } catch {
      /* ignore */
    }
  }, [setProjects]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const p = await api.ultimateCreator.getProject(id);
        upsertProject(p);
        setDetail(p);
        setActiveProjectId(id);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Projekt konnte nicht geladen werden');
      }
    },
    [setActiveProjectId, upsertProject]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadProjects();
      const id = projectIdParam ?? activeProjectId;
      if (id) await loadDetail(id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdParam]);

  useEffect(() => {
    if (!detail || detail.status === 'ready' || detail.status === 'exported' || detail.status === 'partial') return;
    const t = setInterval(() => {
      void loadDetail(detail.id);
    }, 8000);
    return () => clearInterval(t);
  }, [detail?.id, detail?.status, loadDetail]);

  async function handleExport() {
    if (!detail) return;
    setExporting(true);
    setError(null);
    try {
      const res = await api.ultimateCreator.exportProject(detail.id);
      setDetail(res.project);
      const urls = res.project.assets.filter((a) => a.imageUrl).map((a) => a.imageUrl!);
      if (urls.length) {
        urls.forEach((url) => window.open(url, '_blank'));
      } else {
        setError('Noch keine exportierbaren Assets');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  }

  const logoUrl = detail?.logoImageUrl ?? detail?.assets.find((a) => a.key === 'logo')?.imageUrl;
  const bannerUrl = detail?.assets.find((a) => a.key.includes('banner'))?.imageUrl;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <FolderOpen className="h-7 w-7 text-[var(--ucbs-accent-cyan)]" />
            Ultimate Pack (Legacy)
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Öffnet vorhandene Ultimate-Creator-Bild-URLs. Der echte Projekt-ZIP liegt unter Projekte.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => detail && loadDetail(detail.id)} disabled={!detail}>
            <RefreshCw className="mr-1 h-4 w-4" /> Aktualisieren
          </Button>
          <Button size="sm" onClick={handleExport} disabled={!detail || exporting}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            URLs öffnen
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          {projects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadDetail(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    detail?.id === p.id
                      ? 'border-[var(--ucbs-accent-cyan)] bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]'
                      : 'border-white/10 text-zinc-500'
                  }`}
                >
                  {p.name} · {p.status}
                </button>
              ))}
            </div>
          )}

          {!detail ? (
            <Card className="border-white/10 bg-zinc-950/60 py-12 text-center text-sm text-zinc-500">
              Noch kein Ultimate-Projekt.{' '}
              <Link to="/ultimate-creator" className="text-[var(--ucbs-accent-purple)] hover:underline">
                Jetzt erstellen
              </Link>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-white/10 bg-zinc-950/60">
                <CardHeader>
                  <CardTitle className="text-base">{detail.name}</CardTitle>
                  <p className="text-xs text-zinc-500">Status: {detail.status}</p>
                </CardHeader>
                <div className="space-y-2">
                  {detail.assets.map((a) => (
                    <div
                      key={a.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs"
                    >
                      <span className="text-zinc-300">{a.label}</span>
                      <span className="text-zinc-500">{assetStatusLabel(a.status)}</span>
                      {a.imageUrl && (
                        <a
                          href={a.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-[var(--ucbs-accent-cyan)] hover:underline"
                        >
                          Öffnen
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="border-white/10 bg-zinc-950/60">
                <CardHeader>
                  <CardTitle className="text-base">Plattform-Vorschau</CardTitle>
                </CardHeader>
                <LivePreviewStage
                  platforms={detail.platforms}
                  logoUrl={logoUrl}
                  bannerUrl={bannerUrl}
                  assets={detail.assets.map((a) => ({ key: a.key, label: a.label, imageUrl: a.imageUrl }))}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
