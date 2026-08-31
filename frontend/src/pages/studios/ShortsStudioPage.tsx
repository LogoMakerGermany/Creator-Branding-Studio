import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DEFAULT_VIDEO_CROP, clipSubtitlesToRange, type VideoCrop } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Badge, Button } from '@/components/ui';
import { StudioErrorBanner } from '@/components/studio';
import { StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { api, ApiError, type SubtitleEntry, type VideoProject } from '@/services/api';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { useNexterStore } from '@/v2/store/nexter-store';
import { GlassCard } from '@/v2/components/GlassCard';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ShortsStudioPage() {
  const [search] = useSearchParams();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const brandProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selected, setSelected] = useState<VideoProject | null>(null);
  const [start, setStart] = useState(Number(search.get('start') ?? 0));
  const [end, setEnd] = useState(Number(search.get('end') ?? 8));
  const [cropMode, setCropMode] = useState<'center' | 'manual'>('center');
  const [cropX, setCropX] = useState(0.35);
  const [cropY, setCropY] = useState(0);
  const [burnSubs, setBurnSubs] = useState(true);
  const [subs, setSubs] = useState<SubtitleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saveProjectId, setSaveProjectId] = useState(brandProjectId ?? '');
  const [brandProjects, setBrandProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.video
      .list()
      .then((r) => {
        setProjects(r.projects);
        const qid = search.get('projectId');
        const match = r.projects.find((p) => p.id === qid) ?? r.projects[0];
        if (match) {
          setSelected(match);
          setSubs(match.subtitles ?? []);
          if (!search.get('end') && match.duration) setEnd(Math.min(match.duration, 12));
        }
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
  }, [search]);

  const crop: VideoCrop = useMemo(
    () =>
      cropMode === 'manual'
        ? { mode: 'manual', x: cropX, y: cropY, width: 0.3, height: 1 }
        : { ...DEFAULT_VIDEO_CROP },
    [cropMode, cropX, cropY]
  );

  const clipSubs = selected ? clipSubtitlesToRange(subs, { start, end }) : [];

  async function persistSubs() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.patchSubtitles(selected.id, subs);
      setSelected(res.project);
      setStatus('Untertitel gespeichert — Export nutzt die Korrektur.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Untertitel speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function exportShort() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.video.createShort(selected.id, {
        start,
        end,
        format: 'shorts',
        crop,
        burnSubtitles: burnSubs,
      });
      const refreshed = await api.video.get(selected.id);
      setSelected(refreshed.project);
      setProjects((prev) => prev.map((p) => (p.id === refreshed.project.id ? refreshed.project : p)));
      setStatus(res.job.videoUrl ? 'Short exportiert (9:16, lokal, 0 Coins).' : res.job.error || 'Export fehlgeschlagen');
      if (res.job.error) setError(res.job.error);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Short-Export fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function saveLastShort() {
    const last = selected?.shorts[selected.shorts.length - 1];
    if (!selected || !last) return;
    setLoading(true);
    try {
      await api.video.saveFile(selected.id, last.id);
      if (saveProjectId) await api.video.saveProject(selected.id, saveProjectId);
      setStatus('Short in Files/Projekt.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const duration = selected?.duration ?? 30;

  return (
    <StudioShell
      title="Shorts Studio"
      description="9:16 Clips aus vorhandenen Videos — manueller Crop, Untertitel, lokaler Export. Kein Auto-Facecam-Tracking."
      nexterHint="Shorts"
      badge={<Badge variant="brand">9:16 lokal</Badge>}
    >
      {error && <StudioErrorBanner message={error} />}
      {status && <StudioSuccessBanner>{status}</StudioSuccessBanner>}

      <StudioWorkbench
        settingsTitle="Quelle & Crop"
        previewTitle="9:16 Vorschau"
        settings={
          <div data-testid="shorts-wizard" className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Videoquelle</p>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`shorts-source-${p.id}`}
                  onClick={() => {
                    setSelected(p);
                    setSubs(p.subtitles ?? []);
                  }}
                  className={`w-full rounded-lg border p-2 text-left text-sm ${
                    selected?.id === p.id ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-zinc-800 text-zinc-400'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>

            {(selected?.highlights ?? []).length > 0 && (
              <div>
                <p className="mb-1 text-xs text-zinc-500">Highlight als Quelle</p>
                {selected!.highlights.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid={`shorts-highlight-${i}`}
                    className="mb-1 block w-full rounded border border-zinc-800 px-2 py-1 text-left text-xs text-zinc-300"
                    onClick={() => {
                      setStart(h.start);
                      setEnd(h.end);
                    }}
                  >
                    Highlight {i + 1}: {formatTime(h.start)}–{formatTime(h.end)}
                  </button>
                ))}
              </div>
            )}

            <label className="block text-xs text-zinc-400">
              Start {formatTime(start)}
              <input
                data-testid="shorts-start"
                type="range"
                min={0}
                max={Math.max(0.2, duration - 0.3)}
                step={0.1}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Ende {formatTime(end)}
              <input
                data-testid="shorts-end"
                type="range"
                min={0.3}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">9:16 Crop</p>
            <div className="flex gap-2">
              <StudioOptionPill active={cropMode === 'center'} onClick={() => setCropMode('center')}>
                Center Crop
              </StudioOptionPill>
              <span data-testid="shorts-crop-manual">
                <StudioOptionPill active={cropMode === 'manual'} onClick={() => setCropMode('manual')}>
                  Manuell
                </StudioOptionPill>
              </span>
            </div>
            {cropMode === 'manual' && (
              <>
                <label className="block text-xs text-zinc-400">
                  X {cropX.toFixed(2)}
                  <input
                    data-testid="shorts-crop-x"
                    type="range"
                    min={0}
                    max={0.7}
                    step={0.01}
                    value={cropX}
                    onChange={(e) => setCropX(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  Y {cropY.toFixed(2)}
                  <input
                    data-testid="shorts-crop-y"
                    type="range"
                    min={0}
                    max={0.4}
                    step={0.01}
                    value={cropY}
                    onChange={(e) => setCropY(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
              </>
            )}
            <p className="text-[11px] text-zinc-500">Keine automatische Person-im-Bild-Verfolgung in v1.</p>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={burnSubs} onChange={(e) => setBurnSubs(e.target.checked)} />
              Untertitel einbrennen
            </label>
            <Button data-testid="shorts-export" className="w-full" onClick={() => void exportShort()} loading={loading} disabled={!selected?.sourceUrl}>
              Short exportieren (9:16, lokal)
            </Button>
            <Link
              data-testid="shorts-create-content"
              to={`/text-studio?source=short&videoProjectId=${selected?.id ?? ''}${selected?.shorts?.[0] ? `&shortJobId=${selected.shorts[0].id}` : ''}`}
              className="block w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-center text-sm text-violet-200"
            >
              Content dafür erstellen
            </Link>
            <button
              type="button"
              data-testid="shorts-nexter-chip"
              onClick={() =>
                queueNexterPrompt('Mach mir einen TikTok-Text für meinen letzten Short.')
              }
              className="w-full rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-300"
            >
              Nexter: TikTok-Text für letzten Short
            </button>
          </div>
        }
        preview={
          <div className="space-y-3">
            <div
              data-testid="shorts-preview"
              className="relative mx-auto aspect-[9/16] max-h-[480px] w-full max-w-[270px] overflow-hidden rounded-2xl bg-black"
            >
              {selected?.sourceUrl ? (
                <video src={selected.sourceUrl} controls className="h-full w-full object-cover" />
              ) : (
                <p className="p-4 text-center text-xs text-zinc-500">Video wählen</p>
              )}
            </div>
            <p className="text-center text-[11px] text-zinc-500" data-testid="shorts-range">
              {formatTime(start)}–{formatTime(end)} · 1080×1920 wenn die Pipeline das erzeugt
            </p>
          </div>
        }
        history={
          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="!p-4">
              <h3 className="mb-2 text-sm font-semibold">Untertitel (Clip-synchron)</h3>
              {clipSubs.length === 0 && (
                <p className="text-xs text-zinc-500">Kein Transkript — Editor bleibt nutzbar. Whisper ist optional.</p>
              )}
              <ul data-testid="shorts-subtitles" className="space-y-2">
                {subs.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-16 shrink-0 text-[10px] text-zinc-500">
                      {formatTime(s.start)}
                    </span>
                    <input
                      data-testid={`shorts-sub-${i}`}
                      className="flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
                      value={s.text}
                      onChange={(e) => {
                        const next = [...subs];
                        next[i] = { ...s, text: e.target.value };
                        setSubs(next);
                      }}
                    />
                  </li>
                ))}
              </ul>
              {subs.length > 0 && (
                <Button data-testid="shorts-save-subs" size="sm" className="mt-3" onClick={() => void persistSubs()}>
                  Untertitel speichern
                </Button>
              )}
            </GlassCard>
            <GlassCard className="!p-4" data-testid="shorts-results">
              <h3 className="mb-2 text-sm font-semibold">Exports (getrennte Assets)</h3>
              {(selected?.shorts ?? []).length === 0 && <p className="text-xs text-zinc-500">Noch keine Shorts.</p>}
              <div className="space-y-3">
                {(selected?.shorts ?? []).map((s) => (
                  <div key={s.id} className="rounded border border-zinc-800 p-2">
                    <p className="text-sm">{s.title}</p>
                    <p className="text-[11px] text-zinc-500">
                      {s.status}
                      {typeof s.metadata?.start === 'number' ? ` · ${s.metadata.start}–${s.metadata.end}s` : ''}
                      {s.metadata?.width ? ` · ${s.metadata.width}×${s.metadata.height}` : ''}
                    </p>
                    {s.videoUrl && (
                      <video data-testid="shorts-output" src={s.videoUrl} controls className="mt-2 aspect-[9/16] max-h-64 w-full rounded bg-black" />
                    )}
                    <Link
                      to={`/text-studio?source=short&videoProjectId=${selected?.id ?? ''}&shortJobId=${s.id}`}
                      className="mt-2 inline-block text-xs text-violet-300"
                    >
                      Content erstellen
                    </Link>
                  </div>
                ))}
              </div>
              {(selected?.shorts?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
                    value={saveProjectId}
                    onChange={(e) => setSaveProjectId(e.target.value)}
                  >
                    {brandProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Button data-testid="shorts-save-file" size="sm" onClick={() => void saveLastShort()}>
                    In Files / Projekt
                  </Button>
                </div>
              )}
            </GlassCard>
          </div>
        }
      />
    </StudioShell>
  );
}
