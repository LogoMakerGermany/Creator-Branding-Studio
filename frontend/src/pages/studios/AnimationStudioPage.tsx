import { useEffect, useState } from 'react';
import {
  ANIMATION_TYPES,
  COIN_COSTS,
  CoinSpendCategory,
  type AnimationAspect,
  type AnimationTypeId,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Badge, Button } from '@/components/ui';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob, type UserFile } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { GlassCard } from '@/v2/components/GlassCard';

const ANIM_COST = COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION];
const ANIM_CHIP = 'Animier mein Logo';

const MOTION: Array<{ id: 'subtle' | 'medium' | 'strong'; label: string }> = [
  { id: 'subtle', label: 'Dezent' },
  { id: 'medium', label: 'Mittel' },
  { id: 'strong', label: 'Stark' },
];

export function AnimationStudioPage() {
  const { activeDna } = useAuth();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [type, setType] = useState<AnimationTypeId>('intro');
  const preset = ANIMATION_TYPES.find((t) => t.id === type)!;
  const [durationSec, setDurationSec] = useState<number>(preset.durationSec);
  const [aspectRatio, setAspectRatio] = useState<AnimationAspect>('16:9');
  const [motion, setMotion] = useState<'subtle' | 'medium' | 'strong'>('medium');
  const [loop, setLoop] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [logoUrls, setLogoUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = ANIMATION_TYPES.find((t) => t.id === type)!;
    setDurationSec(next.durationSec);
    setLoop(next.supportsLoop);
  }, [type]);

  useEffect(() => {
    api.animations.list().then((r) => setJobs(r.jobs)).catch(() => {});
    api.files.list().then((r) => setFiles(r.files.filter((f) => f.mimeType.startsWith('image/')))).catch(() => {});
    api.ai
      .listJobs()
      .then((r) =>
        setLogoUrls(r.jobs.filter((j) => j.module === 'logo' && j.status === 'completed' && j.imageUrl).map((j) => j.imageUrl!))
      )
      .catch(() => {});
  }, [activeDna?.id]);

  useEffect(() => {
    const fromDna = activeDna?.sourceAssets?.find((a) => a.url)?.url;
    if (fromDna && !logoUrl) setLogoUrl(fromDna);
  }, [activeDna, logoUrl]);

  async function pickFile(file: UserFile) {
    try {
      const full = await api.files.get(file.id);
      setLogoUrl(full.file.dataUrl || file.downloadUrl || '');
    } catch {
      if (file.downloadUrl) setLogoUrl(file.downloadUrl);
    }
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      const res = await fetch('/api/v1/animations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
        },
        body: JSON.stringify({ type, durationSec, aspectRatio, motion, loop, logoUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(json?.error?.message || 'Animation startet nur über Nexter nach Bestätigung.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Animation nur über Nexter');
    }
  }

  const locks = [
    activeDna?.locks?.colors ? `Farben ${activeDna.primaryColors.join(', ')}` : null,
    activeDna?.locks?.character || activeDna?.locks?.mascot
      ? `Figur ${activeDna.character?.description || activeDna.mascot}`
      : null,
    activeDna?.locks?.name ? `Name ${activeDna.name}` : null,
  ].filter(Boolean);

  return (
    <StudioShell
      title="Animation Studio"
      description="Intro, Outro, Stinger, Alert und Logo-Loop aus Creator DNA und Logo. Echter Provider-Job nur nach Nexter-Quote."
      coinCost={ANIM_COST}
      nexterHint="Animation"
      badge={<Badge variant="brand">NEXTER</Badge>}
    >
      {!activeDna && <DnaRequiredBanner message="Creator DNA erforderlich — Animationen übernehmen Farben, Figur und Stil." />}
      {error && <StudioErrorBanner message={error} />}

      <StudioWorkbench
        settingsTitle="Animation"
        previewTitle="Vorschau / Jobs"
        settings={
          <div data-testid="animation-wizard" className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">1. Typ</p>
            <div className="flex flex-wrap gap-2">
              {ANIMATION_TYPES.map((t) => (
                <span key={t.id} data-testid={`animation-type-${t.id}`}>
                  <StudioOptionPill active={type === t.id} onClick={() => setType(t.id)}>
                    {t.label}
                  </StudioOptionPill>
                </span>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">2. Parameter (Pipeline)</p>
            <label className="block text-xs text-zinc-400">
              Dauer {durationSec}s
              <input
                data-testid="animation-duration"
                type="range"
                min={2}
                max={15}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(['16:9', '9:16'] as const).map((a) => (
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
            {preset.supportsLoop && (
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
                Loop
              </label>
            )}

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">3. Logo</p>
            {activeDna?.sourceAssets?.filter((a) => a.url).map((a) => (
              <button
                key={a.id}
                type="button"
                data-testid="animation-logo-dna"
                onClick={() => setLogoUrl(a.url)}
                className="mr-2 overflow-hidden rounded-lg border border-white/10"
              >
                <img src={a.url} alt="" className="h-12 w-12 object-contain" />
              </button>
            ))}
            {logoUrls.slice(0, 4).map((url) => (
              <button key={url} type="button" onClick={() => setLogoUrl(url)} className="mr-2 overflow-hidden rounded-lg border border-white/10">
                <img src={url} alt="" className="h-12 w-12 object-contain" />
              </button>
            ))}
            <div className="flex flex-wrap gap-1">
              {files.slice(0, 6).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid="animation-file-pick"
                  onClick={() => void pickFile(f)}
                  className="rounded border border-white/10 px-2 py-1 text-[11px] text-zinc-400"
                >
                  {f.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">
              {logoUrl
                ? 'Logo wird als Referenz übergeben, sofern der Provider Image-to-Video unterstützt. Sonst Text-to-Video mit DNA-Locks.'
                : 'Ohne Logo: Text-to-Video aus DNA. Kein neues Maskottchen erfinden.'}
            </p>

            {locks.length > 0 && (
              <p className="text-xs text-amber-200/80" data-testid="animation-dna-locks">
                DNA-Locks: {locks.join(' · ')}
              </p>
            )}

            <button
              type="button"
              data-testid="animation-nexter-chip"
              onClick={() =>
                queueNexterPrompt(
                  type === 'logo-loop'
                    ? ANIM_CHIP
                    : `Mach mir daraus ein ${durationSec} Sekunden ${preset.label}`
                )
              }
              className="w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Nexter: „{type === 'logo-loop' ? ANIM_CHIP : `${preset.label} ${durationSec}s`}“ · {ANIM_COST} Coins
            </button>
            <p className="text-[11px] text-zinc-500">
              Kein Direkt-Generate. Quote → Erstellen. Fehlender Provider = ehrlicher Fehler + Refund.
            </p>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void tryDirectGenerate()}>
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
            <div
              data-testid="animation-preview"
              className={`relative mx-auto flex max-h-[360px] w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-950 ${
                aspectRatio === '9:16' ? 'aspect-[9/16] max-w-[220px]' : 'aspect-video'
              }`}
              style={{ background: `radial-gradient(circle at 40% 40%, ${activeDna?.primaryColors[0] ?? '#1E40AF'}44, #09090b)` }}
            >
              {logoUrl ? (
                <img data-testid="animation-logo-preview" src={logoUrl} alt="Logo" className="max-h-[45%] max-w-[45%] object-contain" />
              ) : (
                <span className="text-xs text-zinc-600">Kein Logo gewählt</span>
              )}
            </div>
            <p className="text-center text-[11px] text-zinc-500">
              Vorschau ist Layout, kein gerendertes Video. Kill-Detection gibt es hier nicht.
            </p>
          </div>
        }
        history={
          <GlassCard accent="cyan" className="!p-5" data-testid="animation-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Jobs</h2>
            {jobs.length === 0 && <p className="text-sm text-zinc-500">Noch keine Animationen.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="rounded-lg border border-zinc-800 p-3">
                  <p className="text-sm text-zinc-200">{j.title || j.type}</p>
                  <p className="text-xs text-zinc-500">
                    {j.type} · {j.status}
                    {j.provider ? ` · ${j.provider}` : ''}
                  </p>
                  {j.error && <p className="mt-1 text-xs text-red-400">{j.error}</p>}
                  {j.videoUrl && <video src={j.videoUrl} controls className="mt-2 aspect-video w-full rounded bg-black" />}
                </div>
              ))}
            </div>
          </GlassCard>
        }
      />
    </StudioShell>
  );
}
