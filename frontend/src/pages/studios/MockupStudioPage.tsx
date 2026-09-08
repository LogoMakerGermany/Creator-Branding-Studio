import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import {
  COIN_COSTS,
  CoinSpendCategory,
  MOCKUP_CATEGORIES,
  MOCKUP_COLORS,
  MOCKUP_MODELS,
  MOCKUP_PLACEMENTS,
  PRODUCT_LABEL,
  buildMockupDesignSummary,
  defaultMockupConfig,
  mockupColorHex,
  mockupPlacementLabel,
  type MockupJob,
  type MockupMode,
  type MockupPlacement,
  type MockupProductCategory,
} from '@ucbs/shared';
import { Button } from '@/components/ui';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { StudioErrorBanner } from '@/components/studio';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { formatCoins } from '@/lib/utils';
import { GlassCard } from '@/v2/components/GlassCard';
import { Link } from 'react-router-dom';

const LIFESTYLE_COST = COIN_COSTS[CoinSpendCategory.MOCKUP_GENERATION];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-zinc-400">{children}</label>;
}

function productClip(category: MockupProductCategory): string {
  if (category === 'mug') return 'rounded-[28%]';
  if (category === 'phone') return 'rounded-[22%]';
  if (category === 'cap') return 'rounded-[50%]';
  if (category === 'poster') return 'rounded-sm';
  if (category === 'hoodie') return 'rounded-[18%]';
  if (category === 'tote') return 'rounded-b-[12%]';
  return 'rounded-[12%]';
}

