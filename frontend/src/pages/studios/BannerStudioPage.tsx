import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Image as ImageIcon } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { NeonPreviewBox, StudioErrorBanner, ImageGenerationUnavailableHint } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { api, ApiError } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { formatCoins } from '@/lib/utils';
import {
  BANNER_LAYOUT_POSITIONS,
  BANNER_OUTPUT_FORMATS,
  BANNER_PLATFORM_SPECS,
  BANNER_SAFE_AREAS,
  BANNER_STUDIO_PLATFORMS,
  COIN_COSTS,
  CoinSpendCategory,
  applyBannerPlatformPreset,
  bannerConfigFromDna,
  bannerSafeArea,
  buildBannerDesignSummary,
  defaultBannerConfig,
  type BannerLayoutPosition,
  type BannerOutputFormat,
  type BannerPlatform,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import { Link } from 'react-router-dom';

const COIN_COST = COIN_COSTS[CoinSpendCategory.BANNER_GENERATION];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-zinc-400">{children}</label>;
}

export function BannerStudioPage() {
  const { user, activeDna } = useAuth();
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const { projects, refresh, loading: jobsLoading } = useStudioProjects('banner');
  const { projects: logos } = useStudioProjects('logo');
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<BannerPlatform>('twitch');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [style, setStyle] = useState('cinematic');
  const [logoPosition, setLogoPosition] = useState<BannerLayoutPosition>('left');
  const [textPosition, setTextPosition] = useState<BannerLayoutPosition>('center');
  const [outputFormat, setOutputFormat] = useState<BannerOutputFormat>('png');
  const [transparent, setTransparent] = useState(false);
  const [customWidth, setCustomWidth] = useState<number | ''>('');
  const [customHeight, setCustomHeight] = useState<number | ''>('');
  const [logoJobId, setLogoJobId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeDna) return;
    setTitle((prev) => prev || activeDna.name || '');
    setStyle((prev) => prev || activeDna.brandingStyle || activeDna.styleDirection || 'cinematic');
    const pref = String(activeDna.platformOptimization?.[0]?.platform ?? '');
    if (pref in BANNER_PLATFORM_SPECS) setPlatform(pref as BannerPlatform);
  }, [activeDna]);

  const config = useMemo(() => {
    let next = defaultBannerConfig({
      ...(activeDna ? bannerConfigFromDna(activeDna) : {}),
      platform,
      title,
      subtitle,
      style,
      logoPosition,
      textPosition,
      outputFormat,
      transparentBackground: transparent,
      logoJobId: logoJobId || undefined,
    });
    next = applyBannerPlatformPreset(next, platform);
    if (customWidth && customHeight) {
      next = { ...next, width: Number(customWidth), height: Number(customHeight), platform: 'general', aspect: `${customWidth}:${customHeight}` };
    }
    next.outputFormat = transparent && outputFormat === 'jpg' ? 'png' : outputFormat;
    next.transparentBackground = transparent;
    next.summary = buildBannerDesignSummary(next);
    return next;
  }, [activeDna, platform, title, subtitle, style, logoPosition, textPosition, outputFormat, transparent, customWidth, customHeight, logoJobId]);

  const safe = bannerSafeArea(config.platform);
  const coins = user?.coinBalance ?? 0;
  const remainder = coins - COIN_COST;
  const extraPlatforms = (Object.keys(BANNER_PLATFORM_SPECS) as BannerPlatform[]).filter(
    (id) => !BANNER_STUDIO_PLATFORMS.includes(id)
  );
  const ownedLogos = logos.filter((p) => p.status === 'completed' && !p.fileMissing);

  function nexterPrompt(kind: 'create' | 'variant' | 'change' = 'create', extra = '') {
    if (kind === 'variant') return `Neue Variante meines Banners: ${config.summary} ${extra}`.trim();
    if (kind === 'change') return extra || `Ändere mein letztes Banner: ${config.summary}`;
    return `Mach mir einen ${BANNER_PLATFORM_SPECS[config.platform].label} Banner. ${config.summary} ${extra}`.trim();
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      await api.studio.generate('banner', {
        platform: config.platform,
        title: config.title || undefined,
        subtitle: config.subtitle || undefined,
        style: config.style,
        projectId: projectId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    }
  }

  async function downloadOwnedBanner(jobId: string) {
    try {
      const dl = await api.studio.downloadBanner(jobId);
      window.open(dl.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  async function queueStreamset() {
    setLoading(true);
    try {
      queueNexterPrompt('Soll ich dir daraus ein Komplettset erstellen?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <StudioShell
      title="Banner Studio"
      description="Plattform-Banner mit Safe-Area-Vorschau — Generierung nur über Nexter nach Bestätigung"
      coinCost={COIN_COST}
      nexterHint={nexterPrompt('create')}
    >
      <div className="space-y-4">
        {error && <StudioErrorBanner message={error} />}
        {!activeDna && (
          <p className="text-sm text-zinc-400" data-testid="banner-no-dna">
            Keine Creator DNA — Banner geht auch so. Name und Farben kannst du hier setzen.
          </p>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-4">
            <section data-testid="banner-platform-presets">
              <FieldLabel>Plattform</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {BANNER_STUDIO_PLATFORMS.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={platform === id && !customWidth}
                    onClick={() => {
                      setPlatform(id);
                      setCustomWidth('');
                      setCustomHeight('');
                    }}
                    className="min-h-11"
                  >
                    {BANNER_PLATFORM_SPECS[id].label}
                  </StudioOptionPill>
                ))}
                {extraPlatforms.map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={platform === id && !customWidth}
                    onClick={() => {
                      setPlatform(id);
                      setCustomWidth('');
                      setCustomHeight('');
                    }}
                    className="min-h-11 text-[10px]"
                  >
                    {BANNER_PLATFORM_SPECS[id].label}
                  </StudioOptionPill>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {config.width}×{config.height}px · {config.aspect}
              </p>
            </section>

            <section>
              <FieldLabel>Custom-Größe (optional)</FieldLabel>
              <div className="flex gap-2">
                <Input
                  aria-label="Banner-Breite"
                  inputMode="numeric"
                  placeholder="Breite"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value ? Number(e.target.value) : '')}
                  className="min-h-11"
                />
                <Input
                  aria-label="Banner-Höhe"
                  inputMode="numeric"
                  placeholder="Höhe"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value ? Number(e.target.value) : '')}
                  className="min-h-11"
                />
              </div>
            </section>

            <section>
              <FieldLabel>Titel / Name</FieldLabel>
              <Input className="min-h-11" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Creator-Name" />
              <Input className="mt-2 min-h-11" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Untertitel (optional)" />
            </section>

            <section data-testid="banner-logo-picker">
              <FieldLabel>Eigenes Logo (optional)</FieldLabel>
              <select
                aria-label="Logo auswählen"
                className="min-h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-200"
                value={logoJobId}
                onChange={(e) => setLogoJobId(e.target.value)}
              >
                <option value="">Ohne Logo</option>
                {ownedLogos.map((logo) => (
                  <option key={logo.id} value={logo.id}>
                    Logo {logo.version ? `v${logo.version}` : logo.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {ownedLogos.length === 0 && (
                <p className="mt-1 text-xs text-zinc-500" data-testid="banner-no-logo">
                  Kein eigenes Logo vorhanden — Banner funktioniert trotzdem.
                </p>
              )}
            </section>

            <section>
              <FieldLabel>Logo-Position</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {BANNER_LAYOUT_POSITIONS.map((pos) => (
                  <StudioOptionPill key={pos} active={logoPosition === pos} onClick={() => setLogoPosition(pos)} className="min-h-11 capitalize">
                    {pos === 'left' ? 'Links' : pos === 'right' ? 'Rechts' : 'Mitte'}
                  </StudioOptionPill>
                ))}
              </div>
              <FieldLabel>Text-Position</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {BANNER_LAYOUT_POSITIONS.map((pos) => (
                  <StudioOptionPill key={pos} active={textPosition === pos} onClick={() => setTextPosition(pos)} className="min-h-11 capitalize">
                    {pos === 'left' ? 'Links' : pos === 'right' ? 'Rechts' : 'Mitte'}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Format</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {BANNER_OUTPUT_FORMATS.map((fmt) => (
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
                Transparenter Hintergrund (nur PNG/WEBP)
              </label>
            </section>
          </div>
        }
        preview={
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="banner-preview-label">
              Konfigurationsvorschau — noch kein generiertes Banner
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-sm text-zinc-200" data-testid="banner-design-summary">
              {config.summary}
            </div>
            <p className="text-[11px] text-zinc-500" data-testid="banner-safe-area-hint">
              {safe.hint} {BANNER_SAFE_AREAS[config.platform].cropNote}
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="banner-quote-summary">
              <p>
                {COIN_COST} Coins · Bestand {coins} → nach Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="banner-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>
            <NeonPreviewBox>
              <div
                className="relative mx-auto w-full max-w-xl overflow-hidden rounded-md border border-white/10"
                style={{ aspectRatio: `${config.width} / ${config.height}`, background: config.colors[0] ?? '#0b0f14' }}
                data-testid="banner-local-preview"
                role="img"
                aria-label={`Banner-Layoutvorschau ${config.width} mal ${config.height} Pixel, Logo ${config.logoPosition}, Text ${config.textPosition}`}
              >
                <div
                  className="absolute border border-dashed border-white/40"
                  style={{
                    left: `${safe.insetX * 100}%`,
                    right: `${safe.insetX * 100}%`,
                    top: `${safe.insetY * 100}%`,
                    bottom: `${safe.insetY * 100}%`,
                  }}
                />
                <div
                  className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-1 px-2 text-[10px] text-white ${
                    config.logoPosition === 'left' ? 'left-[10%]' : config.logoPosition === 'right' ? 'right-[10%]' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <ImageIcon className="h-4 w-4" />
                  Logo
                </div>
                <p
                  className={`absolute top-1/2 -translate-y-1/2 px-2 text-xs font-semibold text-white ${
                    config.textPosition === 'left' ? 'left-[28%]' : config.textPosition === 'right' ? 'right-[10%]' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  {config.title || 'Name'}
                </p>
              </div>
            </NeonPreviewBox>
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              data-testid="banner-nexter-chip"
              onClick={() => queueNexterPrompt(nexterPrompt('create'))}
              className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Für {formatCoins(COIN_COST)} Coins erstellen — Nexter
            </button>
            <ImageGenerationUnavailableHint />
            <Button variant="ghost" size="sm" className="min-h-11 w-full" onClick={() => void tryDirectGenerate()}>
              Direkt erzeugen (wird abgelehnt)
            </Button>
          </div>
        }
        history={
          <GlassCard accent="purple" className="!p-5" data-testid="banner-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {jobsLoading && (
              <p className="text-sm text-zinc-500" data-testid="banner-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!jobsLoading && projects.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="banner-jobs-empty">
                Noch kein Banner-Projekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 p-3" data-testid="banner-result-card">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={`Banner ${p.platform ?? ''} Version ${p.version ?? 1}, ${p.width ?? config.width} mal ${p.height ?? config.height} Pixel`}
                      className="mb-2 h-24 w-full object-contain"
                    />
                  ) : p.status === 'failed' ? (
                    <p className="text-xs text-red-400">Fehlgeschlagen{p.error ? `: ${p.error}` : ''}</p>
                  ) : p.status === 'processing' || p.status === 'queued' ? (
                    <p className="text-xs text-zinc-400">{p.status === 'queued' ? 'In der Warteschlange' : 'Wird erzeugt …'}</p>
                  ) : p.fileMissing ? (
                    <p className="text-xs text-amber-300" data-testid="banner-result-missing">
                      Result fehlt
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {p.status}
                    {p.platform ? ` · ${p.platform}` : ''}
                    {p.width && p.height ? ` · ${p.width}×${p.height}` : ''}
                    {p.mimeType ? ` · ${p.mimeType}` : ''}
                    {typeof p.version === 'number' ? ` · v${p.version}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.status === 'completed' && !p.fileMissing && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1" onClick={() => void downloadOwnedBanner(p.id)}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt(nexterPrompt('variant'))}>
                        Neue Variante
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt('Mach das Banner dunkler.')}>
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
                      <Button size="sm" variant="outline" className="min-h-11" data-testid="banner-to-streamset-action" disabled={loading} onClick={() => void queueStreamset()}>
                        Für Streamset
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => queueNexterPrompt('Mach aus meinem Twitch-Banner auch einen YouTube-Banner.')}
                      >
                        Als YouTube
                      </Button>
                    )}
                    {p.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          void api.studio.retryBanner(p.id).catch((err) =>
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
      {!title.trim() && (
        <div className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Titel ist optional, wenn eine Creator DNA den Namen liefert.
        </div>
      )}
    </StudioShell>
  );
}
