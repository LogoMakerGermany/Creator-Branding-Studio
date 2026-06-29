import { useState } from 'react';
import { Sparkles, CheckCircle2, Download } from 'lucide-react';
import { Badge, Button, CardTitle, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { NeonPreviewBox, StudioErrorBanner } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import {
  BANNER_PLATFORM_SPECS,
  type BannerGenerationOptions,
  type BannerPlatform,
  type FacecamGenerationOptions,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';

interface StudioPageProps {
  title: string;
  description: string;
  module: 'banner' | 'facecam';
  coinCost: number;
  styles?: string[];
  exports?: string[];
  styleLabel?: string;
  bannerPlatforms?: BannerPlatform[];
  facecamShapes?: Array<'rectangle' | 'circle' | 'hexagon'>;
}

function OptionPill({
  active,
  onClick,
  children,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
        active
          ? 'border-[var(--ucbs-accent-cyan)]/50 bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]'
          : 'border-white/10 text-zinc-400 hover:border-white/20'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function StudioPage({
  title,
  description,
  module,
  coinCost,
  styles = [],
  exports = ['PNG'],
  styleLabel = 'Stil',
  bannerPlatforms = [],
  facecamShapes = [],
}: StudioPageProps) {
  const { user, activeDna, refreshUser } = useAuth();
  const { projects, refresh } = useStudioProjects(module);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [exportUrls, setExportUrls] = useState<{ png?: string; hd?: string; svg?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<BannerPlatform>(bannerPlatforms[0] ?? 'twitch');
  const [selectedStyle, setSelectedStyle] = useState(styles[0] ?? '');
  const [selectedShape, setSelectedShape] = useState<'rectangle' | 'circle' | 'hexagon'>(facecamShapes[0] ?? 'rectangle');
  const [titleText, setTitleText] = useState('');
  const [subtitleText, setSubtitleText] = useState('');

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let body: BannerGenerationOptions | FacecamGenerationOptions;
      if (module === 'banner') {
        body = {
          platform: selectedPlatform,
          title: titleText || undefined,
          subtitle: subtitleText || undefined,
          style: selectedStyle || undefined,
        };
      } else {
        body = {
          style: selectedStyle || undefined,
          shape: selectedShape,
          transparentBackground: true,
          animated: selectedStyle === 'Animated',
        };
      }

      const res = await api.studio.generate(module, body);
      if (res.imageUrl) setImageUrl(res.imageUrl);
      if (res.exports) setExportUrls(res.exports);
      setProvider(res.provider ?? null);
      await refreshUser();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const platformSpec = module === 'banner' ? BANNER_PLATFORM_SPECS[selectedPlatform] : null;

  return (
    <StudioShell title={title} description={description} coinCost={coinCost}>
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {imageUrl && (
          <StudioSuccessBanner>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Generierung abgeschlossen{provider ? ` (${provider})` : ''}
            </span>
          </StudioSuccessBanner>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-4">
            {module === 'banner' && bannerPlatforms.length > 0 && (
              <div>
                <CardTitle className="text-sm">Plattform</CardTitle>
                <div className="mt-2 flex flex-wrap gap-1">
                  {bannerPlatforms.map((p) => (
                    <OptionPill key={p} active={selectedPlatform === p} onClick={() => setSelectedPlatform(p)}>
                      {BANNER_PLATFORM_SPECS[p].label}
                    </OptionPill>
                  ))}
                </div>
                {platformSpec && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {platformSpec.width}×{platformSpec.height}px · {platformSpec.aspect}
                  </p>
                )}
                <Input className="mt-3" placeholder="Titel" value={titleText} onChange={(e) => setTitleText(e.target.value)} />
                <Input className="mt-2" placeholder="Untertitel" value={subtitleText} onChange={(e) => setSubtitleText(e.target.value)} />
              </div>
            )}

            {module === 'facecam' && facecamShapes.length > 0 && (
              <div>
                <CardTitle className="text-sm">Form</CardTitle>
                <div className="mt-2 flex flex-wrap gap-1">
                  {facecamShapes.map((s) => (
                    <OptionPill key={s} active={selectedShape === s} onClick={() => setSelectedShape(s)} className="capitalize">
                      {s}
                    </OptionPill>
                  ))}
                </div>
              </div>
            )}

            {styles.length > 0 && (
              <div>
                <CardTitle className="text-sm">{styleLabel}</CardTitle>
                <div className="mt-2 flex flex-wrap gap-1">
                  {styles.map((s) => (
                    <OptionPill key={s} active={selectedStyle === s} onClick={() => setSelectedStyle(s)}>
                      {s}
                    </OptionPill>
                  ))}
                </div>
              </div>
            )}

            <div>
              <CardTitle className="text-sm">Export</CardTitle>
              <div className="mt-2 flex flex-wrap gap-1">
                {exports.map((e) => (
                  <Badge key={e} variant="brand">
                    {e}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        }
        preview={
          <NeonPreviewBox>
            {imageUrl ? (
              <img src={imageUrl} alt={title} className="h-full w-full object-contain" />
            ) : (
              <div className="text-center text-zinc-500">
                <Sparkles className="mx-auto h-12 w-12 text-zinc-600" />
                <p className="mt-2 text-sm">Vorschau erscheint hier</p>
              </div>
            )}
          </NeonPreviewBox>
        }
        actions={
          <>
            <Button
              className="flex-1 gap-2"
              onClick={handleGenerate}
              loading={loading}
              disabled={!activeDna || (user?.coinBalance ?? 0) < coinCost}
            >
              <Sparkles className="h-4 w-4" />
              Generieren ({formatCoins(coinCost)} Coins)
            </Button>
            {exportUrls?.png && (
              <a href={exportUrls.png} download={`${module}.png`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  PNG
                </Button>
              </a>
            )}
            {exportUrls?.hd && (
              <a href={exportUrls.hd} download={`${module}-hd.png`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  HD
                </Button>
              </a>
            )}
          </>
        }
        history={
          <StudioHistory
            projects={projects}
            onSelect={(p) => {
              if (p.imageUrl) {
                setImageUrl(p.imageUrl);
                setExportUrls(p.exports ?? null);
                setProvider(p.provider ?? null);
              }
            }}
          />
        }
      />
    </StudioShell>
  );
}
