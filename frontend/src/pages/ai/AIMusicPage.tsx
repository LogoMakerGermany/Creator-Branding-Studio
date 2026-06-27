import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, NeonCard, Input, StatCard } from '@/components/ui';
import { Music, Sparkles, CheckCircle2, History } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { MediaJobPreview } from '@/components/media/MediaJobPreview';
import { DnaRequiredBanner, StudioErrorBanner, NeonPreviewBox } from '@/components/studio';

export function AIMusicPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [history, setHistory] = useState<MediaJob[]>([]);

  useEffect(() => {
    api.aiMusic.list().then((r) => setHistory(r.jobs)).catch(() => {});
  }, [currentJob]);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.aiMusic.generate(prompt || undefined, title || undefined, 120);
      setCurrentJob(res.job);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="KI Musik Generator"
        description="Intromusik, Hintergrundtracks und Jingles im Stil deiner Creator DNA"
        badge={<Badge variant="brand">Suno</Badge>}
        actions={<Badge variant="default">{formatCoins(10)} Coins</Badge>}
      />

      {!activeDna && <DnaRequiredBanner />}
      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Tracks" value={history.length} icon={<History className="h-5 w-5" />} />
        <StatCard label="Provider" value={currentJob?.provider ?? '—'} icon={<Music className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Musik-Stil">
          <Input className="mt-1" placeholder="Track-Titel (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            className="mt-2"
            placeholder="z.B. Energetischer EDM Intro für Gaming Stream..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="mt-2 text-xs text-zinc-500">
            Suno API Key in .env für echte Audio-Ausgabe.
          </p>
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 10}
          >
            <Sparkles className="h-4 w-4" />
            Musik generieren (10 Coins)
          </Button>
        </NeonCard>

        <NeonCard accent="magenta" title="Player">
          <NeonPreviewBox className="mt-2 min-h-[200px]">
            {currentJob ? (
              <div className="w-full p-4">
                <MediaJobPreview job={currentJob} emptyLabel="Track wird generiert..." />
                <p className="mt-3 text-center font-medium text-zinc-200">{currentJob.title}</p>
                {currentJob.duration && (
                  <p className="text-center text-sm text-zinc-500">
                    {Math.floor(currentJob.duration / 60)}:{(currentJob.duration % 60).toString().padStart(2, '0')} min
                  </p>
                )}
                {currentJob.metadata && (
                  <div className="mt-2 space-y-1 text-center text-sm text-zinc-400">
                    {currentJob.metadata.genre != null && <p>Genre: {String(currentJob.metadata.genre)}</p>}
                    {currentJob.metadata.bpm != null && <p>BPM: {String(currentJob.metadata.bpm)}</p>}
                  </div>
                )}
                {currentJob.status === 'completed' && (
                  <p className="mt-2 flex items-center justify-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Bereit · {currentJob.provider}
                  </p>
                )}
              </div>
            ) : (
              <Music className="h-12 w-12 text-brand-400/50" />
            )}
          </NeonPreviewBox>
        </NeonCard>
      </div>

      {history.length > 0 && (
        <NeonCard accent="purple" className="mt-6" title="Verlauf">
          <div className="mt-2 space-y-2">
            {history.slice(0, 8).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setCurrentJob(job)}
                className="ucbs-neon-card flex w-full items-center gap-3 p-3 text-left"
              >
                <Music className="h-4 w-4 text-cyan-400" />
                <div>
                  <p className="text-sm text-zinc-200">{job.title ?? 'KI Track'}</p>
                  <p className="text-xs text-zinc-500">{job.provider} · {new Date(job.createdAt).toLocaleDateString('de-DE')}</p>
                </div>
              </button>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}
