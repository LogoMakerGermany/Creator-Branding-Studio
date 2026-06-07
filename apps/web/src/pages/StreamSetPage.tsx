import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { StreamingPlatform } from '@cbs/shared';
import { getCoinCost } from '@cbs/shared';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { StreamingPlatformPicker } from '../components/PlatformTools';
import { GenerationLoader } from '../components/Sidebar';

export function StreamSetPage() {
  const { id } = useParams<{ id: string }>();
  const [platform, setPlatform] = useState<StreamingPlatform>('twitch');
  const [packId, setPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; completed: number; current?: string; done: boolean; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!packId) return;
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
      setProgress({ total: 17, completed: 0, done: false });
    } finally {
      setLoading(false);
    }
  }

  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;
  const cost = getCoinCost('stream_set');

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Stream-Set Generator</h1>
      <p className="mt-2 text-white/50">Komplettes Stream-Paket für Twitch, Kick oder YouTube – plattformoptimierte Maße.</p>

      <GlassCard className="mt-8 max-w-xl" glow="pink">
        <StreamingPlatformPicker value={platform} onChange={setPlatform} platforms={['twitch', 'kick', 'youtube']} />
        <p className="mt-4 text-sm text-white/50">Enthält: Logo, Banner, Overlay, Facecam, Panels, Screens, Intro, Outro, Stinger, 5 Sticker</p>
        <p className="mt-2 text-sm text-neon-pink">Kosten: {cost} Coins</p>
        {!packId ? (
          <NeonButton onClick={start} loading={loading} className="mt-6 w-full">Stream-Set generieren</NeonButton>
        ) : progress?.done ? (
          <div className="mt-6">
            <p className="text-neon-cyan">✓ Stream-Set fertig!</p>
            <a href={`/api/projects/${id}/downloads/zip`}><NeonButton variant="cyan" className="mt-4">ZIP herunterladen</NeonButton></a>
          </div>
        ) : (
          <div className="mt-6">
            <GenerationLoader status={progress?.current || 'processing'} />
            <div className="mt-4 h-2 rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-neon-pink to-neon-cyan" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-center text-sm text-white/50">{progress?.completed}/{progress?.total}</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
