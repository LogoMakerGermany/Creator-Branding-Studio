import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StreamingPlatform } from '@cbs/shared';
import { getCoinCost } from '@cbs/shared';
import api, { pollJob } from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { StreamingPlatformPicker, MagicPromptInfo } from '../components/PlatformTools';
import { GenerationLoader } from '../components/Sidebar';

const DEFAULT_TEXTS = ['GG', 'EZ WIN', 'LOL', "LET'S GO", 'TEAM XYZ'];
const STICKER_EMOTIONS = ['Triumph', 'Cool', 'Lachen', 'Hype', 'Playful'];

export function StickerStudioPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<StreamingPlatform>('twitch');
  const [texts, setTexts] = useState(DEFAULT_TEXTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: assets = [], refetch } = useQuery({
    queryKey: ['assets', id],
    queryFn: async () => (await api.get(`/projects/${id}/assets`)).data,
  });

  const stickers = assets.filter((a: { assetType: string }) => a.assetType === 'sticker').slice(0, 5);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${id}/stickers`, { stickerTexts: texts, platform });
      for (const jobId of data.jobIds) await pollJob(id!, jobId);
      refetch();
      qc.invalidateQueries({ queryKey: ['coins'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Sticker Studio</h1>
      <p className="mt-2 text-white/50">5 individuelle Sticker – eigene Texte, Posen & Emotionen, transparente PNGs.</p>

      <GlassCard className="mt-6 max-w-xl" glow="purple">
        <StreamingPlatformPicker value={platform} onChange={setPlatform} />
        <MagicPromptInfo />
        <p className="mt-3 text-xs text-neon-pink">Kosten: {getCoinCost('stickers_pack')} Coins (5 Sticker)</p>
      </GlassCard>

      <div className="mt-8 grid gap-4 md:grid-cols-5">
        {texts.map((text, i) => (
          <GlassCard key={i} glow="cyan">
            <p className="text-xs text-white/40">Sticker {String(i + 1).padStart(2, '0')} · {STICKER_EMOTIONS[i]}</p>
            <input value={text} onChange={e => {
              const next = [...texts];
              next[i] = e.target.value;
              setTexts(next);
            }} className="mt-2 w-full rounded-lg border border-white/10 bg-surface-3 px-3 py-2 text-sm" placeholder="Text…" />
            <div className="mt-3 flex min-h-[100px] items-center justify-center rounded-lg"
              style={{ background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0 / 12px 12px' }}>
              {stickers[i]?.fileName ? (
                <img src={`/api/projects/${id}/assets/${stickers[i].fileName}`} alt="" className="max-h-24 object-contain" />
              ) : (
                <span className="text-xs text-white/30">Vorschau</span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-white/30">sticker_{String(i + 1).padStart(2, '0')}.png</p>
          </GlassCard>
        ))}
      </div>

      <div className="mt-6 flex gap-4">
        <NeonButton onClick={generate} loading={loading}>5 Sticker generieren</NeonButton>
        <a href={`/api/projects/${id}/downloads/stickers-zip`}><NeonButton variant="cyan">Sticker ZIP</NeonButton></a>
      </div>
      {loading && <GenerationLoader status="processing" />}
      {error && <p className="mt-4 text-red-400">{error}</p>}
    </div>
  );
}
