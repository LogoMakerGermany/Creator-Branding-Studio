import { PageHeader, Badge, Button, Card, CardTitle, Input, StatCard } from '@/components/ui';
import { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, Download, History } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type GenerationJob } from '@/services/api';
import { formatCoins } from '@/lib/utils';

export function AIImagePage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [history, setHistory] = useState<GenerationJob[]>([]);

  useEffect(() => {
    api.ai.listJobs().then((r) => setHistory(r.jobs)).catch(() => {});
  }, [currentJob]);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.ai.generate(prompt || undefined);
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
        title="KI Bildgenerator"
        description="Generiere Logos, Banner, Overlays und Charaktere basierend auf deiner Creator DNA"
        badge={<Badge variant="brand">OpenAI · Replicate</Badge>}
        actions={<Badge variant="default">{formatCoins(5)} Coins</Badge>}
      />

      {!activeDna && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">Creator DNA erforderlich</span>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Generierungen" value={history.length} icon={<History className="h-5 w-5" />} />
        <StatCard label="Provider" value={currentJob?.provider ?? '—'} icon={<Sparkles className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Prompt (optional)</CardTitle>
          <Input
            className="mt-3"
            placeholder="z.B. Neon Gaming Logo mit Drachen..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="mt-2 text-xs text-zinc-500">
            Ohne Prompt wird automatisch aus deiner Creator DNA generiert.
          </p>
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 5}
          >
            <Sparkles className="h-4 w-4" />
            Bild generieren (5 Coins)
          </Button>
        </Card>

        <Card>
          <CardTitle>Vorschau</CardTitle>
          <div className="mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-surface-900">
            {currentJob?.imageUrl ? (
              <img
                src={currentJob.imageUrl}
                alt="Generiertes Bild"
                className="h-full w-full object-contain"
              />
            ) : (
              <p className="text-sm text-zinc-500">Noch kein Bild generiert</p>
            )}
          </div>
          {currentJob?.imageUrl && (
            <a href={currentJob.imageUrl} download target="_blank" rel="noreferrer">
              <Button variant="outline" className="mt-3 w-full gap-2" size="sm">
                <Download className="h-4 w-4" />
                Herunterladen
              </Button>
            </a>
          )}
          {currentJob?.status === 'completed' && (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Generiert via {currentJob.provider}
            </p>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Verlauf</CardTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {history.slice(0, 8).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => setCurrentJob(job)}
                className="overflow-hidden rounded-lg border border-zinc-800 transition-colors hover:border-zinc-600"
              >
                {job.imageUrl ? (
                  <img src={job.imageUrl} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-zinc-900 text-xs text-zinc-500">
                    {job.status}
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
