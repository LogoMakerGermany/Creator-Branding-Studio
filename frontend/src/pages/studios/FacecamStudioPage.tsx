import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { NeonPreviewBox, StudioErrorBanner } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { api, ApiError } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { formatCoins } from '@/lib/utils';
import {
  COIN_COSTS,
  CoinSpendCategory,
  FACECAM_ASPECT_OPTIONS,
  FACECAM_ASPECT_PRESETS,
  FACECAM_FRAME_SHAPES,
  FACECAM_FRAME_THICKNESSES,
  FACECAM_LOGO_POSITIONS,
  FACECAM_OUTPUT_FORMATS,
  FACECAM_PLATFORM_SPECS,
  FACECAM_STUDIO_PLATFORMS,
  applyFacecamAspectPreset,
  applyFacecamPlatformPreset,
  buildFacecamDesignSummary,
  defaultFacecamConfig,
  facecamConfigFromDna,
  facecamThicknessInset,
  type FacecamAspectRatio,
  type FacecamFrameShape,
  type FacecamFrameThickness,
  type FacecamLogoPosition,
  type FacecamOutputFormat,
  type FacecamPlatform,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import { Link } from 'react-router-dom';

const COIN_COST = COIN_COSTS[CoinSpendCategory.FACECAM_GENERATION];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-zinc-400">{children}</label>;
}

function shapeLabel(shape: FacecamFrameShape) {
  if (shape === 'circle') return 'Kreis';
  if (shape === 'rounded') return 'Abgerundet';
  if (shape === 'hexagon') return 'Hexagon';
  if (shape === 'stylized') return 'Stilisiert';
  return 'Rechteck';
}

function thicknessLabel(t: FacecamFrameThickness) {
  if (t === 'thin') return 'Dünn';
  if (t === 'thick') return 'Dick';
  return 'Mittel';
}

function logoPosLabel(pos: FacecamLogoPosition) {
  if (pos === 'top-left') return 'Oben links';
  if (pos === 'top-right') return 'Oben rechts';
  if (pos === 'bottom-left') return 'Unten links';
  if (pos === 'center') return 'Mitte';
  return 'Unten rechts';
}

