import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { defaultEditPlan, type VideoEditPlan } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { Badge, Button } from '@/components/ui';
import { StudioErrorBanner } from '@/components/studio';
import { StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type VideoProject } from '@/services/api';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { GlassCard } from '@/v2/components/GlassCard';
import { useNexterStore } from '@/v2/store/nexter-store';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function scorePct(score: number): number {
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

export function VideoStudioPage() {
  const { activeDna } = useAuth();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selected, setSelected] = useState<VideoProject | null>(null);
  const [title, setTitle] = useState('Video');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saveProjectId, setSaveProjectId] = useState(brandProjectId ?? '');
  const [brandProjects, setBrandProjects] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyProject(p: VideoProject) {
    setSelected(p);
    const plan = p.editPlan ?? defaultEditPlan(p.duration || 1);
    setTrimStart(plan.trimStart);
    setTrimEnd(plan.trimEnd);
  }

  useEffect(() => {
    api.video
      .list()
      .then((r) => {
        setProjects(r.projects);
        if (r.projects[0]) applyProject(r.projects[0]);
      })
      .catch(() => {});
    api.projects
      .list()
      .then((r) => {
        setBrandProjects(r.projects.map((p) => ({ id: p.id, name: p.name })));
        if (!saveProjectId && (brandProjectId || r.projects[0])) {
          setSaveProjectId(brandProjectId ?? r.projects[0]!.id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.create(title.trim() || 'Video', 30, 'youtube');
      setProjects((prev) => [res.project, ...prev]);
      applyProject(res.project);
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
      const res = await api.video.uploadSource(selected.id, dataUrl);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus('Upload mit echten Metadaten gespeichert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  }

  async function persistPlan(next?: Partial<VideoEditPlan>): Promise<boolean> {
    if (!selected) return false;
    const base = selected.editPlan ?? defaultEditPlan(selected.duration);
    const plan: VideoEditPlan = {
      ...base,
      trimStart,
      trimEnd,
      ...next,
    };
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.saveEditPlan(selected.id, plan);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus('Edit-Plan gespeichert.');
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Plan speichern fehlgeschlagen');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function analyzeLocal() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.analyzeLocal(selected.id);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus(`Lokale Analyse (${res.project.analyzerVersion ?? 'ffmpeg'}) — keine Kill-Detection.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lokale Analyse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function whisperSubtitles() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.generateSubtitles(selected.id);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus('Transkript gespeichert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transkription fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function exportLocal() {
    if (!selected) return;
    const ok = await persistPlan();
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.render(selected.id);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus('Lokaler Export fertig — Original unverändert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function saveToFiles() {
    if (!selected) return;
    setLoading(true);
    try {
      await api.video.saveFile(selected.id);
      setStatus('Export in Files gespeichert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Files fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function saveToProject() {
    if (!selected || !saveProjectId) return;
    setLoading(true);
    try {
      await api.video.saveProject(selected.id, saveProjectId);
      setStatus('Export dem Projekt zugeordnet.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Projekt speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  function excludePause(start: number, end: number) {
    const base = selected?.editPlan ?? defaultEditPlan(selected?.duration ?? 1);
    void persistPlan({
      removeSegments: [...(base.removeSegments ?? []), { start, end }],
    });
  }

  const meta = selected?.metadata;
  const duration = selected?.duration ?? 1;

  return (
    <StudioShell
      title="Video Studio"
      description="Upload, echte Metadaten, Timeline und lokaler FFmpeg-Export — ohne KI-Keys. Whisper optional."
      nexterHint="Video"
      badge={<Badge variant="brand">Lokal</Badge>}
    >
      {error && <StudioErrorBanner message={error} />}
      {status && <StudioSuccessBanner>{status}</StudioSuccessBanner>}

      <StudioWorkbench
        settingsTitle="Projekt & Schnitt"
        previewTitle="Vorschau"
        settings={
          <div data-testid="video-wizard" className="space-y-4">
            <input
              data-testid="video-title"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Projektname"
            />
            <Button data-testid="video-create" className="w-full" onClick={() => void handleCreate()} loading={loading}>
              Projekt erstellen
            </Button>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`video-project-${p.id}`}
                  onClick={() => applyProject(p)}
                  className={`w-full rounded-lg border p-2 text-left text-sm ${
                    selected?.id === p.id ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-zinc-800 text-zinc-400'
                  }`}
                >
                  {p.title}
                  {p.sourceUrl && <span className="ml-2 text-[10px] text-emerald-400">● Video</span>}
                </button>
              ))}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              data-testid="video-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = '';
              }}
            />
            <label className="flex items-start gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
              />
              Ich habe die Rechte am Videomaterial. NEXTER prüft Copyright nicht automatisch.
            </label>
            <Button
              variant="outline"
              className="w-full"
              data-testid="video-upload"
              onClick={() => fileRef.current?.click()}
              loading={uploading}
              disabled={!selected || !rightsConfirmed}
            >
              Video hochladen (MP4/WebM/MOV)
            </Button>

            {meta && (
              <dl data-testid="video-metadata" className="grid grid-cols-2 gap-1 text-[11px] text-zinc-400">
                <dt>Dauer</dt>
                <dd data-testid="video-meta-duration">{meta.durationSec.toFixed(2)}s</dd>
                <dt>Auflösung</dt>
                <dd>
                  {meta.width}×{meta.height}
                </dd>
                <dt>Seitenverhältnis</dt>
                <dd>{meta.aspectRatio}</dd>
                <dt>FPS</dt>
                <dd>{meta.fps ?? '—'}</dd>
                <dt>Audio</dt>
                <dd>{meta.hasAudio ? 'ja' : 'nein'}</dd>
                <dt>Codec</dt>
                <dd>{meta.videoCodec ?? '—'}</dd>
                <dt>Größe</dt>
                <dd>{(meta.sizeBytes / 1024).toFixed(0)} KB</dd>
              </dl>
            )}

            {selected?.sourceUrl && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Timeline (Trim)</p>
                <label className="block text-xs text-zinc-400">
                  Start {formatTime(trimStart)}
                  <input
                    data-testid="video-trim-start"
                    type="range"
                    min={0}
                    max={Math.max(0.1, duration - 0.2)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  Ende {formatTime(trimEnd)}
                  <input
                    data-testid="video-trim-end"
                    type="range"
                    min={0.2}
                    max={duration}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <Button data-testid="video-save-plan" variant="outline" className="w-full" onClick={() => void persistPlan()}>
                  Edit-Plan speichern
                </Button>
                <Button data-testid="video-analyze-local" variant="outline" className="w-full" onClick={() => void analyzeLocal()}>
                  Lokal analysieren (FFmpeg)
                </Button>
                <Button data-testid="video-whisper" variant="ghost" className="w-full" onClick={() => void whisperSubtitles()}>
                  Transkript (Whisper, braucht Key)
                </Button>
                <Button data-testid="video-export" className="w-full" onClick={() => void exportLocal()}>
                  Lokal exportieren (kostenlos)
                </Button>
              </>
            )}

            <button
              type="button"
              data-testid="video-nexter-chip"
              onClick={() => queueNexterPrompt('Analysiere dieses Video')}
              className="w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Nexter: „Analysiere dieses Video“
            </button>
          </div>
        }
        preview={
          <div className="space-y-3">
            {selected?.sourceUrl ? (
              <video
                data-testid="video-preview"
                src={selected.sourceUrl}
                controls
                className="aspect-video w-full rounded-xl bg-black"
              />
            ) : (
              <p className="text-sm text-zinc-500">Kein Video — Upload startet den lokalen Kern.</p>
            )}
            {selected?.renderUrl && (
              <div>
                <p className="mb-1 text-sm text-emerald-300">Export</p>
                <video data-testid="video-render" src={selected.renderUrl} controls className="aspect-video w-full rounded-xl bg-black" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" data-testid="video-save-file" onClick={() => void saveToFiles()}>
                    In Files
                  </Button>
                  <select
                    className="rounded border border-white/10 bg-black/40 px-2 text-xs"
                    value={saveProjectId}
                    onChange={(e) => setSaveProjectId(e.target.value)}
                  >
                    {brandProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" data-testid="video-save-project" onClick={() => void saveToProject()}>
                    Ins Projekt
                  </Button>
                </div>
              </div>
            )}
          </div>
        }
        history={
          selected ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <GlassCard className="!p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-300">Szenen</h3>
                {(selected.scenes?.length ?? 0) === 0 && <p className="text-xs text-zinc-500">Noch keine lokale Analyse.</p>}
                <ul data-testid="video-scenes" className="space-y-1 text-xs text-zinc-400">
                  {(selected.scenes ?? []).map((s, i) => (
                    <li key={i}>
                      Szene {formatTime(s.start)}–{formatTime(s.end)} ({s.duration.toFixed(1)}s)
                    </li>
                  ))}
                </ul>
                <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-300">Pausen</h3>
                <ul data-testid="video-pauses" className="space-y-1 text-xs text-zinc-400">
                  {(selected.pauses ?? []).map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span>
                        Pause {formatTime(p.start)}–{formatTime(p.end)}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] text-cyan-400"
                        onClick={() => excludePause(p.start, p.end)}
                      >
                        Pause entfernen
                      </button>
                    </li>
                  ))}
                </ul>
              </GlassCard>
              <GlassCard className="!p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-300">Highlights</h3>
                <p className="mb-2 text-[11px] text-zinc-500">
                  Scores aus Szenen, Sprache und Audioaktivität — keine Kill-/Reaction-Erkennung.
                </p>
                <ul data-testid="video-highlights" className="space-y-2">
                  {(selected.highlights ?? []).map((h, i) => (
                    <li key={i} className="rounded border border-zinc-800 p-2">
                      <p className="text-sm text-zinc-200">
                        Highlight {formatTime(h.start)}–{formatTime(h.end)} – Score {scorePct(h.score)}
                      </p>
                      <p className="text-[11px] text-zinc-500">{h.reason || h.label}</p>
                      <Link
                        data-testid={`video-open-short-${i}`}
                        to={`/shorts-studio?projectId=${selected.id}&start=${h.start}&end=${h.end}`}
                        className="text-xs text-cyan-400"
                      >
                        Als Short öffnen
                      </Link>
                    </li>
                  ))}
                </ul>
                {activeDna && (
                  <p className="mt-3 text-[11px] text-zinc-500">
                    DNA „{activeDna.name}“ gilt für Branding/Shorts-Texte, nicht für den Videoinhalt.
                  </p>
                )}
              </GlassCard>
            </div>
          ) : undefined
        }
      />
    </StudioShell>
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
