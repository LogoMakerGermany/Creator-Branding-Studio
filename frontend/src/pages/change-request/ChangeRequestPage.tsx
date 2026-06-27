import { useState, useEffect } from 'react';
import {
  PageHeader, Badge, Button, NeonCard, CardTitle, Input,
} from '@/components/ui';
import { RefreshCw, ArrowLeftRight, RotateCcw, AlertCircle } from 'lucide-react';
import { api, ApiError, type ChangeRequestRecord, type GenerationJob } from '@/services/api';

export function ChangeRequestPage() {
  const [requests, setRequests] = useState<ChangeRequestRecord[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [requestText, setRequestText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{ before?: string; after?: string; request: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await api.changeRequest.list();
    setRequests(data.changeRequests);
    setJobs(data.availableJobs);
    if (data.availableJobs.length && !selectedJob) {
      setSelectedJob(data.availableJobs[0].id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob || !requestText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.changeRequest.create(selectedJob, requestText.trim());
      setRequestText('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function showCompare(id: string) {
    const res = await api.changeRequest.compare(id);
    setComparison(res.comparison);
  }

  async function handleRestore(versionId: string) {
    await api.changeRequest.restore(versionId);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Änderungswunsch-System"
        description="KI-gestützte Design-Anpassungen mit Versionsverwaltung und Vorher/Nachher-Vergleich"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-brand-400" />
            Neuer Änderungswunsch
          </CardTitle>

          {jobs.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              Erstelle zuerst ein Design im Logo-, Banner- oder Facecam Studio.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Design auswählen</label>
                <select
                  value={selectedJob}
                  onChange={(e) => setSelectedJob(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.module} – {j.id.slice(0, 8)}…
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Dein Wunsch"
                placeholder="z.B. Augen größer, mehr Neon, Hintergrund ändern..."
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
              />
              <Button type="submit" loading={loading} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Änderung generieren (5 Coins)
              </Button>
            </form>
          )}
        </NeonCard>

        <NeonCard accent="magenta">
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-brand-400" />
            Vorher / Nachher
          </CardTitle>
          {comparison ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-xs text-zinc-500">Vorher</p>
                {comparison.before && (
                  <img src={comparison.before} alt="Vorher" className="w-full rounded-lg border border-zinc-800" />
                )}
              </div>
              <div>
                <p className="mb-2 text-xs text-zinc-500">Nachher</p>
                {comparison.after && (
                  <img src={comparison.after} alt="Nachher" className="w-full rounded-lg border border-zinc-800" />
                )}
              </div>
              <p className="col-span-2 text-sm text-zinc-400">„{comparison.request}"</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Wähle einen Eintrag aus der Historie für den Vergleich.</p>
          )}
        </NeonCard>
      </div>

      {requests.length > 0 && (
        <NeonCard accent="purple" className="mt-6" title="Historie">
          <div className="mt-4 space-y-2">
            {requests.map((cr) => (
              <div key={cr.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3">
                <div>
                  <p className="text-sm text-zinc-200">{cr.request}</p>
                  <p className="text-xs text-zinc-500">
                    {cr.status} · {new Date(cr.createdAt).toLocaleString('de-DE')}
                  </p>
                </div>
                <div className="flex gap-2">
                  {cr.status === 'completed' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => showCompare(cr.id)}>
                        <ArrowLeftRight className="h-3 w-3" />
                      </Button>
                      {cr.versionAfter && (
                        <Button size="sm" variant="ghost" onClick={() => handleRestore(cr.versionAfter!)}>
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}
