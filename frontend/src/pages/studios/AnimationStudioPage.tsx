import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ANIMATION_ASPECTS,
  ANIMATION_EFFECTS,
  ANIMATION_TYPES,
  COIN_COSTS,
  CoinSpendCategory,
  buildAnimationPreviewState,
  type AnimationAspect,
  type AnimationConfig,
  type AnimationDirection,
  type AnimationEffectId,
  type AnimationTypeId,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Badge, Button } from '@/components/ui';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, getAuthRequestToken, type MediaJob, type UserFile } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { GlassCard } from '@/v2/components/GlassCard';

const ANIM_COST = COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION];

const MOTION: Array<{ id: 'subtle' | 'medium' | 'strong'; label: string }> = [
  { id: 'subtle', label: 'Dezent' },
  { id: 'medium', label: 'Mittel' },
  { id: 'strong', label: 'Stark' },
];

function asType(v: string | null): AnimationTypeId {
  return ANIMATION_TYPES.some((t) => t.id === v) ? (v as AnimationTypeId) : 'intro';
}
function asEffect(v: string | null): AnimationEffectId {
  return ANIMATION_EFFECTS.some((e) => e.id === v) ? (v as AnimationEffectId) : 'fade-in';
}

export function AnimationStudioPage() {
  const { activeDna, user } = useAuth();
  const [search] = useSearchParams();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [type, setType] = useState<AnimationTypeId>(asType(search.get('type')));
  const preset = ANIMATION_TYPES.find((t) => t.id === type)!;
  const [durationSec, setDurationSec] = useState<number>(Number(search.get('duration')) || preset.durationSec);
  const [aspectRatio, setAspectRatio] = useState<AnimationAspect>(
    (search.get('aspect') as AnimationAspect) || '16:9'
  );
  const [motion, setMotion] = useState<'subtle' | 'medium' | 'strong'>('medium');
  const [loop, setLoop] = useState(search.get('loop') === '1');
  const [effect, setEffect] = useState<AnimationEffectId>(asEffect(search.get('effect')));
  const [direction, setDirection] = useState<AnimationDirection>(
    (search.get('direction') as AnimationDirection) || 'cw'
  );
  const [rotations, setRotations] = useState(1);
  const [transparent, setTransparent] = useState(search.get('transparent') === '1');
  const [sourceFileId, setSourceFileId] = useState(search.get('sourceFileId') || '');
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = ANIMATION_TYPES.find((t) => t.id === type)!;
    if (!search.get('duration')) setDurationSec(next.durationSec);
    if (next.supportsLoop) setLoop(true);
  }, [type, search]);

  useEffect(() => {
    let cancelled = false;
    setLoadingAssets(true);
    setLoadingJobs(true);
    api.animations
      .list()
      .then((r) => {
        if (!cancelled) setJobs(r.jobs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingJobs(false);
      });
    api.animations
      .assets()
      .then((r) => {
        if (!cancelled) setFiles(r.files);
      })
      .catch(() =>
        api.files
          .list()
          .then((r) => {
            if (!cancelled) setFiles(r.files.filter((f) => f.mimeType.startsWith('image/')));
          })
          .catch(() => {})
      )
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });
    const poll = window.setInterval(() => {
      api.animations
        .list()
        .then((r) => {
          if (!cancelled) setJobs(r.jobs);
        })
        .catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [activeDna?.id]);

  useEffect(() => {
    const f = files.find((x) => x.id === sourceFileId);
    if (f?.downloadUrl) setSourcePreviewUrl(f.downloadUrl);
  }, [files, sourceFileId]);

  const plan: AnimationConfig = useMemo(
    () => ({
      type,
      durationSec,
      aspectRatio,
      motion,
      loop,
      withAudio: false,
      effect,
      rotations,
      direction,
      transparent,
      sourceFileId: sourceFileId || null,
    }),
    [type, durationSec, aspectRatio, motion, loop, effect, rotations, direction, transparent, sourceFileId]
  );
  const preview = buildAnimationPreviewState(plan);
  const coins = user?.coinBalance ?? 0;
  const remainder = coins - ANIM_COST;

  async function pickFile(file: UserFile) {
    setSourceFileId(file.id);
    setPreviewLoading(true);
    setError(null);
    try {
      const full = await api.files.get(file.id);
      setSourcePreviewUrl(full.file.dataUrl || file.downloadUrl || '');
    } catch {
      setSourcePreviewUrl('');
      setError('Ungültiges oder fremdes Asset — Vorschau nicht möglich.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      const token = await getAuthRequestToken();
      const res = await fetch('/api/v1/animations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...plan, coinCost: 1 }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
      setError(json?.error?.message || 'Animation startet nur über Nexter nach Bestätigung.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Animation nur über Nexter');
    }
  }

  async function downloadJob(job: MediaJob) {
    setError(null);
    try {
      const r = await api.animations.download(job.id);
      window.open(r.downloadUrl, '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  function nexterPrompt(): string {
    if (type === 'stream-start') return 'Erstelle einen animierten Starting-Soon-Screen.';
    if (type === 'stream-end') return 'Erstelle einen animierten Endscreen.';
    if (effect === 'rotate') return 'Lass mein Logo einmal um die eigene Achse drehen.';
    if (effect === 'fade-in') return 'Lass das Logo langsam einblenden.';
    if (type === 'intro') return `Mach daraus ein ${durationSec} Sekunden Intro.`;
    return `Animier mein Logo als ${preset.label}, ${durationSec} Sekunden.`;
  }

  const locks = [
    activeDna?.locks?.colors ? `Farben ${activeDna.primaryColors.join(', ')}` : null,
    activeDna?.locks?.character || activeDna?.locks?.mascot
      ? `Figur ${activeDna.character?.description || activeDna.mascot}`
      : null,
    activeDna?.locks?.name ? `Name ${activeDna.name}` : null,
  ].filter(Boolean);

  const frameClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] max-w-[220px]'
      : aspectRatio === '1:1'
        ? 'aspect-square max-w-[280px]'
        : 'aspect-video';

  return (
    <StudioShell
      title="Animation Studio"
      description="Eigenes Asset wählen, Effekt lokal vorschauen, Provider-Job nur nach Nexter-Quote."
      coinCost={ANIM_COST}
      nexterHint="Animation"
      badge={<Badge variant="brand">NEXTER</Badge>}
    >
      {!activeDna && <DnaRequiredBanner message="Creator DNA erforderlich — Animationen übernehmen Farben, Figur und Stil." />}
      {error && <StudioErrorBanner message={error} />}

      <StudioWorkbench
        settingsTitle="Animation"
        previewTitle="Vorschau"
        settings={
          <div data-testid="animation-wizard" className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">1. Asset</p>
            {loadingAssets && (
              <p className="text-xs text-zinc-500" data-testid="animation-assets-loading">
                Assets laden …
              </p>
            )}
            {!loadingAssets && files.length === 0 && (
              <p className="text-xs text-amber-200/80" data-testid="animation-no-asset">
                Kein eigenes Bild/Logo. Lade eines in Files oder erstelle ein Logo.
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {files.slice(0, 12).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid="animation-file-pick"
                  onClick={() => void pickFile(f)}
                  className={`min-h-11 rounded border px-2 py-1 text-[11px] ${
                    sourceFileId === f.id ? 'border-cyan-400 text-cyan-200' : 'border-white/10 text-zinc-400'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">2. Typ</p>
            <div className="flex flex-wrap gap-2">
              {ANIMATION_TYPES.map((t) => (
                <span key={t.id} data-testid={`animation-type-${t.id}`}>
                  <StudioOptionPill active={type === t.id} onClick={() => setType(t.id)}>
                    {t.label}
                  </StudioOptionPill>
                </span>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">3. Effekt</p>
            <div className="flex flex-wrap gap-2" data-testid="animation-effects">
              {ANIMATION_EFFECTS.map((e) => (
                <StudioOptionPill key={e.id} active={effect === e.id} onClick={() => setEffect(e.id)}>
                  {e.label}
                </StudioOptionPill>
              ))}
            </div>
            {effect === 'rotate' && (
              <div className="space-y-2" data-testid="animation-rotation">
                <div className="flex flex-wrap gap-2">
                  <StudioOptionPill active={direction === 'cw'} onClick={() => setDirection('cw')}>
                    Uhrzeigersinn
                  </StudioOptionPill>
                  <StudioOptionPill active={direction === 'ccw'} onClick={() => setDirection('ccw')}>
                    Gegen den Uhrzeigersinn
                  </StudioOptionPill>
                </div>
                <label className="block text-xs text-zinc-400">
                  Umdrehungen {rotations}
                  <input
                    type="range"
                    min={1}
                    max={3}
                    value={rotations}
                    onChange={(e) => setRotations(Number(e.target.value))}
                    className="mt-1 w-full"
                    data-testid="animation-rotations"
                  />
                </label>
              </div>
            )}

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">4. Parameter</p>
            <label className="block text-xs text-zinc-400">
              Dauer {durationSec}s
              <input
                data-testid="animation-duration"
                type="range"
                min={1}
                max={15}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <div className="flex flex-wrap gap-2" data-testid="animation-aspects">
              {ANIMATION_ASPECTS.map((a) => (
                <StudioOptionPill key={a} active={aspectRatio === a} onClick={() => setAspectRatio(a)}>
                  {a}
                </StudioOptionPill>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {MOTION.map((m) => (
                <StudioOptionPill key={m.id} active={motion === m.id} onClick={() => setMotion(m.id)}>
                  {m.label}
                </StudioOptionPill>
              ))}
            </div>
            {(preset.supportsLoop || effect === 'pulse' || effect === 'rotate') && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
                Loop
              </label>
            )}
            <label className="flex min-h-11 items-start gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                data-testid="animation-transparent"
              />
              <span>
                Transparenter Hintergrund
                <span className="block text-[11px] text-zinc-500">{preview.alphaNote}</span>
              </span>
            </label>

            {locks.length > 0 && (
              <p className="text-xs text-amber-200/80" data-testid="animation-dna-locks">
                DNA-Locks: {locks.join(' · ')}
              </p>
            )}

            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="animation-quote-summary">
              <p>
                Asset {sourceFileId ? 'gewählt' : 'fehlt'} · {preview.effect} · {preview.durationSec}s · {preview.aspectRatio} ·{' '}
                {ANIM_COST} Coins
              </p>
              <p>
                Bestand {coins} → nach Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="animation-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>

            <button
              type="button"
              data-testid="animation-nexter-chip"
              onClick={() => queueNexterPrompt(nexterPrompt())}
              className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Nexter: „{nexterPrompt()}“ · {ANIM_COST} Coins
            </button>
            <p className="text-[11px] text-zinc-500">
              Kein Direkt-Generate. Quote → Erstellen. Fehlender Provider = ehrlicher Fehler + Refund.
            </p>
            <Button variant="ghost" size="sm" className="min-h-11 w-full" onClick={() => void tryDirectGenerate()}>
              Direkt erzeugen (wird abgelehnt)
            </Button>
          </div>
        }
        preview={
          <div className="space-y-3">
            {activeDna && (
              <StudioSuccessBanner>
                DNA: {activeDna.name}
                {activeDna.primaryColors[0] ? ` · ${activeDna.primaryColors.join(', ')}` : ''}
                {activeDna.styleDirection ? ` · ${activeDna.styleDirection}` : ''}
              </StudioSuccessBanner>
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="animation-preview-label">
              {preview.label} — nicht pixelidentisch zum Provider-Render
            </p>
            <div
              data-testid="animation-preview"
              className={`relative mx-auto flex max-h-[360px] w-full items-center justify-center overflow-hidden rounded-2xl ${frameClass}`}
              style={{
                aspectRatio: preview.cssAspect === 'auto' ? undefined : preview.cssAspect,
                background: transparent
                  ? 'repeating-conic-gradient(#27272a 0% 25%, #09090b 0% 50%) 50% / 16px 16px'
                  : `radial-gradient(circle at 40% 40%, ${activeDna?.primaryColors[0] ?? '#1E40AF'}44, #09090b)`,
              }}
            >
              {sourcePreviewUrl ? (
                <img
                  data-testid="animation-logo-preview"
                  src={sourcePreviewUrl}
                  alt="Logo"
                  className={`max-h-[55%] max-w-[55%] object-contain ${preview.animationClass}`}
                  style={{
                    animationDuration: preview.animationDuration,
                    animationIterationCount: preview.animationIteration,
                    animationTimingFunction: motion === 'strong' ? 'ease-in-out' : 'ease-out',
                    animationFillMode: 'both',
                  }}
                />
              ) : previewLoading ? (
                <span className="text-xs text-zinc-500" data-testid="animation-preview-loading">
                  Vorschau lädt …
                </span>
              ) : (
                <span className="text-xs text-zinc-600" data-testid="animation-preview-empty">
                  Kein Asset gewählt
                </span>
              )}
            </div>
            <p className="text-center text-[11px] text-zinc-500" data-testid="animation-preview-config">
              {preview.effect} · {preview.durationSec}s · {preview.aspectRatio} · {preview.loop ? 'Loop' : 'einmal'}
            </p>
          </div>
        }
        history={
          <GlassCard accent="cyan" className="!p-5" data-testid="animation-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {loadingJobs && (
              <p className="text-sm text-zinc-500" data-testid="animation-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!loadingJobs && jobs.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="animation-jobs-empty">
                Noch keine Animationen.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="rounded-lg border border-zinc-800 p-3" data-testid="animation-result-card">
                  <p className="text-sm text-zinc-200">{j.title || j.type}</p>
                  <p className="text-xs text-zinc-500">
                    {j.status}
                    {j.duration ? ` · ${j.duration}s` : ''}
                    {typeof j.metadata?.aspectRatio === 'string' ? ` · ${j.metadata.aspectRatio}` : ''}
                    {typeof j.metadata?.version === 'number' ? ` · v${j.metadata.version}` : ''}
                    {j.provider ? ` · ${j.provider}` : ''}
                  </p>
                  {j.status === 'queued' || j.status === 'processing' ? (
                    <p className="mt-1 text-xs text-cyan-300">Job läuft …</p>
                  ) : null}
                  {j.status === 'failed' && <p className="mt-1 text-xs text-red-400">{j.error || 'Fehlgeschlagen'}</p>}
                  {j.fileMissing && (
                    <p className="mt-1 text-xs text-amber-300" data-testid="animation-file-missing">
                      Result-Datei fehlt.
                    </p>
                  )}
                  {j.videoUrl && j.status === 'completed' && !j.fileMissing && (
                    <video src={j.videoUrl} controls className="mt-2 aspect-video w-full rounded bg-black" />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {j.status === 'completed' && (
                      <Button size="sm" data-testid="animation-download" onClick={() => void downloadJob(j)}>
                        Download
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => queueNexterPrompt('Mach die Animation langsamer.')}
                    >
                      Ändern
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => queueNexterPrompt('Neue Variante der Animation.')}
                    >
                      Neue Variante
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        }
      />
    </StudioShell>
  );
}
