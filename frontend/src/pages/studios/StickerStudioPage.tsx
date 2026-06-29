import { useState } from 'react';
import { Sparkles, CheckCircle2, Download } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { NeonPreviewBox, StudioErrorBanner } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import type { StickerGenerationOptions } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';

const COIN_COST = 8;

export function StickerStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const { projects, refresh } = useStudioProjects('sticker');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [exports, setExports] = useState<{ png?: string; hd?: string; svg?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [form, setForm] = useState<StickerGenerationOptions>({
    name: '',
    style: 'Anime',
    multicolor: true,
    shape: 'circle',
    transparentBackground: true,
  });

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.studio.generate('sticker', form);
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
      title="Sticker Studio"
      description="Emotes, Sticker und Badges — mehrfarbig, PNG & SVG Export"
      coinCost={COIN_COST}
    >
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {imageUrl && (
          <StudioSuccessBanner>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Sticker generiert{provider ? ` (${provider})` : ''}
            </span>
          </StudioSuccessBanner>
        )}
      </div>

      <StudioWorkbench
        settings={
          <div className="space-y-3">
            <Input placeholder="Name / Emote" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Stil" value={form.style ?? ''} onChange={(e) => setForm({ ...form, style: e.target.value })} />
            <div className="flex flex-wrap gap-1">
              {(['circle', 'square', 'die-cut'] as const).map((s) => (
                <StudioOptionPill key={s} active={form.shape === s} onClick={() => setForm({ ...form, shape: s })} className="capitalize">
                  {s}
                </StudioOptionPill>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.multicolor} onChange={(e) => setForm({ ...form, multicolor: e.target.checked })} />
              Mehrfarbig
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.transparentBackground} onChange={(e) => setForm({ ...form, transparentBackground: e.target.checked })} />
              Transparenter Hintergrund
            </label>
          </div>
        }
        preview={
          <NeonPreviewBox aspect="square">
            {imageUrl ? (
              <img src={imageUrl} alt="Sticker" className="h-full w-full object-contain" />
            ) : (
              <p className="text-sm text-zinc-500">Sticker-Vorschau</p>
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
              <a href={exports.png} download="sticker.png" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> PNG</Button>
              </a>
            )}
            {exports?.svg && (
              <a href={exports.svg} download="sticker.svg" target="_blank" rel="noreferrer">
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
