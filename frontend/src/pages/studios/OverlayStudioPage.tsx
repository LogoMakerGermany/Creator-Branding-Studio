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
  OVERLAY_ASPECT_OPTIONS,
  OVERLAY_ASPECT_PRESETS,
  OVERLAY_BORDER_STYLES,
  OVERLAY_LAYOUT_PRESETS,
  OVERLAY_LOGO_POSITIONS,
  OVERLAY_OUTPUT_FORMATS,
  OVERLAY_PLATFORM_SPECS,
  OVERLAY_STUDIO_PLATFORMS,
  applyOverlayLayoutPreset,
  applyOverlayPlatformPreset,
  buildOverlayDesignSummary,
  defaultOverlayConfig,
  overlayConfigFromDna,
  overlayLayoutLabel,
  type OverlayAspectRatio,
  type OverlayBorderStyle,
  type OverlayLayoutPreset,
  type OverlayLogoPosition,
  type OverlayOutputFormat,
  type OverlayPlatform,
  type OverlayRegion,
  type OverlayType,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import { Link } from 'react-router-dom';

const COIN_COST = COIN_COSTS[CoinSpendCategory.OVERLAY_GENERATION];
const OVERLAY_TYPES: Array<{ id: OverlayType; label: string }> = [
  { id: 'hud', label: 'HUD' },
  { id: 'alert', label: 'Alert' },
  { id: 'panel', label: 'Panel' },
  { id: 'starting-soon', label: 'Starting Soon' },
  { id: 'brb', label: 'BRB' },
  { id: 'offline', label: 'Offline' },
  { id: 'ending', label: 'Ending' },
  { id: 'full-scene', label: 'Full Scene' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-zinc-400">{children}</label>;
}

function logoPosLabel(pos: OverlayLogoPosition) {
  if (pos === 'top-left') return 'Oben links';
  if (pos === 'top-right') return 'Oben rechts';
  if (pos === 'bottom-left') return 'Unten links';
  if (pos === 'center') return 'Mitte';
  return 'Unten rechts';
}

function borderLabel(style: OverlayBorderStyle) {
  if (style === 'thin') return 'Dünn';
  if (style === 'thick') return 'Dick';
  if (style === 'none') return 'Ohne';
  return 'Mittel';
}

function regionBoxStyle(region: OverlayRegion, canvasW: number, canvasH: number) {
  return {
    left: `${(region.x / canvasW) * 100}%`,
    top: `${(region.y / canvasH) * 100}%`,
    width: `${(region.width / canvasW) * 100}%`,
    height: `${(region.height / canvasH) * 100}%`,
  };
}

const REGION_COLORS: Record<string, string> = {
  Gameplay: 'border-cyan-400/80 bg-cyan-400/10 text-cyan-100',
  Facecam: 'border-violet-400/80 bg-violet-400/10 text-violet-100',
  Chat: 'border-amber-400/80 bg-amber-400/10 text-amber-100',
  Alert: 'border-rose-400/80 bg-rose-400/10 text-rose-100',
};

export function OverlayStudioPage() {
  const { user, activeDna } = useAuth();
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const { projects, refresh, loading: jobsLoading } = useStudioProjects('overlay');
  const { projects: logos } = useStudioProjects('logo');
  const { projects: facecams } = useStudioProjects('facecam');
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<OverlayPlatform>('twitch');
  const [aspectRatio, setAspectRatio] = useState<OverlayAspectRatio>('16:9');
  const [layoutPreset, setLayoutPreset] = useState<OverlayLayoutPreset>('gameplay-facecam-chat');
  const [overlayType, setOverlayType] = useState<OverlayType>('hud');
  const [style, setStyle] = useState('gaming');
  const [borderStyle, setBorderStyle] = useState<OverlayBorderStyle>('medium');
  const [logoPosition, setLogoPosition] = useState<OverlayLogoPosition>('top-left');
  const [outputFormat, setOutputFormat] = useState<OverlayOutputFormat>('png');
  const [transparent, setTransparent] = useState(true);
  const [customWidth, setCustomWidth] = useState<number | ''>('');
  const [customHeight, setCustomHeight] = useState<number | ''>('');
  const [logoJobId, setLogoJobId] = useState('');
  const [facecamJobId, setFacecamJobId] = useState('');
  const [regionOverrides, setRegionOverrides] = useState<{
    gameplay?: boolean;
    facecam?: boolean;
    chat?: boolean;
    alert?: boolean;
  }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeDna) return;
    setStyle((prev) => prev || activeDna.brandingStyle || activeDna.styleDirection || 'gaming');
    const pref = String(activeDna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
    if (pref in OVERLAY_PLATFORM_SPECS) {
      const next = pref as OverlayPlatform;
      setPlatform(next);
      setAspectRatio(OVERLAY_PLATFORM_SPECS[next].defaultAspect);
      setLayoutPreset(OVERLAY_PLATFORM_SPECS[next].defaultLayout);
    }
  }, [activeDna]);

  const config = useMemo(() => {
    let next = defaultOverlayConfig({
      ...(activeDna ? overlayConfigFromDna(activeDna) : {}),
      platform,
      aspectRatio,
      layoutPreset,
      overlayType,
      style,
      borderStyle,
      logoPosition,
      format: outputFormat,
      transparentBackground: transparent,
      logoJobId: logoJobId || undefined,
      facecamJobId: facecamJobId || undefined,
    });
    next = applyOverlayPlatformPreset(next, platform);
    if (layoutPreset !== OVERLAY_PLATFORM_SPECS[platform].defaultLayout) {
      next = applyOverlayLayoutPreset(next, layoutPreset);
    }
    if (aspectRatio !== 'custom' && aspectRatio in OVERLAY_ASPECT_PRESETS && platform === 'custom') {
      next = {
        ...next,
        aspectRatio,
        width: OVERLAY_ASPECT_PRESETS[aspectRatio as Exclude<OverlayAspectRatio, 'custom'>].width,
        height: OVERLAY_ASPECT_PRESETS[aspectRatio as Exclude<OverlayAspectRatio, 'custom'>].height,
      };
      next = applyOverlayLayoutPreset(next, layoutPreset === 'custom' ? 'gameplay-facecam-chat' : layoutPreset);
    }
    if (customWidth && customHeight) {
      next = { ...next, width: Number(customWidth), height: Number(customHeight), aspectRatio: 'custom' };
      next = applyOverlayLayoutPreset(next, layoutPreset === 'custom' ? 'gameplay-facecam-chat' : layoutPreset);
      next.layoutPreset = layoutPreset === 'custom' ? 'custom' : next.layoutPreset;
    }
    if (overlayType === 'starting-soon' || overlayType === 'brb' || overlayType === 'offline' || overlayType === 'ending') {
      next = applyOverlayLayoutPreset(next, 'gameplay-full');
      next.overlayType = overlayType;
      next.transparentBackground = false;
      next.gameplayRegion = { ...next.gameplayRegion, transparent: false };
    } else {
      next.overlayType = overlayType;
    }
    next.borderStyle = borderStyle;
    next.logoPosition = logoPosition;
    next.format = transparent && outputFormat === 'jpg' ? 'png' : outputFormat;
    next.transparentBackground = transparent && next.format !== 'jpg';
    if (next.format === 'jpg') {
      next.gameplayRegion = { ...next.gameplayRegion, transparent: false };
      next.facecamRegion = { ...next.facecamRegion, transparent: false };
      next.chatRegion = { ...next.chatRegion, transparent: false };
    }
    const applyVis = (region: OverlayRegion, visible: boolean | undefined): OverlayRegion =>
      typeof visible === 'boolean' ? { ...region, visible } : region;
    if (regionOverrides.gameplay !== undefined || regionOverrides.facecam !== undefined || regionOverrides.chat !== undefined || regionOverrides.alert !== undefined) {
      next.gameplayRegion = applyVis(next.gameplayRegion, regionOverrides.gameplay);
      next.facecamRegion = applyVis(next.facecamRegion, regionOverrides.facecam);
      next.chatRegion = applyVis(next.chatRegion, regionOverrides.chat);
      next.alertRegion = applyVis(next.alertRegion, regionOverrides.alert);
      next.layoutPreset = 'custom';
    }
    next.logoJobId = logoJobId || undefined;
    next.facecamJobId = facecamJobId || undefined;
    next.summary = buildOverlayDesignSummary(next);
    return next;
  }, [
    activeDna,
    platform,
    aspectRatio,
    layoutPreset,
    overlayType,
    style,
    borderStyle,
    logoPosition,
    outputFormat,
    transparent,
    customWidth,
    customHeight,
    logoJobId,
    facecamJobId,
    regionOverrides,
  ]);

  const coins = user?.coinBalance ?? 0;
  const remainder = coins - COIN_COST;
  const ownedLogos = logos.filter((p) => p.status === 'completed' && !p.fileMissing);
  const ownedFacecams = facecams.filter((p) => p.status === 'completed' && !p.fileMissing);

  function nexterPrompt(kind: 'create' | 'variant' | 'change' = 'create', extra = '') {
    if (kind === 'variant') return `Neue Variante meines Overlays: ${config.summary} ${extra}`.trim();
    if (kind === 'change') return extra || `Ändere mein Overlay: ${config.summary}`;
    return `Mach mir ein ${OVERLAY_PLATFORM_SPECS[config.platform].label} Overlay. ${config.summary} ${extra}`.trim();
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      await api.studio.generate('overlay', {
        platform: config.platform,
        style: config.style,
        overlayType: config.overlayType,
        transparentBackground: config.transparentBackground,
        projectId: projectId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    }
  }

  async function downloadOwnedOverlay(jobId: string) {
    try {
      const dl = await api.studio.downloadOverlay(jobId);
      window.open(dl.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  const previewRegions: Array<{ name: string; region: OverlayRegion }> = [
    { name: 'Gameplay', region: config.gameplayRegion },
    { name: 'Facecam', region: config.facecamRegion },
    { name: 'Chat', region: config.chatRegion },
    { name: 'Alert', region: config.alertRegion },
  ];

  return (
    <StudioShell
      title="Overlay Studio"
      description="Stream-Overlays mit Gameplay-, Facecam- und Chat-Bereichen — lokale Layout-Vorschau, Generierung nur über Nexter nach Bestätigung"
      coinCost={COIN_COST}
      nexterHint={nexterPrompt('create')}
    >
      <div className="space-y-4">
        {error && <StudioErrorBanner message={error} />}
        {!activeDna && (
          <p className="text-sm text-zinc-400" data-testid="overlay-no-dna">
            Keine Creator DNA — Overlay geht auch so. Farben und Stil kannst du hier setzen. Logo und Facecam sind optional.
          </p>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-4">
            <section data-testid="overlay-platform-presets">
              <FieldLabel>Plattform</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {OVERLAY_STUDIO_PLATFORMS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={platform === id && !customWidth}
                    onClick={() => {
                      setPlatform(id);
                      setAspectRatio(OVERLAY_PLATFORM_SPECS[id].defaultAspect);
                      setLayoutPreset(OVERLAY_PLATFORM_SPECS[id].defaultLayout);
                      setCustomWidth('');
                      setCustomHeight('');
                      setRegionOverrides({});
                    }}
                    className="min-h-11"
                  >
                    {OVERLAY_PLATFORM_SPECS[id].label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section data-testid="overlay-layout-presets">
              <FieldLabel>Layout</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {OVERLAY_LAYOUT_PRESETS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={layoutPreset === id}
                    onClick={() => {
                      setLayoutPreset(id);
                      setRegionOverrides({});
                      if (id === 'tiktok-vertical') {
                        setPlatform('tiktok');
                        setAspectRatio('9:16');
                      }
                    }}
                    className="min-h-11"
                  >
                    {overlayLayoutLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {config.width}×{config.height}px · {config.aspectRatio} · {overlayLayoutLabel(config.layoutPreset)}
              </p>
            </section>

            <section>
              <FieldLabel>Seitenverhältnis / Custom-Größe</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {OVERLAY_ASPECT_OPTIONS.map((id) => (
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
                    {id === 'custom' ? 'Custom' : OVERLAY_ASPECT_PRESETS[id].label}
                  </StudioOptionPill>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label="Overlay-Breite"
                  inputMode="numeric"
                  value={customWidth}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCustomWidth(e.target.value === '' ? '' : n);
                    if (e.target.value) setAspectRatio('custom');
                  }}
                />
                <Input
                  aria-label="Overlay-Höhe"
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
              <FieldLabel>Overlay-Typ</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {OVERLAY_TYPES.map((t) => (
                  <StudioOptionPill key={t.id} active={overlayType === t.id} onClick={() => setOverlayType(t.id)} className="min-h-11">
                    {t.label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section data-testid="overlay-region-toggles">
              <FieldLabel>Bereiche (Sichtbarkeit)</FieldLabel>
              {(
                [
                  ['gameplay', 'Gameplay', config.gameplayRegion.visible],
                  ['facecam', 'Facecam', config.facecamRegion.visible],
                  ['chat', 'Chat', config.chatRegion.visible],
                  ['alert', 'Alert', config.alertRegion.visible],
                ] as const
              ).map(([key, label, visible]) => (
                <label key={key} className="flex min-h-11 items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setRegionOverrides((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  {label}
                  {key === 'gameplay' && config.gameplayRegion.transparent ? ' — transparentes Fenster' : ''}
                  {key === 'facecam' && config.facecamRegion.transparent ? ' — transparenter Innenbereich' : ''}
                </label>
              ))}
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
                {OVERLAY_LOGO_POSITIONS.map((pos) => (
                  <StudioOptionPill key={pos} active={logoPosition === pos} onClick={() => setLogoPosition(pos)} className="min-h-11">
                    {logoPosLabel(pos)}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Eigene Facecam (optional)</FieldLabel>
              <select
                aria-label="Eigene Facecam wählen"
                className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                value={facecamJobId}
                onChange={(e) => setFacecamJobId(e.target.value)}
              >
                <option value="">Ohne Facecam-Asset</option>
                {ownedFacecams.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    Facecam {cam.platform ?? ''} {cam.width && cam.height ? `${cam.width}×${cam.height}` : ''}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <FieldLabel>Rahmen / Format</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {OVERLAY_BORDER_STYLES.map((id) => (
                  <StudioOptionPill key={id} active={borderStyle === id} onClick={() => setBorderStyle(id)} className="min-h-11">
                    {borderLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {OVERLAY_OUTPUT_FORMATS.map((fmt) => (
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
                Transparente Content-Bereiche (nur PNG/WEBP)
              </label>
              <Input aria-label="Stil" className="mt-2" value={style} onChange={(e) => setStyle(e.target.value)} />
            </section>
          </div>
        }
        preview={
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="overlay-preview-label">
              VORSCHAU — noch kein generiertes Bild
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-sm text-zinc-200" data-testid="overlay-design-summary">
              {config.summary}
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="overlay-quote-summary">
              <p>
                Overlay · {OVERLAY_PLATFORM_SPECS[config.platform].label} · {overlayLayoutLabel(config.layoutPreset)} ·{' '}
                {config.width}×{config.height} · {config.format.toUpperCase()} · {COIN_COST} Coins · Bestand {coins} → nach
                Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="overlay-insufficient-coins">
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
                }}
                data-testid="overlay-local-preview"
                role="img"
                aria-label={`Overlay-Layoutvorschau ${config.width} mal ${config.height} Pixel, ${overlayLayoutLabel(config.layoutPreset)}, ${OVERLAY_PLATFORM_SPECS[config.platform].label}, Gameplay ${config.gameplayRegion.visible ? 'sichtbar' : 'aus'}, Facecam ${config.facecamRegion.visible ? 'sichtbar' : 'aus'}, Chat ${config.chatRegion.visible ? 'sichtbar' : 'aus'}`}
              >
                {previewRegions
                  .filter((row) => row.region.visible)
                  .map((row) => (
                    <div
                      key={row.name}
                      className={`absolute flex items-start justify-start border-2 ${REGION_COLORS[row.name]}`}
                      style={regionBoxStyle(row.region, config.width, config.height)}
                    >
                      <span className="m-1 rounded bg-black/50 px-1 text-[9px] font-semibold uppercase tracking-wider">
                        {row.name}
                        {row.region.transparent ? ' · Loch' : ''}
                      </span>
                    </div>
                  ))}
                <span
                  className="absolute text-[10px] font-semibold uppercase tracking-wider text-white/80"
                  style={{
                    ...(config.logoPosition === 'top-left'
                      ? { top: '4%', left: '4%' }
                      : config.logoPosition === 'top-right'
                        ? { top: '4%', right: '4%' }
                        : config.logoPosition === 'bottom-left'
                          ? { bottom: '4%', left: '4%' }
                          : config.logoPosition === 'center'
                            ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                            : { bottom: '4%', right: '4%' }),
                  }}
                >
                  {config.logoJobId ? 'LOGO' : 'Branding'}
                </span>
              </div>
            </NeonPreviewBox>
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              data-testid="overlay-nexter-chip"
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
          <GlassCard accent="purple" className="!p-5" data-testid="overlay-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {jobsLoading && (
              <p className="text-sm text-zinc-500" data-testid="overlay-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!jobsLoading && projects.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="overlay-jobs-empty">
                Noch kein Overlay-Projekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 p-3" data-testid="overlay-result-card">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={`Overlay ${p.platform ?? ''} ${p.layoutPreset ?? ''} Version ${p.version ?? 1}, ${p.width ?? config.width} mal ${p.height ?? config.height} Pixel`}
                      className="mb-2 h-24 w-full object-contain"
                    />
                  ) : p.status === 'failed' ? (
                    <p className="text-xs text-red-400">Fehlgeschlagen{p.error ? `: ${p.error}` : ''}</p>
                  ) : p.status === 'processing' || p.status === 'queued' ? (
                    <p className="text-xs text-zinc-400">{p.status === 'queued' ? 'In der Warteschlange' : 'Wird erzeugt …'}</p>
                  ) : p.fileMissing ? (
                    <p className="text-xs text-amber-300" data-testid="overlay-result-missing">
                      Result fehlt
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {p.status}
                    {p.platform ? ` · ${p.platform}` : ''}
                    {p.layoutPreset ? ` · ${p.layoutPreset}` : ''}
                    {p.width && p.height ? ` · ${p.width}×${p.height}` : ''}
                    {p.aspectRatio ? ` · ${p.aspectRatio}` : ''}
                    {p.mimeType ? ` · ${p.mimeType}` : ''}
                    {p.transparentBackground ? ' · transparent' : ''}
                    {typeof p.version === 'number' ? ` · v${p.version}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.status === 'completed' && !p.fileMissing && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1" onClick={() => void downloadOwnedOverlay(p.id)}>
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
                        onClick={() => queueNexterPrompt('Ändere mein Overlay: Facecam kleiner.')}
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
                        data-testid="overlay-to-streamset-action"
                        disabled={loading}
                        onClick={() => {
                          setLoading(true);
                          try {
                            queueNexterPrompt('Soll ich dir daraus ein Komplettset erstellen?');
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
                        onClick={() => queueNexterPrompt('Mach aus meinem Twitch Overlay eine TikTok-Version.')}
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
                          void api.studio.retryOverlay(p.id).catch((err) =>
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
        Logo und Facecam sind optional. Schachbrettflächen in der Vorschau sind transparente Content-Bereiche — kein fertiges AI-Bild.
      </div>
    </StudioShell>
  );
}
