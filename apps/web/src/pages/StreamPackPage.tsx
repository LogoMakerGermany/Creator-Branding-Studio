import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { GenerationLoader } from '../components/Sidebar';

export function StreamPackPage() {
  const { id } = useParams<{ id: string }>();
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

  async function startPack() {
    setLoading(true);
    try {
      const { data } = await api.post(`/projects/${id}/stream-pack`);
      setPackId(data.packId);
      setProgress({ total: 17, completed: 0, done: false });
    } finally {
      setLoading(false);
    }
  }

  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Stream Pack Generator</h1>
      <p className="mt-2 text-white/50">Ein Klick – komplettes Stream-Paket im DNA-Stil.</p>

      <GlassCard className="mt-8 max-w-xl" glow="pink">
        <ul className="space-y-1 text-sm text-white/60">
          {['Logo', 'Banner', 'Overlay', 'Facecam', 'Panels', 'Offline', 'Starting Soon', 'BRB', 'Ending', 'Intro', 'Outro', 'Stinger', '5 Sticker'].map(item => (
            <li key={item}>✦ {item}</li>
          ))}
        </ul>
        {!packId ? (
          <NeonButton onClick={startPack} loading={loading} className="mt-6 w-full">
            Stream Pack generieren
          </NeonButton>
        ) : progress?.done ? (
          <div className="mt-6">
            <p className="text-neon-cyan">✓ Stream Pack fertig!</p>
            <a href={`/api/projects/${id}/downloads/zip`} className="mt-4 inline-block">
              <NeonButton variant="cyan">ZIP herunterladen</NeonButton>
            </a>
          </div>
        ) : progress?.error ? (
          <p className="mt-4 text-red-400">{progress.error}</p>
        ) : (
          <div className="mt-6">
            <GenerationLoader status={progress?.current || 'processing'} />
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-neon-pink to-neon-cyan transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-center text-sm text-white/50">{progress?.completed}/{progress?.total} ({pct}%)</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
