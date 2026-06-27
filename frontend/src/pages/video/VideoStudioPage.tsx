import { useEffect, useState, useRef } from 'react';
import {
  PageHeader, Badge, Button, NeonCard, CardTitle, Input, StatCard,
} from '@/components/ui';
import {
  Film, Plus, Scissors, Subtitles, Sparkles, CheckCircle2, Download, Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type VideoProject } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { DnaRequiredBanner, StudioErrorBanner } from '@/components/studio';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selected, setSelected] = useState<VideoProject | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.video.list().then((r) => {
      setProjects(r.projects);
      if (r.projects[0]) setSelected(r.projects[0]);
    }).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.create(title.trim(), 300);
      setProjects((prev) => [res.project, ...prev]);
      setSelected(res.project);
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erstellen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    if (!selected) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const duration = await getVideoDuration(dataUrl);
      const res = await api.video.uploadSource(selected.id, dataUrl, duration);
      setSelected(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  }

  async function runAction(action: 'highlights' | 'subtitles' | 'short', highlightIndex?: number) {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      let project = selected;
      if (action === 'highlights') {
        const res = await api.video.detectHighlights(selected.id);
        project = res.project;
      } else if (action === 'subtitles') {
        const res = await api.video.generateSubtitles(selected.id);
        project = res.project;
      } else {
        const res = await api.video.createShort(selected.id, highlightIndex ?? 0);
        project = { ...selected, shorts: [...selected.shorts, res.job] };
        await refreshUser();
      }
      setSelected(project);
      setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Aktion fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Video Studio"
        description="Videos schneiden, Highlights erkennen, Untertitel und Shorts generieren"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={<Badge variant="default">Short: {formatCoins(20)} Coins</Badge>}
      />

      {!activeDna && (
        <DnaRequiredBanner message="Creator DNA erforderlich für Short-Generierung" />
      )}

      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Projekte" value={projects.length} icon={<Film className="h-5 w-5" />} />
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Status" value={selected?.status ?? '—'} icon={<Sparkles className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <NeonCard accent="cyan">
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Neues Projekt
          </CardTitle>
          <Input
            className="mt-3"
            placeholder="Projektname..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button className="mt-3 w-full" onClick={handleCreate} loading={loading}>
            Projekt erstellen
          </Button>
          <div className="mt-4 space-y-1">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className={`w-full rounded-lg border p-2 text-left text-sm transition-colors ${
                  selected?.id === p.id
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-zinc-200'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {p.title}
                {p.sourceUrl && <span className="ml-2 text-[10px] text-emerald-400">● Video</span>}
              </button>
            ))}
          </div>
        </NeonCard>

        <NeonCard accent="purple" className="lg:col-span-2">
          {selected ? (
            <>
              <CardTitle>{selected.title}</CardTitle>
              <p className="mt-1 text-sm text-zinc-500">
                Dauer: {formatTime(selected.duration)} · {selected.highlights.length} Highlights · {selected.subtitles.length} Untertitel
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                >
                  <Upload className="h-4 w-4" />
                  Video hochladen
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => runAction('highlights')} loading={loading} disabled={!selected.sourceUrl}>
                  <Scissors className="h-4 w-4" />
                  Highlights
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => runAction('subtitles')} loading={loading} disabled={!selected.sourceUrl}>
                  <Subtitles className="h-4 w-4" />
                  Untertitel
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => runAction('short', 0)}
                  loading={loading}
                  disabled={!activeDna || selected.highlights.length === 0 || (user?.coinBalance ?? 0) < 20}
                >
                  <Film className="h-4 w-4" />
                  Short (20 Coins)
                </Button>
              </div>

              {selected.sourceUrl && (
                <div className="mt-4 overflow-hidden rounded-lg border border-cyan-500/20">
                  <video src={selected.sourceUrl} controls className="aspect-video w-full bg-black" />
                </div>
              )}

              {!selected.sourceUrl && (
                <p className="mt-4 text-sm text-zinc-500">Lade ein Video hoch (MP4/WebM, max. 50 MB), um Highlights und Untertitel zu generieren.</p>
              )}

              {selected.highlights.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-sm font-medium text-zinc-300">Highlights</p>
                  <div className="space-y-2">
                    {selected.highlights.map((h, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-surface-950/50 p-3">
                        <div>
                          <p className="text-sm text-zinc-200">{h.label}</p>
                          <p className="text-xs text-zinc-500">
                            {formatTime(h.start)} – {formatTime(h.end)} · Score {(h.score * 100).toFixed(0)}%
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runAction('short', i)}
                          disabled={!activeDna || (user?.coinBalance ?? 0) < 20}
                        >
                          Short
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.subtitles.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-sm font-medium text-zinc-300">Untertitel</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {selected.subtitles.map((s, i) => (
                      <p key={i} className="text-sm text-zinc-400">
                        <span className="text-zinc-500">{formatTime(s.start)}–{formatTime(s.end)}</span> {s.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {selected.shorts.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-sm font-medium text-zinc-300">Generierte Shorts</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selected.shorts.map((job) => (
                      <div key={job.id} className="ucbs-neon-card overflow-hidden p-0">
                        {job.thumbnailUrl && (
                          <img src={job.thumbnailUrl} alt={job.title} className="aspect-[9/16] w-full object-cover" />
                        )}
                        <div className="p-2">
                          <p className="text-sm text-zinc-200">{job.title}</p>
                          <p className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {job.provider}
                          </p>
                          {(job.videoUrl || job.thumbnailUrl) && (
                            <a href={job.videoUrl || job.thumbnailUrl} download target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm" className="mt-2 w-full gap-2">
                                <Download className="h-3 w-3" />
                                Download
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">Erstelle oder wähle ein Video-Projekt</p>
          )}
        </NeonCard>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

function getVideoDuration(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(Math.round(video.duration) || 300);
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(300);
    video.src = dataUrl;
  });
}
