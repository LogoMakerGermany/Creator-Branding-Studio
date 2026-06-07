import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { VIDEO_DURATIONS } from '@cbs/shared';
import type { StreamingPlatform } from '@cbs/shared';
import api, { pollJob } from '../lib/api';
import { GlassCard } from '../components/GlassCard';
import { NeonButton } from '../components/NeonButton';
import { StreamingPlatformPicker, MagicPromptInfo } from '../components/PlatformTools';
import { GenerationLoader } from '../components/Sidebar';

export function IntroOutroPage() {
  const { id } = useParams<{ id: string }>();
  const [platform, setPlatform] = useState<StreamingPlatform>('twitch');
  const [type, setType] = useState<'intro' | 'outro'>('intro');
  const [duration, setDuration] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${id}/animations`, { assetType: type, duration, platform });
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
      <h1 className="font-display text-3xl font-bold text-gradient">Intro & Outro Generator</h1>
      <p className="mt-2 text-white/50">Video-Prompt Engine erstellt automatisch professionelle Prompts.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <GlassCard glow="purple">
          <div className="flex gap-2">
            {(['intro', 'outro'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 rounded-lg py-2 text-sm capitalize ${type === t ? 'bg-neon-purple/20 text-neon-purple' : 'bg-white/5 text-white/50'}`}>
                {t === 'intro' ? 'Intro' : 'Outro'}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <StreamingPlatformPicker value={platform} onChange={setPlatform} platforms={['twitch', 'kick', 'youtube']} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {VIDEO_DURATIONS.map(d => (
              <button key={d} onClick={() => setDuration(d)}
                className={`rounded-lg px-3 py-1.5 text-sm ${duration === d ? 'bg-neon-cyan/20 text-neon-cyan' : 'bg-white/5'}`}>{d}s</button>
            ))}
          </div>
          <MagicPromptInfo />
          <NeonButton onClick={generate} loading={loading} className="mt-4 w-full">Generieren</NeonButton>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </GlassCard>
        <GlassCard className="lg:col-span-2 flex min-h-[360px] items-center justify-center" glow="cyan">
          {loading ? <GenerationLoader status="processing" /> : result ? (
            result.endsWith('.mp4') ? <video src={`/api/projects/${id}/assets/${result}`} controls className="max-h-[400px] rounded-xl" />
              : <img src={`/api/projects/${id}/assets/${result}`} alt="" className="max-h-[400px] rounded-xl" />
          ) : <p className="text-white/30">Intro/Outro Vorschau</p>}
        </GlassCard>
      </div>
    </div>
  );
}