export function MockupStudioPage() {
  const { user, activeDna } = useAuth();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const { projects: logos } = useStudioProjects('logo');
  const { projects: stickers } = useStudioProjects('sticker');
  const [category, setCategory] = useState<MockupProductCategory>('mug');
  const [colorId, setColorId] = useState('white');
  const [modelLabel, setModelLabel] = useState(MOCKUP_MODELS.mug[0]);
  const [placement, setPlacement] = useState<MockupPlacement>('front');
  const [scale, setScale] = useState(100);
  const [mode, setMode] = useState<MockupMode>('local');
  const [sourceLogoJobId, setSourceLogoJobId] = useState('');
  const [sourceStickerJobId, setSourceStickerJobId] = useState('');
  const [jobs, setJobs] = useState<MockupJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const restoredRef = useRef(false);

  const models = MOCKUP_MODELS[category];
  useEffect(() => {
    setModelLabel((prev) => (models.includes(prev) ? prev : models[0]));
  }, [category, models]);

  useEffect(() => {
    setJobsLoading(true);
    api.mockups
      .list()
      .then((r) => setJobs(r.jobs))
      .catch(() => setJobs([]))
      .finally(() => setJobsLoading(false));
  }, []);

  useEffect(() => {
    if (restoredRef.current || jobs.length === 0) return;
    const last = jobs[0];
    restoredRef.current = true;
    setCategory(last.category);
    setColorId(last.colorId);
    setModelLabel(last.modelLabel);
    setPlacement(last.placement);
    setScale(last.scalePercent);
    setMode(last.lifestyle ? 'lifestyle' : last.mode ?? 'local');
    if (last.sourceLogoJobId) setSourceLogoJobId(last.sourceLogoJobId);
    if (last.sourceStickerJobId) setSourceStickerJobId(last.sourceStickerJobId);
  }, [jobs]);

  const ownedLogos = logos.filter((p) => p.status === 'completed' && !p.fileMissing);
  const ownedStickers = stickers.filter((p) => p.status === 'completed' && !p.fileMissing);
  const previewLogo = ownedLogos.find((p) => p.id === sourceLogoJobId)?.imageUrl;
  const previewSticker = ownedStickers.find((p) => p.id === sourceStickerJobId)?.imageUrl;
  const designUrl = previewSticker || previewLogo || '';

  const config = useMemo(() => {
    const next = defaultMockupConfig({
      mode,
      category,
      colorId,
      modelLabel,
      placement,
      scalePercent: scale,
      sourceKind: sourceStickerJobId ? 'sticker' : sourceLogoJobId ? 'logo' : undefined,
      sourceLogoJobId: sourceLogoJobId || undefined,
      sourceStickerJobId: sourceStickerJobId || undefined,
    });
    next.summary = buildMockupDesignSummary(next);
    return next;
  }, [mode, category, colorId, modelLabel, placement, scale, sourceLogoJobId, sourceStickerJobId]);

  const coins = user?.coinBalance ?? 0;
  const remainder = coins - LIFESTYLE_COST;
  const colorHex = mockupColorHex(colorId);
  const align =
    placement === 'corner' ? 'items-start justify-end p-10' : placement === 'wrap' ? 'items-center justify-center px-6' : 'items-center justify-center';
  const mark = `${Math.max(40, Math.min(140, scale)) * 0.42}%`;

  function nexterPrompt(kind: 'lifestyle' | 'local' | 'change' | 'variant' = 'lifestyle') {
    if (kind === 'change') return `Ändere mein Mockup: Logo kleiner. ${config.summary}`;
    if (kind === 'variant') return `Neue Variante meines Mockups: ${config.summary}`;
    if (kind === 'local') return `Zeig mein Logo auf einem ${PRODUCT_LABEL[category]}.`;
    return `Mach mir eine realistische Lifestyle-Version. ${config.summary}`;
  }

  async function saveComposite() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.mockups.generate({
        category,
        colorId,
        modelLabel,
        placement,
        scalePercent: scale,
        sourceLogoJobId: sourceLogoJobId || undefined,
        sourceStickerJobId: sourceStickerJobId || undefined,
        lifestyle: false,
        projectId: projectId ?? undefined,
      });
      setJobs((prev) => [res.job, ...prev.filter((j) => j.id !== res.job.id)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mockup fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function tryLifestyleDirect() {
    setError(null);
    try {
      await api.mockups.generate({
        category,
        colorId,
        modelLabel,
        placement,
        scalePercent: scale,
        lifestyle: true,
        projectId: projectId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lifestyle abgelehnt');
    }
  }

  async function downloadOwned(jobId: string) {
    try {
      const dl = await api.mockups.download(jobId);
      window.open(dl.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  return (
    <StudioShell
      title="Mockup Studio"
      description="Lokales Composite ohne KI — Lifestyle-Fotos nur über Nexter nach Bestätigung"
      coinCost={mode === 'lifestyle' ? LIFESTYLE_COST : 0}
      nexterHint={nexterPrompt(mode === 'lifestyle' ? 'lifestyle' : 'local')}
    >
      <div className="space-y-4">
        {error && <StudioErrorBanner message={error} />}
        {!activeDna && (
          <p className="text-sm text-zinc-400" data-testid="mockup-no-dna">
            Keine Creator DNA — eigenes Logo oder Sticker reicht. DNA wird nicht automatisch geändert.
          </p>
        )}
        {!designUrl && (
          <p className="text-sm text-amber-300" data-testid="mockup-no-source" role="status">
            Keine eigenen Source-Assets — erstelle zuerst ein Logo oder einen Sticker.
          </p>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-4">
            <section data-testid="mockup-mode">
              <FieldLabel>Modus</FieldLabel>
              <div className="flex flex-wrap gap-1">
                <StudioOptionPill active={mode === 'local'} onClick={() => setMode('local')} className="min-h-11">
                  Lokal (0 Coins)
                </StudioOptionPill>
                <StudioOptionPill active={mode === 'lifestyle'} onClick={() => setMode('lifestyle')} className="min-h-11">
                  Lifestyle-KI
                </StudioOptionPill>
              </div>
            </section>
            <section data-testid="mockup-tabs">
              <FieldLabel>Produkt</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {MOCKUP_CATEGORIES.map((c) => (
                  <StudioOptionPill key={c.id} active={category === c.id} onClick={() => setCategory(c.id)} className="min-h-11">
                    {c.label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>
            <section>
              <FieldLabel>Eigenes Asset</FieldLabel>
              <select
                aria-label="Logo-Quelle"
                className="mb-2 min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                value={sourceLogoJobId}
                onChange={(e) => {
                  setSourceLogoJobId(e.target.value);
                  if (e.target.value) setSourceStickerJobId('');
                }}
              >
                <option value="">Logo wählen</option>
                {ownedLogos.map((logo) => (
                  <option key={logo.id} value={logo.id}>
                    Logo {logo.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sticker-Quelle"
                className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                value={sourceStickerJobId}
                onChange={(e) => {
                  setSourceStickerJobId(e.target.value);
                  if (e.target.value) setSourceLogoJobId('');
                }}
              >
                <option value="">Sticker wählen</option>
                {ownedStickers.map((sticker) => (
                  <option key={sticker.id} value={sticker.id}>
                    Sticker {sticker.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </section>
            <section>
              <FieldLabel>Farbe</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {MOCKUP_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.label}
                    data-testid={`mockup-color-${c.id}`}
                    onClick={() => setColorId(c.id)}
                    className={`min-h-11 min-w-11 rounded-full border ${colorId === c.id ? 'ring-2 ring-violet-400' : 'border-white/20'}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </section>
            <section>
              <FieldLabel>Modell / Position / Größe</FieldLabel>
              <div className="mb-2 flex flex-wrap gap-1">
                {models.map((m) => (
                  <StudioOptionPill key={m} active={modelLabel === m} onClick={() => setModelLabel(m)} className="min-h-11">
                    {m}
                  </StudioOptionPill>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {MOCKUP_PLACEMENTS.map((p) => (
                  <StudioOptionPill key={p} active={placement === p} onClick={() => setPlacement(p)} className="min-h-11">
                    {mockupPlacementLabel(p)}
                  </StudioOptionPill>
                ))}
              </div>
              <label className="block text-xs text-zinc-400">
                Größe {scale}%
                <input
                  aria-label="Mockup-Größe"
                  type="range"
                  min={40}
                  max={140}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="mt-1 min-h-11 w-full"
                />
              </label>
            </section>
          </div>
        }
        preview={
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="mockup-preview-label">
              VORSCHAU — {mode === 'lifestyle' ? 'kein Lifestyle-AI-Bild' : 'kein finales Composite'}
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-sm text-zinc-200" data-testid="mockup-design-summary">
              {config.summary}
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="mockup-quote-summary">
              {mode === 'lifestyle' ? (
                <p>
                  Lifestyle-KI · {PRODUCT_LABEL[category]} · {LIFESTYLE_COST} Coins · Bestand {coins} →{' '}
                  {remainder < 0 ? 'unzureichend' : remainder}
                </p>
              ) : (
                <p>Lokales Composite · 0 Coins · {PRODUCT_LABEL[category]} · {config.scalePercent}%</p>
              )}
              {mode === 'lifestyle' && remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="mockup-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>
            <div
              data-testid="mockup-preview"
              className="relative mx-auto flex aspect-square max-h-[440px] w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-950"
              role="img"
              aria-label={`Mockup-Vorschau ${PRODUCT_LABEL[category]}, ${mockupPlacementLabel(placement)}, Größe ${scale} Prozent. Kein finales AI-Bild.`}
            >
              <div className={`relative flex h-[78%] w-[62%] ${productClip(category)} ${align}`} style={{ background: colorHex }}>
                {designUrl ? (
                  <img src={designUrl} alt="" className="object-contain drop-shadow-lg" style={{ width: mark, height: mark }} />
                ) : (
                  <span className="text-xs text-zinc-600">Kein Design</span>
                )}
              </div>
            </div>
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2">
            {mode === 'local' ? (
              <Button data-testid="mockup-save-composite" className="min-h-11" onClick={() => void saveComposite()} disabled={loading || !designUrl}>
                {loading ? 'Speichere …' : 'Mockup speichern (kostenlos)'}
              </Button>
            ) : (
              <button
                type="button"
                data-testid="mockup-nexter-chip"
                onClick={() => queueNexterPrompt(nexterPrompt('lifestyle'))}
                className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
              >
                Für {formatCoins(LIFESTYLE_COST)} Coins erstellen — Nexter
              </button>
            )}
            <Button variant="ghost" size="sm" className="min-h-11 w-full" onClick={() => void tryLifestyleDirect()}>
              Lifestyle direkt erzeugen (wird abgelehnt)
            </Button>
          </div>
        }
        history={
          <GlassCard accent="purple" className="!p-5" data-testid="mockup-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {jobsLoading && <p className="text-sm text-zinc-500">Ergebnisse laden …</p>}
            {!jobsLoading && jobs.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="mockup-jobs-empty">
                Noch kein Mockup-Projekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {jobs.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 p-3" data-testid="mockup-result-card">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={`${p.lifestyle ? 'Lifestyle' : 'Lokales'} Mockup ${p.category} Version ${p.version ?? 1}`}
                      className="mb-2 h-24 w-full object-contain"
                    />
                  ) : p.status === 'failed' ? (
                    <p className="text-xs text-red-400">Fehlgeschlagen{p.error ? `: ${p.error}` : ''}</p>
                  ) : p.status === 'processing' || p.status === 'queued' ? (
                    <p className="text-xs text-zinc-400">{p.status === 'queued' ? 'In der Warteschlange' : 'Wird erzeugt …'}</p>
                  ) : p.fileMissing ? (
                    <p className="text-xs text-amber-300">Result fehlt</p>
                  ) : p.sourceMissing ? (
                    <p className="text-xs text-amber-300">Quelldatei fehlt</p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {p.lifestyle ? 'Lifestyle' : 'Lokal'} · {p.category}
                    {typeof p.version === 'number' ? ` · v${p.version}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.status === 'completed' && !p.fileMissing && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => void downloadOwned(p.id)}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt(nexterPrompt('variant'))}>
                        Neue Variante
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt(nexterPrompt('change'))}>
                        Ändern
                      </Button>
                    )}
                    {p.status === 'completed' && projectId && (
                      <Link to={`/projects/${projectId}`} className="inline-flex">
                        <Button size="sm" variant="outline" className="min-h-11">
                          Im Projekt verwenden
                        </Button>
                      </Link>
                    )}
                    {p.status === 'failed' && p.lifestyle && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          void api.mockups.retry(p.id).catch((err) =>
                            setError(err instanceof ApiError ? err.message : 'Retry braucht ein neues Angebot')
                          )
                        }
                      >
                        Erneut versuchen
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        }
      />
      <div className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        Lokales Composite braucht keinen Provider. Lifestyle startet erst nach Nexter-Bestätigung.
      </div>
    </StudioShell>
  );
}
