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
  MAX_STICKER_TEXT_CHARS,
  STICKER_KINDS,
  STICKER_OUTLINES,
  STICKER_OUTPUT_FORMATS,
  STICKER_PLATFORM_SPECS,
  STICKER_SHAPES,
  STICKER_SIZE_PRESETS,
  STICKER_STUDIO_PLATFORMS,
  applyStickerPlatformPreset,
  applyStickerSizePreset,
  buildStickerDesignSummary,
  defaultStickerConfig,
  stickerConfigFromDna,
  stickerKindLabel,
  stickerOutlineLabel,
  stickerShapeLabel,
  validateStickerDimensions,
  validateStickerFormat,
  validateStickerText,
  type StickerKind,
  type StickerOutline,
  type StickerOutputFormat,
  type StickerPlatform,
  type StickerShape,
  type StickerSizePreset,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import { Link } from 'react-router-dom';

const COIN_COST = COIN_COSTS[CoinSpendCategory.STICKER_GENERATION];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-zinc-400">{children}</label>;
}

function outlinePx(outline: StickerOutline): number {
  if (outline === 'none') return 0;
  if (outline === 'thin') return 3;
  if (outline === 'thick') return 10;
  return 6;
}

export function StickerStudioPage() {
  const { user, activeDna } = useAuth();
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const { projects, refresh, loading: jobsLoading } = useStudioProjects('sticker');
  const { projects: logos } = useStudioProjects('logo');
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<StickerKind>('sticker');
  const [platform, setPlatform] = useState<StickerPlatform>('twitch');
  const [sizePreset, setSizePreset] = useState<StickerSizePreset>('standard');
  const [shape, setShape] = useState<StickerShape>('square');
  const [outline, setOutline] = useState<StickerOutline>('medium');
  const [style, setStyle] = useState('gaming');
  const [motif, setMotif] = useState('');
  const [text, setText] = useState('');
  const [outputFormat, setOutputFormat] = useState<StickerOutputFormat>('png');
  const [transparent, setTransparent] = useState(true);
  const [customWidth, setCustomWidth] = useState<number | ''>('');
  const [customHeight, setCustomHeight] = useState<number | ''>('');
  const [logoJobId, setLogoJobId] = useState('');
  const [referenceFileId, setReferenceFileId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeDna) return;
    setStyle((prev) => prev || activeDna.brandingStyle || activeDna.styleDirection || 'gaming');
    setMotif((prev) => prev || activeDna.mascot || '');
    const pref = String(activeDna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
    if (pref in STICKER_PLATFORM_SPECS) {
      const next = pref as StickerPlatform;
      setPlatform(next);
      setSizePreset(STICKER_PLATFORM_SPECS[next].defaultSize);
    }
  }, [activeDna]);

  const config = useMemo(() => {
    let next = defaultStickerConfig({
      ...(activeDna ? stickerConfigFromDna(activeDna) : {}),
      kind,
      platform,
      sizePreset,
      shape,
      outline,
      style,
      motif,
      text,
      format: outputFormat,
      transparentBackground: transparent,
      logoJobId: logoJobId || undefined,
      logoAssetId: logoJobId || undefined,
      referenceAssetIds: referenceFileId.trim() ? [referenceFileId.trim()] : [],
    });
    next = applyStickerPlatformPreset(next, platform);
    next.kind = kind;
    next.shape = shape;
    next.outline = outline;
    next.style = style;
    next.motif = motif;
    next.text = text;
    if (sizePreset !== 'custom') {
      next = applyStickerSizePreset(next, sizePreset);
    }
    if (customWidth && customHeight) {
      next = { ...next, width: Number(customWidth), height: Number(customHeight), sizePreset: 'custom' };
    }
    next.format = transparent && outputFormat === 'jpg' ? 'png' : outputFormat;
    next.transparentBackground = transparent && next.format !== 'jpg';
    if (next.format === 'jpg') next.transparentBackground = false;
    next.logoJobId = logoJobId || undefined;
    next.logoAssetId = logoJobId || undefined;
    next.referenceAssetIds = referenceFileId.trim() ? [referenceFileId.trim()] : [];
    next.summary = buildStickerDesignSummary(next);
    return next;
  }, [
    activeDna,
    kind,
    platform,
    sizePreset,
    shape,
    outline,
    style,
    motif,
    text,
    outputFormat,
    transparent,
    customWidth,
    customHeight,
    logoJobId,
    referenceFileId,
  ]);

  const coins = user?.coinBalance ?? 0;
  const remainder = coins - COIN_COST;
  const ownedLogos = logos.filter((p) => p.status === 'completed' && !p.fileMissing);
  const dims = validateStickerDimensions(config.width, config.height);
  const fmt = validateStickerFormat(config.format, config.transparentBackground);
  const textCheck = validateStickerText(config.text);
  const configError = !dims.ok ? dims.message : !fmt.ok ? fmt.message : !textCheck.ok ? textCheck.message : null;

  function nexterPrompt(mode: 'create' | 'variant' | 'change' = 'create', extra = '') {
    if (mode === 'variant') return `Neue Variante meines Stickers: ${config.summary} ${extra}`.trim();
    if (mode === 'change') return extra || `Ändere meinen Sticker: ${config.summary}`;
    return `Mach mir einen ${STICKER_PLATFORM_SPECS[config.platform].label}-${stickerKindLabel(config.kind)}. ${config.summary} ${extra}`.trim();
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      await api.studio.generate('sticker', {
        name: config.text || stickerKindLabel(config.kind),
        style: config.style,
        shape: config.shape,
        transparentBackground: config.transparentBackground,
        projectId: projectId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    }
  }

  async function downloadOwnedSticker(jobId: string) {
    try {
      const dl = await api.studio.downloadSticker(jobId);
      window.open(dl.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  const previewClip =
    config.shape === 'circle'
      ? '50%'
      : config.shape === 'die-cut'
        ? undefined
        : '12%';
  const previewClipPath =
    config.shape === 'die-cut'
      ? 'polygon(12% 4%, 88% 0%, 100% 28%, 94% 78%, 68% 100%, 18% 96%, 0% 68%, 6% 18%)'
      : undefined;

  return (
    <StudioShell
      title="Sticker Studio"
      description="Sticker, Badges und Emotes — lokale Config-Vorschau, Generierung nur über Nexter nach Bestätigung"
      coinCost={COIN_COST}
      nexterHint={nexterPrompt('create')}
    >
      <div className="space-y-4">
        {error && <StudioErrorBanner message={error} />}
        {!activeDna && (
          <p className="text-sm text-zinc-400" data-testid="sticker-no-dna">
            Keine Creator DNA — Sticker geht auch so. Farben, Motiv und Stil kannst du hier setzen. Logo ist optional.
          </p>
        )}
        {configError && (
          <p className="text-sm text-amber-300" data-testid="sticker-config-error" role="status">
            {configError}
          </p>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-4">
            <section data-testid="sticker-type-presets">
              <FieldLabel>Typ</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {STICKER_KINDS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={kind === id}
                    onClick={() => {
                      setKind(id);
                      if (id === 'badge') setShape('circle');
                      if (id === 'emote') setShape('square');
                    }}
                    className="min-h-11"
                  >
                    {stickerKindLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section data-testid="sticker-platform-presets">
              <FieldLabel>Plattform</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {STICKER_STUDIO_PLATFORMS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={platform === id && !customWidth}
                    onClick={() => {
                      setPlatform(id);
                      setSizePreset(STICKER_PLATFORM_SPECS[id].defaultSize);
                      setCustomWidth('');
                      setCustomHeight('');
                    }}
                    className="min-h-11"
                  >
                    {STICKER_PLATFORM_SPECS[id].label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section data-testid="sticker-size-presets">
              <FieldLabel>Größe</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(STICKER_SIZE_PRESETS) as Array<Exclude<StickerSizePreset, 'custom'>>).map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={sizePreset === id && !customWidth}
                    onClick={() => {
                      setSizePreset(id);
                      setCustomWidth('');
                      setCustomHeight('');
                    }}
                    className="min-h-11"
                  >
                    {STICKER_SIZE_PRESETS[id].label}
                  </StudioOptionPill>
                ))}
                <StudioOptionPill
                  active={sizePreset === 'custom'}
                  onClick={() => setSizePreset('custom')}
                  className="min-h-11"
                >
                  Custom
                </StudioOptionPill>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {config.width}×{config.height}px · {config.format.toUpperCase()}
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label="Sticker-Breite"
                  inputMode="numeric"
                  value={customWidth}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCustomWidth(e.target.value === '' ? '' : n);
                    if (e.target.value) setSizePreset('custom');
                  }}
                />
                <Input
                  aria-label="Sticker-Höhe"
                  inputMode="numeric"
                  value={customHeight}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCustomHeight(e.target.value === '' ? '' : n);
                    if (e.target.value) setSizePreset('custom');
                  }}
                />
              </div>
            </section>

            <section>
              <FieldLabel>Form</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {STICKER_SHAPES.map((id) => (
                  <StudioOptionPill key={id} active={shape === id} onClick={() => setShape(id)} className="min-h-11">
                    {stickerShapeLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Rand</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {STICKER_OUTLINES.map((id) => (
                  <StudioOptionPill key={id} active={outline === id} onClick={() => setOutline(id)} className="min-h-11">
                    {stickerOutlineLabel(id)}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Motiv / Text / Stil</FieldLabel>
              <Input aria-label="Motiv" placeholder="Motiv" className="mb-2" value={motif} onChange={(e) => setMotif(e.target.value)} />
              <Input
                aria-label="Sticker-Text"
                placeholder="Optionaler Text, z. B. HYPE"
                maxLength={MAX_STICKER_TEXT_CHARS}
                className="mb-2"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Input aria-label="Stil" value={style} onChange={(e) => setStyle(e.target.value)} />
            </section>

            <section>
              <FieldLabel>Format / Transparenz</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {STICKER_OUTPUT_FORMATS.map((fmtId) => (
                  <StudioOptionPill
                    key={fmtId}
                    active={outputFormat === fmtId}
                    onClick={() => {
                      setOutputFormat(fmtId);
                      if (fmtId === 'jpg') setTransparent(false);
                    }}
                    className="min-h-11 uppercase"
                  >
                    {fmtId}
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
                Transparenter Hintergrund (nur PNG/WEBP)
              </label>
              {outputFormat === 'jpg' && (
                <p className="mt-1 text-xs text-amber-300" data-testid="sticker-jpg-no-alpha">
                  JPG hat keine Transparenz — der Hintergrund bleibt opak.
                </p>
              )}
            </section>

            <section>
              <FieldLabel>Eigenes Logo (optional)</FieldLabel>
              <select
                aria-label="Logo-Referenz"
                className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-3 py-2 text-sm"
                value={logoJobId}
                onChange={(e) => setLogoJobId(e.target.value)}
              >
                <option value="">Ohne Logo-Referenz</option>
                {ownedLogos.map((logo) => (
                  <option key={logo.id} value={logo.id}>
                    Logo {logo.width && logo.height ? `${logo.width}×${logo.height}` : logo.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <Input
                aria-label="Referenz-Datei-ID"
                className="mt-2"
                placeholder="Eigene Referenz-Datei-ID (optional)"
                value={referenceFileId}
                onChange={(e) => setReferenceFileId(e.target.value)}
              />
            </section>
          </div>
        }
        preview={
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="sticker-preview-label">
              VORSCHAU — noch kein generiertes Bild
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-sm text-zinc-200" data-testid="sticker-design-summary">
              {config.summary}
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="sticker-quote-summary">
              <p>
                {stickerKindLabel(config.kind)} · {STICKER_PLATFORM_SPECS[config.platform].label} · {config.width}×
                {config.height} · {config.format.toUpperCase()}
                {config.transparentBackground ? ' · transparent' : ' · opak'} · {COIN_COST} Coins · Bestand {coins} → nach
                Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="sticker-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>
            <NeonPreviewBox aspect="square">
              <div
                className="relative mx-auto flex h-full w-full max-w-sm items-center justify-center"
                style={{
                  backgroundImage: config.transparentBackground
                    ? 'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)'
                    : undefined,
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                  backgroundColor: config.transparentBackground ? '#18181b' : config.colors[1] || '#18181b',
                }}
                data-testid="sticker-local-preview"
                role="img"
                aria-label={`Sticker-Vorschau ${stickerKindLabel(config.kind)} für ${STICKER_PLATFORM_SPECS[config.platform].label}, ${config.width} mal ${config.height} Pixel, ${stickerShapeLabel(config.shape)}, ${stickerOutlineLabel(config.outline)}, ${config.transparentBackground ? 'transparenter Hintergrund' : 'opaker Hintergrund'}${config.text ? `, Text ${config.text}` : ''}. Kein finales AI-Bild.`}
              >
                <div
                  className="relative flex h-[68%] w-[68%] items-center justify-center text-center"
                  style={{
                    background: `linear-gradient(135deg, ${config.colors[0] || '#22d3ee'}, ${config.colors[1] || '#a855f7'})`,
                    borderRadius: previewClip,
                    clipPath: previewClipPath,
                    boxShadow:
                      config.outline === 'none'
                        ? 'none'
                        : `0 0 0 ${outlinePx(config.outline)}px #ffffff`,
                  }}
                >
                  <span className="px-2 text-sm font-bold uppercase tracking-wide text-white drop-shadow">
                    {config.text || config.motif || stickerKindLabel(config.kind)}
                  </span>
                  {config.logoJobId && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/50 px-1 text-[9px] font-semibold uppercase tracking-wider text-white">
                      Logo
                    </span>
                  )}
                </div>
              </div>
            </NeonPreviewBox>
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              data-testid="sticker-nexter-chip"
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
          <GlassCard accent="purple" className="!p-5" data-testid="sticker-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {jobsLoading && (
              <p className="text-sm text-zinc-500" data-testid="sticker-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!jobsLoading && projects.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="sticker-jobs-empty">
                Noch kein Sticker-Projekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 p-3" data-testid="sticker-result-card">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={`${p.stickerType ?? 'Sticker'} ${p.platform ?? ''} Version ${p.version ?? 1}, ${p.width ?? config.width} mal ${p.height ?? config.height} Pixel`}
                      className="mb-2 h-24 w-full object-contain"
                    />
                  ) : p.status === 'failed' ? (
                    <p className="text-xs text-red-400">Fehlgeschlagen{p.error ? `: ${p.error}` : ''}</p>
                  ) : p.status === 'processing' || p.status === 'queued' ? (
                    <p className="text-xs text-zinc-400">{p.status === 'queued' ? 'In der Warteschlange' : 'Wird erzeugt …'}</p>
                  ) : p.fileMissing ? (
                    <p className="text-xs text-amber-300" data-testid="sticker-result-missing">
                      Result fehlt
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {p.status}
                    {p.stickerType ? ` · ${p.stickerType}` : ''}
                    {p.platform ? ` · ${p.platform}` : ''}
                    {p.width && p.height ? ` · ${p.width}×${p.height}` : ''}
                    {p.mimeType ? ` · ${p.mimeType}` : ''}
                    {p.transparentBackground ? ' · transparent' : ''}
                    {typeof p.version === 'number' ? ` · v${p.version}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.status === 'completed' && !p.fileMissing && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1" onClick={() => void downloadOwnedSticker(p.id)}>
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
                        onClick={() => queueNexterPrompt('Ändere meinen Sticker: Figur kleiner.')}
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
                        data-testid="sticker-to-streamset-action"
                        disabled={loading}
                        onClick={() => {
                          setLoading(true);
                          try {
                            queueNexterPrompt('Soll ich den Sticker im Streamset verwenden?');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        Im Streamset verwenden
                      </Button>
                    )}
                    {p.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          void api.studio.retrySticker(p.id).catch((err) =>
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
        Die Canvas-Vorschau ist eine Config-Vorschau, kein finales AI-Bild. Mehrere Sticker starte ich nicht automatisch als Batch.
      </div>
    </StudioShell>
  );
}
