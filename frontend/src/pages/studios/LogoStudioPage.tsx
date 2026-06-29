import { useState } from 'react';
import { Sparkles, CheckCircle2, Download } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { NeonPreviewBox, StudioErrorBanner } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { LOGO_STYLE_PRESETS, type LogoGenerationOptions } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';

const COIN_COST = 15;

function OptionPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
        active
          ? 'border-[var(--ucbs-accent-cyan)]/50 bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]'
          : 'border-white/10 text-zinc-400 hover:border-white/20'
      }`}
    >
      {children}
    </button>
  );
}

export function LogoStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const { projects, refresh } = useStudioProjects('logo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [exports, setExports] = useState<{ png?: string; hd?: string; svg?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  const [form, setForm] = useState<LogoGenerationOptions>({
    logoName: '',
    clanName: '',
    slogan: '',
    style: LOGO_STYLE_PRESETS[0],
    game: '',
    platform: '',
    ringLogo: false,
    transparentBackground: true,
    threeD: false,
    realistic: false,
    cartoon: false,
    anime: false,
    neon: false,
    ultraCinematic: false,
  });

  function setField<K extends keyof LogoGenerationOptions>(key: K, value: LogoGenerationOptions[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyStylePreset(style: string) {
    setForm((prev) => ({
      ...prev,
      style,
      threeD: style === '3D',
      realistic: style === 'Realistisch',
      cartoon: style === 'Cartoon',
      anime: style === 'Anime',
      neon: style === 'Neon',
      ultraCinematic: style === 'Ultra Cinematic',
    }));
  }

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.studio.generate('logo', form);
      if (res.imageUrl) setImageUrl(res.imageUrl);
      if (res.exports) setExports(res.exports);
      setProvider(res.provider ?? null);
      await refreshUser();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <StudioShell
      title="Logo Studio"
      description="Gaming, Streamer, Clan und Team Logos — KI-generiert mit voller Kontrolle"
      coinCost={COIN_COST}
    >
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {imageUrl && (
          <StudioSuccessBanner>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Generierung abgeschlossen{provider ? ` (${provider})` : ''} — gespeichert in Datei Cloud
            </span>
          </StudioSuccessBanner>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-3">
            <Input placeholder="Logo Name" value={form.logoName ?? ''} onChange={(e) => setField('logoName', e.target.value)} />
            <Input placeholder="Clanname / Team" value={form.clanName ?? ''} onChange={(e) => setField('clanName', e.target.value)} />
            <Input placeholder="Slogan" value={form.slogan ?? ''} onChange={(e) => setField('slogan', e.target.value)} />
            <Input placeholder="Spiel" value={form.game ?? ''} onChange={(e) => setField('game', e.target.value)} />
            <Input placeholder="Plattform (Twitch, YouTube…)" value={form.platform ?? ''} onChange={(e) => setField('platform', e.target.value)} />

            <div>
              <p className="mb-2 text-xs text-zinc-500">Stil</p>
              <div className="flex flex-wrap gap-1">
                {LOGO_STYLE_PRESETS.map((s) => (
                  <OptionPill key={s} active={form.style === s} onClick={() => applyStylePreset(s)}>
                    {s}
                  </OptionPill>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-sm text-zinc-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.ringLogo} onChange={(e) => setField('ringLogo', e.target.checked)} />
                Ringlogo
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.transparentBackground} onChange={(e) => setField('transparentBackground', e.target.checked)} />
                Transparenter Hintergrund
              </label>
            </div>

            <p className="text-xs text-zinc-500">
              Guthaben: {formatCoins(user?.coinBalance ?? 0)} Coins
              {activeDna && ` · DNA: ${activeDna.name}`}
            </p>
          </div>
        }
        preview={
          <NeonPreviewBox aspect="square">
            {imageUrl ? (
              <img src={imageUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <div className="text-center text-zinc-500">
                <Sparkles className="mx-auto h-12 w-12 text-zinc-600" />
                <p className="mt-2 text-sm">Logo-Vorschau erscheint hier</p>
              </div>
            )}
          </NeonPreviewBox>
        }
        actions={
          <>
            <Button
              className="gap-2"
              onClick={handleGenerate}
              loading={loading}
              disabled={!activeDna || (user?.coinBalance ?? 0) < COIN_COST}
            >
              <Sparkles className="h-4 w-4" />
              Generieren ({formatCoins(COIN_COST)} Coins)
            </Button>
            {exports?.png && (
              <a href={exports.png} download="logo.png" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3.5 w-3.5" /> PNG
                </Button>
              </a>
            )}
            {exports?.hd && (
              <a href={exports.hd} download="logo-hd.png" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3.5 w-3.5" /> HD
                </Button>
              </a>
            )}
            {exports?.svg && (
              <a href={exports.svg} download="logo.svg" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3.5 w-3.5" /> SVG
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
                setExports(p.exports ?? null);
                setProvider(p.provider ?? null);
              }
            }}
          />
        }
      />
    </StudioShell>
  );
}
