import { useEffect, useRef, useState } from 'react';
import { FolderKanban, Plus, Trash2, RotateCcw, Download, Upload } from 'lucide-react';
import type { Project, ProjectType } from '@ucbs/shared';
import { PageHeader, Badge, Button, NeonCard, Input } from '@/components/ui';
import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { PROJECTS_MODULES } from '@/v2/config/navigation';
import { api, ApiError } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const TYPES: ProjectType[] = [
  'logo',
  'branding',
  'banner',
  'video',
  'intro',
  'overlay',
  'full_package',
  'custom',
];

const MAX_ZIP_MB = 80;

export function ProjectsHubPage() {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trash, setTrash] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('custom');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  async function refresh() {
    const [active, deleted] = await Promise.all([api.projects.list(), api.projects.trash()]);
    setProjects(active.projects);
    setTrash(deleted.projects);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

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

  async function handleDelete(id: string) {
    await api.projects.remove(id);
    await refresh();
  }

  async function handleRestore(id: string) {
    await api.projects.restore(id);
    await refresh();
  }

  async function handlePurge(id: string) {
    await api.projects.purge(id);
    await refresh();
  }

  async function handleExport(id: string) {
    setLoading(true);
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
    } finally {
      setLoading(false);
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

      // Ensure MIME is zip even if browser omits it
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

  return (
    <div className="space-y-8">
      <HubPageLayout
        title="Projekte"
        description="Projekte anlegen, ZIP exportieren/importieren und im Papierkorb wiederherstellen"
        modules={PROJECTS_MODULES}
      />

      <PageHeader
        title="Projektverwaltung"
        description="Versionierte Marken-Projekte mit Papierkorb sowie ZIP-Export und -Import"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>
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
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Typ</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProjectType)}
              className="rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2.5 text-sm text-zinc-100"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Button className="gap-2" onClick={handleCreate} loading={loading}>
            <Plus className="h-4 w-4" />
            Anlegen
          </Button>
        </div>
      </NeonCard>

      <NeonCard accent="cyan" title="ZIP-Import">
        <p className="mt-2 text-sm text-zinc-400">
          Exportiertes UCBS-Projekt wiederherstellen: Manifest prüfen, Creator-DNA importieren, Assets
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
            className="gap-2"
            variant="secondary"
            loading={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            ZIP auswählen &amp; importieren
          </Button>
          <span className="text-xs text-zinc-500">Max. {MAX_ZIP_MB} MB</span>
        </div>
      </NeonCard>

      <div className="flex gap-2">
        <Button variant={!showTrash ? 'secondary' : 'outline'} onClick={() => setShowTrash(false)}>
          Aktiv ({projects.length})
        </Button>
        <Button variant={showTrash ? 'secondary' : 'outline'} onClick={() => setShowTrash(true)}>
          Papierkorb ({trash.length})
        </Button>
      </div>

      <div className="grid gap-3">
        {(showTrash ? trash : projects).map((p) => (
          <NeonCard key={p.id} accent="purple">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FolderKanban className="h-5 w-5 text-[var(--ucbs-accent-purple)]" />
                <div>
                  <p className="font-medium text-zinc-100">{p.name}</p>
                  <p className="text-xs text-zinc-500">
                    {p.type} · {p.status}
                    {p.dnaId ? ' · DNA verknüpft' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {!showTrash ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      loading={loading}
                      onClick={() => handleExport(p.id)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      ZIP
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => handleRestore(p.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Wiederherstellen
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handlePurge(p.id)}>
                      Endgültig löschen
                    </Button>
                  </>
                )}
              </div>
            </div>
          </NeonCard>
        ))}
        {(showTrash ? trash : projects).length === 0 && (
          <p className="text-sm text-zinc-500">
            {showTrash ? 'Papierkorb ist leer' : 'Noch keine Projekte'}
          </p>
        )}
      </div>
    </div>
  );
}
