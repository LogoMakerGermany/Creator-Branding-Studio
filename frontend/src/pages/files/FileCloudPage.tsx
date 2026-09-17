import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cloud, Upload, Trash2, Download, Image as ImageIcon, LayoutGrid, List } from 'lucide-react';
import { PageHeader, Badge, Button, NeonCard, Input, StatCard } from '@/components/ui';
import { StudioErrorBanner } from '@/components/studio';
import { api, ApiError, type UserFile } from '@/services/api';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { useNexterStore } from '@/v2/store/nexter-store';

const UPLOAD_CATEGORIES = [
  { id: 'logo', label: 'Logo' },
  { id: 'banner', label: 'Banner' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'sticker', label: 'Sticker' },
  { id: 'video', label: 'Video' },
  { id: 'project', label: 'Projekt' },
  { id: 'other', label: 'Sonstiges' },
] as const;

const KIND_FILTERS = [
  { id: 'all', label: 'Alle' },
  { id: 'image', label: 'Bilder' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'other', label: 'Sonstiges' },
] as const;

const SOURCE_FILTERS = [
  { id: 'all', label: 'Alle Quellen' },
  { id: 'generation', label: 'Studio-Ergebnisse' },
  { id: 'upload', label: 'Eigene Uploads' },
] as const;

const CATEGORY_FILTERS = [{ id: 'all', label: 'Alle Typen' }, ...UPLOAD_CATEGORIES] as const;

const IMAGE_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapFileError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Network Error';
  if (err.code === 'EMPTY_UPLOAD') return 'Leere Datei ist nicht erlaubt';
  if (err.code === 'FILE_TOO_LARGE' || err.status === 413) return 'Datei zu groß';
  if (err.code === 'INVALID_UPLOAD') return err.message.includes('erlaubt') ? 'Dateityp nicht erlaubt' : 'Ungültiger Upload';
  if (err.code === 'FILE_MISSING' || err.status === 410) return 'Datei nicht verfügbar';
  if (err.code === 'DELETE_BLOCKED' || err.status === 409) return 'Löschen durch Referenzen blockiert';
  if (err.code === 'NOT_FOUND' && /projekt/i.test(err.message)) return 'Projekt nicht gefunden';
  if (err.code === 'NOT_FOUND') return 'Datei nicht gefunden';
  if (err.status === 401 || err.status === 403) return 'Unauthorized';
  if (/fetch|network/i.test(err.message)) return 'Network Error';
  return err.message || 'Speichern fehlgeschlagen';
}

function isImage(file: UserFile) {
  return file.mimeType.startsWith('image/');
}
function isAudio(file: UserFile) {
  return file.mimeType.startsWith('audio/');
}
function isVideo(file: UserFile) {
  return file.mimeType.startsWith('video/') || file.category === 'video';
}
function isSvg(file: UserFile) {
  return file.mimeType.includes('svg') || file.name.toLowerCase().endsWith('.svg');
}

