import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import type { StreamSetPlatform } from '@cbs/shared';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { PlatformButtonPicker, StreamSetPreviewPanel, type StreamSetPreviewData } from '../components/StreamSetPreview';
import { MagicPromptInfo, TransparencyBadge } from '../components/PlatformTools';
import { GenerationLoader } from '../components/Sidebar';

export function StreamSetPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialPlatform = (location.state as { platform?: StreamSetPlatform })?.platform ?? 'tiktok';
  const initialPackId = (location.state as { packId?: string })?.packId ?? null;

  const [platform, setPlatform] = useState<StreamSetPlatform>(initialPlatform);
  const [preview, setPreview] = useState<StreamSetPreviewData | null>(null);
  const [packId, setPackId] = useState<string | null>(initialPackId);
  const [progress, setProgress] = useState<{ total: number; completed: number; current?: string; done: boolean; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/projects/${id}/stream-set/preview`, { params: { platform } })
      .then(({ data }) => setPreview(data))
      .catch(() => setPreview(null));
  }, [id, platform]);

  useEffect(() => {
    if (!packId || !id) return;
    const interval = setInterval(async () => {
      const { data } = await api.get(`/projects/${id}/stream-pack/${packId}`);
      setProgress(data);
      if (data.done) clearInterval(interval);
    }, 2000);
    return () => clearInterval(interval);
  }, [packId, id]);

  async function start() {
    setLoading(true);
    try {
      const { data } = await api.post(`/projects/${id}/stream-pack`, { platform });
      setPackId(data.packId);
      setProgress({ total: preview?.assets.length ?? 0, completed: 0, done: false });
    } finally {
      setLoading(false);
    }
  }

  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Stream-Set Generator</h1>
      <p className="mt-2 text-white/50">Plattformoptimiertes Komplettpaket – dynamische Assets, Größen & Coin-Kosten.</p>

      <GlassCard className="mt-8 max-w-2xl" glow="pink">
        <PlatformButtonPicker value={platform} onChange={setPlatform} />
        <div className="mt-4 space-y-2">
          <MagicPromptInfo />
          <TransparencyBadge />
        </div>
        {preview && (
          <p className="mt-4 text-sm text-neon-pink">
            Gesamtpreis: <strong>{preview.totalCoins} Coins</strong> · {preview.assets.length} Assets
          </p>
        )}
        {!packId ? (
          <NeonButton onClick={start} loading={loading} className="mt-6 w-full">
            Stream-Set generieren
          </NeonButton>
        ) : progress?.done ? (
          <div className="mt-6">
            <p className="text-neon-cyan">✓ Stream-Set fertig!</p>
            <a href={`/api/projects/${id}/downloads/zip`}>
              <NeonButton variant="cyan" className="mt-4">ZIP herunterladen</NeonButton>
            </a>
          </div>
        ) : (
          <div className="mt-6">
            <GenerationLoader status={progress?.current || 'processing'} />
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-neon-pink to-neon-cyan transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-center text-sm text-white/50">{progress?.completed}/{progress?.total}</p>
          </div>
        )}
      </GlassCard>

      {preview && !packId && <StreamSetPreviewPanel preview={preview} />}
    </div>
  );
}
