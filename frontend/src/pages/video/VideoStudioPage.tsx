import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { defaultEditPlan, buildVideoPreviewState, VIDEO_TRANSITION_TYPES, type VideoAspectPreset, type VideoEditPlan, type VideoFitMode, type VideoTransitionId } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Badge, Button } from '@/components/ui';
import { StudioErrorBanner } from '@/components/studio';
import { StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type UserFile, type VideoProject, type SubtitleEntry } from '@/services/api';
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
  const [search] = useSearchParams();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selected, setSelected] = useState<VideoProject | null>(null);
  const [title, setTitle] = useState('Video');
  const [trimStart, setTrimStart] = useState(Number(search.get('start') ?? 0));
  const [trimEnd, setTrimEnd] = useState(Number(search.get('end') ?? 1));
  const [aspect, setAspect] = useState<VideoAspectPreset>((search.get('aspect') as VideoAspectPreset) || 'original');
  const [fitMode, setFitMode] = useState<VideoFitMode>('crop');
  const [volume, setVolume] = useState(1);
  const [mute, setMute] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [introFileId, setIntroFileId] = useState<string>('');
  const [outroFileId, setOutroFileId] = useState<string>('');
  const [audioFileId, setAudioFileId] = useState<string>('');
  const [transition, setTransition] = useState<VideoTransitionId>('cut');
  const [captions, setCaptions] = useState<SubtitleEntry[]>([]);
  const [capText, setCapText] = useState('');
  const [capStart, setCapStart] = useState(0);
  const [capEnd, setCapEnd] = useState(2);
  const [capEditIndex, setCapEditIndex] = useState<number | null>(null);
  const [burnCaptions, setBurnCaptions] = useState(false);
  const [ownedClips, setOwnedClips] = useState<UserFile[]>([]);
  const [ownedMusic, setOwnedMusic] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saveProjectId, setSaveProjectId] = useState(brandProjectId ?? '');
  const [brandProjects, setBrandProjects] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  function applyProject(p: VideoProject) {
    setSelected(p);
    const plan = p.editPlan ?? defaultEditPlan(p.duration || 1);
    setTrimStart(plan.trimStart);
    setTrimEnd(plan.trimEnd);
    setAspect(plan.aspectRatio);
    setFitMode(plan.fitMode ?? 'crop');
    setVolume(plan.volume);
    setMute(Boolean(plan.mute));
    setIntroFileId(plan.introFileId || '');
    setOutroFileId(plan.outroFileId || '');
    setAudioFileId(plan.audioFileId || '');
    setTransition(plan.transition === 'fade' ? 'fade' : 'cut');
    setBurnCaptions(Boolean(plan.subtitleTrack));
    setCaptions(p.subtitles ?? []);
  }

  useEffect(() => {
    api.video
      .list()
      .then((r) => {
        setProjects(r.projects);
        const qid = search.get('projectId');
        const match = r.projects.find((p) => p.id === qid) ?? r.projects[0];
        if (match) applyProject(match);
      })
      .catch(() => {});
    api.files
      .list()
      .then((r) => {
        setOwnedClips(r.files.filter((f) => f.category === 'video' || f.mimeType.startsWith('video/')));
        setOwnedMusic(r.files.filter((f) => f.mimeType.startsWith('audio/')));
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
      const res = await api.video.create(title.trim() || 'Video', 30, 'youtube', saveProjectId || undefined);
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
      const res = await api.video.uploadSource(selected.id, dataUrl, undefined, file.name);
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
      aspectRatio: aspect,
      fitMode,
      volume,
      mute,
      introFileId: introFileId || null,
      outroFileId: outroFileId || null,
      audioFileId: audioFileId || null,
      transition,
      subtitleTrack: burnCaptions,
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
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.video.detectHighlights(selected.id);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus(
        res.project.highlights.length
          ? `Highlight-Kandidaten (${res.project.analyzerVersion ?? 'ffmpeg'}) — kein automatischer Export.`
          : 'Keine Highlight-Kandidaten gefunden. Du kannst Start/Ende manuell setzen.'
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lokale Analyse fehlgeschlagen');
    } finally {
      setAnalyzing(false);
    }
  }

  async function whisperSubtitles() {
    setError('Automatische Untertitel starten nur über Nexter nach Bestätigung (Für X Coins erstellen).');
    queueNexterPrompt('Erstelle automatische Untertitel für dieses Video.');
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

  async function persistCaptions(next: SubtitleEntry[]): Promise<boolean> {
    if (!selected) return false;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.patchSubtitles(selected.id, next);
      applyProject(res.project);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setStatus('Captions gespeichert.');
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Caption speichern fehlgeschlagen');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function addOrReplaceCaption() {
    const entry = { start: capStart, end: capEnd, text: capText };
    const next =
      capEditIndex != null
        ? captions.map((c, i) => (i === capEditIndex ? entry : c))
        : [...captions, entry];
    const ok = await persistCaptions(next);
    if (ok) {
      setCapText('');
      setCapEditIndex(null);
    }
  }

  const meta = selected?.metadata;
  const duration = selected?.duration ?? 1;
  const previewPlan: VideoEditPlan = {
    ...(selected?.editPlan ?? defaultEditPlan(duration)),
    trimStart,
    trimEnd,
    aspectRatio: aspect,
    fitMode,
    volume,
    mute,
    introFileId: introFileId || null,
    outroFileId: outroFileId || null,
    audioFileId: audioFileId || null,
    transition,
    subtitleTrack: burnCaptions,
  };
  const preview = buildVideoPreviewState({ plan: previewPlan, captions });
  const activeCaption = captions.find((c) => playhead >= c.start && playhead < c.end);

  function onPreviewTime(el: HTMLVideoElement) {
    let t = el.currentTime;
    if (t < trimStart) {
      el.currentTime = trimStart;
      t = trimStart;
    }
    if (t > trimEnd) {
      el.pause();
      el.currentTime = trimEnd;
      t = trimEnd;
    }
    setPlayhead(t);
  }

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

            {selected?.fileMissing && (
              <p className="text-xs text-amber-300" data-testid="video-file-missing">
                Quelldatei fehlt. Download ist deaktiviert.
              </p>
            )}

            {selected?.sourceUrl && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Timeline</p>
                <div className="relative h-8 overflow-hidden rounded bg-zinc-900" data-testid="video-timeline">
                  <div
                    className="absolute inset-y-0 bg-cyan-500/30"
                    style={{
                      left: `${(trimStart / Math.max(duration, 0.01)) * 100}%`,
                      width: `${((trimEnd - trimStart) / Math.max(duration, 0.01)) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-white"
                    style={{ left: `${(playhead / Math.max(duration, 0.01)) * 100}%` }}
                    data-testid="video-playhead"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Playhead {formatTime(playhead)} · Auswahl {formatTime(trimStart)}–{formatTime(trimEnd)} (
                  {(trimEnd - trimStart).toFixed(1)}s)
                </p>
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
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Format</p>
                <div className="flex flex-wrap gap-2" data-testid="video-formats">
                  {(['original', '16:9', '9:16', '1:1'] as VideoAspectPreset[]).map((id) => (
                    <StudioOptionPill key={id} active={aspect === id} onClick={() => setAspect(id)}>
                      {id}
                    </StudioOptionPill>
                  ))}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Zuschneiden</p>
                <div className="flex flex-wrap gap-2" data-testid="video-fit">
                  {(['crop', 'fit', 'center'] as VideoFitMode[]).map((id) => (
                    <StudioOptionPill key={id} active={fitMode === id} onClick={() => setFitMode(id)}>
                      {id === 'fit' ? 'Fit (ohne Verzerren)' : id === 'center' ? 'Center' : 'Crop'}
                    </StudioOptionPill>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} data-testid="video-mute" />
                  Audio stumm
                </label>
                <label className="block text-xs text-zinc-400">
                  Lautstärke {volume.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={volume}
                    disabled={mute}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="mt-1 w-full"
                    data-testid="video-volume"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  Intro (eigene Datei)
                  <select
                    className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                    value={introFileId}
                    onChange={(e) => setIntroFileId(e.target.value)}
                    data-testid="video-intro"
                  >
                    <option value="">Kein Intro</option>
                    {ownedClips.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Outro (eigene Datei)
                  <select
                    className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                    value={outroFileId}
                    onChange={(e) => setOutroFileId(e.target.value)}
                    data-testid="video-outro"
                  >
                    <option value="">Kein Outro</option>
                    {ownedClips.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Eigene Musik (Audio)
                  <select
                    className="mt-1 min-h-11 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                    value={audioFileId}
                    onChange={(e) => setAudioFileId(e.target.value)}
                    data-testid="video-audio"
                  >
                    <option value="">Keine eigene Musik</option>
                    {ownedMusic.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Übergang</p>
                <div className="flex flex-wrap gap-2" data-testid="video-transitions">
                  {VIDEO_TRANSITION_TYPES.map((id) => (
                    <StudioOptionPill key={id} active={transition === id} onClick={() => setTransition(id)}>
                      {id === 'fade' ? 'Fade / Crossfade' : 'Cut'}
                    </StudioOptionPill>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Nur Cut und Fade — genau die Typen, die der lokale Export ausführt.
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Captions</p>
                <div className="space-y-2" data-testid="video-caption-editor">
                  <input
                    data-testid="video-caption-text"
                    className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white"
                    placeholder="Caption-Text"
                    value={capText}
                    onChange={(e) => setCapText(e.target.value)}
                    maxLength={200}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-zinc-400">
                      Start
                      <input
                        data-testid="video-caption-start"
                        type="number"
                        min={0}
                        step={0.1}
                        value={capStart}
                        onChange={(e) => setCapStart(Number(e.target.value))}
                        className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-400">
                      Ende
                      <input
                        data-testid="video-caption-end"
                        type="number"
                        min={0}
                        step={0.1}
                        value={capEnd}
                        onChange={(e) => setCapEnd(Number(e.target.value))}
                        className="mt-1 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
                      />
                    </label>
                  </div>
                  <Button data-testid="video-caption-add" variant="outline" className="w-full" onClick={() => void addOrReplaceCaption()}>
                    {capEditIndex != null ? 'Caption speichern' : 'Caption hinzufügen'}
                  </Button>
                  <ul data-testid="video-caption-list" className="space-y-1">
                    {captions.map((c, i) => (
                      <li key={`${c.start}-${c.text}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                        <button
                          type="button"
                          data-testid={`video-caption-edit-${i}`}
                          className="text-left"
                          onClick={() => {
                            setCapText(c.text);
                            setCapStart(c.start);
                            setCapEnd(c.end);
                            setCapEditIndex(i);
                          }}
                        >
                          {c.start.toFixed(1)}–{c.end.toFixed(1)}s · {c.text}
                        </button>
                        <button
                          type="button"
                          data-testid={`video-caption-delete-${i}`}
                          className="text-rose-300"
                          onClick={() => void persistCaptions(captions.filter((_, j) => j !== i))}
                        >
                          Löschen
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={burnCaptions}
                      onChange={(e) => setBurnCaptions(e.target.checked)}
                      data-testid="video-burn-captions"
                    />
                    Captions beim Export einbrennen
                  </label>
                  {selected.captionsNeedReview && (
                    <p className="text-[11px] text-amber-300" data-testid="video-captions-review">
                      Automatische Captions sind ein Entwurf — bitte prüfen, dann erst einbrennen.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button data-testid="video-save-plan" variant="outline" onClick={() => void persistPlan()}>
                    Edit-Plan speichern
                  </Button>
                  <Button data-testid="video-analyze-local" variant="outline" loading={analyzing} onClick={() => void analyzeLocal()}>
                    Highlights finden
                  </Button>
                  <Button data-testid="video-whisper" variant="ghost" onClick={() => void whisperSubtitles()}>
                    Untertitel (provider-gated)
                  </Button>
                  <Button data-testid="video-export" loading={loading} disabled={selected.status === 'processing'} onClick={() => void exportLocal()}>
                    {selected.status === 'processing' ? 'Export läuft …' : 'Lokal exportieren'}
                  </Button>
                </div>
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
            {!selected && <p className="text-sm text-zinc-500">Kein Projekt — zuerst erstellen.</p>}
            {selected && !selected.sourceUrl && !selected.fileMissing && (
              <p className="text-sm text-zinc-500" data-testid="video-empty">
                Kein Video — Upload startet den lokalen Kern.
              </p>
            )}
            {uploading && <p className="text-sm text-cyan-300">Upload läuft …</p>}
            {analyzing && <p className="text-sm text-cyan-300">Analyse läuft …</p>}
            {selected?.sourceUrl ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="video-preview-label">
                  {preview.label} — nicht pixelidentisch zum Export
                </p>
                <div
                  data-testid="video-preview-frame"
                  className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl bg-black"
                  style={{ aspectRatio: preview.cssAspect, maxHeight: 480 }}
                >
                  <video
                    ref={videoRef}
                    data-testid="video-preview"
                    src={selected.sourceUrl}
                    controls
                    muted={preview.mute}
                    onLoadedMetadata={(e) => {
                      const el = e.target as HTMLVideoElement;
                      el.currentTime = trimStart;
                      el.volume = Math.min(1, preview.volume);
                    }}
                    onTimeUpdate={(e) => onPreviewTime(e.target as HTMLVideoElement)}
                    className="h-full w-full bg-black"
                    style={{ objectFit: preview.objectFit }}
                  />
                  {activeCaption && (
                    <div
                      data-testid="video-caption-overlay"
                      className="pointer-events-none absolute bottom-6 left-1/2 w-[90%] -translate-x-1/2 text-center text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                    >
                      {activeCaption.text}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                  {introFileId ? <span data-testid="video-preview-intro">Intro-Markierung</span> : null}
                  {outroFileId ? <span data-testid="video-preview-outro">Outro-Markierung</span> : null}
                  <span data-testid="video-preview-transition">
                    Übergang: {preview.transition === 'fade' ? `Fade ${preview.transitionSec}s` : 'Cut'}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-white/10 p-3 text-xs text-zinc-400" data-testid="video-config-preview">
              <p className="mb-1 font-semibold text-zinc-300">Vorschau-Konfiguration (gleicher Plan wie Export)</p>
              <p data-testid="video-preview-trim">
                Ausschnitt {formatTime(preview.trimStart)}–{formatTime(preview.trimEnd)} · Format {preview.aspectRatio} ·{' '}
                {preview.fitMode} ({preview.objectFit}) · erwartet {(preview.trimEnd - preview.trimStart).toFixed(1)}s
                {preview.introFileId ? ' · mit Intro' : ''}
                {preview.outroFileId ? ' · mit Outro' : ''}
                {preview.mute ? ' · stumm' : ''}
                {preview.captions.length ? ` · ${preview.captions.length} Captions` : ''}
              </p>
            </div>
            {selected?.status === 'failed' && (
              <p className="text-sm text-rose-300">Export fehlgeschlagen. Es wurde kein erfolgreiches Asset gespeichert.</p>
            )}
            {selected?.renderUrl && (
              <div>
                <p className="mb-1 text-sm text-emerald-300">Export fertig</p>
                <video data-testid="video-render" src={selected.renderUrl} controls className="aspect-video w-full rounded-xl bg-black" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.renderFileId && (
                    <Button
                      size="sm"
                      data-testid="video-download"
                      onClick={() => {
                        void api.files.downloadUrl(selected.renderFileId!).then((r) => {
                          window.open(r.downloadUrl, '_blank');
                        });
                      }}
                    >
                      Download
                    </Button>
                  )}
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
                  {(selected.highlights ?? []).length === 0 && (
                    <li className="text-xs text-zinc-500">Keine Highlight-Kandidaten. Manueller Trim bleibt möglich.</li>
                  )}
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
