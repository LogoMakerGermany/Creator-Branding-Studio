import { useEffect, useRef, useState } from 'react';
import { Cloud, Upload, Trash2, Download, Image as ImageIcon } from 'lucide-react';
import { PageHeader, Badge, Button, NeonCard } from '@/components/ui';
import { StudioErrorBanner, TypeOptionButton } from '@/components/studio';
import { api, ApiError, type UserFile } from '@/services/api';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';

const UPLOAD_CATEGORIES = [
  { id: 'logo', label: 'Logos' },
  { id: 'banner', label: 'Banner' },
  { id: 'overlay', label: 'Overlays' },
  { id: 'sticker', label: 'Sticker' },
  { id: 'video', label: 'Videos' },
  { id: 'project', label: 'Projekte' },
  { id: 'other', label: 'Sonstiges' },
] as const;

const FILE_TYPE_FILTERS = [
  { id: 'all', label: 'Alle' },
  { id: 'png', label: 'PNG', match: (f: UserFile) => f.mimeType.includes('png') || f.name.toLowerCase().endsWith('.png') },
  { id: 'svg', label: 'SVG', match: (f: UserFile) => f.mimeType.includes('svg') || f.name.toLowerCase().endsWith('.svg') },
  { id: 'psd', label: 'PSD', match: (f: UserFile) => f.name.toLowerCase().endsWith('.psd') },
  { id: 'video', label: 'Videos', match: (f: UserFile) => f.mimeType.startsWith('video/') || f.category === 'video' },
  { id: 'image', label: 'Bilder', match: (f: UserFile) => f.mimeType.startsWith('image/') },
  { id: 'zip', label: 'Archive', match: (f: UserFile) => f.mimeType.includes('zip') || f.name.toLowerCase().endsWith('.zip') },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCloudPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [category, setCategory] = useState<UserFile['category']>('logo');
  const [typeFilter, setTypeFilter] = useState<(typeof FILE_TYPE_FILTERS)[number]['id']>('all');
  const [projectOnly, setProjectOnly] = useState(false);
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  useEffect(() => {
    load();
  }, [projectOnly, brandProjectId]);

  async function load() {
    const res = await api.files.list(projectOnly && brandProjectId ? brandProjectId : undefined);
    setFiles(res.files);
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    if (!rightsConfirmed) {
      setError('Bitte Rechte am Material bestätigen.');
      return;
    }
    setLoading(true);
    setError(null);

    const maxBytes = 5 * 1024 * 1024;

    try {
      for (const file of Array.from(fileList)) {
        if (file.size > maxBytes) {
          throw new ApiError('Datei zu groß (max. 5 MB)', 'FILE_TOO_LARGE', 413);
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
      setError(err instanceof ApiError ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    await api.files.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleDownload(id: string, name: string, downloadUrl?: string) {
    if (downloadUrl?.startsWith('http')) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = name;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      return;
    }
    const res = await api.files.get(id);
    const link = document.createElement('a');
    link.href = res.file.dataUrl;
    link.download = name;
    link.click();
  }

  const visibleFiles = files.filter((f) => {
    const filter = FILE_TYPE_FILTERS.find((t) => t.id === typeFilter);
    return filter && filter.id !== 'all' ? filter.match(f) : true;
  });

  return (
    <div>
      <PageHeader
        title="Datei Cloud"
        description="Speichere Logos, Banner, Overlays und Projekte zentral — wie Google Drive für Creator"
        badge={<Badge variant="brand">NEXTER</Badge>}
        backTo="/projects"
        backLabel="Projekte"
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept="image/*,video/*,.json,.zip"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              className="gap-2"
              loading={loading}
              disabled={!rightsConfirmed}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Hochladen
            </Button>
          </>
        }
      />

      {error && <StudioErrorBanner message={error} />}

      <label className="mb-4 flex items-start gap-2 text-sm text-zinc-400">
        <input
          type="checkbox"
          className="mt-1"
          checked={rightsConfirmed}
          onChange={(e) => setRightsConfirmed(e.target.checked)}
        />
        <span>
          Ich bestätige, dass ich die erforderlichen Rechte am hochgeladenen Material habe. NEXTER prüft
          Urheberrechte nicht automatisch.
        </span>
      </label>

      <NeonCard accent="cyan" className="mb-6" title="Upload-Kategorie">
        <div className="flex flex-wrap gap-2">
          {UPLOAD_CATEGORIES.map((cat) => (
            <TypeOptionButton
              key={cat.id}
              active={category === cat.id}
              onClick={() => setCategory(cat.id)}
              className="px-3 py-1.5"
            >
              {cat.label}
            </TypeOptionButton>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          KI-Generierungen aus Logo, Banner und Branding-Paket werden automatisch gespeichert.
        </p>
      </NeonCard>

      <NeonCard accent="purple" className="mb-6" title="Dateityp filtern">
        <div className="flex flex-wrap gap-2">
          {FILE_TYPE_FILTERS.map((t) => (
            <TypeOptionButton
              key={t.id}
              active={typeFilter === t.id}
              onClick={() => setTypeFilter(t.id)}
              className="px-3 py-1.5"
            >
              {t.label}
            </TypeOptionButton>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <TypeOptionButton active={!projectOnly} onClick={() => setProjectOnly(false)} className="px-3 py-1.5">
            Alle Dateien
          </TypeOptionButton>
          <TypeOptionButton
            active={projectOnly}
            onClick={() => setProjectOnly(true)}
            className="px-3 py-1.5"
            disabled={!brandProjectId}
          >
            Dateien dieses Projekts
          </TypeOptionButton>
        </div>
      </NeonCard>

      {visibleFiles.length === 0 ? (
        <NeonCard accent="purple" className="flex flex-col items-center justify-center py-16 text-center">
          <Cloud className="h-12 w-12 text-zinc-600" />
          <p className="mt-4 text-zinc-400">
            {files.length === 0 ? 'Noch keine Dateien vorhanden' : 'Keine Dateien für diesen Filter'}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Lade Assets hoch oder generiere welche in den Studios</p>
        </NeonCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFiles.map((file) => (
            <NeonCard key={file.id} accent="magenta" className="p-4">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
                {file.mimeType.startsWith('image/') && file.downloadUrl ? (
                  <img src={file.downloadUrl} alt={file.name} className="h-full w-full object-cover" />
                ) : file.mimeType.startsWith('image/') ? (
                  <ImageIcon className="h-10 w-10 text-zinc-600" />
                ) : (
                  <Cloud className="h-10 w-10 text-zinc-600" />
                )}
              </div>
              <div className="mt-3">
                <p className="truncate text-sm font-medium text-zinc-200">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {file.category} · {formatBytes(file.size)} · {file.source === 'generation' ? 'KI' : 'Upload'}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleDownload(file.id, file.name, file.downloadUrl)}>
                  <Download className="h-3 w-3" />
                  Download
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleDelete(file.id)}>
                  <Trash2 className="h-3 w-3" />
                  Löschen
                </Button>
              </div>
            </NeonCard>
          ))}
        </div>
      )}
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