export function FacecamStudioPage() {
  const { user, activeDna } = useAuth();
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const { projects, refresh, loading: jobsLoading } = useStudioProjects('facecam');
  const { projects: logos } = useStudioProjects('logo');
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<FacecamPlatform>('twitch');
  const [aspectRatio, setAspectRatio] = useState<FacecamAspectRatio>('16:9');
  const [frameShape, setFrameShape] = useState<FacecamFrameShape>('rectangle');
  const [frameThickness, setFrameThickness] = useState<FacecamFrameThickness>('medium');
  const [style, setStyle] = useState('gaming');
  const [logoPosition, setLogoPosition] = useState<FacecamLogoPosition>('bottom-right');
  const [outputFormat, setOutputFormat] = useState<FacecamOutputFormat>('png');
  const [transparent, setTransparent] = useState(true);
  const [customWidth, setCustomWidth] = useState<number | ''>('');
  const [customHeight, setCustomHeight] = useState<number | ''>('');
  const [logoJobId, setLogoJobId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeDna) return;
    setStyle((prev) => prev || activeDna.brandingStyle || activeDna.styleDirection || 'gaming');
    const pref = String(activeDna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
    if (pref in FACECAM_PLATFORM_SPECS) {
      setPlatform(pref as FacecamPlatform);
      setAspectRatio(FACECAM_PLATFORM_SPECS[pref as FacecamPlatform].defaultAspect);
    }
  }, [activeDna]);

  const config = useMemo(() => {
    let next = defaultFacecamConfig({
      ...(activeDna ? facecamConfigFromDna(activeDna) : {}),
      platform,
      aspectRatio,
      style,
      frameShape,
      frameThickness,
      logoPosition,
      format: outputFormat,
      transparentBackground: transparent,
      transparentCenter: transparent,
      logoJobId: logoJobId || undefined,
    });
    next = applyFacecamPlatformPreset(next, platform);
    if (aspectRatio !== 'custom' && aspectRatio in FACECAM_ASPECT_PRESETS) {
      next = applyFacecamAspectPreset(next, aspectRatio);
    }
    if (customWidth && customHeight) {
      next = { ...next, width: Number(customWidth), height: Number(customHeight), aspectRatio: 'custom' };
    }
    next.frameShape = frameShape;
    next.frameThickness = frameThickness;
    next.logoPosition = logoPosition;
    next.format = transparent && outputFormat === 'jpg' ? 'png' : outputFormat;
    next.transparentBackground = transparent && next.format !== 'jpg';
    next.transparentCenter = next.transparentBackground;
    next.summary = buildFacecamDesignSummary(next);
    return next;
  }, [
    activeDna,
    platform,
    aspectRatio,
    style,
    frameShape,
    frameThickness,
    logoPosition,
    outputFormat,
    transparent,
    customWidth,
    customHeight,
    logoJobId,
  ]);

  const coins = user?.coinBalance ?? 0;
  const remainder = coins - COIN_COST;
  const ownedLogos = logos.filter((p) => p.status === 'completed' && !p.fileMissing);
  const inset = facecamThicknessInset(config.frameThickness);
  const radius =
    config.frameShape === 'circle' ? '50%' : config.frameShape === 'rounded' || config.frameShape === 'stylized' ? '12%' : '0';
  const clip =
    config.frameShape === 'hexagon'
      ? 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)'
      : undefined;

  function nexterPrompt(kind: 'create' | 'variant' | 'change' = 'create', extra = '') {
    if (kind === 'variant') return `Neue Variante meiner Facecam: ${config.summary} ${extra}`.trim();
    if (kind === 'change') return extra || `Ändere meine letzte Facecam: ${config.summary}`;
    return `Mach mir einen ${FACECAM_PLATFORM_SPECS[config.platform].label} Facecam-Rahmen. ${config.summary} ${extra}`.trim();
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      await api.studio.generate('facecam', {
        platform: config.platform,
        style: config.style,
        shape: config.frameShape,
        transparentBackground: config.transparentBackground,
        projectId: projectId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    }
  }

  async function downloadOwnedFacecam(jobId: string) {
    try {
      const dl = await api.studio.downloadFacecam(jobId);
      window.open(dl.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  return (
    <StudioShell
      title="Facecam Studio"
      description="Webcam-Rahmen als Overlay — lokale Layout-Vorschau, Generierung nur über Nexter nach Bestätigung"
      coinCost={COIN_COST}
      nexterHint={nexterPrompt('create')}
    >
      <div className="space-y-4">
        {error && <StudioErrorBanner message={error} />}
        {!activeDna && (
          <p className="text-sm text-zinc-400" data-testid="facecam-no-dna">
            Keine Creator DNA — Facecam geht auch so. Farben und Stil kannst du hier setzen. Logo ist optional.
          </p>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-4">
            <section data-testid="facecam-platform-presets">
              <FieldLabel>Plattform</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {FACECAM_STUDIO_PLATFORMS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={platform === id && !customWidth}
                    onClick={() => {
                      setPlatform(id);
                      setAspectRatio(FACECAM_PLATFORM_SPECS[id].defaultAspect);
                      setCustomWidth('');
                      setCustomHeight('');
                    }}
                    className="min-h-11"
                  >
                    {FACECAM_PLATFORM_SPECS[id].label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section data-testid="facecam-aspect-presets">
              <FieldLabel>Seitenverhältnis</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {FACECAM_ASPECT_OPTIONS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={aspectRatio === id}
                    onClick={() => {
                      setAspectRatio(id);
                      if (id !== 'custom') {
                        setCustomWidth('');
                        setCustomHeight('');
                      }
                    }}
                    className="min-h-11"
                  >
                    {id === 'custom' ? 'Custom' : FACECAM_ASPECT_PRESETS[id].label}
                  </StudioOptionPill>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {config.width}×{config.height}px · {config.aspectRatio}
              </p>
            </section>

            <section>
              <FieldLabel>Custom-Größe (optional)</FieldLabel>
              <div className="flex gap-2">
                <Input
                  aria-label="Facecam-Breite"
                  inputMode="numeric"
                  value={customWidth}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCustomWidth(e.target.value === '' ? '' : n);
                    if (e.target.value) setAspectRatio('custom');
                  }}
                />
                <Input
                  aria-label="Facecam-Höhe"
                  inputMode="numeric"
                  value={customHeight}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCustomHeight(e.target.value === '' ? '' : n);
                    if (e.target.value) setAspectRatio('custom');
                  }}
                />
              </div>
            </section>

            <section>
              <FieldLabel>Rahmenform</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {FACECAM_FRAME_SHAPES.map((id) => (
                  <StudioOptionPill key={id} active={frameShape === id} onClick={() => setFrameShape(id)} className="min-h-11">
                    {shapeLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
              <FieldLabel>Rahmenstärke</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {FACECAM_FRAME_THICKNESSES.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={frameThickness === id}
                    onClick={() => setFrameThickness(id)}
                    className="min-h-11"
                  >
                    {thicknessLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Eigenes Logo (optional)</FieldLabel>
              <select
                aria-label="Eigenes Logo wählen"
                className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                value={logoJobId}
                onChange={(e) => setLogoJobId(e.target.value)}
              >
                <option value="">Ohne Logo</option>
                {ownedLogos.map((logo) => (
                  <option key={logo.id} value={logo.id}>
                    Logo {logo.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <FieldLabel>Logo-Position</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {FACECAM_LOGO_POSITIONS.map((pos) => (
                  <StudioOptionPill key={pos} active={logoPosition === pos} onClick={() => setLogoPosition(pos)} className="min-h-11">
                    {logoPosLabel(pos)}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Format</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {FACECAM_OUTPUT_FORMATS.map((fmt) => (
                  <StudioOptionPill
                    key={fmt}
                    active={outputFormat === fmt}
                    onClick={() => {
                      setOutputFormat(fmt);
                      if (fmt === 'jpg') setTransparent(false);
                    }}
                    className="min-h-11 uppercase"
                  >
                    {fmt}
                  </StudioOptionPill>
                ))}
              </div>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={transparent && outputFormat !== 'jpg'}
                  onChange={(e) => {
                    setTransparent(e.target.checked);
                    if (e.target.checked && outputFormat === 'jpg') setOutputFormat('png');
                  }}
                />
                Transparenter Kamerabereich (nur PNG/WEBP)
              </label>
              <Input
                aria-label="Stil"
                className="mt-2"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              />
            </section>
          </div>
        }
        preview={
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="facecam-preview-label">
              VORSCHAU — noch kein generiertes Bild
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-sm text-zinc-200" data-testid="facecam-design-summary">
              {config.summary}
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="facecam-quote-summary">
              <p>
                Facecam · {FACECAM_PLATFORM_SPECS[config.platform].label} · {config.width}×{config.height} ·{' '}
                {config.format.toUpperCase()} · {COIN_COST} Coins · Bestand {coins} → nach Bestätigung{' '}
                {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="facecam-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>
            <NeonPreviewBox>
              <div
                className="relative mx-auto w-full max-w-xl overflow-hidden border border-white/10"
                style={{
                  aspectRatio: `${config.width} / ${config.height}`,
                  backgroundImage:
                    'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                  backgroundColor: '#18181b',
                  clipPath: clip,
                  borderRadius: clip ? undefined : radius,
                }}
                data-testid="facecam-local-preview"
                role="img"
                aria-label={`Facecam-Layoutvorschau ${config.width} mal ${config.height} Pixel, ${shapeLabel(config.frameShape)}, ${thicknessLabel(config.frameThickness)}, transparenter Kamerabereich, Logo ${logoPosLabel(config.logoPosition)}`}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    boxShadow: `inset 0 0 0 ${Math.max(8, Math.round(inset * 180))}px ${config.colors[0] ?? '#22d3ee'}`,
                    borderRadius: clip ? undefined : radius,
                    opacity: 0.9,
                  }}
                  aria-hidden
                />
                {config.frameShape === 'stylized' && (
                  <div className="pointer-events-none absolute inset-2 border border-violet-400/40" aria-hidden />
                )}
                <span
                  className="absolute text-[10px] font-semibold uppercase tracking-wider text-white/80"
                  style={{
                    ...(config.logoPosition === 'top-left'
                      ? { top: '8%', left: '8%' }
                      : config.logoPosition === 'top-right'
                        ? { top: '8%', right: '8%' }
                        : config.logoPosition === 'bottom-left'
                          ? { bottom: '8%', left: '8%' }
                          : config.logoPosition === 'center'
                            ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                            : { bottom: '8%', right: '8%' }),
                  }}
                >
                  {config.logoJobId ? 'LOGO' : ''}
                </span>
              </div>
            </NeonPreviewBox>
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              data-testid="facecam-nexter-chip"
              onClick={() => queueNexterPrompt(nexterPrompt('create'))}
              className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Für {formatCoins(COIN_COST)} Coins erstellen — Nexter
            </button>
            <Button variant="ghost" size="sm" className="min-h-11 w-full" onClick={() => void tryDirectGenerate()}>
              Direkt erzeugen (wird abgelehnt)
            </Button>
          </div>
        }
        history={
          <GlassCard accent="purple" className="!p-5" data-testid="facecam-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {jobsLoading && (
              <p className="text-sm text-zinc-500" data-testid="facecam-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!jobsLoading && projects.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="facecam-jobs-empty">
                Noch kein Facecam-Projekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 p-3" data-testid="facecam-result-card">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={`Facecam ${p.platform ?? ''} Version ${p.version ?? 1}, ${p.width ?? config.width} mal ${p.height ?? config.height} Pixel${p.transparentBackground ? ', transparenter Kamerabereich' : ''}`}
                      className="mb-2 h-24 w-full object-contain"
                    />
                  ) : p.status === 'failed' ? (
                    <p className="text-xs text-red-400">Fehlgeschlagen{p.error ? `: ${p.error}` : ''}</p>
                  ) : p.status === 'processing' || p.status === 'queued' ? (
                    <p className="text-xs text-zinc-400">{p.status === 'queued' ? 'In der Warteschlange' : 'Wird erzeugt …'}</p>
                  ) : p.fileMissing ? (
                    <p className="text-xs text-amber-300" data-testid="facecam-result-missing">
                      Result fehlt
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {p.status}
                    {p.platform ? ` · ${p.platform}` : ''}
                    {p.width && p.height ? ` · ${p.width}×${p.height}` : ''}
                    {p.aspectRatio ? ` · ${p.aspectRatio}` : ''}
                    {p.mimeType ? ` · ${p.mimeType}` : ''}
                    {p.transparentBackground ? ' · transparent' : ''}
                    {typeof p.version === 'number' ? ` · v${p.version}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.status === 'completed' && !p.fileMissing && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1" onClick={() => void downloadOwnedFacecam(p.id)}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt(nexterPrompt('variant'))}>
                        Neue Variante
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => queueNexterPrompt('Ändere meine Facecam: Rahmen dünner.')}
                      >
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
                    {p.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        data-testid="facecam-to-streamset-action"
                        disabled={loading}
                        onClick={() => {
                          setLoading(true);
                          try {
                            queueNexterPrompt('Soll ich dir daraus ein vollständiges Streamset erstellen?');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        Im Streamset verwenden
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Link to="/layout-studio" className="inline-flex">
                        <Button size="sm" variant="outline" className="min-h-11">
                          Im Layout verwenden
                        </Button>
                      </Link>
                    )}
                    {p.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => queueNexterPrompt('Mach aus meiner Twitch-Facecam eine TikTok-Version.')}
                      >
                        Als TikTok
                      </Button>
                    )}
                    {p.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          void api.studio.retryFacecam(p.id).catch((err) =>
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
            <StudioHistory
              projects={projects}
              onSelect={() => {
                void refresh();
              }}
            />
          </GlassCard>
        }
      />
      <div className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        Logo ist optional. Der Innenbereich der Vorschau ist der transparente Kamerabereich — kein fertiges AI-Bild.
      </div>
    </StudioShell>
  );
}
