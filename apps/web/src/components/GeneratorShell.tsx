import { useState } from 'react';
import { ASSET_LABELS, getCoinCost, type AssetType, type StreamingPlatform } from '@cbs/shared';
import { GlassCard } from './GlassCard';
import { NeonButton } from './NeonButton';
import { GenerationLoader } from './Sidebar';
import { StreamingPlatformPicker, FormatDimensionsBadge, MagicPromptInfo, TransparencyBadge } from './PlatformTools';
import api, { pollJob } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface GeneratorShellProps {
  projectId: string;
  assetType: AssetType;
  defaultPlatform?: StreamingPlatform;
  showStreamPlatforms?: boolean;
}

export function GeneratorShell({
  projectId,
  assetType,
  defaultPlatform = 'twitch',
  showStreamPlatforms = true,
}: GeneratorShellProps) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<StreamingPlatform>(defaultPlatform);
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ fileName: string } | null>(null);
  const [error, setError] = useState('');

  const cost = getCoinCost(assetType);
  const isFacecam = assetType === 'facecam';

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post(`/projects/${projectId}/generate/${assetType}`, {
        platform,
        customText: customText || undefined,
      });
      const job = await pollJob(projectId, data.jobId, setStatus);
      if (job.status === 'failed') throw new Error(job.error || 'Generierung fehlgeschlagen');
      setResult({ fileName: job.fileName! });
      qc.invalidateQueries({ queryKey: ['coins'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <GlassCard className="lg:col-span-1" glow="cyan">
        <h2 className="font-display text-xl font-bold">{ASSET_LABELS[assetType]}</h2>
        <p className="mt-2 text-sm text-white/50">DNA + Magic Prompt Engine – kein manueller Prompt nötig.</p>
        <div className="mt-6 space-y-4">
          {showStreamPlatforms && (
            <StreamingPlatformPicker
              value={platform}
              onChange={setPlatform}
              platforms={['twitch', 'kick', 'youtube']}
            />
          )}
          <FormatDimensionsBadge platform={platform} assetType={assetType} />
          <MagicPromptInfo />
          <TransparencyBadge highlight={isFacecam} />
          <input value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Optionaler Text…"
            className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-2.5 text-sm outline-none focus:border-neon-pink" />
          <p className="text-xs text-neon-pink">Kosten: {cost} Coins</p>
          <NeonButton onClick={handleGenerate} loading={loading} disabled={loading} className="w-full">
            Generieren
          </NeonButton>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </GlassCard>

      <GlassCard className="lg:col-span-2 flex min-h-[400px] items-center justify-center" glow="pink">
        {loading ? (
          <GenerationLoader status={status || 'processing'} />
        ) : result ? (
          <img
            src={`/api/projects/${projectId}/assets/${result.fileName}`}
            alt="Generiertes Asset"
            className="max-h-[500px] max-w-full rounded-xl object-contain"
            style={{ background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0 / 20px 20px' }}
          />
        ) : (
          <p className="text-white/30">Vorschau erscheint nach der Generierung (Transparenz-Checker-Hintergrund)</p>
        )}
      </GlassCard>
    </div>
  );
}

export function AssetPreview({ projectId, fileName }: { projectId: string; fileName: string }) {
  return (
    <img src={`/api/projects/${projectId}/assets/${fileName}`} alt="" className="rounded-lg object-contain" />
  );
}