export function FileCloudPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useSearchParams();
  const view = search.get('view') === 'list' ? 'list' : 'grid';
  const kind = search.get('kind') || 'all';
  const categoryFilter = search.get('category') || 'all';
  const sort = search.get('sort') || 'newest';
  const q = search.get('q') || '';
  const sourceFilter = search.get('source') || 'all';
  const projectFilter = search.get('project') || '';
  const deepFileId = search.get('file');

  const [files, setFiles] = useState<UserFile[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ total: 0, image: 0, video: 0, audio: 0 });
  const [category, setCategory] = useState<UserFile['category']>('logo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [renewFailed, setRenewFailed] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; usageCount: number } | null>(null);
  const [usage, setUsage] = useState<Array<{ projectId: string; projectName: string; assetId: string }>>([]);
  const [versions, setVersions] = useState<UserFile[]>([]);
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(search);
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
      if (key !== 'view' && key !== 'q') next.delete('offset');
      setSearch(next, { replace: true });
    },
    [search, setSearch]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, projectRes] = await Promise.all([
        api.files.list({
          q: q || undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          kind: kind !== 'all' ? kind : undefined,
          source: sourceFilter !== 'all' ? sourceFilter : undefined,
          projectId: projectFilter || undefined,
          sort,
          limit: 50,
          offset: 0,
        }),
        api.projects.list(),
      ]);
      setFiles(res.files);
      setTotal(res.total ?? res.files.length);
      setCounts(res.counts ?? { total: res.files.length, image: 0, video: 0, audio: 0 });
      setProjects(projectRes.projects.map((p) => ({ id: p.id, name: p.name })));
    } catch (err) {
      setError(mapFileError(err));
    } finally {
      setLoading(false);
    }
  }, [q, categoryFilter, kind, sort, sourceFilter, projectFilter]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setError(null);
    try {
      const res = await api.files.list({
        q: q || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        kind: kind !== 'all' ? kind : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        projectId: projectFilter || undefined,
        sort,
        limit: 50,
        offset: files.length,
      });
      setFiles((prev) => [...prev, ...res.files]);
      setTotal(res.total ?? files.length + res.files.length);
    } catch (err) {
      setError(mapFileError(err));
    } finally {
      setLoadingMore(false);
    }
  }, [q, categoryFilter, kind, sort, sourceFilter, projectFilter, files.length]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deepFileId || loading) return;
    if (selectedId === deepFileId) return;
    const file = files.find((f) => f.id === deepFileId);
    if (file) {
      void openPreview(file);
      return;
    }
    void api.files
      .get(deepFileId)
      .then((detail) => {
        setFiles((prev) => (prev.some((f) => f.id === detail.file.id) ? prev : [detail.file, ...prev]));
        setSelectedId(detail.file.id);
        setRenameValue(detail.file.name);
        setUsage(detail.usage ?? []);
        setVersions(detail.versions ?? []);
        setPreviewUrl(detail.file.available === false ? null : detail.file.dataUrl || detail.file.downloadUrl || null);
      })
      .catch((err) => {
        setError(err instanceof ApiError && err.status === 404 ? 'Datei nicht gefunden' : mapFileError(err));
      });
  }, [deepFileId, loading]);

  useEffect(() => {
    if (!confirmDelete) return;
    document.getElementById('file-delete-cancel')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmDelete(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDelete]);

  const selected = files.find((f) => f.id === selectedId) ?? null;

  async function renewUrl(id: string): Promise<string | null> {
    if (renewFailed.has(id)) return null;
    try {
      const res = await api.files.downloadUrl(id);
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, downloadUrl: res.downloadUrl, expiresAt: res.expiresAt, available: true } : f)));
      return res.downloadUrl;
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'FILE_MISSING' || err.status === 410)) {
        setRenewFailed((prev) => new Set(prev).add(id));
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, available: false, downloadUrl: undefined } : f)));
        setError('Datei nicht verfügbar');
        return null;
      }
      setError(mapFileError(err));
      return null;
    }
  }

  async function openPreview(file: UserFile) {
    setSelectedId(file.id);
    setPreviewUrl(null);
    setPreviewLoading(true);
    setRenameValue(file.name);
    setParam('file', file.id);
    try {
      const detail = await api.files.get(file.id);
      setUsage(detail.usage ?? []);
      setVersions(detail.versions ?? []);
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, ...detail.file, downloadUrl: detail.file.dataUrl || f.downloadUrl } : f)));
      if (detail.file.available === false) {
        setPreviewUrl(null);
        return;
      }
      setPreviewUrl(detail.file.dataUrl || detail.file.downloadUrl || null);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'FILE_MISSING' || err.status === 410)) {
        setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, available: false, downloadUrl: undefined } : f)));
        setError('Datei nicht verfügbar');
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setError('Datei nicht gefunden');
        setSelectedId(null);
        return;
      }
      if (file.available === false) return;
      const expired = file.expiresAt ? Date.parse(file.expiresAt) < Date.now() + 30_000 : !file.downloadUrl;
      const url = expired ? await renewUrl(file.id) : file.downloadUrl || (await renewUrl(file.id));
      setPreviewUrl(url);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    if (!rightsConfirmed) {
      setError('Bitte Rechte am Material bestätigen.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        if (file.size <= 0) throw new ApiError('Leere Datei ist nicht erlaubt', 'EMPTY_UPLOAD', 400);
        const maxBytes = category === 'video' || file.type.startsWith('video/') ? VIDEO_MAX : IMAGE_MAX;
        if (file.size > maxBytes) {
          throw new ApiError(`Datei zu groß (max. ${maxBytes / (1024 * 1024)} MB)`, 'FILE_TOO_LARGE', 413);
        }
        const dataUrl = await readFileAsDataUrl(file);
        await api.files.upload({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          category,
          dataUrl,
          projectId: brandProjectId ?? undefined,
          rightsConfirmed: true,
        });
      }
      await load();
    } catch (err) {
      setError(mapFileError(err));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.files.delete(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setUsage([]);
        setVersions([]);
      }
      setConfirmDelete(null);
    } catch (err) {
      setError(mapFileError(err));
    }
  }

  async function requestDelete(file: UserFile) {
    let usageCount = usage.length;
    try {
      const detail = await api.files.get(file.id);
      usageCount = detail.usage?.length ?? 0;
      setUsage(detail.usage ?? []);
    } catch {
      usageCount = 0;
    }
    setConfirmDelete({ id: file.id, name: file.name, usageCount });
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setError('Dateiname darf nicht leer sein');
      return;
    }
    setError(null);
    try {
      const res = await api.files.update(id, { name });
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...res.file } : f)));
    } catch (err) {
      setError(err instanceof ApiError ? mapFileError(err) : 'Umbenennen fehlgeschlagen');
    }
  }

  async function removeFromProject(projectId: string, assetId: string) {
    setError(null);
    try {
      await api.projects.detachAsset(projectId, assetId);
      setUsage((prev) => prev.filter((u) => u.assetId !== assetId));
      if (selectedId) {
        const remaining = usage.filter((u) => u.assetId !== assetId);
        if (remaining.length === 0) {
          await api.files.update(selectedId, { projectId: null });
          setFiles((prev) => prev.map((f) => (f.id === selectedId ? { ...f, projectId: undefined } : f)));
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? mapFileError(err) : 'Projektverknüpfung fehlgeschlagen');
    }
  }

  async function handleDownload(id: string, name: string) {
    setError(null);
    try {
      const res = await api.files.downloadUrl(id);
      const link = document.createElement('a');
      link.href = res.downloadUrl;
      link.download = name;
      if (res.downloadUrl.startsWith('http')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      link.click();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 410 ? 'Datei nicht verfügbar' : 'Download fehlgeschlagen');
    }
  }

  async function assignProject(id: string, projectId: string | null) {
    setError(null);
    try {
      const res = await api.files.update(id, { projectId });
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...res.file } : f)));
      const detail = await api.files.get(id);
      setUsage(detail.usage ?? []);
      setVersions(detail.versions ?? []);
    } catch (err) {
      setError(mapFileError(err));
    }
  }

  const emptyAll =
    !loading && total === 0 && !q && kind === 'all' && categoryFilter === 'all' && sourceFilter === 'all' && !projectFilter;
  const emptyFilter = !loading && files.length === 0 && !emptyAll;

  const previewSrc = previewUrl || selected?.downloadUrl;

  return (
    <div>
      <PageHeader
        title="Datei Cloud"
        description="Zentrale Übersicht eigener Creator-Dateien. Downloads laufen über File-ID, Ownership und zeitlich begrenzte Signed URLs — keine öffentlichen Storage-Pfade. Download bedeutet keine Rechteklärung und keine Garantie urheber- oder markenrechtlicher Unbedenklichkeit."
        badge={<Badge variant="brand">NEXTER</Badge>}
        backTo="/projects"
        backLabel="Projekte"
        actions={
          <>
            <input
              id="file-cloud-upload"
              ref={inputRef}
              type="file"
              className="sr-only"
              multiple
              accept="image/*,video/*,audio/*,.json,.zip"
              aria-label="Datei hochladen"
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <Button className="min-h-11" variant="outline" loading={loading} aria-label="Dateien aktualisieren" onClick={() => void load()}>
              Aktualisieren
            </Button>
            <Button className="min-h-11 gap-2" loading={loading} disabled={!rightsConfirmed} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Hochladen
            </Button>
          </>
        }
      />

      {error && (
        <div role="alert">
          <StudioErrorBanner message={error} />
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatCard label="Gesamt" value={counts.total} />
        <StatCard label="Bilder" value={counts.image} />
        <StatCard label="Video" value={counts.video} />
        <StatCard label="Audio" value={counts.audio} />
      </div>

      <label className="mb-4 flex min-h-11 items-start gap-2 text-sm text-zinc-400" htmlFor="file-rights">
        <input
          id="file-rights"
          type="checkbox"
          className="mt-1"
          checked={rightsConfirmed}
          onChange={(e) => setRightsConfirmed(e.target.checked)}
        />
        <span>
          Ich bestätige, dass ich die erforderlichen Rechte am hochgeladenen Material habe. NEXTER prüft Urheberrechte
          nicht automatisch.
        </span>
      </label>

      <NeonCard accent="cyan" className="mb-4" title="Hochladen">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Upload-Kategorie">
          {UPLOAD_CATEGORIES.map((cat) => (
            <Button
              key={cat.id}
              size="sm"
              variant={category === cat.id ? 'primary' : 'outline'}
              className="min-h-11"
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Upload geht über das Backend. Maximal {IMAGE_MAX / (1024 * 1024)} MB für Bilder/Audio,{' '}
          {VIDEO_MAX / (1024 * 1024)} MB für Video. KI-Ergebnisse aus den Studios erscheinen automatisch.
        </p>
      </NeonCard>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Input id="file-search" label="Suche" aria-label="Dateien suchen" placeholder="Name, Typ, Projekt" value={q} onChange={(e) => setParam('q', e.target.value)} className="min-h-11" />
        <label className="block text-xs font-medium text-zinc-400" htmlFor="file-kind">
          Dateiart
          <select id="file-kind" aria-label="Dateiart filtern" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm" value={kind} onChange={(e) => setParam('kind', e.target.value)}>
            {KIND_FILTERS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-zinc-400" htmlFor="file-cat">
          Asset-Typ
          <select id="file-cat" aria-label="Asset-Typ filtern" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm" value={categoryFilter} onChange={(e) => setParam('category', e.target.value)}>
            {CATEGORY_FILTERS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-zinc-400" htmlFor="file-source">
          Quelle
          <select id="file-source" aria-label="Quelle filtern" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm" value={sourceFilter} onChange={(e) => setParam('source', e.target.value)}>
            {SOURCE_FILTERS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-zinc-400" htmlFor="file-project-filter">
          Projekt
          <select id="file-project-filter" aria-label="Projekt filtern" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm" value={projectFilter} onChange={(e) => setParam('project', e.target.value)}>
            <option value="">Alle Projekte</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-zinc-400" htmlFor="file-sort">
          Sortierung
          <select id="file-sort" aria-label="Sortierung" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm" value={sort} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="newest">Neueste zuerst</option>
            <option value="oldest">Älteste zuerst</option>
            <option value="name">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="size">Größe</option>
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={view === 'grid' ? 'primary' : 'outline'} className="min-h-11" aria-pressed={view === 'grid'} onClick={() => setParam('view', 'grid')}>
          <LayoutGrid className="mr-1 h-4 w-4" /> Grid
        </Button>
        <Button size="sm" variant={view === 'list' ? 'primary' : 'outline'} className="min-h-11" aria-pressed={view === 'list'} onClick={() => setParam('view', 'list')}>
          <List className="mr-1 h-4 w-4" /> Liste
        </Button>
      </div>

      {loading && (
        <p className="mb-4 text-sm text-zinc-500" role="status">
          Dateien werden geladen…
        </p>
      )}
      {emptyAll && (
        <NeonCard accent="purple" className="flex flex-col items-center justify-center py-16 text-center">
          <Cloud className="h-12 w-12 text-zinc-600" />
          <p className="mt-4 text-zinc-400">Noch keine Dateien</p>
          <p className="mt-1 text-sm text-zinc-500">Lade eine Datei hoch oder erstelle ein Asset im Studio.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Button className="min-h-11" disabled={!rightsConfirmed} onClick={() => inputRef.current?.click()}>
              Datei hochladen
            </Button>
            <Link to="/logo-studio" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline">
              Logo erstellen
            </Link>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--ucbs-accent-cyan)] hover:underline"
              onClick={() => queueNexterPrompt('Zeig mir meine letzten Dateien.')}
            >
              Nexter fragen
            </button>
          </div>
        </NeonCard>
      )}
      {emptyFilter && <p className="mb-4 text-sm text-zinc-500">Keine Dateien für diesen Filter.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <NeonCard key={file.id} accent="magenta" className="p-4">
                  <button type="button" className="w-full text-left" onClick={() => void openPreview(file)} aria-label={`${file.name} öffnen`}>
                    <FileThumb file={file} />
                    <p className="mt-3 truncate text-sm font-medium text-zinc-200">{file.name}</p>
                    <p className="text-xs text-zinc-500">
                      {file.category} · {formatBytes(file.size)} · {file.source === 'generation' ? 'KI' : 'Upload'}
                      {file.version ? ` · v${file.version}` : ''}
                    </p>
                    {file.available === false && <p className="text-xs text-amber-200">Datei nicht verfügbar</p>}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="min-h-11 gap-1" aria-label={`${file.name} herunterladen`} disabled={file.available === false} onClick={() => void handleDownload(file.id, file.name)}>
                      <Download className="h-3 w-3" /> Download
                    </Button>
                    <Button size="sm" variant="outline" className="min-h-11 gap-1" aria-label={`${file.name} löschen`} onClick={() => void requestDelete(file)}>
                      <Trash2 className="h-3 w-3" /> Löschen
                    </Button>
                  </div>
                </NeonCard>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
                  <button type="button" className="min-h-11 min-w-0 flex-1 text-left text-sm" onClick={() => void openPreview(file)}>
                    <span className="font-medium text-zinc-200">{file.name}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{file.category} · {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleString('de-DE')}</span>
                  </button>
                  <Button size="sm" variant="outline" className="min-h-11" disabled={file.available === false} onClick={() => void handleDownload(file.id, file.name)}>Download</Button>
                  <Button size="sm" variant="outline" className="min-h-11" aria-label={`${file.name} löschen`} onClick={() => void requestDelete(file)}>Löschen</Button>
                </li>
              ))}
            </ul>
          )}
          {files.length < total && (
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                loading={loadingMore}
                aria-label="Weitere Dateien laden"
                onClick={() => void loadMore()}
              >
                Weitere laden ({files.length} von {total})
              </Button>
            </div>
          )}
        </div>

        <NeonCard accent="purple" title="Details">
          {!selected && <p className="text-sm text-zinc-500">Datei öffnen, um Vorschau und Metadaten zu sehen.</p>}
          {selected && (
            <div className="space-y-2 text-sm">
              {selected.available === false ? (
                <p className="text-amber-200">Datei nicht verfügbar</p>
              ) : previewLoading ? (
                <p className="text-sm text-zinc-500" role="status">Vorschau wird geladen…</p>
              ) : previewSrc && isImage(selected) ? (
                <img src={previewSrc} alt={selected.name} className="max-h-48 w-full rounded object-contain" />
              ) : previewSrc && isAudio(selected) ? (
                <audio controls className="w-full" src={previewSrc} aria-label={`Audio ${selected.name}`}>
                  Audio wird nicht unterstützt.
                </audio>
              ) : previewSrc && isVideo(selected) ? (
                <video controls className="w-full rounded" src={previewSrc} aria-label={`Video ${selected.name}`}>
                  Video wird nicht unterstützt.
                </video>
              ) : (
                <p className="text-zinc-500">Keine Vorschau — Metadaten und Download.</p>
              )}
              {isSvg(selected) && <p className="text-[11px] text-zinc-500">SVG wird als Bild geladen, nicht als HTML ausgeführt.</p>}
              <Input
                id="file-rename"
                label="Name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
              />
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => void handleRename(selected.id)}>
                Umbenennen
              </Button>
              <p><span className="text-zinc-500">Typ:</span> {selected.category}</p>
              <p><span className="text-zinc-500">MIME:</span> {selected.mimeType}</p>
              <p><span className="text-zinc-500">Größe:</span> {formatBytes(selected.size)}</p>
              <p><span className="text-zinc-500">Erstellt:</span> {new Date(selected.createdAt).toLocaleString('de-DE')}</p>
              <p><span className="text-zinc-500">Quelle:</span> {selected.source === 'generation' ? 'Studio' : 'Upload'}</p>
              {selected.version ? <p><span className="text-zinc-500">Version:</span> v{selected.version}</p> : null}
              {selected.sourceJobId ? <p><span className="text-zinc-500">Studio-Job:</span> {selected.sourceJobId}</p> : null}
              {usage.length > 0 && (
                <div>
                  <p className="text-zinc-500">Verwendet in</p>
                  <ul className="mt-1 space-y-1">
                    {usage.map((u) => (
                      <li key={u.assetId} className="flex items-center justify-between gap-2">
                        <Link to={`/projects/${u.projectId}`} className="text-[var(--ucbs-accent-cyan)] hover:underline">{u.projectName}</Link>
                        <Button size="sm" variant="ghost" className="min-h-11" onClick={() => void removeFromProject(u.projectId, u.assetId)}>
                          Aus Projekt entfernen
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {versions.length > 1 && (
                <div>
                  <p className="text-zinc-500">Versionen</p>
                  <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                    {versions.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          className="min-h-11 text-left text-[var(--ucbs-accent-cyan)] hover:underline"
                          onClick={() => void openPreview(v)}
                        >
                          v{v.version ?? 1} · {v.name} · {new Date(v.createdAt).toLocaleString('de-DE')}
                          {v.id === selected.id ? ' · aktuell' : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="block text-xs font-medium text-zinc-400" htmlFor="file-assign-project">
                Zu Projekt hinzufügen
                <select
                  id="file-assign-project"
                  className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) void assignProject(selected.id, e.target.value);
                  }}
                >
                  <option value="">Projekt wählen</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              {selected.source === 'generation' && selected.sourceJobId && (
                <Link
                  to={`/change-request?jobId=${encodeURIComponent(selected.sourceJobId)}`}
                  className="inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline"
                >
                  Änderung anfordern
                </Link>
              )}
              {selected.source === 'generation' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() =>
                    queueNexterPrompt(
                      selected.category === 'logo'
                        ? `Neue Variante meines Logos: ${selected.name}`
                        : `Neue Variante von „${selected.name}“.`
                    )
                  }
                >
                  Neue Variante
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={() => queueNexterPrompt(`Benutze diese Datei (${selected.id}) für einen Mockup.`)}
              >
                Mit Nexter verwenden
              </Button>
              {selected.available !== false && (
                <Button size="sm" variant="outline" className="min-h-11" onClick={() => void renewUrl(selected.id)}>
                  Signed URL erneuern
                </Button>
              )}
              <Button size="sm" variant="outline" className="min-h-11" onClick={() => void requestDelete(selected)}>
                Datei löschen
              </Button>
            </div>
          )}
        </NeonCard>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="file-delete-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--ucbs-bg)] p-5">
            <h2 id="file-delete-title" className="text-lg font-semibold text-white">Datei löschen?</h2>
            <p className="mt-2 text-sm text-zinc-300">
              „{confirmDelete.name}“ wird aus der Datei Cloud entfernt (Soft Delete).
              {confirmDelete.usageCount > 0
                ? ` Diese Datei wird in ${confirmDelete.usageCount} Projekt${confirmDelete.usageCount === 1 ? '' : 'en'} verwendet.`
                : ' Sie ist aktuell in keinem Projekt verknüpft.'}
            </p>
            <p className="mt-2 text-xs text-zinc-500">„Aus Projekt entfernen“ löscht die Datei nicht.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="min-h-11" id="file-delete-cancel" onClick={() => setConfirmDelete(null)}>Abbrechen</Button>
              <Button className="min-h-11" onClick={() => void handleDelete(confirmDelete.id)}>Endgültig aus Liste entfernen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileThumb({ file }: { file: UserFile }) {
  if (file.available === false) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs text-amber-200">
        Datei nicht verfügbar
      </div>
    );
  }
  if (file.mimeType.startsWith('image/') && file.downloadUrl) {
    return <img src={file.downloadUrl} alt={file.name} className="aspect-video h-full w-full rounded-lg object-cover" />;
  }
  return (
    <div className="flex aspect-video items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50">
      {file.mimeType.startsWith('image/') ? <ImageIcon className="h-10 w-10 text-zinc-600" /> : <Cloud className="h-10 w-10 text-zinc-600" />}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}
