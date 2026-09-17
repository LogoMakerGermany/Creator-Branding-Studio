import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus, Trash2, RotateCcw, Download, Upload } from 'lucide-react';
import type { Project, ProjectType } from '@ucbs/shared';
import { NEXTER_STUDIO_PATHS } from '@ucbs/shared';
import { PageHeader, Badge, Button, NeonCard, Input } from '@/components/ui';
import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { Skeleton } from '@/v2/components/Skeleton';
import { PROJECTS_MODULES } from '@/v2/config/navigation';
import { api, ApiError } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';

const TYPES: ProjectType[] = [
  'logo',
  'branding',
  'banner',
  'video',
  'intro',
  'overlay',
  'full_package',
  'streamset',
  'mockup',
  'shorts',
  'social',
  'text',
  'custom',
];

const MAX_ZIP_MB = 80;

type SortKey = 'updated' | 'newest' | 'oldest' | 'name';

function studioForType(type: string): string {
  return NEXTER_STUDIO_PATHS[type] || '/projects';
}

export function ProjectsHubPage() {
  const { user, refreshUser, activeDna } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useBrandProjectStore((s) => s.setActiveProjectId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [trash, setTrash] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('custom');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | ProjectType>('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; name: string; kind: 'delete' | 'purge' } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function refresh() {
    setLoading(true);
    setListError(null);
    try {
      const active = await api.projects.list({
        q: query.trim() || undefined,
        type: typeFilter || undefined,
        sort,
        filter: 'active',
        limit: 50,
      });
      setProjects(active.projects);
      setTotal(active.total ?? active.projects.length);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Projekte konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
    try {
      const deleted = await api.projects.trash();
      setTrash(deleted.projects);
      setTrashError(null);
    } catch (err) {
      setTrashError(err instanceof ApiError ? err.message : 'Papierkorb nicht verfügbar.');
    }
  }

  useEffect(() => {
    void refresh();
  }, [user?.id, query, typeFilter, sort]);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Projektname erforderlich');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.projects.create({ name: name.trim(), type });
      setName('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erstellen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    setError(null);
    try {
      await api.projects.rename(id, renameValue.trim());
      setRenamingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Umbenennen fehlgeschlagen');
    }
  }

  async function confirmDestructive() {
    if (!confirmAction) return;
    setError(null);
    try {
      if (confirmAction.kind === 'delete') await api.projects.remove(confirmAction.id);
      else await api.projects.purge(confirmAction.id);
      setConfirmAction(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  async function handleRestore(id: string) {
    await api.projects.restore(id);
    await refresh();
  }

  async function handleExport(id: string) {
    setError(null);
    try {
      const result = await api.projects.export(id);
      if (result.exportUrl) {
        const a = document.createElement('a');
        a.href = result.exportUrl;
        a.download = `${result.project.name.replace(/\s+/g, '-')}.zip`;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.click();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ZIP-Export fehlgeschlagen');
    }
  }

  async function handleImportFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.zip') && file.type !== 'application/zip') {
      setError('Bitte eine ZIP-Datei auswählen');
      return;
    }
    if (file.size > MAX_ZIP_MB * 1024 * 1024) {
      setError(`ZIP zu groß (max. ${MAX_ZIP_MB} MB)`);
      return;
    }

    setImporting(true);
    setError(null);
    setImportStatus('ZIP wird gelesen…');

    try {
      const zipDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Datei konnte nicht gelesen werden'));
        };
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
        reader.readAsDataURL(file);
      });

      const normalized =
        zipDataUrl.startsWith('data:application/zip') ||
        zipDataUrl.startsWith('data:application/x-zip-compressed')
          ? zipDataUrl
          : zipDataUrl.replace(/^data:[^;]+/, 'data:application/zip');

      setImportStatus('Daten prüfen, DNA & Assets importieren…');
      const result = await api.projects.import({
        zipDataUrl: normalized,
        importDna: true,
        importCloud: true,
      });

      await Promise.all([refresh(), refreshUser()]);
      const checkSummary = result.checks.map((c) => c.message).join(' · ');
      setImportStatus(
        `„${result.project.name}“ wiederhergestellt · ${result.assetsImported} Assets` +
          (result.dnaImported ? ' · DNA importiert' : '') +
          (result.cloudFilesImported ? ` · ${result.cloudFilesImported} Cloud-Dateien` : '') +
          (checkSummary ? `\n${checkSummary}` : '')
      );
    } catch (err) {
      setImportStatus(null);
      setError(err instanceof ApiError ? err.message : 'ZIP-Import fehlgeschlagen');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const visible = showTrash ? trash : projects;

  return (
    <div className="space-y-8" aria-busy={loading}>
      <HubPageLayout
        title="Projekte"
        description="Projekte anlegen, ZIP exportieren/importieren und im Papierkorb wiederherstellen"
        modules={PROJECTS_MODULES}
      />

      <PageHeader
        title="Projektverwaltung"
        description="Versionierte Marken-Projekte mit Papierkorb sowie ZIP-Export und -Import"
        badge={<Badge variant="brand">NEXTER</Badge>}
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300" role="alert">
          {error}
        </div>
      )}
      {importStatus && (
        <div className="whitespace-pre-wrap rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-200">
          {importStatus}
        </div>
      )}

      <NeonCard accent="cyan" title="Neues Projekt">
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Twitch Relaunch" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="project-type">
              Typ
            </label>
            <select
              id="project-type"
              value={type}
              onChange={(e) => setType(e.target.value as ProjectType)}
              className="min-h-11 rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2.5 text-sm text-zinc-100"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Button className="min-h-11 gap-2" onClick={handleCreate} loading={loading}>
            <Plus className="h-4 w-4" aria-hidden />
            Anlegen
          </Button>
        </div>
      </NeonCard>

      <NeonCard accent="cyan" title="ZIP-Import">
        <p className="mt-2 text-sm text-zinc-400">
          Exportiertes NEXTER-Projekt wiederherstellen: Manifest prüfen, Creator-DNA importieren, Assets
          hochladen und Projekt neu anlegen.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          <Button
            className="min-h-11 gap-2"
            variant="secondary"
            loading={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" aria-hidden />
            ZIP auswählen &amp; importieren
          </Button>
          <span className="text-xs text-zinc-500">Max. {MAX_ZIP_MB} MB</span>
        </div>
      </NeonCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Suche"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Projektname oder Asset"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="project-filter-type">
            Typfilter
          </label>
          <select
            id="project-filter-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as '' | ProjectType)}
            className="min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2.5 text-sm text-zinc-100"
          >
            <option value="">Alle Typen</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="project-sort">
            Sortierung
          </label>
          <select
            id="project-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2.5 text-sm text-zinc-100"
          >
            <option value="updated">Zuletzt bearbeitet</option>
            <option value="newest">Neueste</option>
            <option value="oldest">Älteste</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={!showTrash ? 'secondary' : 'outline'} onClick={() => setShowTrash(false)}>
          Aktiv ({total})
        </Button>
        <Button variant={showTrash ? 'secondary' : 'outline'} onClick={() => setShowTrash(true)}>
          Papierkorb ({trash.length})
        </Button>
      </div>

      {confirmAction && (
        <div
          role="dialog"
          aria-labelledby="project-delete-title"
          aria-modal="true"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <h2 id="project-delete-title" className="font-medium text-amber-100">
            {confirmAction.kind === 'delete' ? 'Projekt in den Papierkorb legen?' : 'Projekteintrag endgültig entfernen?'}
          </h2>
          <p className="mt-1 text-sm text-zinc-300">
            „{confirmAction.name}“ — Dateien, DNA und Coins bleiben erhalten.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => void confirmDestructive()}>
              Bestätigen
            </Button>
            <Button className="min-h-11" variant="outline" onClick={() => setConfirmAction(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {showTrash && trashError && (
        <p className="text-sm text-amber-200" role="alert">
          {trashError}
        </p>
      )}
      {!showTrash && listError && (
        <p className="text-sm text-amber-200" role="alert">
          {listError}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((p) => (
            <NeonCard key={p.id} accent="purple">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FolderKanban className="h-5 w-5 shrink-0 text-[var(--ucbs-accent-purple)]" aria-hidden />
                  <div className="min-w-0">
                    {renamingId === p.id ? (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          label="Neuer Name"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                        />
                        <Button size="sm" className="min-h-11" onClick={() => void handleRename(p.id)}>
                          Speichern
                        </Button>
                        <Button size="sm" variant="outline" className="min-h-11" onClick={() => setRenamingId(null)}>
                          Abbrechen
                        </Button>
                      </div>
                    ) : (
                      <Link to={`/projects/${p.id}`} className="font-medium text-zinc-100 hover:underline" data-testid="project-open">
                        {p.name}
                      </Link>
                    )}
                    <p className="text-xs text-zinc-500">
                      {p.type} · {p.status}
                      {p.dnaId ? ' · DNA verknüpft' : ''}
                      {` · ${p.assets?.length ?? 0} Assets`}
                      {` · ${p.updatedAt.slice(0, 10)}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!showTrash ? (
                    <>
                      <Link to={`/projects/${p.id}`} className="inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline">
                        Weiterarbeiten
                      </Link>
                      <Link
                        to={`${studioForType(p.type)}?projectId=${encodeURIComponent(p.id)}`}
                        onClick={() => setActiveProjectId(p.id)}
                        className="inline-flex min-h-11 items-center text-sm text-zinc-300 hover:underline"
                      >
                        Studio
                      </Link>
                      <Button variant="outline" size="sm" className="min-h-11 gap-1" onClick={() => void handleExport(p.id)}>
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        ZIP
                      </Button>
                      <Button
                        variant={activeProjectId === p.id ? 'secondary' : 'outline'}
                        size="sm"
                        className="min-h-11"
                        onClick={() => setActiveProjectId(p.id)}
                      >
                        {activeProjectId === p.id ? 'Aktiv für Nexter' : 'Für Nexter nutzen'}
                      </Button>
                      {activeDna && p.dnaId !== activeDna.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          onClick={() => void api.projects.update(p.id, { dnaId: activeDna.id }).then(() => refresh())}
                        >
                          DNA verknüpfen
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.name);
                        }}
                      >
                        Umbenennen
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => void api.projects.duplicate(p.id).then(() => refresh())}
                        title="Dupliziert nur die Projektstruktur (Name, Typ, DNA). Assets und Dateien werden nicht kopiert."
                      >
                        Struktur duplizieren
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        aria-label={`Projekt ${p.name} in den Papierkorb legen`}
                        onClick={() => setConfirmAction({ id: p.id, name: p.name, kind: 'delete' })}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" className="min-h-11 gap-1" onClick={() => void handleRestore(p.id)}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Wiederherstellen
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => setConfirmAction({ id: p.id, name: p.name, kind: 'purge' })}
                        title="Löscht nur den Projekteintrag. Dateien, Jobs und DNA bleiben."
                      >
                        Eintrag löschen
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </NeonCard>
          ))}
          {visible.length === 0 && (
            <div>
              <p className="text-sm text-zinc-500">
                {showTrash ? 'Papierkorb ist leer' : 'Noch keine Projekte'}
              </p>
              {!showTrash && (
                <button
                  type="button"
                  className="mt-2 inline-block min-h-11 text-sm text-[var(--ucbs-accent-cyan)] hover:underline"
                  onClick={() => document.getElementById('project-type')?.focus()}
                >
                  Erstes Projekt erstellen
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
