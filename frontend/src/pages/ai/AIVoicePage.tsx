import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, NeonCard, Input, StatCard } from '@/components/ui';
import { Mic, Sparkles, CheckCircle2, History, Copy } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { MediaJobPreview } from '@/components/media/MediaJobPreview';
import { DnaRequiredBanner, StudioErrorBanner, NeonPreviewBox } from '@/components/studio';

export function AIVoicePage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [history, setHistory] = useState<MediaJob[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.aiVoice.list().then((r) => setHistory(r.jobs)).catch(() => {});
  }, [currentJob]);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.aiVoice.generate(prompt || undefined, title || undefined);
      setCurrentJob(res.job);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const transcript = currentJob?.metadata?.transcript ? String(currentJob.metadata.transcript) : '';

  async function copyTranscript() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <PageHeader
        title="KI Sprecherstimmen"
        description="Voiceovers, Stream-Intros und Ansagen in deinem Branding-Stil"
        badge={<Badge variant="brand">ElevenLabs</Badge>}
        actions={<Badge variant="default">{formatCoins(8)} Coins</Badge>}
      />

      {!activeDna && <DnaRequiredBanner />}
      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Voiceovers" value={history.length} icon={<History className="h-5 w-5" />} />
        <StatCard label="Stimme" value={currentJob?.metadata?.voice ? String(currentJob.metadata.voice) : '—'} icon={<Mic className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Skript">
          <Input className="mt-1" placeholder="Titel (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="mt-2 w-full rounded-lg border border-zinc-800 bg-surface-950 p-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
            rows={5}
            placeholder="Eigenes Skript oder leer lassen für Auto-Generierung aus Creator DNA..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="mt-2 text-xs text-zinc-500">
            ElevenLabs API Key in .env für echte Audio-Ausgabe.
          </p>
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 8}
          >
            <Sparkles className="h-4 w-4" />
            Voiceover generieren (8 Coins)
          </Button>
        </NeonCard>

        <NeonCard accent="magenta" title="Ergebnis">
          <NeonPreviewBox className="mt-2 min-h-[200px]">
            {currentJob ? (
              <div className="w-full p-4">
                <MediaJobPreview job={currentJob} emptyLabel="Voiceover wird generiert..." />
                <p className="mt-3 text-center font-medium text-zinc-200">{currentJob.title ?? 'Voiceover'}</p>
                {currentJob.status === 'completed' && (
                  <p className="mt-2 flex items-center justify-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Bereit · {currentJob.provider}
                  </p>
                )}
              </div>
            ) : (
              <Mic className="h-12 w-12 text-fuchsia-400/50" />
            )}
          </NeonPreviewBox>
          {transcript && (
            <div className="mt-4 rounded-lg border border-zinc-800/80 bg-surface-950/50 p-4">
              <p className="text-sm text-zinc-300">{transcript}</p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={copyTranscript}>
                <Copy className="h-3 w-3" />
                {copied ? 'Kopiert!' : 'Skript kopieren'}
              </Button>
            </div>
          )}
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
                <Mic className="h-4 w-4 text-fuchsia-400" />
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200">{job.title ?? 'Voiceover'}</p>
                  <p className="truncate text-xs text-zinc-500 max-w-md">
                    {job.metadata?.transcript ? String(job.metadata.transcript).slice(0, 80) : job.prompt}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}
