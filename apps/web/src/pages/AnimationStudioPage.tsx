import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { VIDEO_DURATIONS } from '@cbs/shared';
import api, { pollJob } from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { GenerationLoader } from '../components/Sidebar';

const ANIMATION_TYPES = [
  { id: 'intro', label: 'Logo Intro' },
  { id: 'outro', label: 'Logo Outro' },
  { id: 'intro', label: 'Stream Intro' },
  { id: 'outro', label: 'Stream Outro' },
  { id: 'transition', label: 'Transition' },
  { id: 'stinger', label: 'Stinger' },
  { id: 'loading', label: 'Loading Screen' },
  { id: 'social_reveal', label: 'Social Reveal' },
  { id: 'product_reveal', label: 'Product Reveal' },
  { id: 'clan_intro', label: 'Clan Intro' },
  { id: 'team_intro', label: 'Team Intro' },
];

export function AnimationStudioPage() {
  const { id } = useParams<{ id: string }>();
  const [selected, setSelected] = useState('intro');
  const [duration, setDuration] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post(`/projects/${id}/animations`, { assetType: selected, duration });
      const job = await pollJob(id!, data.jobId);
      if (job.status === 'failed') throw new Error(job.error);
      setResult(job.fileName!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-gradient">Animation Studio</h1>
      <p className="mt-2 text-white/50">PixVerse-ähnliche Oberfläche – Video-Prompts werden automatisch erstellt.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-1">
          {ANIMATION_TYPES.map((a, i) => (
            <GlassCard key={`${a.id}-${i}`} onClick={() => setSelected(a.id)}
              className={selected === a.id ? 'ring-2 ring-neon-purple' : ''} glow={selected === a.id ? 'purple' : 'none'}>
              <p className="text-sm font-medium">{a.label}</p>
            </GlassCard>
          ))}
          <GlassCard>
            <p className="mb-2 text-sm text-white/60">Länge</p>
            <div className="flex flex-wrap gap-2">
              {VIDEO_DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${duration === d ? 'bg-neon-cyan/20 text-neon-cyan' : 'bg-white/5 text-white/50'}`}>
                  {d}s
                </button>
              ))}
            </div>
            <NeonButton onClick={generate} loading={loading} className="mt-4 w-full">Animation generieren</NeonButton>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </GlassCard>
        </div>

        <GlassCard className="lg:col-span-2 flex min-h-[400px] items-center justify-center" glow="pink">
          {loading ? (
            <GenerationLoader status="processing" />
          ) : result ? (
            result.endsWith('.mp4') ? (
              <video src={`/api/projects/${id}/assets/${result}`} controls className="max-h-[500px] rounded-xl" />
            ) : (
              <img src={`/api/projects/${id}/assets/${result}`} alt="" className="max-h-[500px] rounded-xl" />
            )
          ) : (
            <div className="text-center text-white/30">
              <p className="text-6xl">🎬</p>
              <p className="mt-4">Wähle einen Animationstyp und generiere</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
