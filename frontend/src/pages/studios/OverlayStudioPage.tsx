import { useState } from 'react';
import { Sparkles, CheckCircle2, Download } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { NeonPreviewBox, StudioErrorBanner } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import type { OverlayGenerationOptions } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';

const COIN_COST = 12;
const OVERLAY_TYPES = [
  { id: 'hud', label: 'HUD' },
  { id: 'alert', label: 'Alert' },
  { id: 'panel', label: 'Panel' },
  { id: 'starting-soon', label: 'Starting Soon' },
  { id: 'brb', label: 'BRB' },
  { id: 'offline', label: 'Offline' },
  { id: 'ending', label: 'Ending' },
  { id: 'full-scene', label: 'Full Scene' },
] as const;

export function OverlayStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const { projects, refresh } = useStudioProjects('overlay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [exports, setExports] = useState<{ png?: string; hd?: string; svg?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [form, setForm] = useState<OverlayGenerationOptions>({
    overlayType: 'hud',
    transparentBackground: true,
    animated: false,
    style: 'Neon',
  });

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.studio.generate('overlay', form);
      if (res.status === 'failed' || !res.imageUrl) {
        setError(res.error || 'Generierung fehlgeschlagen');
        return;
      }
      setImageUrl(res.imageUrl);
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
      title="Overlay Studio"
      description="Stream-Overlays, HUDs, Alerts und Szenen — OBS/Streamlabs-ready"
      coinCost={COIN_COST}
    >
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {imageUrl && (
          <StudioSuccessBanner>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Overlay generiert{provider ? ` (${provider})` : ''}
            </span>
          </StudioSuccessBanner>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-3">
            <Input placeholder="Stil" value={form.style ?? ''} onChange={(e) => setForm({ ...form, style: e.target.value })} />
            <div className="flex flex-wrap gap-1">
              {OVERLAY_TYPES.map((t) => (
                <StudioOptionPill
                  key={t.id}
                  active={form.overlayType === t.id}
                  onClick={() => setForm({ ...form, overlayType: t.id })}
                >
                  {t.label}
                </StudioOptionPill>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.transparentBackground} onChange={(e) => setForm({ ...form, transparentBackground: e.target.checked })} />
              Transparenter Hintergrund
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.animated} onChange={(e) => setForm({ ...form, animated: e.target.checked })} />
              Animierter Look
            </label>
          </div>
        }
        preview={
          <NeonPreviewBox>
            {imageUrl ? (
              <img src={imageUrl} alt="Overlay" className="h-full w-full object-contain" />
            ) : (
              <p className="text-sm text-zinc-500">Overlay-Vorschau</p>
            )}
          </NeonPreviewBox>
        }
        actions={
          <>
            <Button onClick={handleGenerate} loading={loading} disabled={!activeDna || (user?.coinBalance ?? 0) < COIN_COST} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generieren ({formatCoins(COIN_COST)} Coins)
            </Button>
            {exports?.png && (
              <a href={exports.png} download="overlay.png" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> PNG</Button>
              </a>
            )}
            {exports?.svg && (
              <a href={exports.svg} download="overlay.svg" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> SVG</Button>
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
